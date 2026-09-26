import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Annotated, Protocol, cast

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.models import AgentEvent
from app.storage.session_store import SessionStore

logger = logging.getLogger(__name__)

REALTIME_REGISTRY_STATE_KEY = "realtime_registry"
LAST_EVENT_ID_HEADER = "last-event-id"
LAST_EVENT_ID_QUERY_PARAM = "last_event_id"


class EventSocket(Protocol):
    async def send_text(self, data: str) -> None: ...


def encode_event(event: AgentEvent) -> str:
    return json.dumps(event.model_dump(mode="json"), separators=(",", ":"))


def parse_last_event_id(raw_value: str | None) -> int:
    if raw_value is None:
        return 0
    try:
        sequence = int(raw_value.strip())
    except ValueError:
        logger.debug("ignoring malformed last event id: %r", raw_value)
        return 0
    return max(sequence, 0)


@dataclass(slots=True)
class _Connection:
    """One subscribed socket plus the ordering state that belongs to it.

    ``lock`` serialises every write to this socket so a slow consumer cannot
    interleave frames. ``ready`` gates live delivery: while it is false the
    connection is still catching up on persisted history and events are parked in
    ``buffered`` instead of being sent, which is what keeps a reconnecting client
    from seeing a live event *before* the replay it is resuming from.
    """

    socket: EventSocket
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    ready: bool = False
    buffered: list[AgentEvent] = field(default_factory=list)


class ConnectionRegistry:
    def __init__(self, store: SessionStore | None = None) -> None:
        self._lock = asyncio.Lock()
        self._connections: dict[str, dict[EventSocket, _Connection]] = {}
        self._subscriber_events: dict[str, asyncio.Event] = {}
        self._store = store

    async def connect(self, session_id: str, websocket: EventSocket) -> None:
        """Register a socket that is already ready to receive live events."""
        await self._register(session_id, websocket, ready=True)

    async def join(
        self,
        session_id: str,
        websocket: EventSocket,
        *,
        after_sequence: int = 0,
        store: SessionStore | None = None,
    ) -> int:
        """Register a socket and hand it its history without a reordering window.

        The socket is registered *before* the history is read so that nothing
        emitted during the read is lost, but it is not ``ready`` yet: those events
        are buffered and flushed only after the history has been written, in
        sequence order. Returns the number of events written to the socket.
        """
        await self._register(session_id, websocket, ready=False)
        try:
            replayed = await self._catch_up(session_id, websocket, after_sequence, store)
        except BaseException:
            await self.disconnect(session_id, websocket)
            raise
        logger.debug("realtime join wrote %d events for %s", replayed, session_id)
        return replayed

    async def disconnect(self, session_id: str, websocket: EventSocket) -> None:
        async with self._lock:
            self._discard(session_id, websocket)
            if self.connection_count(session_id) == 0:
                self._subscriber_events.pop(session_id, None)
        logger.debug("realtime connection closed: %s", session_id)

    async def wait_for_subscriber(self, session_id: str, timeout: float) -> bool:
        async with self._lock:
            if self.connection_count(session_id) > 0:
                return True
            event = self._subscriber_events.setdefault(session_id, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout)
        except TimeoutError:
            async with self._lock:
                if self.connection_count(session_id) == 0:
                    self._subscriber_events.pop(session_id, None)
            return False
        return True

    async def broadcast(self, session_id: str, event: AgentEvent) -> None:
        message = encode_event(event)
        async with self._lock:
            entries = tuple(self._connections.get(session_id, {}).values())
            deliver: list[_Connection] = []
            for entry in entries:
                if entry.ready:
                    deliver.append(entry)
                else:
                    entry.buffered.append(event)
        failed: list[EventSocket] = []
        for entry in deliver:
            if not await self._write(entry, message):
                failed.append(entry.socket)
        if failed:
            async with self._lock:
                for websocket in failed:
                    self._discard(session_id, websocket)

    def connection_count(self, session_id: str) -> int:
        return len(self._connections.get(session_id, {}))

    async def _register(self, session_id: str, websocket: EventSocket, *, ready: bool) -> None:
        entry = _Connection(socket=websocket, ready=ready)
        async with self._lock:
            self._connections.setdefault(session_id, {})[websocket] = entry
            self._subscriber_events.setdefault(session_id, asyncio.Event()).set()
        logger.debug("realtime connection opened: %s", session_id)

    async def _catch_up(
        self,
        session_id: str,
        websocket: EventSocket,
        after_sequence: int,
        store: SessionStore | None,
    ) -> int:
        resolved_store = store or self._store
        if resolved_store is None:
            logger.warning("realtime replay has no session store for %s", session_id)
        session = await resolved_store.get(session_id) if resolved_store is not None else None
        history = sorted(session.events, key=lambda stored: stored.sequence) if session else ()
        async with self._lock:
            entry = self._connections.get(session_id, {}).get(websocket)
        if entry is None:
            return 0
        written = 0
        highest = after_sequence
        # The per-socket lock is held for the whole catch-up, so live events that
        # arrive once the connection flips to ready queue behind the history here
        # instead of overtaking it.
        async with entry.lock:
            for event in history:
                if event.sequence <= highest:
                    continue
                if not await self._write_locked(entry, encode_event(event)):
                    return written
                highest = event.sequence
                written += 1
            async with self._lock:
                buffered = entry.buffered
                entry.buffered = []
                entry.ready = True
            for event in buffered:
                if event.sequence <= highest:
                    continue
                if not await self._write_locked(entry, encode_event(event)):
                    break
                highest = event.sequence
                written += 1
        return written

    async def _write(self, entry: _Connection, message: str) -> bool:
        async with entry.lock:
            return await self._write_locked(entry, message)

    async def _write_locked(self, entry: _Connection, message: str) -> bool:
        try:
            await entry.socket.send_text(message)
        except Exception as error:
            logger.warning("dropping realtime connection: %s", error)
            return False
        return True

    def _discard(self, session_id: str, websocket: EventSocket) -> None:
        connections = self._connections.get(session_id)
        if connections is None:
            return
        connections.pop(websocket, None)
        if not connections:
            del self._connections[session_id]


def get_realtime_registry(connection: HTTPConnection) -> ConnectionRegistry:
    state = connection.app.state
    registry = getattr(state, REALTIME_REGISTRY_STATE_KEY, None)
    if registry is None:
        registry = ConnectionRegistry(store=cast(SessionStore, state.session_store))
        setattr(state, REALTIME_REGISTRY_STATE_KEY, registry)
    return cast(ConnectionRegistry, registry)


RealtimeRegistryDependency = Annotated[ConnectionRegistry, Depends(get_realtime_registry)]
