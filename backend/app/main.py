import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import audit, health, learning_pathway, market, matching, sessions, skills
from app.config import Settings, get_settings
from app.services import hana_client
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
        keep_alive_task = _start_hana_keep_alive(resolved_settings)
        try:
            yield
        finally:
            await _stop_hana_keep_alive(keep_alive_task)
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
    application.include_router(market.router)
    return application


app = create_app()


def _start_hana_keep_alive(settings: Settings) -> asyncio.Task[None] | None:
    if settings.use_mock_hana or not hana_client.is_available(settings):
        return None
    return asyncio.create_task(
        hana_client.keep_alive_loop(settings),
        name="hana-keep-alive",
    )


async def _stop_hana_keep_alive(task: asyncio.Task[None] | None) -> None:
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        return
