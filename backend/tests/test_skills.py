from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

KAVYA_TRANSCRIPT = (
    "I spent six years as a manual tester. I wrote regression test cases in Jira, "
    "reproduced production defects, and maintained Postman collections for API testing. "
    "I also wrote Selenium scripts for smoke tests and helped validate SQL data."
)

SECURE_TRANSCRIPT = (
    "I coordinated release verification with stakeholders and wrote a test plan "
    "for a new billing module."
)


def build_client(tmp_path: Path, **overrides: Any) -> TestClient:
    return TestClient(create_app(Settings(database_path=tmp_path / "reroute.db", **overrides)))


def test_mock_extraction_is_deterministic_and_labeled(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        first = client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT})
        second = client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT})

    assert first.status_code == 200
    assert first.json() == second.json()
    payload = first.json()
    assert payload["source"] == "simulated"
    assert payload["skills"]
    assert all(0.6 <= skill["confidence"] <= 0.95 for skill in payload["skills"])
    assert payload["needs_proof"]


def test_mock_extraction_reads_transcript_specific_skills(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        kavya = client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT}).json()
        other = client.post("/skills/extract", json={"transcript": SECURE_TRANSCRIPT}).json()

    kavya_names = {skill["name"] for skill in kavya["skills"]}
    other_names = {skill["name"] for skill in other["skills"]}
    assert "Regression testing" in kavya_names
    assert kavya_names != other_names


def test_mock_work_sample_scores_and_issues_credential(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        short = client.post(
            "/skills/work-sample",
            json={"skill_id": "Regression testing", "submission": "Wrote cases."},
        ).json()
        detailed = client.post(
            "/skills/work-sample",
            json={
                "skill_id": "Regression testing",
                "submission": "Wrote a regression suite covering checkout and returns.",
            },
        ).json()

    assert short["source"] == "simulated"
    assert detailed["source"] == "simulated"
    assert 0 <= short["score"] <= 100
    assert detailed["score"] > short["score"]
    assert detailed["credential_issued"] is True


def test_extraction_persists_passport_into_session(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        session_id = client.post(
            "/session/start",
            json={"input_type": "text", "content": KAVYA_TRANSCRIPT, "persona": "Kavya"},
        ).json()["session_id"]
        extraction = client.post(
            "/skills/extract",
            json={"transcript": KAVYA_TRANSCRIPT, "session_id": session_id},
        )
        session = client.get(f"/session/{session_id}").json()

    assert extraction.status_code == 200
    assert session["passport"] is not None
    assert session["passport"]["owner"] == "Kavya"
    assert session["passport"]["passport_id"] == f"passport-{session_id}"
    assert session["passport"]["source"] == "simulated"
    assert session["skills_source"] == "simulated"
    assert {claim["name"] for claim in session["passport"]["skills"]} == {
        skill["name"] for skill in extraction.json()["skills"]
    }
    assert any(claim["verified"] is False for claim in session["passport"]["skills"])


def test_work_sample_marks_skill_verified_and_records_credential(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        session_id = client.post(
            "/session/start",
            json={"input_type": "text", "content": KAVYA_TRANSCRIPT, "persona": "Kavya"},
        ).json()["session_id"]
        client.post(
            "/skills/extract",
            json={"transcript": KAVYA_TRANSCRIPT, "session_id": session_id},
        )
        work_sample = client.post(
            "/skills/work-sample",
            json={
                "skill_id": "Regression testing",
                "submission": "Built a full regression pack for the billing release.",
                "session_id": session_id,
            },
        )
        session = client.get(f"/session/{session_id}").json()

    assert work_sample.status_code == 200
    assert work_sample.json()["credential_issued"] is True
    claims = {claim["name"]: claim for claim in session["passport"]["skills"]}
    assert claims["Regression testing"]["verified"] is True
    assert "Regression testing" in session["passport"]["credentials"]


def test_sessions_without_passport_reject_work_sample_persistence(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        session_id = client.post(
            "/session/start",
            json={"input_type": "text", "content": "hello", "persona": "Kavya"},
        ).json()["session_id"]
        without_passport = client.post(
            "/skills/work-sample",
            json={
                "skill_id": "Regression testing",
                "submission": "evidence",
                "session_id": session_id,
            },
        )
        missing_session = client.post(
            "/skills/extract",
            json={"transcript": KAVYA_TRANSCRIPT, "session_id": "does-not-exist"},
        )

    assert without_passport.status_code == 409
    assert missing_session.status_code == 404


def test_live_mode_falls_back_to_simulated_when_hub_call_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def explode(*_: object, **__: object) -> object:
        raise RuntimeError("GenAI Hub unreachable")

    monkeypatch.setattr("app.services.genai_hub._post_orchestration", explode)
    with build_client(
        tmp_path,
        use_mock_genai=False,
        genai_hub_endpoint="https://genai.example.test/v1/orchestration",
        genai_hub_client_id="client",
        genai_hub_client_secret="secret",
        genai_hub_model="trial-model",
    ) as client:
        extraction = client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT})
        work_sample = client.post(
            "/skills/work-sample",
            json={"skill_id": "Regression testing", "submission": "Wrote cases."},
        )

    assert extraction.status_code == 200
    assert extraction.json()["source"] == "simulated"
    assert extraction.json()["skills"]
    assert work_sample.status_code == 200
    assert work_sample.json()["source"] == "simulated"


def test_live_mode_falls_back_when_configuration_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def explode(*_: object, **__: object) -> object:
        raise RuntimeError("must not be called")

    monkeypatch.setattr("app.services.genai_hub._post_orchestration", explode)
    with build_client(tmp_path, use_mock_genai=False) as client:
        response = client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT})

    assert response.status_code == 200
    assert response.json()["source"] == "simulated"


