import asyncio
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import SessionState
from app.storage.session_store import (
    SessionNotFoundError,
    SessionVersionConflictError,
    SqliteSessionStore,
)


def make_session(session_id: str = "session-1") -> SessionState:
    now = datetime.now(UTC)
    return SessionState(
        session_id=session_id,
        input_type="text",
        content="I am looking for a role in quality assurance.",
        persona="Kavya",
        state={"workflow": {"status": "initialized"}},
        source="local",
        version=0,
        created_at=now,
        updated_at=now,
    )


def test_session_persistence(tmp_path: Path) -> None:
    database_path = tmp_path / "state" / "reroute.db"
    session = make_session()

    async def exercise_store() -> None:
        store = SqliteSessionStore(database_path)
        await store.initialize()
        try:
            await store.create(session)
            loaded = await store.get(session.session_id)
            assert loaded == session
        finally:
            await store.close()

    asyncio.run(exercise_store())


def test_memory_database_persists_across_store_operations() -> None:
    session = make_session("memory-session")

    async def exercise_store() -> None:
        store = SqliteSessionStore(":memory:")
        await store.initialize()
        try:
            await store.create(session)
            assert await store.get(session.session_id) == session
        finally:
            await store.close()

    asyncio.run(exercise_store())


def test_update_upsert_uses_versions_and_detects_conflicts() -> None:
    session = make_session("versioned-session")
    updated = session.model_copy(
        update={
            "status": "running",
            "state": {"workflow": {"status": "running"}},
            "updated_at": datetime.now(UTC),
        }
    )

    async def exercise_store() -> None:
        store = SqliteSessionStore(":memory:")
        await store.initialize()
        try:
            await store.create(session)
            stored = await store.update(updated, expected_version=0)
            loaded = await store.get(session.session_id)
            assert stored.version == 1
            assert loaded is not None
            assert loaded.status == "running"

            stale = session.model_copy(update={"status": "waiting"})
            with pytest.raises(SessionVersionConflictError):
                await store.update(stale, expected_version=0)

            upserted = await store.upsert(stored, expected_version=1)
            assert upserted.version == 2
            with pytest.raises(SessionNotFoundError):
                await store.update(make_session("missing"), expected_version=0)
        finally:
            await store.close()

    asyncio.run(exercise_store())


def test_session_start_and_get_round_trip(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    with TestClient(app) as client:
        start_response = client.post(
            "/session/start",
            json={
                "input_type": "text",
                "content": "Manual testing experience",
                "persona": "Kavya",
            },
        )
        session_id = start_response.json()["session_id"]
        get_response = client.get(f"/session/{session_id}")

    assert start_response.status_code == 200
    assert start_response.json()["source"] == "simulated"
    assert get_response.status_code == 200
    assert get_response.json()["session_id"] == session_id
    assert get_response.json()["persona"] == "Kavya"
    assert get_response.json()["state"] == {}
    assert get_response.json()["status"] == "started"
    assert get_response.json()["version"] == 0


def test_missing_session_returns_not_found(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    with TestClient(app) as client:
        response = client.get("/session/missing")

    assert response.status_code == 404


def test_openapi_contains_first_slice_routes(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    paths = app.openapi()["paths"]

    assert "/session/start" in paths
    assert "/session/{session_id}" in paths
    assert "/audit/ghost-twin" in paths
    assert "/health" in paths
    assert "/route" not in paths


def test_ghost_twin_audit_endpoint(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    with TestClient(app) as client:
        response = client.post(
            "/audit/ghost-twin",
            json={
                "candidate_profile": {
                    "career_gap": {"months": 18},
                    "gender": "female",
                    "age": 29,
                    "college_tier": "tier_2",
                    "city": "Chennai",
                },
                "role_id": "role-42",
                "threshold": 5,
            },
        )

    payload = response.json()
    assert response.status_code == 200
    assert len(payload["twins"]) == 5
    assert payload["threshold"] == 5
    assert payload["result"] in {"PASS", "FLAGGED"}
    assert payload["source"] == "live"
    assert payload["engine"] == "pure_python"
    assert all(twin["source"] == "live" for twin in payload["twins"])


def test_server_threshold_cannot_be_overridden(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db", ghost_twin_threshold=7))
    payload: dict[str, Any] = {
        "candidate_profile": {
            "career_gap": "18 months",
            "gender": "female",
            "age": 29,
            "college_tier": "tier_2",
            "city": "Chennai",
        },
        "role_id": "role-42",
    }
    with TestClient(app) as client:
        default_response = client.post("/audit/ghost-twin", json=payload)
        mismatched_response = client.post(
            "/audit/ghost-twin",
            json={**payload, "threshold": 5},
        )

    assert default_response.status_code == 200
    assert default_response.json()["threshold"] == 7
    assert mismatched_response.status_code == 422
    assert "server guardrail" in mismatched_response.json()["detail"]


def test_invalid_payloads_are_rejected(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    with TestClient(app) as client:
        invalid_session = client.post(
            "/session/start",
            json={"input_type": "video", "content": "test", "persona": "Kavya"},
        )
        invalid_audit = client.post(
            "/audit/ghost-twin",
            json={
                "candidate_profile": {
                    "career_gap": "18",
                    "gender": "female",
                    "age": 29,
                    "college_tier": "tier_2",
                    "city": "Chennai",
                },
                "role_id": "role-42",
            },
        )
        missing_attribute = client.post(
            "/audit/ghost-twin",
            json={
                "candidate_profile": {
                    "gender": "female",
                    "age": 29,
                    "college_tier": "tier_2",
                    "city": "Chennai",
                },
                "role_id": "role-42",
            },
        )

    assert invalid_session.status_code == 422
    assert invalid_audit.status_code == 422
    assert missing_attribute.status_code == 422


def test_health_uses_app_settings_without_claiming_unimplemented_sap_is_live(
    tmp_path: Path,
) -> None:
    app = create_app(
        Settings(
            database_path=tmp_path / "reroute.db",
            use_mock_hana=False,
            use_mock_genai=True,
        )
    )
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["hana"] == {
        "mode": "live",
        "source": "local",
        "integration_status": "not_implemented",
    }
    assert response.json()["genai"] == {
        "mode": "mock",
        "source": "simulated",
        "integration_status": "not_implemented",
    }
