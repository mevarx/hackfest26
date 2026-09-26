import asyncio
import importlib
import json
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.api import sessions
from app.api.sessions import SESSION_NOT_FOUND_CLOSE_CODE, OrchestrationRunner
from app.config import Settings
from app.main import create_app
from app.models import AgentEvent, AgentName, AgentStatus, SessionState
from app.realtime import ConnectionRegistry, parse_last_event_id
from app.storage.session_store import SessionStore

POST_RETURN_BOUND_SECONDS = 5.0
ORCHESTRATION_WAIT_SECONDS = 60.0
ORCHESTRATION_POLL_SECONDS = 0.05
STUB_EVENT_DELAY_SECONDS = 0.2
SLOW_SOCKET_DELAY_SECONDS = 0.5
WAIT_SUBSCRIBER_RACE_SECONDS = 0.02
WAIT_SUBSCRIBER_TIMEOUT_SECONDS = 5.0
STUB_EVENTS: tuple[tuple[AgentName, AgentStatus, str], ...] = (
    ("ORCHESTRATOR", "running", "Orchestration started"),
    ("SKILLS DISCOVERY", "done", "Skill claims extracted"),
    ("BIAS AUDIT", "done", "Bias audit completed"),
)


def make_app(tmp_path: Path) -> FastAPI:
    return create_app(Settings(database_path=tmp_path / "reroute.db"))


def make_event(
    session_id: str,
    sequence: int,
    agent: AgentName = "ORCHESTRATOR",
    status: AgentStatus = "running",
    message: str | None = None,
) -> AgentEvent:
    return AgentEvent(
        session_id=session_id,
        sequence=sequence,
        agent=agent,
        status=status,
        message=message or f"event {sequence}",
        data={"phase": f"phase-{sequence}", "session_id": session_id},
        source="simulated",
        event_id=f"{session_id}:event:{sequence}",
        timestamp=datetime.now(UTC).isoformat(),
    )


def make_session(session_id: str, event_count: int = 0) -> SessionState:
    now = datetime.now(UTC)
    return SessionState(
        session_id=session_id,
        input_type="text",
        content="I have manual testing experience.",
        persona="Kavya",
        source="simulated",
        state={},
        events=[make_event(session_id, sequence) for sequence in range(1, event_count + 1)],
        version=0,
        created_at=now,
        updated_at=now,
    )


def seed_session(app: FastAPI, session: SessionState) -> None:
    async def persist() -> None:
        store = cast(SessionStore, app.state.session_store)
        await store.initialize()
        await store.create(session)

    asyncio.run(persist())


def load_real_runner() -> OrchestrationRunner | None:
    try:
        module = importlib.import_module("app.orchestrator")
    except ImportError:
        return None
    entry_point = getattr(module, "run_orchestration", None)
    if not callable(entry_point):
        return None
    return cast(OrchestrationRunner, entry_point)


def make_stub_runner(delay: float = STUB_EVENT_DELAY_SECONDS) -> OrchestrationRunner:
    async def run_stub(
        *,
        settings: Settings,
        session: SessionState,
        store: SessionStore,
        on_event: Callable[[AgentEvent], Awaitable[None]],
    ) -> SessionState:
        current = session
        for sequence, (agent, status, message) in enumerate(STUB_EVENTS, start=1):
            await asyncio.sleep(delay)
            event = make_event(
                session.session_id,
                sequence,
                agent=agent,
                status=status,
                message=message,
            )
            current = await store.upsert(
                current.merged(events=[*current.events, event]),
                expected_version=current.version,
            )
            await on_event(event)
        return await store.upsert(
            current.merged(status="completed"),
            expected_version=current.version,
        )

    return run_stub


def wait_for_orchestration(client: TestClient, session_id: str) -> dict[str, Any]:
    deadline = time.perf_counter() + ORCHESTRATION_WAIT_SECONDS
    unchanged_since = time.perf_counter()
    payload: dict[str, Any] = {}
    observed = -1
    while time.perf_counter() < deadline:
        payload = cast(dict[str, Any], client.get(f"/session/{session_id}").json())
        events = cast(list[dict[str, Any]], payload.get("events", []))
        if payload.get("status") in {"completed", "failed"}:
            return payload
        if len(events) != observed:
            observed = len(events)
            unchanged_since = time.perf_counter()
        elif time.perf_counter() - unchanged_since > 1.0:
            return payload
        time.sleep(ORCHESTRATION_POLL_SECONDS)
    return payload


