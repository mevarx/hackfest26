from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.mocks.employer_fixtures import JOB_POSTS
from app.mocks.market_fixtures import DISPLACEMENT_RADAR


def build_client(tmp_path: Path, **overrides: Any) -> TestClient:
    return TestClient(create_app(Settings(database_path=tmp_path / "reroute.db", **overrides)))


def test_displacement_radar_is_always_labeled_simulated(tmp_path: Path) -> None:
    entry = DISPLACEMENT_RADAR[0]
    with build_client(tmp_path) as client:
        response = client.get(
            "/market/displacement-radar",
            params={"role": entry["role"], "city": entry["city"]},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == entry["role"]
    assert payload["city"] == entry["city"]
    assert payload["exposure"] == entry["exposure"]
    assert payload["demand"] == entry["demand"]
    assert payload["source"] == "simulated"
    assert payload["disclaimer"]


def test_displacement_radar_defaults_city_and_rejects_unknown_role(tmp_path: Path) -> None:
    chennai = next(entry for entry in DISPLACEMENT_RADAR if entry["city"] == "Chennai")
    with build_client(tmp_path) as client:
        default_city = client.get("/market/displacement-radar", params={"role": chennai["role"]})
        unknown = client.get(
            "/market/displacement-radar",
            params={"role": "astropilot", "city": "Chennai"},
        )
        missing_role = client.get("/market/displacement-radar")

    assert default_city.status_code == 200
    assert default_city.json()["city"] == "Chennai"
    assert unknown.status_code == 404
    assert "astropilot" in unknown.json()["detail"]
    assert missing_role.status_code == 422


def test_employer_rewrite_returns_before_and_after_with_hidden_talent_count(
    tmp_path: Path,
) -> None:
    post = JOB_POSTS[0]
    with build_client(tmp_path) as client:
        response = client.post(
            "/employer/rewrite-filter",
            json={"job_post_id": post["post_id"]},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_post_id"] == post["post_id"]
    assert payload["hidden_talent_count"] == post["hidden_talent_count"]
    assert payload["hidden_talent_count"] > 0
    assert payload["filter_text_before"] != payload["filter_text_after"]
    assert payload["removed_criteria"]
    assert payload["restrictive_phrase"]
    assert payload["source"] == "simulated"
    assert payload["disclaimer"]


def test_employer_rewrite_rejects_unknown_post(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        response = client.post(
            "/employer/rewrite-filter",
            json={"job_post_id": "does-not-exist"},
        )

    assert response.status_code == 404
    assert "expected one of" in response.json()["detail"]


def test_market_and_employer_never_report_live_even_with_sap_unavailable(
    tmp_path: Path,
) -> None:
    entry = DISPLACEMENT_RADAR[0]
    post = JOB_POSTS[0]
    with build_client(
        tmp_path,
        use_mock_hana=False,
        use_mock_genai=False,
        hana_host="unreachable.invalid",
        hana_user="nobody",
        hana_password="nothing",
        genai_hub_endpoint="https://unreachable.invalid/orchestration",
        genai_hub_client_id="nobody",
        genai_hub_client_secret="nothing",
        genai_hub_model="nothing",
    ) as client:
        radar = client.get(
            "/market/displacement-radar",
            params={"role": entry["role"], "city": entry["city"]},
        )
        rewrite = client.post(
            "/employer/rewrite-filter",
            json={"job_post_id": post["post_id"]},
        )

    assert radar.json()["source"] == "simulated"
    assert rewrite.json()["source"] == "simulated"


def test_market_and_employer_routes_are_in_openapi(tmp_path: Path) -> None:
    app = create_app(Settings(database_path=tmp_path / "reroute.db"))
    paths = app.openapi()["paths"]

    assert "/market/displacement-radar" in paths
    assert "/employer/rewrite-filter" in paths
