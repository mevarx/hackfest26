import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api import matching
from app.config import Settings
from app.main import create_app
from app.mocks.role_fixtures import ROLE_PROFILES, role_embedding_text
from app.models import MatchConstraints, MatchResponse, RankedMatch, SkillClaim
from app.services import embedding_provider, inclusive_matching

KAVYA_TRANSCRIPT = (
    "I spent six years as a manual tester. I wrote regression test cases in Jira, "
    "reproduced production defects, and maintained Postman collections for API testing. "
    "I also wrote Selenium scripts for smoke tests and helped validate SQL data."
)
KAVYA_SKILLS: tuple[SkillClaim, ...] = (
    SkillClaim(name="Regression testing", confidence=0.92, verified=True),
    SkillClaim(name="API testing", confidence=0.88),
    SkillClaim(name="Defect triage", confidence=0.84, verified=True),
    SkillClaim(name="Test automation", confidence=0.76),
    SkillClaim(name="Compatibility testing", confidence=0.7),
    SkillClaim(name="Stakeholder communication", confidence=0.6),
)
LOW_PAY_ROLE_ID = "qa-test-associate"
LOW_PAY_ANNUAL_PAY = 450_000
CANDIDATE_ANNUAL_PAY = 660_000
GUARDRAIL_REASON = "Pay cut of 31.8% exceeds the 15% wage-scar guardrail"


