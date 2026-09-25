import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import SessionStoreDependency, SettingsDependency
from app.config import session_source
from app.models import SessionStartRequest, SessionStartResponse, SessionState

router = APIRouter(prefix="/session", tags=["sessions"])


@router.post("/start", response_model=SessionStartResponse)
async def start_session(
    request: SessionStartRequest,
    session_store: SessionStoreDependency,
    settings: SettingsDependency,
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
    return SessionStartResponse(session_id=session.session_id, source=source)


@router.get(
    "/{session_id}/stream",
    response_class=StreamingResponse,
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
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
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
