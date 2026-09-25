import asyncio
import json
import sqlite3
from pathlib import Path
from typing import Protocol

from app.models import SessionState


class SessionVersionConflictError(RuntimeError):
    def __init__(self, session_id: str) -> None:
        super().__init__(f"session version conflict: {session_id}")
        self.session_id = session_id


class SessionNotFoundError(LookupError):
    def __init__(self, session_id: str) -> None:
        super().__init__(f"session not found: {session_id}")
        self.session_id = session_id


class SessionStore(Protocol):
    async def initialize(self) -> None: ...

    async def create(self, session: SessionState) -> None: ...

    async def update(self, session: SessionState, expected_version: int) -> SessionState: ...

    async def upsert(self, session: SessionState, expected_version: int) -> SessionState: ...

    async def get(self, session_id: str) -> SessionState | None: ...

    async def close(self) -> None: ...


class SqliteSessionStore:
    def __init__(self, database_path: Path | str) -> None:
        self._database_path = str(database_path)
        self._uses_uri = self._database_path == ":memory:"
        self._database_target = (
            f"file:reroute_{id(self)}?mode=memory&cache=shared"
            if self._uses_uri
            else self._database_path
        )
        self._keeper: sqlite3.Connection | None = None

    async def initialize(self) -> None:
        await asyncio.to_thread(self._initialize)

    async def create(self, session: SessionState) -> None:
        await asyncio.to_thread(self._create, session)

    async def update(self, session: SessionState, expected_version: int) -> SessionState:
        return await asyncio.to_thread(self._update, session, expected_version)

    async def upsert(self, session: SessionState, expected_version: int) -> SessionState:
        return await asyncio.to_thread(self._upsert, session, expected_version, True)

    async def get(self, session_id: str) -> SessionState | None:
        return await asyncio.to_thread(self._get, session_id)

    async def close(self) -> None:
        await asyncio.to_thread(self._close)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self._database_target,
            timeout=30,
            uri=self._uses_uri,
        )
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        if self._uses_uri and self._keeper is None:
            self._keeper = sqlite3.connect(
                self._database_target,
                timeout=30,
                uri=True,
                check_same_thread=False,
            )
        elif not self._uses_uri:
            Path(self._database_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            if not self._uses_uri:
                connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    input_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    persona TEXT NOT NULL,
                    status TEXT NOT NULL,
                    source TEXT NOT NULL,
                    state_json TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            columns = {
                str(row["name"])
                for row in connection.execute("PRAGMA table_info(sessions)").fetchall()
            }
            if "version" not in columns:
                connection.execute(
                    "ALTER TABLE sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 0"
                )

    def _create(self, session: SessionState) -> None:
        if session.version != 0:
            raise ValueError("new sessions must start at version 0")
        values = self._session_values(session, 0)
        with self._connect() as connection:
            try:
                self._insert(connection, values)
            except sqlite3.IntegrityError as error:
                raise SessionVersionConflictError(session.session_id) from error

    def _update(self, session: SessionState, expected_version: int) -> SessionState:
        if session.version != expected_version:
            raise ValueError("session payload version must match expected_version")
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT version FROM sessions WHERE session_id = ?",
                (session.session_id,),
            ).fetchone()
            if row is None:
                raise SessionNotFoundError(session.session_id)
            if int(row["version"]) != expected_version:
                raise SessionVersionConflictError(session.session_id)
            stored = session.model_copy(update={"version": expected_version + 1})
            values = self._session_values(stored, expected_version + 1)
            cursor = connection.execute(
                """
                UPDATE sessions
                SET input_type = ?,
                    content = ?,
                    persona = ?,
                    status = ?,
                    source = ?,
                    state_json = ?,
                    payload_json = ?,
                    updated_at = ?,
                    version = ?
                WHERE session_id = ? AND version = ?
                """,
                (*values[1:8], values[9], values[10], session.session_id, expected_version),
            )
            if cursor.rowcount != 1:
                raise SessionVersionConflictError(session.session_id)
            return stored

    def _upsert(
        self,
        session: SessionState,
        expected_version: int,
        allow_missing: bool,
    ) -> SessionState:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT version FROM sessions WHERE session_id = ?",
                (session.session_id,),
            ).fetchone()
            if row is None:
                if not allow_missing or expected_version != 0:
                    raise SessionVersionConflictError(session.session_id)
                stored = session.model_copy(update={"version": 0})
                self._insert(connection, self._session_values(stored, 0))
                return stored
            if session.version != expected_version or int(row["version"]) != expected_version:
                raise SessionVersionConflictError(session.session_id)
            stored = session.model_copy(update={"version": expected_version + 1})
            values = self._session_values(stored, expected_version + 1)
            cursor = connection.execute(
                """
                UPDATE sessions
                SET input_type = ?,
                    content = ?,
                    persona = ?,
                    status = ?,
                    source = ?,
                    state_json = ?,
                    payload_json = ?,
                    updated_at = ?,
                    version = ?
                WHERE session_id = ? AND version = ?
                """,
                (*values[1:8], values[9], values[10], session.session_id, expected_version),
            )
            if cursor.rowcount != 1:
                raise SessionVersionConflictError(session.session_id)
            return stored

    def _get(self, session_id: str) -> SessionState | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return SessionState.model_validate_json(str(row["payload_json"]))

    def _close(self) -> None:
        if self._keeper is not None:
            self._keeper.close()
            self._keeper = None

    def _insert(self, connection: sqlite3.Connection, values: tuple[str, ...]) -> None:
        connection.execute(
            """
            INSERT INTO sessions (
                session_id,
                input_type,
                content,
                persona,
                status,
                source,
                state_json,
                payload_json,
                created_at,
                updated_at,
                version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )

    def _session_values(self, session: SessionState, version: int) -> tuple[str, ...]:
        state_json = json.dumps(session.state, allow_nan=False, separators=(",", ":"))
        stored = session.model_copy(update={"version": version})
        return (
            stored.session_id,
            stored.input_type,
            stored.content,
            stored.persona,
            stored.status,
            stored.source,
            state_json,
            stored.model_dump_json(),
            stored.created_at.isoformat(),
            stored.updated_at.isoformat(),
            str(version),
        )
