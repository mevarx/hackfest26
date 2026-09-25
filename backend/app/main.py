from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import audit, health, learning_pathway, matching, sessions, skills
from app.config import Settings, get_settings
from app.storage.session_store import SessionStore, SqliteSessionStore


def create_app(
    settings: Settings | None = None,
    session_store: SessionStore | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    resolved_store = session_store or SqliteSessionStore(resolved_settings.database_path)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await resolved_store.initialize()
        try:
            yield
        finally:
            await resolved_store.close()

    application = FastAPI(
        title="ReRoute API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.state.session_store = resolved_store
    application.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health.router)
    application.include_router(sessions.router)
    application.include_router(audit.router)
    application.include_router(skills.router)
    application.include_router(learning_pathway.router)
    application.include_router(matching.router)
    return application


app = create_app()
