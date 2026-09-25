import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.domain.ghost_twin import GhostTwinOutcome, run_ghost_twin_audit
from app.main import create_app
from app.models import (
    GhostTwinAuditRequest,
    GhostTwinCandidateProfile,
    GhostTwinResult,
    SessionState,
)
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


def test_ghost_twin_models_use_fair_defaults() -> None:
    profile = GhostTwinCandidateProfile(
        career_gap="18 months",
        gender="female",
        age=29,
        college_tier="tier_2",
        city="Chennai",
    )
    request = GhostTwinAuditRequest(candidate_profile=profile, role_id="role-42")
    result = GhostTwinResult(actual_score=85, twins=[], max_delta=0, result="PASS")

    assert profile.skill_score == 85
    assert request.simulate_legacy_ats is False
    assert result.source == "local"


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


def test_session_stream_emits_ordered_sse_events_and_headers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delays: list[float] = []

    async def record_sleep(delay: float) -> None:
        delays.append(delay)

    monkeypatch.setattr("app.api.sessions.asyncio.sleep", record_sleep)
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    with TestClient(app) as client:
        start_response = client.post(
            "/session/start",
            json={
                "input_type": "text",
                "content": "I have manual testing experience.",
                "persona": "Kavya",
            },
        )
        session_id = start_response.json()["session_id"]
        before_stream = client.get(f"/session/{session_id}").json()
        response = client.get(f"/session/{session_id}/stream")
        after_stream = client.get(f"/session/{session_id}").json()
        second_response = client.get(f"/session/{session_id}/stream")
        unknown_response = client.get("/session/unknown/stream")

    frames = [frame for frame in response.text.strip().split("\n\n") if frame]
    events: list[dict[str, Any]] = [json.loads(frame[6:]) for frame in frames]
    second_frames = [frame for frame in second_response.text.strip().split("\n\n") if frame]
    second_events: list[dict[str, Any]] = [json.loads(frame[6:]) for frame in second_frames]

    assert start_response.status_code == 200
    assert response.status_code == 200
    assert second_response.status_code == 200
    assert unknown_response.status_code == 404
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["connection"] == "keep-alive"
    assert delays == [1, 1, 1, 1, 1, 1]
    assert len(frames) == 4
    assert len(events) == 4
    assert [event["agent"] for event in events] == [
        "ORCHESTRATOR",
        "GENAI",
        "HANA",
        "GHOST TWIN",
    ]
    assert [event["status"] for event in events] == ["running", "running", "running", "done"]
    assert [event["sequence"] for event in events] == [1, 2, 3, 4]
    assert len({event["event_id"] for event in events}) == 4
    assert [event["event_id"] for event in second_events] == [event["event_id"] for event in events]
    assert all(isinstance(event["message"], str) and event["message"] for event in events)
    assert all(isinstance(event["data"], dict) and event["data"] for event in events)
    assert events[-1]["data"]["result"] == "PASS"
    assert before_stream["version"] == after_stream["version"] == 0
    assert before_stream["state"] == after_stream["state"] == {}


def test_missing_session_returns_not_found(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    with TestClient(app) as client:
        response = client.get("/session/missing")

    assert response.status_code == 404


def test_openapi_contains_first_slice_routes(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    paths = app.openapi()["paths"]

    assert "/session/start" in paths
    assert "/session/{session_id}/stream" in paths
    stream_responses = paths["/session/{session_id}/stream"]["get"]["responses"]
    assert "text/event-stream" in stream_responses["200"]["content"]
    assert "404" in stream_responses
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
    assert payload["source"] == "local"
    assert payload["engine"] == "pure_python"
    assert all(twin["source"] == "local" for twin in payload["twins"])


def test_quality_analyst_demo_profile_fair_and_legacy_modes(tmp_path: Path) -> None:
    payload: dict[str, Any] = {
        "candidate_profile": {
            "career_gap": "18 months",
            "gender": "female",
            "age": 29,
            "college_tier": "tier_3",
            "city": "Chennai",
            "skill_score": 86,
        },
        "role_id": "quality-analyst",
    }
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    with TestClient(app) as client:
        fair_response = client.post("/audit/ghost-twin", json=payload)
        legacy_response = client.post(
            "/audit/ghost-twin",
            json={**payload, "simulate_legacy_ats": True},
        )

    fair = fair_response.json()
    legacy = legacy_response.json()
    assert fair_response.status_code == 200
    assert legacy_response.status_code == 200
    assert fair["actual_score"] == 86
    assert all(twin["score"] == fair["actual_score"] for twin in fair["twins"])
    assert fair["max_delta"] == 0
    assert fair["result"] == "PASS"
    assert legacy["max_delta"] > 5
    assert legacy["result"] == "FLAGGED"
    assert legacy["threshold"] == 5


def test_audit_forwards_skill_score_and_legacy_simulation_defaults(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    original_run = run_ghost_twin_audit
    captured: list[dict[str, Any]] = []

    def capture_run(**kwargs: Any) -> GhostTwinOutcome:
        captured.append(kwargs)
        return original_run(**kwargs)

    monkeypatch.setattr("app.api.audit.run_ghost_twin_audit", capture_run)
    base_profile: dict[str, Any] = {
        "career_gap": "18 months",
        "gender": "female",
        "age": 29,
        "college_tier": "tier_2",
        "city": "Chennai",
    }
    with TestClient(app) as client:
        explicit_response = client.post(
            "/audit/ghost-twin",
            json={
                "candidate_profile": {**base_profile, "skill_score": 72},
                "role_id": "role-42",
                "simulate_legacy_ats": True,
            },
        )
        default_response = client.post(
            "/audit/ghost-twin",
            json={"candidate_profile": base_profile, "role_id": "role-42"},
        )

    assert explicit_response.status_code == 200
    assert default_response.status_code == 200
    assert captured[0]["skill_score"] == 72
    assert captured[0]["simulate_legacy_ats"] is True
    assert captured[1]["skill_score"] == 85
    assert captured[1]["simulate_legacy_ats"] is False


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


def test_new_ghost_twin_wire_fields_are_strict(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    base_profile: dict[str, Any] = {
        "career_gap": "18 months",
        "gender": "female",
        "age": 29,
        "college_tier": "tier_2",
        "city": "Chennai",
    }
    with TestClient(app) as client:
        string_skill_response = client.post(
            "/audit/ghost-twin",
            json={
                "candidate_profile": {**base_profile, "skill_score": "86"},
                "role_id": "role-42",
            },
        )
        string_flag_response = client.post(
            "/audit/ghost-twin",
            json={
                "candidate_profile": base_profile,
                "role_id": "role-42",
                "simulate_legacy_ats": "true",
            },
        )
        integer_flag_response = client.post(
            "/audit/ghost-twin",
            json={
                "candidate_profile": base_profile,
                "role_id": "role-42",
                "simulate_legacy_ats": 1,
            },
        )

    assert string_skill_response.status_code == 422
    assert string_flag_response.status_code == 422
    assert integer_flag_response.status_code == 422


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