def test_websocket_rejects_unknown_session_with_documented_close_code(tmp_path: Path) -> None:
    """The handshake is accepted first so the 4404 code actually reaches the client.

    Closing before ``accept()`` makes the server reject the upgrade, and the
    client cannot then distinguish "no such session" from any other rejection.
    """
    app = make_app(tmp_path)
    with (
        TestClient(app) as client,
        client.websocket_connect("/session/unknown-session/stream") as websocket,
        pytest.raises(WebSocketDisconnect) as rejection,
    ):
        websocket.receive_text()

    assert rejection.value.code == SESSION_NOT_FOUND_CLOSE_CODE


def test_websocket_replays_persisted_events_in_order(tmp_path: Path) -> None:
    app = make_app(tmp_path)
    session = make_session("replay-session", event_count=3)
    seed_session(app, session)

    with (
        TestClient(app) as client,
        client.websocket_connect(f"/session/{session.session_id}/stream") as socket,
    ):
        payloads = [cast(dict[str, Any], socket.receive_json()) for _ in range(3)]

    assert [payload["sequence"] for payload in payloads] == [1, 2, 3]
    assert [payload["event_id"] for payload in payloads] == [
        f"replay-session:event:{sequence}" for sequence in (1, 2, 3)
    ]
    for payload, sequence in zip(payloads, (1, 2, 3), strict=True):
        assert set(payload) == {
            "session_id",
            "sequence",
            "agent",
            "status",
            "message",
            "data",
            "source",
            "event_id",
            "timestamp",
        }
        assert payload["session_id"] == "replay-session"
        assert payload["agent"] == "ORCHESTRATOR"
        assert payload["status"] in {"running", "done", "waiting_consent"}
        assert payload["message"] == f"event {sequence}"
        assert payload["data"] == {"phase": f"phase-{sequence}", "session_id": "replay-session"}
        assert payload["source"] in {"live", "simulated", "local"}
        assert datetime.fromisoformat(payload["timestamp"]).tzinfo is not None


def test_websocket_answers_ping_and_ignores_unknown_messages(tmp_path: Path) -> None:
    app = make_app(tmp_path)
    session = make_session("ping-session")
    seed_session(app, session)

    with (
        TestClient(app) as client,
        client.websocket_connect(f"/session/{session.session_id}/stream") as socket,
    ):
        socket.send_json({"type": "ping"})
        assert socket.receive_json() == {"type": "pong"}
        socket.send_json({"type": "unknown-control-message"})
        socket.send_text("not-json")
        socket.send_json({"type": "ping"})
        assert socket.receive_json() == {"type": "pong"}


def test_websocket_reconnect_replays_only_events_after_last_event_id(tmp_path: Path) -> None:
    app = make_app(tmp_path)
    session = make_session("resume-session", event_count=4)
    seed_session(app, session)

    with TestClient(app) as client:
        with client.websocket_connect(
            f"/session/{session.session_id}/stream?last_event_id=2"
        ) as socket:
            query_payloads = [cast(dict[str, Any], socket.receive_json()) for _ in range(2)]
        with client.websocket_connect(
            f"/session/{session.session_id}/stream",
            headers={"Last-Event-ID": "1"},
        ) as socket:
            header_payloads = [cast(dict[str, Any], socket.receive_json()) for _ in range(3)]
        with client.websocket_connect(
            f"/session/{session.session_id}/stream?last_event_id=not-a-sequence"
        ) as socket:
            malformed_payloads = [cast(dict[str, Any], socket.receive_json()) for _ in range(4)]

    assert [payload["sequence"] for payload in query_payloads] == [3, 4]
    assert [payload["sequence"] for payload in header_payloads] == [2, 3, 4]
    assert [payload["sequence"] for payload in malformed_payloads] == [1, 2, 3, 4]
    for payloads in (query_payloads, header_payloads, malformed_payloads):
        event_ids = [payload["event_id"] for payload in payloads]
        assert len(set(event_ids)) == len(event_ids)


def test_parse_last_event_id_ignores_malformed_values() -> None:
    assert parse_last_event_id(None) == 0
    assert parse_last_event_id("12") == 12
    assert parse_last_event_id(" 7 ") == 7
    assert parse_last_event_id("0") == 0
    assert parse_last_event_id("-4") == 0
    assert parse_last_event_id("1.5") == 0
    assert parse_last_event_id("") == 0
    assert parse_last_event_id("abc") == 0


class RecordingSocket:
    def __init__(self) -> None:
        self.messages: list[str] = []

    async def send_text(self, data: str) -> None:
        self.messages.append(data)


class FailingSocket:
    async def send_text(self, data: str) -> None:
        raise RuntimeError("socket is closed")


