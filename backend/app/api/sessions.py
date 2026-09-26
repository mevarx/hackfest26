import asyncio
import importlib
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated, cast
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import StreamingResponse
from starlette.requests import HTTPConnection

from app.api.dependencies import SessionStoreDependency, SettingsDependency
from app.config import Settings, session_source
from app.models import AgentEvent, SessionStartRequest, SessionStartResponse, SessionState
from app.realtime import (
    LAST_EVENT_ID_HEADER,
    LAST_EVENT_ID_QUERY_PARAM,
    ConnectionRegistry,
    RealtimeRegistryDependency,
    parse_last_event_id,
)
from app.storage.session_store import SessionStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/session", tags=["sessions"])

SESSION_NOT_FOUND_CLOSE_CODE = 4404
ORCHESTRATION_ATTACH_GRACE_SECONDS = 0.15
ORCHESTRATION_TASKS_STATE_KEY = "orchestration_tasks"
_ORCHESTRATION_MODULE = "app.orchestrator"
_ORCHESTRATION_ENTRY_POINT = "run_orchestration"

OrchestrationRunner = Callable[..., Awaitable[object]]


def get_connection_session_store(connection: HTTPConnection) -> SessionStore:
    return cast(SessionStore, connection.app.state.session_store)


ConnectionSessionStoreDependency = Annotated[
    SessionStore,
    Depends(get_connection_session_store),
]


def load_orchestration_runner() -> OrchestrationRunner | None:
    try:
        module = importlib.import_module(_ORCHESTRATION_MODULE)
    except ImportError:
        logger.error("orchestration module %s is unavailable", _ORCHESTRATION_MODULE)
        return None
    entry_point = getattr(module, _ORCHESTRATION_ENTRY_POINT, None)
    if not callable(entry_point):
        logger.error(
            "%s.%s is not callable",
            _ORCHESTRATION_MODULE,
            _ORCHESTRATION_ENTRY_POINT,
        )
        return None
    return cast(OrchestrationRunner, entry_point)


@router.post("/start", response_model=SessionStartResponse)
async def start_session(
    request: SessionStartRequest,
    http_request: Request,
    session_store: SessionStoreDependency,
    settings: SettingsDependency,
    registry: RealtimeRegistryDependency,
) -> SessionStartResponse:
    now = datetime.now(UTC)
    source = session_source(settings)
    session = SessionState(
        session_id=str(uuid4()),
        input_type=request.input_type,
        content=request.content,
        persona=request.persona,
        status="started",
        source=source,
        state={},
        version=0,
        created_at=now,
        updated_at=now,
    )
    await session_store.create(session)
    task = asyncio.create_task(
        _orchestrate_session(
            session_id=session.session_id,
            settings=settings,
            session_store=session_store,
            registry=registry,
        )
    )
    _track_orchestration_task(http_request.app, task)
    return SessionStartResponse(session_id=session.session_id, source=source)


@router.websocket("/{session_id}/stream")
async def stream_session_events(
    websocket: WebSocket,
    session_id: str,
    session_store: ConnectionSessionStoreDependency,
    registry: RealtimeRegistryDependency,
) -> None:
    session = await session_store.get(session_id)
    if session is None:
        # The handshake has to be accepted before a close code can be delivered;
        # closing first makes the server reject the upgrade and the client cannot
        # tell "no such session" from any other rejection.
        await websocket.accept()
        await websocket.close(code=SESSION_NOT_FOUND_CLOSE_CODE)
        return
    await websocket.accept()
    try:
        await registry.join(
            session_id,
            websocket,
            after_sequence=_resume_sequence(websocket),
            store=session_store,
        )
        await _serve_client_messages(websocket)
    except WebSocketDisconnect:
        logger.debug("realtime client disconnected from %s", session_id)
    finally:
        await registry.disconnect(session_id, websocket)