def test_live_mode_labels_successful_hub_responses_as_live(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.genai_hub._post_orchestration",
        lambda *_, **__: {
            "results": [
                {
                    "output": {
                        "choices": [
                            {
                                "message": {
                                    "content": (
                                        '{"skills": [{"name": "Test automation", '
                                        '"confidence": 0.88}], '
                                        '"needs_proof": ["Test automation"]}'
                                    )
                                }
                            }
                        ]
                    }
                }
            ]
        },
    )
    with build_client(
        tmp_path,
        use_mock_genai=False,
        genai_hub_endpoint="https://genai.example.test/v1/orchestration",
        genai_hub_client_id="client",
        genai_hub_client_secret="secret",
        genai_hub_model="trial-model",
    ) as client:
        response = client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT})

    assert response.status_code == 200
    assert response.json()["source"] == "live"
    assert response.json()["skills"] == [{"name": "Test automation", "confidence": 0.88}]


def test_live_work_sample_response_is_labeled_live(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.genai_hub._post_orchestration",
        lambda *_, **__: '{"score": 64}',
    )
    with build_client(
        tmp_path,
        use_mock_genai=False,
        genai_hub_endpoint="https://genai.example.test/v1/orchestration",
        genai_hub_client_id="client",
        genai_hub_client_secret="secret",
        genai_hub_model="trial-model",
    ) as client:
        response = client.post(
            "/skills/work-sample",
            json={"skill_id": "Regression testing", "submission": "evidence"},
        )

    assert response.status_code == 200
    assert response.json() == {"score": 64, "credential_issued": False, "source": "live"}


def test_health_reports_configured_genai_without_exposing_secrets(tmp_path: Path) -> None:
    with build_client(
        tmp_path,
        use_mock_genai=False,
        genai_hub_endpoint="https://genai.example.test/v1/orchestration",
        genai_hub_client_id="client",
        genai_hub_client_secret="super-secret-value",
        genai_hub_model="trial-model",
    ) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["genai"] == {
        "mode": "live",
        "source": "live",
        "integration_status": "configured",
    }
    assert "super-secret-value" not in response.text


def test_invalid_skill_payloads_are_rejected(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        empty_transcript = client.post("/skills/extract", json={"transcript": ""})
        empty_submission = client.post(
            "/skills/work-sample",
            json={"skill_id": "Regression testing", "submission": ""},
        )
        unknown_field = client.post(
            "/skills/extract",
            json={"transcript": "hello", "unexpected": True},
        )

    assert empty_transcript.status_code == 422
    assert empty_submission.status_code == 422
    assert unknown_field.status_code == 422