class _OneShotStore(SessionStore):
    """A store double that serves one already-built session."""

    def __init__(self, session: SessionState) -> None:
        self._session = session

    async def initialize(self) -> None:
        return None

    async def create(self, session: SessionState) -> None:
        raise NotImplementedError

    async def update(self, session: SessionState, expected_version: int) -> SessionState:
        raise NotImplementedError

    async def upsert(self, session: SessionState, expected_version: int) -> SessionState:
        raise NotImplementedError

    async def get(self, session_id: str) -> SessionState | None:
        return self._session if self._session.session_id == session_id else None

    async def close(self) -> None:
        return None


def test_broadcast_drops_failed_sockets_without_raising() -> None:
    async def exercise() -> None:
        registry = ConnectionRegistry()
        healthy = RecordingSocket()
        await registry.connect("broadcast-session", healthy)
        await registry.connect("broadcast-session", FailingSocket())
        assert registry.connection_count("broadcast-session") == 2

        event = make_event("broadcast-session", 1)
        await registry.broadcast("broadcast-session", event)
        await registry.broadcast("broadcast-session", make_event("broadcast-session", 2))
        await registry.broadcast("unobserved-session", make_event("unobserved-session", 1))

        assert registry.connection_count("broadcast-session") == 1
        delivered = [json.loads(message) for message in healthy.messages]
        assert [payload["sequence"] for payload in delivered] == [1, 2]
        assert delivered[0]["event_id"] == event.event_id
        assert delivered[0]["data"] == {"phase": "phase-1", "session_id": "broadcast-session"}

        await registry.disconnect("broadcast-session", healthy)
        assert registry.connection_count("broadcast-session") == 0

    asyncio.run(exercise())


def test_join_delivers_history_before_concurrent_live_events() -> None:
    """A resuming client must never see a live event ahead of its own history.

    The socket is registered before the store is read, so an event emitted during
    that read is buffered rather than delivered immediately. Handing it over first
    would push the client past the sequences it is replaying and permanently lose
    the rest of its history.
    """

    class BlockingStore(_OneShotStore):
        def __init__(self, session: SessionState) -> None:
            super().__init__(session)
            self.reading = asyncio.Event()
            self.release = asyncio.Event()

        async def get(self, session_id: str) -> SessionState | None:
            self.reading.set()
            await self.release.wait()
            return await super().get(session_id)

    async def exercise() -> None:
        store = BlockingStore(make_session("join-session", event_count=3))
        registry = ConnectionRegistry()
        socket = RecordingSocket()

        joining = asyncio.create_task(registry.join("join-session", socket, store=store))
        await store.reading.wait()
        live = make_event("join-session", 4, message="emitted during the replay read")
        broadcast = asyncio.create_task(registry.broadcast("join-session", live))
        await asyncio.sleep(0)
        store.release.set()
        await asyncio.gather(joining, broadcast)

        delivered = [json.loads(message) for message in socket.messages]
        assert [payload["sequence"] for payload in delivered] == [1, 2, 3, 4]
        assert delivered[-1]["message"] == live.message

    asyncio.run(exercise())


def test_join_resumes_after_the_requested_sequence() -> None:
    async def exercise() -> None:
        store = _OneShotStore(make_session("resume-session", event_count=4))
        registry = ConnectionRegistry()
        socket = RecordingSocket()
        await registry.join("resume-session", socket, after_sequence=2, store=store)
        delivered = [json.loads(message) for message in socket.messages]
        assert [payload["sequence"] for payload in delivered] == [3, 4]

    asyncio.run(exercise())


def test_broadcast_does_not_hold_the_registry_lock_across_sends() -> None:
    """One stalled consumer must not serialise unrelated sessions behind it."""

    class SlowSocket:
        def __init__(self, delay: float) -> None:
            self._delay = delay
            self.started = asyncio.Event()

        async def send_text(self, data: str) -> None:
            self.started.set()
            await asyncio.sleep(self._delay)

    async def exercise() -> None:
        registry = ConnectionRegistry()
        slow = SlowSocket(SLOW_SOCKET_DELAY_SECONDS)
        await registry.connect("slow-session", slow)

        async def emit_to_slow_session() -> None:
            await registry.broadcast("slow-session", make_event("slow-session", 1))
            await registry.broadcast("slow-session", make_event("slow-session", 2))

        blocker = asyncio.create_task(emit_to_slow_session())
        await slow.started.wait()
        healthy = RecordingSocket()
        await registry.connect("fast-session", healthy)

        started_at = time.perf_counter()
        await registry.broadcast("fast-session", make_event("fast-session", 1))
        elapsed = time.perf_counter() - started_at

        assert elapsed < SLOW_SOCKET_DELAY_SECONDS / 2, (
            f"broadcast to an unrelated session waited {elapsed:.3f}s on a stalled socket"
        )
        assert len(healthy.messages) == 1
        await blocker

    asyncio.run(exercise())