@router.get(
    "/{session_id}/stream",
    response_class=StreamingResponse,
    deprecated=True,
    description=(
        "Deprecated Server-Sent Events mirror of the agent stream. Use the "
        "WebSocket at the same path, which replays persisted history and then "
        "delivers live events."
    ),
    responses={
        200: {"content": {"text/event-stream": {}}},
        404: {"description": "Session not found"},
    },
)
async def stream_session(
    session_id: str,
    session_store: SessionStoreDependency,
) -> StreamingResponse:
    session = await session_store.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return StreamingResponse(
        _session_event_stream(session_id),
        media_type="text/event-stream",
        headers={
            # `Connection` is hop-by-hop and must not be set by an application.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{session_id}", response_model=SessionState)
async def get_session(
    session_id: str,
    session_store: SessionStoreDependency,
) -> SessionState:
    session = await session_store.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


async def _orchestrate_session(
    *,
    session_id: str,
    settings: Settings,
    session_store: SessionStore,
    registry: ConnectionRegistry,
) -> None:
    """Run the orchestrator for one session and mirror its events to the sockets.

    The run is delegated to ``app.orchestrator.run_orchestration``, which owns
    session persistence: this task only forwards every event it is handed to the
    registry and never writes session state itself. A short grace window waits for
    the first stream subscriber so a client that opens the socket right after
    ``POST /session/start`` receives the run live instead of by replay; a client
    that never attaches loses nothing because replay serves the history.
    """
    runner = load_orchestration_runner()
    if runner is None:
        return
    if not await registry.wait_for_subscriber(session_id, ORCHESTRATION_ATTACH_GRACE_SECONDS):
        logger.debug("no realtime subscriber attached to %s; starting the run anyway", session_id)
    session = await session_store.get(session_id)
    if session is None:
        logger.warning("orchestration skipped for missing session: %s", session_id)
        return

    async def broadcast_event(event: AgentEvent) -> None:
        await registry.broadcast(session_id, event)

    try:
        await runner(
            settings=settings,
            session=session,
            store=session_store,
            on_event=broadcast_event,
        )
    except Exception:
        logger.exception("orchestration failed for session: %s", session_id)


def _track_orchestration_task(app: FastAPI, task: asyncio.Task[None]) -> None:
    state = app.state
    tasks = getattr(state, ORCHESTRATION_TASKS_STATE_KEY, None)
    if not isinstance(tasks, set):
        tasks = set[asyncio.Task[None]]()
        setattr(state, ORCHESTRATION_TASKS_STATE_KEY, tasks)
    tracked: set[asyncio.Task[None]] = tasks
    tracked.add(task)
    task.add_done_callback(tracked.discard)


def _resume_sequence(websocket: WebSocket) -> int:
    return parse_last_event_id(
        websocket.query_params.get(LAST_EVENT_ID_QUERY_PARAM)
        or websocket.headers.get(LAST_EVENT_ID_HEADER)
    )


async def _serve_client_messages(websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            return
        text = message.get("text")
        if isinstance(text, str) and _is_ping(text):
            await websocket.send_text(json.dumps({"type": "pong"}, separators=(",", ":")))
        else:
            logger.debug("ignoring unknown realtime client message")


def _is_ping(raw_message: str) -> bool:
    try:
        payload = json.loads(raw_message)
    except json.JSONDecodeError:
        return False
    return isinstance(payload, dict) and payload.get("type") == "ping"


async def _session_event_stream(session_id: str) -> AsyncIterator[str]:
    events: tuple[dict[str, object], ...] = (
        {
            "agent": "ORCHESTRATOR",
            "status": "running",
            "message": "Starting session orchestration",
            "data": {"session_id": session_id, "phase": "starting"},
        },
        {
            "agent": "GENAI",
            "status": "running",
            "message": "Extracting skills from transcript",
            "data": {"skill_claims": 3, "phase": "extracting_skills"},
        },
        {
            "agent": "HANA",
            "status": "running",
            "message": "Storing skill passport",
            "data": {"passport_id": f"passport-{session_id}", "source": "simulated"},
        },
        {
            "agent": "GHOST TWIN",
            "status": "done",
            "message": "Ghost Twin audit passed",
            "data": {"result": "PASS", "max_delta": 0, "source": "simulated"},
        },
    )
    for sequence, event in enumerate(events, start=1):
        if sequence > 1:
            await asyncio.sleep(1)
        payload = {
            **event,
            "event_id": f"{session_id}:event:{sequence}",
            "sequence": sequence,
        }
        yield f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"
