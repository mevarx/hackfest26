from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

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


@router.get("/{session_id}", response_model=SessionState)
async def get_session(
    session_id: str,
    session_store: SessionStoreDependency,
) -> SessionState:
    session = await session_store.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session