@pytest.fixture(autouse=True)
def offline_embedder(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(embedding_provider.BACKEND_ENV_VAR, embedding_provider.HASHING_BACKEND)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(database_path=tmp_path / "reroute.db")


def build_client(tmp_path: Path, **overrides: Any) -> TestClient:
    application = create_app(Settings(database_path=tmp_path / "reroute.db", **overrides))
    application.include_router(matching.router)
    return TestClient(application)


def use_hana_stub(monkeypatch: pytest.MonkeyPatch, **attributes: Any) -> SimpleNamespace:
    defaults: dict[str, Any] = {
        "is_available": lambda _settings: True,
        "run_query": lambda *_args, **_kwargs: [],
        "run_scalar": lambda *_args, **_kwargs: 0,
    }
    defaults.update(attributes)
    stub = SimpleNamespace(**defaults)
    monkeypatch.setattr(inclusive_matching, "hana_client", stub)
    return stub


def live_rows() -> list[dict[str, Any]]:
    query = embedding_provider.embed_text(inclusive_matching.candidate_skill_text(KAVYA_SKILLS))
    rows: list[dict[str, Any]] = []
    for profile in ROLE_PROFILES:
        vector = embedding_provider.embed_text(role_embedding_text(profile))
        rows.append(
            {
                "ROLE_ID": profile.role_id,
                "TITLE": profile.title,
                "CITY": profile.city,
                "LANGUAGE": profile.language,
                "COMMUTE_KM": profile.commute_km,
                "WEEKLY_HOURS": profile.weekly_hours,
                "ANNUAL_PAY": profile.annual_pay,
                "REQUIRED_SKILLS": '["Regression testing", "API testing"]',
                "EMBEDDING": vector,
                "SIMILARITY": embedding_provider.cosine_similarity(query, vector),
            }
        )
    return rows


def test_mock_match_is_deterministic_and_schema_valid(settings: Settings) -> None:
    first = inclusive_matching.match(settings, KAVYA_SKILLS)
    second = inclusive_matching.match(settings, KAVYA_SKILLS)

    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert isinstance(first, MatchResponse)
    assert first.source == "simulated"
    assert first.guardrail_threshold_pct == 15.0
    assert first.matches
    assert len(first.matches) == len(ROLE_PROFILES)
    assert all(isinstance(candidate, RankedMatch) for candidate in first.matches)
    assert {candidate.source for candidate in first.matches} == {"simulated"}
    assert {candidate.role for candidate in first.matches} == {
        role.role_id for role in ROLE_PROFILES
    }
    assert all(0.0 <= candidate.similarity <= 1.0 for candidate in first.matches)
    assert all(0.0 <= candidate.score <= 1.0 for candidate in first.matches)
    allowed = [candidate.score for candidate in first.matches if not candidate.blocked_by_guardrail]
    blocked = [candidate.score for candidate in first.matches if candidate.blocked_by_guardrail]
    assert allowed == sorted(allowed, reverse=True)
    assert blocked == sorted(blocked, reverse=True)


def test_the_guardrail_threshold_is_the_response_contract(settings: Settings) -> None:
    assert inclusive_matching.GUARDRAIL_THRESHOLD_PCT == 15.0
    empty = inclusive_matching.match(settings, [], candidate_annual_pay=CANDIDATE_ANNUAL_PAY)
    assert empty.guardrail_threshold_pct == 15.0
    assert empty.matches


def test_the_seed_script_writes_exactly_where_the_matcher_reads() -> None:
    import scripts.seed_role_embeddings as seed_script

    assert seed_script.ROLE_EMBEDDINGS_PATH is inclusive_matching.ROLE_EMBEDDINGS_PATH


def test_guardrail_blocks_a_pay_cut_the_candidate_did_not_accept(settings: Settings) -> None:
    response = inclusive_matching.match(
        settings, KAVYA_SKILLS, candidate_annual_pay=CANDIDATE_ANNUAL_PAY
    )

    blocked = _match_for(response, LOW_PAY_ROLE_ID)
    assert blocked.annual_pay == LOW_PAY_ANNUAL_PAY
    assert blocked.pay_delta_pct == -31.8
    assert blocked.blocked_by_guardrail is True
    assert blocked.guardrail_reason == GUARDRAIL_REASON
    assert blocked.score <= inclusive_matching.BLOCKED_SCORE_CEILING
    assert blocked.similarity > 0.0
    flags = [candidate.blocked_by_guardrail for candidate in response.matches]
    assert flags == sorted(flags)


def test_guardrail_stays_open_when_the_candidate_accepts_a_pay_cut(settings: Settings) -> None:
    response = inclusive_matching.match(
        settings,
        KAVYA_SKILLS,
        constraints=MatchConstraints(accept_pay_cut=True),
        candidate_annual_pay=CANDIDATE_ANNUAL_PAY,
    )

    for role_id in (LOW_PAY_ROLE_ID, "manual-testing-technician"):
        candidate = _match_for(response, role_id)
        assert candidate.pay_delta_pct < 0
        assert candidate.blocked_by_guardrail is False
        assert candidate.guardrail_reason is None


def test_the_guardrail_threshold_applies_to_the_simulated_live_fallback(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def explode(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
        raise RuntimeError("SAP HANA Cloud unreachable")

    stub = use_hana_stub(monkeypatch)
    monkeypatch.setattr(stub, "run_query", explode)

    response = inclusive_matching.match(
        settings, KAVYA_SKILLS, candidate_annual_pay=CANDIDATE_ANNUAL_PAY
    )

    assert response.source == "simulated"
    assert {candidate.source for candidate in response.matches} == {"simulated"}
    assert response.guardrail_threshold_pct == 15.0
    fallback = _match_for(response, LOW_PAY_ROLE_ID)
    assert fallback.blocked_by_guardrail is True
    assert fallback.guardrail_reason == GUARDRAIL_REASON


def test_a_successful_live_query_is_labeled_live(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[str] = []

    def fake_run_query(
        _settings: Settings,
        sql: str,
        parameters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        captured.append(sql)
        return live_rows()

    stub = use_hana_stub(monkeypatch)
    monkeypatch.setattr(stub, "run_query", fake_run_query)

    response = inclusive_matching.match(
        settings, KAVYA_SKILLS, candidate_annual_pay=CANDIDATE_ANNUAL_PAY
    )

    assert response.source == "live"
    assert response.matches
    assert {candidate.source for candidate in response.matches} == {"live"}
    assert len(captured) == 1
    assert "ROLE_EMBEDDINGS" in captured[0]
    assert "COSINE_SIMILARITY" in captured[0]
    assert "TO_REAL_VECTOR(:query_embedding)" in captured[0]
    live_blocked = _match_for(response, LOW_PAY_ROLE_ID)
    assert live_blocked.blocked_by_guardrail is True
    assert live_blocked.guardrail_reason == GUARDRAIL_REASON


def test_the_query_embedding_is_a_plain_decimal_literal(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_run_query(
        _settings: Settings,
        _sql: str,
        parameters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        captured["parameters"] = parameters
        return live_rows()

    stub = use_hana_stub(monkeypatch)
    monkeypatch.setattr(stub, "run_query", fake_run_query)

    inclusive_matching.match(settings, KAVYA_SKILLS)

    literal = str(captured["parameters"]["query_embedding"])
    values = literal.split(",")
    assert len(values) == embedding_provider.EMBEDDING_DIMENSIONS
    assert all("e" not in value for value in values)


def test_a_live_row_with_the_wrong_dimension_falls_back_to_simulated(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rows = live_rows()
    rows[0]["EMBEDDING"] = [0.1] * (embedding_provider.EMBEDDING_DIMENSIONS - 1)
    use_hana_stub(monkeypatch, run_query=lambda *_args, **_kwargs: rows)

    response = inclusive_matching.match(settings, KAVYA_SKILLS)

    assert response.source == "simulated"
    assert {candidate.source for candidate in response.matches} == {"simulated"}


def test_the_two_column_live_query_falls_back_to_the_catalogue(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    narrow_rows = [
        {"ROLE_ID": row["ROLE_ID"], "EMBEDDING": row["EMBEDDING"], "SIMILARITY": row["SIMILARITY"]}
        for row in live_rows()
    ]
    wide_seen: list[str] = []

    def fake_run_query(
        _settings: Settings,
        sql: str,
        _parameters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        wide_seen.append(sql)
        if "TITLE" in sql:
            raise RuntimeError("ROLE_EMBEDDINGS has no TITLE column")
        return narrow_rows

    stub = use_hana_stub(monkeypatch)
    monkeypatch.setattr(stub, "run_query", fake_run_query)

    response = inclusive_matching.match(settings, KAVYA_SKILLS)

    assert len(wide_seen) == 2
    assert response.source == "live"
    assert {candidate.source for candidate in response.matches} == {"live"}
    assert {candidate.role_id for candidate in response.matches} == {
        role.role_id for role in ROLE_PROFILES
    }
    assert _match_for(response, LOW_PAY_ROLE_ID).annual_pay == LOW_PAY_ANNUAL_PAY


def test_an_empty_live_result_falls_back_to_simulated(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    use_hana_stub(monkeypatch, run_query=lambda *_args, **_kwargs: [])

    response = inclusive_matching.match(settings, KAVYA_SKILLS)

    assert response.source == "simulated"
    assert response.matches


def test_embedding_dimension_mismatch_is_rejected() -> None:
    with pytest.raises(ValueError, match="must have 384 dimensions"):
        embedding_provider.validate_embedding([0.1] * 8)
    with pytest.raises(ValueError, match="must have 384 dimensions"):
        embedding_provider.cosine_similarity(
            [0.1] * 8, [0.1] * embedding_provider.EMBEDDING_DIMENSIONS
        )
    with pytest.raises(ValueError, match="must have 384 dimensions, got 385"):
        embedding_provider.cosine_similarity(
            [0.1] * embedding_provider.EMBEDDING_DIMENSIONS,
            [0.1] * (embedding_provider.EMBEDDING_DIMENSIONS + 1),
        )
    assert len(embedding_provider.embed_text("Regression testing")) == 384
    assert embedding_provider.embed_texts([]) == []


def test_cosine_similarity_is_sane_for_identical_and_orthogonal_vectors() -> None:
    vector = embedding_provider.embed_text("Regression testing and API testing")
    other = embedding_provider.embed_text("Stakeholder communication for release sign-off")
    orthogonal = [0.0] * embedding_provider.EMBEDDING_DIMENSIONS
    orthogonal[7] = 1.0

    assert embedding_provider.cosine_similarity(vector, vector) == pytest.approx(1.0, abs=1e-9)
    assert embedding_provider.cosine_similarity(vector, orthogonal) == pytest.approx(0.0, abs=1e-9)
    assert -1.0 <= embedding_provider.cosine_similarity(vector, other) <= 1.0


def test_the_hashing_embedder_is_stable_and_never_loads_a_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def explode() -> Any:
        raise AssertionError("the model must not load while the backend is forced")

    monkeypatch.setattr(embedding_provider, "_load_model", explode)
    first = embedding_provider.embed_texts(["Regression testing", "API testing"])
    second = embedding_provider.embed_texts(["Regression testing", "API testing"])

    assert embedding_provider.active_backend() == embedding_provider.HASHING_BACKEND
    assert first == second
    for vector in first:
        assert len(vector) == embedding_provider.EMBEDDING_DIMENSIONS
        assert sum(value * value for value in vector) == pytest.approx(1.0, abs=1e-6)


def test_requesting_the_model_backend_still_serves_an_embedding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(embedding_provider.BACKEND_ENV_VAR, embedding_provider.MODEL_BACKEND)
    monkeypatch.setattr(embedding_provider, "_load_model", lambda: None)

    assert embedding_provider.active_backend() == embedding_provider.MODEL_BACKEND
    assert len(embedding_provider.embed_text("Regression testing")) == 384


def test_a_seeded_embeddings_file_drives_the_simulated_ranking(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    seed_path = tmp_path / "role_embeddings.json"
    monkeypatch.setattr(inclusive_matching, "ROLE_EMBEDDINGS_PATH", seed_path)
    replacement = embedding_provider.embed_text("Data validation for warehouse migrations")
    seed_path.write_text(json.dumps({LOW_PAY_ROLE_ID: replacement}), encoding="utf-8")
    candidate_vector = embedding_provider.embed_text(
        inclusive_matching.candidate_skill_text(KAVYA_SKILLS)
    )

    response = inclusive_matching.match(settings, KAVYA_SKILLS)

    assert inclusive_matching.load_role_embeddings() == {LOW_PAY_ROLE_ID: replacement}
    assert _match_for(response, LOW_PAY_ROLE_ID).similarity == pytest.approx(
        max(0.0, embedding_provider.cosine_similarity(candidate_vector, replacement)),
        abs=1e-6,
    )


def test_a_seeded_file_with_the_wrong_dimension_is_ignored(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    seed_path = tmp_path / "broken.json"
    seed_path.write_text(json.dumps({LOW_PAY_ROLE_ID: [0.5, 0.5]}), encoding="utf-8")
    monkeypatch.setattr(inclusive_matching, "ROLE_EMBEDDINGS_PATH", seed_path)

    assert inclusive_matching.load_role_embeddings() == {}


def test_constraints_penalize_without_emptying_the_table(settings: Settings) -> None:
    generous = MatchConstraints(commute_km=50, hours=60, language="English")
    short_hours = MatchConstraints(commute_km=50, hours=20, language="English")
    tamil_only = MatchConstraints(commute_km=50, hours=60, language="Tamil")
    relaxed = inclusive_matching.match(settings, KAVYA_SKILLS, constraints=generous)
    fewer_hours = inclusive_matching.match(settings, KAVYA_SKILLS, constraints=short_hours)
    other_language = inclusive_matching.match(settings, KAVYA_SKILLS, constraints=tamil_only)

    assert len(relaxed.matches) == len(fewer_hours.matches) == len(ROLE_PROFILES)
    assert len(other_language.matches) == len(ROLE_PROFILES)
    for role_id in ("sdet", "qa-analyst", "api-test-engineer"):
        assert _match_for(fewer_hours, role_id).score == pytest.approx(
            _match_for(relaxed, role_id).score - inclusive_matching.HOURS_PENALTY
        )
    assert _match_for(other_language, "qa-analyst").score == pytest.approx(
        _match_for(relaxed, "qa-analyst").score - inclusive_matching.LANGUAGE_PENALTY
    )
    assert _match_for(other_language, "support-operations-lead").score == pytest.approx(
        _match_for(relaxed, "support-operations-lead").score + inclusive_matching.LANGUAGE_PENALTY
    )


def test_a_long_commute_costs_a_role_some_score(settings: Settings) -> None:
    near = inclusive_matching.match(
        settings, KAVYA_SKILLS, constraints=MatchConstraints(commute_km=40)
    )
    far = inclusive_matching.match(
        settings, KAVYA_SKILLS, constraints=MatchConstraints(commute_km=12)
    )

    assert _match_for(far, "compatibility-test-lead").score == pytest.approx(
        _match_for(near, "compatibility-test-lead").score - inclusive_matching.COMMUTE_PENALTY
    )
    assert _match_for(far, "business-analyst").score == _match_for(near, "business-analyst").score


def test_target_role_is_ranked_first(settings: Settings) -> None:
    by_id = inclusive_matching.match(
        settings, KAVYA_SKILLS, target_role="manual-testing-technician"
    )
    by_title = inclusive_matching.match(settings, KAVYA_SKILLS, target_role="QA Analyst")
    unknown = inclusive_matching.match(settings, KAVYA_SKILLS, target_role="astronaut")

    assert by_id.matches[0].role_id == "manual-testing-technician"
    assert by_title.matches[0].role_id == "qa-analyst"
    assert len(unknown.matches) == len(ROLE_PROFILES)


def test_match_endpoint_resolves_the_session_passport(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        session_id = start_passport_session(client)
        response = client.post(
            "/match",
            json={
                "passport_id": f"passport-{session_id}",
                "session_id": session_id,
                "constraints": {"commute_km": 25, "hours": 40, "accept_pay_cut": False},
            },
        )
        missing = client.post(
            "/match",
            json={"passport_id": "passport-x", "session_id": "does-not-exist"},
        )
        empty = client.post(
            "/match",
            json={"passport_id": "passport-x", "session_id": start_session(client)},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["passport_id"] == f"passport-{session_id}"
    assert payload["source"] == "simulated"
    assert payload["guardrail_threshold_pct"] == 15.0
    assert payload["matches"]
    assert missing.status_code == 404
    assert empty.status_code == 404


def test_match_endpoint_accepts_a_passport_id_without_a_session(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        response = client.post("/match", json={"passport_id": "passport-kavya"})
        empty_passport = client.post("/match", json={"passport_id": ""})

    assert response.status_code == 200
    assert response.json()["passport_id"] == "passport-kavya"
    assert response.json()["matches"]
    assert empty_passport.status_code == 422


def test_match_endpoint_reads_the_candidate_pay_from_the_session(tmp_path: Path) -> None:
    application = create_app(Settings(database_path=tmp_path / "reroute.db"))
    application.include_router(matching.router)
    with TestClient(application) as client:
        session_id = start_passport_session(client)
        store = application.state.session_store
        session = asyncio.run(store.get(session_id))
        assert session is not None
        asyncio.run(
            store.update(
                session.merged(state={"candidate_annual_pay": 1_200_000}),
                expected_version=session.version,
            )
        )
        response = client.post(
            "/match",
            json={"passport_id": "passport-kavya", "session_id": session_id},
        )
        baseline = client.post("/match", json={"passport_id": "passport-kavya"})

    assert response.status_code == 200
    assert _match_for(
        MatchResponse.model_validate(response.json()), LOW_PAY_ROLE_ID
    ).pay_delta_pct == (-62.5)
    assert _match_for(
        MatchResponse.model_validate(baseline.json()), LOW_PAY_ROLE_ID
    ).pay_delta_pct == (-31.8)


def start_session(client: TestClient) -> str:
    response = client.post(
        "/session/start",
        json={"input_type": "text", "content": "hello", "persona": "Kavya"},
    )
    return str(response.json()["session_id"])


def start_passport_session(client: TestClient) -> str:
    session_id = start_session(client)
    client.post(
        "/skills/extract",
        json={"transcript": KAVYA_TRANSCRIPT, "session_id": session_id},
    )
    return session_id


def _match_for(response: MatchResponse, role_id: str) -> RankedMatch:
    for candidate in response.matches:
        if candidate.role_id == role_id:
            return candidate
    raise AssertionError(f"{role_id} is missing from the ranking")
