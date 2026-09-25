import asyncio
import json
import logging
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


class ConnectionRegistry:
    def __init__(self, store: SessionStore | None = None) -> None:
        self._lock = asyncio.Lock()
        self._connections: dict[str, set[EventSocket]] = {}
        self._subscriber_events: dict[str, asyncio.Event] = {}
        self._store = store

    async def connect(self, session_id: str, websocket: EventSocket) -> None:
        async with self._lock:
            self._connections.setdefault(session_id, set()).add(websocket)
            self._subscriber_events.setdefault(session_id, asyncio.Event()).set()
        logger.debug("realtime connection opened: %s", session_id)

    async def disconnect(self, session_id: str, websocket: EventSocket) -> None:
        async with self._lock:
            self._discard(session_id, websocket)
            if self.connection_count(session_id) == 0:
                self._subscriber_events.pop(session_id, None)
        logger.debug("realtime connection closed: %s", session_id)

    async def wait_for_subscriber(self, session_id: str, timeout: float) -> bool:
        event = self._subscriber_events.setdefault(session_id, asyncio.Event())
        if not event.is_set():
            try:
                await asyncio.wait_for(event.wait(), timeout)
            except TimeoutError:
                return False
            finally:
                if self.connection_count(session_id) == 0:
                    self._subscriber_events.pop(session_id, None)
        return True

    async def broadcast(self, session_id: str, event: AgentEvent) -> None:
        message = encode_event(event)
        async with self._lock:
            targets = tuple(self._connections.get(session_id, ()))
            failed: list[EventSocket] = []
            for websocket in targets:
                try:
                    await websocket.send_text(message)
                except Exception as error:
                    logger.warning("dropping realtime connection for %s: %s", session_id, error)
                    failed.append(websocket)
            for websocket in failed:
                self._discard(session_id, websocket)

    async def replay(
        self,
        session_id: str,
        websocket: EventSocket,
        after_sequence: int = 0,
        *,
        store: SessionStore | None = None,
    ) -> int:
        resolved_store = store or self._store
        if resolved_store is None:
            logger.warning("realtime replay has no session store for %s", session_id)
            return 0
        session = await resolved_store.get(session_id)
        if session is None:
            return 0
        pending = sorted(session.events, key=lambda stored: stored.sequence)
        replayed = 0
        async with self._lock:
            for event in pending:
                if event.sequence <= after_sequence:
                    continue
                try:
                    await websocket.send_text(encode_event(event))
                except Exception as error:
                    logger.warning("realtime replay stopped for %s: %s", session_id, error)
                    break
                replayed += 1
        logger.debug("realtime replay sent %d events for %s", replayed, session_id)
        return replayed

    def connection_count(self, session_id: str) -> int:
        return len(self._connections.get(session_id, ()))

    def _discard(self, session_id: str, websocket: EventSocket) -> None:
        connections = self._connections.get(session_id)
        if connections is None:
            return
        connections.discard(websocket)
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