def test_wait_for_subscriber_observes_a_connection_made_while_waiting() -> None:
    async def exercise() -> None:
        registry = ConnectionRegistry()

        async def attach() -> None:
            await asyncio.sleep(WAIT_SUBSCRIBER_RACE_SECONDS)
            await registry.connect("racing-session", RecordingSocket())

        racer = asyncio.create_task(attach())
        assert await registry.wait_for_subscriber("racing-session", WAIT_SUBSCRIBER_TIMEOUT_SECONDS)
        await racer

    asyncio.run(exercise())


def test_post_session_start_runs_orchestration_without_blocking_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_runner = make_stub_runner()
    if load_real_runner() is None:
        monkeypatch.setattr(sessions, "load_orchestration_runner", lambda: stub_runner)
    app = make_app(tmp_path)

    with TestClient(app) as client:
        started_at = time.perf_counter()
        response = client.post(
            "/session/start",
            json={
                "input_type": "text",
                "content": "I have manual testing experience.",
                "persona": "Kavya",
            },
        )
        elapsed = time.perf_counter() - started_at
        payload = cast(dict[str, Any], response.json())
        session_id = cast(str, payload["session_id"])
        immediate = cast(dict[str, Any], client.get(f"/session/{session_id}").json())
        completed = wait_for_orchestration(client, session_id)

    assert response.status_code == 200
    assert payload["session_id"] == session_id
    assert payload["status"] == "started"
    assert payload["source"] in {"simulated", "local"}
    assert elapsed < POST_RETURN_BOUND_SECONDS
    assert len(cast(list[Any], completed["events"])) >= 1
    assert completed["status"] in {"completed", "failed"}
    assert len(cast(list[Any], immediate["events"])) < len(cast(list[Any], completed["events"]))


def test_websocket_receives_live_events_from_background_orchestration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_runner = make_stub_runner()
    monkeypatch.setattr(sessions, "load_orchestration_runner", lambda: stub_runner)
    app = make_app(tmp_path)
    received: dict[str, dict[str, Any]] = {}
    reads = 0
    delivered = 0

    with TestClient(app) as client:
        response = client.post(
            "/session/start",
            json={
                "input_type": "text",
                "content": "I have manual testing experience.",
                "persona": "Kavya",
            },
        )
        session_id = cast(str, cast(dict[str, Any], response.json())["session_id"])
        with client.websocket_connect(f"/session/{session_id}/stream") as socket:
            while len(received) < len(STUB_EVENTS) and reads < len(STUB_EVENTS) + 4:
                payload = cast(dict[str, Any], socket.receive_json())
                reads += 1
                if payload.get("type") == "pong":
                    continue
                delivered += 1
                received.setdefault(cast(str, payload["event_id"]), payload)
        completed = wait_for_orchestration(client, session_id)

    assert delivered == len(STUB_EVENTS)
    assert [payload["sequence"] for payload in received.values()] == [1, 2, 3]
    assert [payload["message"] for payload in received.values()] == [
        message for _, _, message in STUB_EVENTS
    ]
    assert all(payload["session_id"] == session_id for payload in received.values())
    assert list(received) == [
        f"{session_id}:event:{sequence}" for sequence in range(1, len(STUB_EVENTS) + 1)
    ]
    assert completed["status"] == "completed"
    assert len(cast(list[Any], completed["events"])) == len(STUB_EVENTS)


def test_deprecated_sse_route_still_streams_session_events(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def skip_delay(delay: float) -> None:
        return None

    monkeypatch.setattr("app.api.sessions.asyncio.sleep", skip_delay)
    app = make_app(tmp_path)
    operation = cast(
        dict[str, Any],
        cast(dict[str, Any], app.openapi()["paths"]["/session/{session_id}/stream"])["get"],
    )
    session = make_session("sse-session")
    seed_session(app, session)

    with TestClient(app) as client:
        with client.stream("GET", f"/session/{session.session_id}/stream") as response:
            status_code = response.status_code
            content_type = response.headers["content-type"]
            first_line = next(response.iter_lines())
        unknown = client.get("/session/unknown-session/stream")

    assert operation["deprecated"] is True
    assert status_code == 200
    assert content_type.startswith("text/event-stream")
    assert first_line.startswith("data: ")
    assert json.loads(first_line.removeprefix("data: "))["sequence"] == 1
    assert unknown.status_code == 404
