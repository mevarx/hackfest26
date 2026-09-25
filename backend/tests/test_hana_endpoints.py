from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def build_client(tmp_path: Path, **overrides: Any) -> TestClient:
    return TestClient(create_app(Settings(database_path=tmp_path / "reroute.db", **overrides)))


def test_route_endpoint_returns_simulated_path_in_mock_mode(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        response = client.get(
            "/route",
            params={
                "from_skill": "Manual testing",
                "target_role": "qa-analyst",
                "hours_per_week": 10,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "simulated"
    assert payload["from_skill"] == "Manual testing"
    assert payload["target_role"] == "qa-analyst"
    assert payload["hours_per_week"] == 10
    assert payload["legs"]
    assert payload["legs"][0]["skill"] == "Manual testing"
    assert payload["legs"][0]["hours"] == 0
    assert payload["total_hours"] == sum(leg["hours"] for leg in payload["legs"])
    assert payload["weeks"] == round(payload["total_hours"] / 10, 1)
    assert payload["weeks"] > 0
    assert payload["paid_bridge"] is not None
    assert payload["paid_bridge"]["source"] == "simulated"


def test_route_endpoint_is_deterministic(tmp_path: Path) -> None:
    params: dict[str, str | int] = {
        "from_skill": "Manual testing",
        "target_role": "sdet",
        "hours_per_week": 8,
    }
    with build_client(tmp_path) as client:
        first = client.get("/route", params=params)
        second = client.get("/route", params=params)

    assert first.status_code == 200
    assert first.json() == second.json()


def test_route_endpoint_rejects_unknown_skill_or_role(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        unknown_skill = client.get(
            "/route",
            params={"from_skill": "Underwater basket weaving", "target_role": "qa-analyst"},
        )
        unknown_role = client.get(
            "/route",
            params={"from_skill": "Manual testing", "target_role": "astronaut"},
        )
        invalid_hours = client.get(
            "/route",
            params={
                "from_skill": "Manual testing",
                "target_role": "qa-analyst",
                "hours_per_week": 0,
            },
        )

    assert unknown_skill.status_code == 422
    assert "Underwater basket weaving" in unknown_skill.json()["detail"]
    assert unknown_role.status_code == 422
    assert "astronaut" in unknown_role.json()["detail"]
    assert invalid_hours.status_code == 422


def test_route_falls_back_to_simulated_when_hana_query_fails(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    def explode(*_: object, **__: object) -> None:
        raise RuntimeError("HANA unreachable")

    monkeypatch.setattr("app.services.hana_client.is_available", lambda settings: True)
    monkeypatch.setattr("app.services.hana_client.run_query", explode)
    with build_client(tmp_path, use_mock_hana=False) as client:
        response = client.get(
            "/route",
            params={"from_skill": "Manual testing", "target_role": "qa-analyst"},
        )

    assert response.status_code == 200
    assert response.json()["source"] == "simulated"
    assert response.json()["total_hours"] > 0


def test_match_endpoint_ranks_roles_and_labels_simulated(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        response = client.post(
            "/match",
            json={"passport_id": "passport-kavya", "constraints": {"commute_km": 30}},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "simulated"
    assert payload["guardrail_threshold_pct"] == 15.0
    assert payload["matches"]
    allowed = [match for match in payload["matches"] if not match["blocked_by_guardrail"]]
    blocked = [match for match in payload["matches"] if match["blocked_by_guardrail"]]
    assert allowed
    assert [match["score"] for match in allowed] == sorted(
        (match["score"] for match in allowed), reverse=True
    )
    if blocked:
        assert [match["score"] for match in blocked] == sorted(
            (match["score"] for match in blocked), reverse=True
        )
        allowed_roles = {match["role_id"] for match in allowed}
        blocked_roles = {match["role_id"] for match in blocked}
        last_allowed_index = max(
            index
            for index, match in enumerate(payload["matches"])
            if match["role_id"] in allowed_roles
        )
        first_blocked_index = min(
            index
            for index, match in enumerate(payload["matches"])
            if match["role_id"] in blocked_roles
        )
        assert last_allowed_index < first_blocked_index
    for match in payload["matches"]:
        assert match["source"] == "simulated"
        assert 0.0 <= match["similarity"] <= 1.0
        assert 0.0 <= match["score"] <= 1.0


def test_match_guardrail_blocks_pay_cut_unless_opted_in(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        strict = client.post(
            "/match",
            json={"passport_id": "passport-kavya", "constraints": {"accept_pay_cut": False}},
        ).json()
        opted_in = client.post(
            "/match",
            json={"passport_id": "passport-kavya", "constraints": {"accept_pay_cut": True}},
        ).json()

    strict_blocked = {
        match["role_id"] for match in strict["matches"] if match["blocked_by_guardrail"]
    }
    opted_blocked = {
        match["role_id"] for match in opted_in["matches"] if match["blocked_by_guardrail"]
    }

    assert strict_blocked
    assert strict_blocked.isdisjoint(opted_blocked)
    for match in strict["matches"]:
        if match["blocked_by_guardrail"]:
            assert match["pay_delta_pct"] < -15.0
            assert "wage-scar" in (match["guardrail_reason"] or "")
            assert match["score"] <= 0.25


def test_match_uses_session_passport_when_session_id_supplied(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        session_id = client.post(
            "/session/start",
            json={
                "input_type": "text",
                "content": "I wrote regression tests and Postman collections.",
                "persona": "Kavya",
            },
        ).json()["session_id"]
        client.post(
            "/skills/extract",
            json={
                "transcript": "I wrote regression tests and Postman collections for API testing.",
                "session_id": session_id,
            },
        )
        response = client.post(
            "/match",
            json={
                "passport_id": f"passport-{session_id}",
                "session_id": session_id,
                "constraints": {"commute_km": 25, "hours": 40, "language": "English"},
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["passport_id"] == f"passport-{session_id}"
    assert payload["source"] == "simulated"
    assert payload["matches"]


def test_match_falls_back_to_simulated_when_hana_query_fails(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    def explode(*_: object, **__: object) -> None:
        raise RuntimeError("HANA unreachable")

    monkeypatch.setattr("app.services.hana_client.is_available", lambda settings: True)
    monkeypatch.setattr("app.services.hana_client.run_query", explode)
    with build_client(tmp_path, use_mock_hana=False) as client:
        response = client.post("/match", json={"passport_id": "passport-kavya"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "simulated"
    assert payload["matches"]
    assert all(match["source"] == "simulated" for match in payload["matches"])


def test_match_rejects_missing_session_or_passport(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        session_id = client.post(
            "/session/start",
            json={"input_type": "text", "content": "hello", "persona": "Kavya"},
        ).json()["session_id"]
        missing_session = client.post(
            "/match",
            json={"passport_id": "passport-x", "session_id": "does-not-exist"},
        )
        no_passport = client.post(
            "/match",
            json={"passport_id": "passport-x", "session_id": session_id},
        )

    assert missing_session.status_code == 404
    assert no_passport.status_code in {404, 409}


def test_new_routes_are_registered_in_openapi(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    paths = app.openapi()["paths"]

    assert "/route" in paths
    assert "/match" in paths
    assert "get" in paths["/route"]
    assert "post" in paths["/match"]


def test_health_reports_configured_hana_without_exposing_password(tmp_path: Path) -> None:
    with build_client(
        tmp_path,
        use_mock_hana=False,
        hana_host="trial.example.test",
        hana_user="SAPADMIN",
        hana_password="super-secret-hana",
    ) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["hana"] == {
        "mode": "live",
        "source": "live",
        "integration_status": "configured",
    }
    assert "super-secret-hana" not in response.text


def test_match_labels_live_source_when_hana_answers(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    from app.mocks.role_fixtures import ROLE_PROFILES
    from app.services.embedding_provider import EMBEDDING_DIMENSIONS

    def fake_run_query(
        settings: Any,
        sql: str,
        parameters: Any = None,
    ) -> list[dict[str, Any]]:
        return [
            {
                "ROLE_ID": profile.role_id,
                "SIMILARITY": 0.9 - index * 0.05,
                "EMBEDDING": [0.0] * EMBEDDING_DIMENSIONS,
            }
            for index, profile in enumerate(ROLE_PROFILES[:3])
        ]

    monkeypatch.setattr("app.services.hana_client.is_available", lambda settings: True)
    monkeypatch.setattr("app.services.hana_client.run_query", fake_run_query)
    with build_client(tmp_path, use_mock_hana=False) as client:
        response = client.post("/match", json={"passport_id": "passport-kavya"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "live"
    assert len(payload["matches"]) == 3
    assert all(match["source"] == "live" for match in payload["matches"])
    assert {match["similarity"] for match in payload["matches"]} == {0.9, 0.85, 0.8}
    assert {match["role_id"] for match in payload["matches"]} == {
        profile.role_id for profile in ROLE_PROFILES[:3]
    }
    scores = [match["score"] for match in payload["matches"]]
    assert scores == sorted(scores, reverse=True)


def test_health_reports_hana_not_configured_without_credentials(tmp_path: Path) -> None:
    with build_client(tmp_path, use_mock_hana=False) as client:
        response = client.get("/health")

    assert response.json()["hana"] == {
        "mode": "live",
        "source": "live",
        "integration_status": "not_implemented",
    }
