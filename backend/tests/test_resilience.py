"""Demo-day safety net: SAP integrations configured live but genuinely unreachable.

Every guarantee asserted here is a promise ReRoute makes to a judge watching a
single demo run. Both SAP integrations are switched into live mode with real
looking credentials pointed at ``.invalid`` hostnames, the ``hdbcli`` driver and
the ``sentence-transformers`` model are both absent, and every outbound socket is
refused for the duration of the module. Under those conditions the app must still
answer HTTP 200 everywhere and must label every SAP-backed payload ``simulated``
rather than claiming data it never received.
"""

import asyncio
import socket
import time
from collections.abc import Callable, Iterator, Mapping
from contextlib import ExitStack
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final, Protocol, cast
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, SecretStr

from app.config import Settings, session_source
from app.main import create_app
from app.mocks.employer_fixtures import JOB_POSTS
from app.mocks.genai_fixtures import CREDENTIAL_THRESHOLD
from app.mocks.market_fixtures import DISPLACEMENT_RADAR
from app.models import (
    AgentEvent,
    DisplacementRadarResponse,
    EmployerFilterRewriteResponse,
    GhostTwinResult,
    HealthResponse,
    MatchResponse,
    RouteResponse,
    SessionStartResponse,
    SessionState,
    SkillExtractionResponse,
    WorkSampleResponse,
)
from app.orchestrator import AGENT_BY_NODE, OrchestrationResult, run_orchestration
from app.services import embedding_provider, genai_hub, hana_client
from app.storage.session_store import SessionStore

KAVYA_TRANSCRIPT: Final[str] = (
    "I spent six years as a manual tester. I wrote regression test cases in Jira, "
    "reproduced production defects, and maintained Postman collections for API testing. "
    "I also wrote Selenium scripts for smoke tests and helped validate SQL data."
)
WORK_SAMPLE_SUBMISSION: Final[str] = (
    "I built a regression pack for the billing release covering checkout, refunds and "
    "payment retries, and wired the Postman collection into the nightly pipeline."
)
PERSONA: Final[str] = "Kavya"
DEMO_SESSION_ID: Final[str] = "resilience-demo-session"

UNREACHABLE_HANA_HOST: Final[str] = "hana-cloud.invalid"
UNREACHABLE_GENAI_HOST: Final[str] = "genai-hub.invalid"
UNREACHABLE_GENAI_ENDPOINT: Final[str] = (
    f"https://{UNREACHABLE_GENAI_HOST}/v1/inference/deployments"
)
HANA_USER: Final[str] = "REROUTE_DEMO"
HANA_PASSWORD: Final[str] = "demo-hana-password-7f3c-do-not-echo"
GENAI_CLIENT_ID: Final[str] = "demo-client-id-2b19-do-not-echo"
GENAI_CLIENT_SECRET: Final[str] = "demo-client-secret-9a41-do-not-echo"
GENAI_MODEL: Final[str] = "gemini-2.0-flash-trial"
SAP_CREDENTIALS: Final[tuple[str, ...]] = (
    HANA_PASSWORD,
    GENAI_CLIENT_ID,
    GENAI_CLIENT_SECRET,
)
GHOST_TWIN_THRESHOLD: Final[int] = 5
GHOST_TWIN_ROLE_ID: Final[str] = "quality-analyst"
GHOST_TWIN_PROFILE: Final[dict[str, Any]] = {
    "career_gap": "18 months",
    "gender": "female",
    "age": 29,
    "college_tier": "tier_3",
    "city": "Chennai",
    "skill_score": 86,
}
ROUTE_PARAMS: Final[dict[str, str | int]] = {
    "from_skill": "Manual testing",
    "target_role": "qa-analyst",
    "hours_per_week": 10,
}
MATCH_REQUEST: Final[dict[str, Any]] = {
    "passport_id": "passport-kavya",
    "target_role": "qa-analyst",
    "constraints": {"commute_km": 30, "hours": 40, "language": "English"},
}
EXPECTED_GUARDRAIL_THRESHOLD_PCT: Final[float] = 15.0

UNUSED_DATABASE_PATH: Final[Path] = Path(":memory:")
KEEP_ALIVE_SECONDS: Final[float] = 0.01
KEEP_ALIVE_TIMEOUT_SECONDS: Final[float] = 0.5
KEEP_ALIVE_TICKS: Final[int] = 3
ORCHESTRATION_TIMEOUT_SECONDS: Final[float] = 10.0
SESSION_POLL_ATTEMPTS: Final[int] = 250
SESSION_POLL_INTERVAL_SECONDS: Final[float] = 0.02

NETWORK_BLOCKED_MESSAGE: Final[str] = "network egress is disabled by test_resilience"
LOOPBACK_HOSTS: Final[frozenset[str]] = frozenset({"localhost", "::1", "0.0.0.0"})
PERMITTED_EVENT_SOURCES: Final[frozenset[str]] = frozenset({"live", "simulated", "local"})
PERMITTED_DATA_SOURCES: Final[frozenset[str]] = frozenset({"simulated", "local"})

HEALTH_LABEL: Final[str] = "health"
SKILLS_EXTRACT_LABEL: Final[str] = "skills_extract"
SKILLS_WORK_SAMPLE_LABEL: Final[str] = "skills_work_sample"
ROUTE_LABEL: Final[str] = "route"
MATCH_LABEL: Final[str] = "match"
RADAR_LABEL: Final[str] = "market_displacement_radar"
REWRITE_LABEL: Final[str] = "employer_rewrite_filter"
AUDIT_LABEL: Final[str] = "audit_ghost_twin"
AUDIT_LEGACY_LABEL: Final[str] = "audit_ghost_twin_legacy_ats"
SAP_BACKED_LABELS: Final[tuple[str, ...]] = (
    SKILLS_EXTRACT_LABEL,
    SKILLS_WORK_SAMPLE_LABEL,
    ROUTE_LABEL,
    MATCH_LABEL,
    RADAR_LABEL,
    REWRITE_LABEL,
)
PURE_LOCAL_LABELS: Final[tuple[str, ...]] = (AUDIT_LABEL, AUDIT_LEGACY_LABEL)
SURFACE_MODELS: Final[Mapping[str, type[BaseModel]]] = {
    HEALTH_LABEL: HealthResponse,
    SKILLS_EXTRACT_LABEL: SkillExtractionResponse,
    SKILLS_WORK_SAMPLE_LABEL: WorkSampleResponse,
    ROUTE_LABEL: RouteResponse,
    MATCH_LABEL: MatchResponse,
    RADAR_LABEL: DisplacementRadarResponse,
    REWRITE_LABEL: EmployerFilterRewriteResponse,
    AUDIT_LABEL: GhostTwinResult,
    AUDIT_LEGACY_LABEL: GhostTwinResult,
}


class HttpResponse(Protocol):
    """The slice of a Starlette ``TestClient`` response these tests rely on."""

    @property
    def status_code(self) -> int: ...

    @property
    def text(self) -> str: ...

    def json(self) -> Any: ...


class SapSurface:
    """One pass over the whole SAP-dependent surface of the unreachable app."""

    def __init__(self, settings: Settings, payloads: Mapping[str, dict[str, Any]]) -> None:
        self.settings = settings
        self.payloads = payloads

    def payload(self, label: str) -> dict[str, Any]:
        return self.payloads[label]

    @property
    def labels(self) -> tuple[str, ...]:
        return tuple(self.payloads)


class DeadHanaConnection:
    """A driver-shaped connection object whose every touch point fails."""

    def cursor(self) -> Any:
        raise OSError("the SAP HANA Cloud trial instance refused the connection")

    def reconnect(self) -> None:
        raise OSError("the SAP HANA Cloud trial instance refused the connection")

    def close(self) -> None:
        return None


def unreachable_sap_settings(database_path: Path) -> Settings:
    """Live-mode credentials aimed at hostnames that can never resolve."""
    return Settings(
        database_path=database_path,
        use_mock_hana=False,
        use_mock_genai=False,
        hana_host=UNREACHABLE_HANA_HOST,
        hana_port=443,
        hana_user=HANA_USER,
        hana_password=SecretStr(HANA_PASSWORD),
        hana_keep_alive_seconds=KEEP_ALIVE_SECONDS,
        hana_query_timeout_seconds=0.5,
        genai_hub_endpoint=UNREACHABLE_GENAI_ENDPOINT,
        genai_hub_client_id=GENAI_CLIENT_ID,
        genai_hub_client_secret=SecretStr(GENAI_CLIENT_SECRET),
        genai_hub_model=GENAI_MODEL,
        genai_hub_timeout_seconds=0.5,
        cors_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        ghost_twin_threshold=GHOST_TWIN_THRESHOLD,
    )


def _egress_target(*args: object) -> object:
    for candidate in args:
        if isinstance(candidate, tuple) and candidate:
            return candidate[0]
        if isinstance(candidate, (str, bytes)):
            return candidate
    return None


def _loopback_only(original: Callable[..., object]) -> Callable[..., object]:
    """Refuse off-box egress while leaving the loopback self-pipe socket working."""

    def guarded(*args: object, **kwargs: object) -> object:
        host = _egress_target(*args)
        if isinstance(host, bytes):
            host = host.decode("utf-8", "replace")
        if isinstance(host, str) and (host.startswith("127.") or host in LOOPBACK_HOSTS):
            return original(*args, **kwargs)
        raise OSError(NETWORK_BLOCKED_MESSAGE)

    return guarded


@pytest.fixture(scope="module", autouse=True)
def no_network_egress() -> Iterator[None]:
    """Refuse every off-box socket so the fallback path is what is exercised."""
    hana_client.reset_connection()
    with ExitStack() as stack:
        stack.enter_context(
            patch.object(socket.socket, "connect", _loopback_only(socket.socket.connect))
        )
        stack.enter_context(
            patch.object(socket.socket, "connect_ex", _loopback_only(socket.socket.connect_ex))
        )
        stack.enter_context(
            patch.object(socket, "create_connection", _loopback_only(socket.create_connection))
        )
        stack.enter_context(patch.object(socket, "getaddrinfo", _loopback_only(socket.getaddrinfo)))
        yield
    hana_client.reset_connection()


def assert_ok_document(
    label: str,
    response: HttpResponse,
    model: type[BaseModel] | None = None,
) -> dict[str, Any]:
    """Assert a 200 with a JSON object body, optionally schema-validated."""
    assert response.status_code == 200, (
        f"{label} answered HTTP {response.status_code} instead of 200: {response.text}"
    )
    document: object = response.json()
    assert isinstance(document, dict), f"{label} did not answer with a JSON object"
    if model is not None:
        model.model_validate(document)
    return cast(dict[str, Any], document)


def collect_source_labels(document: object, path: str = "$") -> list[tuple[str, str]]:
    """Every ``source`` value in a payload, paired with its JSON path."""
    found: list[tuple[str, str]] = []
    if isinstance(document, Mapping):
        for key, value in document.items():
            child = f"{path}.{key}"
            if key == "source" and isinstance(value, str):
                found.append((child, value))
            found.extend(collect_source_labels(value, child))
    elif isinstance(document, list):
        for index, value in enumerate(document):
            found.extend(collect_source_labels(value, f"{path}[{index}]"))
    return found


def _radar_params() -> dict[str, str]:
    entry = DISPLACEMENT_RADAR[0]
    return {"role": entry["role"], "city": entry["city"]}


def _audit_request(simulate_legacy_ats: bool) -> dict[str, Any]:
    return {
        "candidate_profile": dict(GHOST_TWIN_PROFILE),
        "role_id": GHOST_TWIN_ROLE_ID,
        "threshold": GHOST_TWIN_THRESHOLD,
        "simulate_legacy_ats": simulate_legacy_ats,
    }


def _collect_sap_surface(client: TestClient) -> dict[str, dict[str, Any]]:
    return {
        HEALTH_LABEL: assert_ok_document("GET /health", client.get("/health"), HealthResponse),
        SKILLS_EXTRACT_LABEL: assert_ok_document(
            "POST /skills/extract",
            client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT}),
            SkillExtractionResponse,
        ),
        SKILLS_WORK_SAMPLE_LABEL: assert_ok_document(
            "POST /skills/work-sample",
            client.post(
                "/skills/work-sample",
                json={
                    "skill_id": "Regression testing",
                    "submission": WORK_SAMPLE_SUBMISSION,
                },
            ),
            WorkSampleResponse,
        ),
        ROUTE_LABEL: assert_ok_document(
            "GET /route", client.get("/route", params=ROUTE_PARAMS), RouteResponse
        ),
        MATCH_LABEL: assert_ok_document(
            "POST /match", client.post("/match", json=MATCH_REQUEST), MatchResponse
        ),
        RADAR_LABEL: assert_ok_document(
            "GET /market/displacement-radar",
            client.get("/market/displacement-radar", params=_radar_params()),
            DisplacementRadarResponse,
        ),
        REWRITE_LABEL: assert_ok_document(
            "POST /employer/rewrite-filter",
            client.post(
                "/employer/rewrite-filter",
                json={"job_post_id": JOB_POSTS[0]["post_id"]},
            ),
            EmployerFilterRewriteResponse,
        ),
        AUDIT_LABEL: assert_ok_document(
            "POST /audit/ghost-twin",
            client.post("/audit/ghost-twin", json=_audit_request(False)),
            GhostTwinResult,
        ),
        AUDIT_LEGACY_LABEL: assert_ok_document(
            "POST /audit/ghost-twin (simulate_legacy_ats=true)",
            client.post("/audit/ghost-twin", json=_audit_request(True)),
            GhostTwinResult,
        ),
    }


@pytest.fixture(scope="module")
def sap_surface(
    tmp_path_factory: pytest.TempPathFactory,
    no_network_egress: None,
) -> Iterator[SapSurface]:
    settings = unreachable_sap_settings(tmp_path_factory.mktemp("resilience") / "reroute.db")
    with TestClient(create_app(settings)) as client:
        yield SapSurface(settings=settings, payloads=_collect_sap_surface(client))


def test_health_reports_both_sap_integrations_as_live_and_configured(
    sap_surface: SapSurface,
) -> None:
    payload = sap_surface.payload(HEALTH_LABEL)

    assert payload["status"] == "ok"
    for integration in ("hana", "genai"):
        assert payload[integration] == {
            "mode": "live",
            "source": "live",
            "integration_status": "configured",
        }, f"{integration} must report live+configured because its credentials are set"


def test_health_never_echoes_a_hana_password_or_genai_client_secret(
    sap_surface: SapSurface,
) -> None:
    health = sap_surface.payload(HEALTH_LABEL)
    integration_blocks = str({key: health[key] for key in ("hana", "genai")})

    for secret in SAP_CREDENTIALS:
        assert secret not in integration_blocks, f"the health payload leaked {secret!r}"
    assert HANA_USER not in integration_blocks
    assert UNREACHABLE_HANA_HOST not in integration_blocks
    assert UNREACHABLE_GENAI_HOST not in integration_blocks


def test_genai_hub_is_genuinely_contacted_before_the_simulated_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    attempts: list[object] = []
    guarded: Callable[..., object] = socket.create_connection

    def recording(address: object, *args: object, **kwargs: object) -> object:
        attempts.append(address)
        return guarded(address, *args, **kwargs)

    monkeypatch.setattr(socket, "create_connection", recording)
    settings = unreachable_sap_settings(tmp_path / "genai-lookup.db")
    with TestClient(create_app(settings)) as client:
        extraction = assert_ok_document(
            "POST /skills/extract",
            client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT}),
            SkillExtractionResponse,
        )

    assert any(
        isinstance(address, tuple) and address and address[0] == UNREACHABLE_GENAI_HOST
        for address in attempts
    ), (
        "the live SAP Generative AI Hub path was never attempted, so the simulated "
        f"label below would be vacuous; dialed addresses were {attempts}"
    )
    assert extraction["source"] == "simulated"
    assert extraction["skills"]


def test_skills_extract_degrades_to_simulated_when_genai_hub_unreachable(
    sap_surface: SapSurface,
) -> None:
    payload = sap_surface.payload(SKILLS_EXTRACT_LABEL)

    assert payload["source"] == "simulated"
    assert payload["skills"]
    assert payload["needs_proof"]
    for skill in payload["skills"]:
        assert 0.0 <= skill["confidence"] <= 1.0


def test_work_sample_degrades_to_simulated_and_honours_the_credential_threshold(
    sap_surface: SapSurface,
) -> None:
    payload = sap_surface.payload(SKILLS_WORK_SAMPLE_LABEL)

    assert payload["source"] == "simulated"
    assert 0 <= payload["score"] <= 100
    assert payload["credential_issued"] == (payload["score"] >= CREDENTIAL_THRESHOLD)


def test_route_degrades_to_simulated_when_hana_cloud_unreachable(
    sap_surface: SapSurface,
) -> None:
    payload = sap_surface.payload(ROUTE_LABEL)
    legs = payload["legs"]

    assert payload["source"] == "simulated"
    assert legs
    assert payload["total_hours"] == sum(leg["hours"] for leg in legs)
    assert payload["weeks"] > 0
    assert payload["weeks"] == round(payload["total_hours"] / ROUTE_PARAMS["hours_per_week"], 1)
    assert payload["paid_bridge"]["source"] == "simulated"


def test_match_degrades_to_simulated_for_every_ranked_role(
    sap_surface: SapSurface,
) -> None:
    payload = sap_surface.payload(MATCH_LABEL)
    matches = payload["matches"]

    assert payload["source"] == "simulated"
    assert matches
    assert payload["guardrail_threshold_pct"] == EXPECTED_GUARDRAIL_THRESHOLD_PCT
    for match in matches:
        assert match["source"] == "simulated", f"{match['role_id']} mislabelled its source"
        if match["blocked_by_guardrail"]:
            assert match["guardrail_reason"], f"{match['role_id']} was blocked without a reason"
            assert match["pay_delta_pct"] < -EXPECTED_GUARDRAIL_THRESHOLD_PCT


def test_market_and_employer_stay_simulated_because_they_never_touch_sap(
    sap_surface: SapSurface,
) -> None:
    radar = sap_surface.payload(RADAR_LABEL)
    rewrite = sap_surface.payload(REWRITE_LABEL)

    assert radar["source"] == "simulated"
    assert radar["disclaimer"]
    assert rewrite["source"] == "simulated"
    assert rewrite["hidden_talent_count"] > 0
    assert rewrite["disclaimer"]


def test_ghost_twin_audit_is_labeled_local_for_fair_and_legacy_simulated_modes(
    sap_surface: SapSurface,
) -> None:
    fair = sap_surface.payload(AUDIT_LABEL)
    legacy = sap_surface.payload(AUDIT_LEGACY_LABEL)

    for payload in (fair, legacy):
        assert payload["source"] == "local"
        assert payload["engine"] == "pure_python"
        assert payload["threshold"] == GHOST_TWIN_THRESHOLD
        assert {twin["source"] for twin in payload["twins"]} == {"local"}
    assert fair["result"] == "PASS"
    assert fair["max_delta"] == 0
    assert legacy["result"] == "FLAGGED"
    assert legacy["max_delta"] > GHOST_TWIN_THRESHOLD


def test_no_sap_backed_payload_ever_claims_a_live_source(sap_surface: SapSurface) -> None:
    live_claims: dict[str, list[str]] = {}
    for label in sap_surface.labels:
        paths = [
            path
            for path, value in collect_source_labels(sap_surface.payload(label))
            if value == "live"
        ]
        if paths:
            live_claims[label] = paths

    assert set(live_claims) <= {HEALTH_LABEL}, (
        "only /health may report a live source, because it reports the configured "
        f"mode rather than the provenance of a rendered fact; got {sorted(live_claims)}"
    )
    for label in SAP_BACKED_LABELS:
        values = {value for _, value in collect_source_labels(sap_surface.payload(label))}
        assert values, f"{label} carries no source label at all"
        assert values <= PERMITTED_DATA_SOURCES, f"{label} labelled {sorted(values)}"
    for label in PURE_LOCAL_LABELS:
        values = {value for _, value in collect_source_labels(sap_surface.payload(label))}
        assert values == {"local"}


def _await_completed_session(client: TestClient, session_id: str) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for _ in range(SESSION_POLL_ATTEMPTS):
        payload = assert_ok_document(
            f"GET /session/{session_id}", client.get(f"/session/{session_id}"), SessionState
        )
        if payload["status"] == "completed":
            return payload
        time.sleep(SESSION_POLL_INTERVAL_SECONDS)
    return payload


def test_session_start_and_read_back_never_claim_a_live_source(
    tmp_path: Path,
) -> None:
    with TestClient(create_app(unreachable_sap_settings(tmp_path / "session.db"))) as client:
        started = assert_ok_document(
            "POST /session/start",
            client.post(
                "/session/start",
                json={
                    "input_type": "text",
                    "content": KAVYA_TRANSCRIPT,
                    "persona": PERSONA,
                },
            ),
            SessionStartResponse,
        )
        assert started["session_id"]
        assert started["source"] == "local"
        session = _await_completed_session(client, started["session_id"])

    assert session["status"] == "completed"
    assert session["source"] == "local"
    assert session["skills_source"] == "simulated"
    assert session["passport"]["source"] == "simulated"
    assert session["route"]["source"] == "simulated"
    assert session["matches"]
    assert all(match["source"] == "simulated" for match in session["matches"])
    assert session["audit_result"]["source"] == "local"
    offenders = [event["event_id"] for event in session["events"] if event["source"] == "live"]
    assert offenders == [], (
        f"these orchestrator events claimed live while SAP is unreachable: {offenders}"
    )


async def _drive_unreachable_orchestration(
    settings: Settings,
    store: SessionStore,
) -> tuple[OrchestrationResult, SessionState]:
    now = datetime.now(UTC)
    session = SessionState(
        session_id=DEMO_SESSION_ID,
        input_type="text",
        content=KAVYA_TRANSCRIPT,
        persona=PERSONA,
        status="started",
        source=session_source(settings),
        state={},
        version=0,
        created_at=now,
        updated_at=now,
    )
    emitted: list[AgentEvent] = []

    async def on_event(event: AgentEvent) -> None:
        emitted.append(event)

    await store.initialize()
    try:
        await store.create(session)
        result = await asyncio.wait_for(
            run_orchestration(settings=settings, session=session, store=store, on_event=on_event),
            timeout=ORCHESTRATION_TIMEOUT_SECONDS,
        )
        stored = await store.get(DEMO_SESSION_ID)
        assert stored is not None
        assert [event.event_id for event in emitted] == [event.event_id for event in stored.events]
        return result, stored
    finally:
        await store.close()


def test_orchestrator_completes_every_agent_while_both_sap_integrations_are_unreachable(
    tmp_path: Path,
) -> None:
    settings = unreachable_sap_settings(tmp_path / "orchestration.db")
    store = cast(SessionStore, create_app(settings).state.session_store)

    result, stored = asyncio.run(_drive_unreachable_orchestration(settings, store))

    assert result.failed_nodes == ()
    assert result.used_langgraph is True
    assert {event.agent for event in result.events} == set(AGENT_BY_NODE.values())
    assert result.events, "the orchestrator emitted no events at all"
    assert all(event.source in PERMITTED_EVENT_SOURCES for event in result.events), (
        "every persisted event must carry one of live/simulated/local"
    )
    assert stored.status == "completed"
    assert stored.skills_source == "simulated"
    assert stored.route is not None
    assert stored.route.source == "simulated"
    assert stored.matches
    assert all(match.source == "simulated" for match in stored.matches)
    assert stored.audit_result is not None
    assert stored.audit_result.source == "local"


def test_orchestrator_persists_no_live_claim_while_sap_is_unreachable(
    tmp_path: Path,
) -> None:
    settings = unreachable_sap_settings(tmp_path / "orchestration-honesty.db")
    store = cast(SessionStore, create_app(settings).state.session_store)

    _result, stored = asyncio.run(_drive_unreachable_orchestration(settings, store))

    assert stored.events, "the orchestrator persisted no events at all"
    offenders = [
        (event.event_id, event.agent, event.status)
        for event in stored.events
        if event.source == "live"
    ]
    assert offenders == [], (
        "orchestrator events must never claim a live source while SAP HANA Cloud and the "
        f"SAP Generative AI Hub are both unreachable; offenders: {offenders}"
    )
    assert {event.source for event in stored.events} == {"simulated", "local"}


def test_skills_extract_degrades_to_simulated_when_the_genai_hub_call_raises_mid_demo(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def outage(payload: dict[str, Any], settings: Settings) -> Any:
        calls.append(str(settings.genai_hub_endpoint))
        raise ConnectionError("the SAP Generative AI Hub deployment stopped responding")

    monkeypatch.setattr(genai_hub, "_post_orchestration", outage)
    settings = unreachable_sap_settings(tmp_path / "genai-outage.db")
    with TestClient(create_app(settings)) as client:
        extraction = assert_ok_document(
            "POST /skills/extract",
            client.post("/skills/extract", json={"transcript": KAVYA_TRANSCRIPT}),
            SkillExtractionResponse,
        )
        work_sample = assert_ok_document(
            "POST /skills/work-sample",
            client.post(
                "/skills/work-sample",
                json={"skill_id": "Regression testing", "submission": WORK_SAMPLE_SUBMISSION},
            ),
            WorkSampleResponse,
        )

    assert calls, "the live SAP path was never attempted, so the outage was not exercised"
    assert extraction["source"] == "simulated"
    assert extraction["skills"]
    assert work_sample["source"] == "simulated"
    assert work_sample["credential_issued"] == (work_sample["score"] >= CREDENTIAL_THRESHOLD)


def test_route_and_match_degrade_to_simulated_when_the_hana_query_raises_mid_demo(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queries: list[str] = []

    def outage(
        _settings: Settings,
        sql: str,
        parameters: Mapping[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        queries.append(sql)
        raise OSError("the SAP HANA Cloud connection was dropped mid-demo")

    monkeypatch.setattr(hana_client, "is_available", lambda _settings: True)
    monkeypatch.setattr(hana_client, "run_query", outage)
    settings = unreachable_sap_settings(tmp_path / "hana-outage.db")
    with TestClient(create_app(settings)) as client:
        route = assert_ok_document(
            "GET /route", client.get("/route", params=ROUTE_PARAMS), RouteResponse
        )
        match = assert_ok_document(
            "POST /match", client.post("/match", json=MATCH_REQUEST), MatchResponse
        )

    assert queries, "the live SAP HANA query was never attempted"
    assert route["source"] == "simulated"
    assert route["legs"]
    assert route["total_hours"] == sum(leg["hours"] for leg in route["legs"])
    assert match["source"] == "simulated"
    assert match["matches"]
    assert all(item["source"] == "simulated" for item in match["matches"])


def test_keep_alive_helper_never_raises_while_sap_hana_is_unreachable() -> None:
    settings = unreachable_sap_settings(UNUSED_DATABASE_PATH)
    ticks: list[float] = []

    async def tick(delay: float) -> None:
        ticks.append(delay)
        if len(ticks) > KEEP_ALIVE_TICKS:
            raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(hana_client.keep_alive_loop(settings, sleep=tick))

    assert ticks == [KEEP_ALIVE_SECONDS] * (KEEP_ALIVE_TICKS + 1)
    assert ticks, "the keep-alive helper never woke up"


def test_keep_alive_helper_keeps_ticking_in_real_time_until_cancelled() -> None:
    settings = unreachable_sap_settings(UNUSED_DATABASE_PATH)

    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(
            asyncio.wait_for(
                hana_client.keep_alive_loop(settings),
                timeout=KEEP_ALIVE_TIMEOUT_SECONDS,
            )
        )


def test_hana_ping_reports_a_dead_connection_instead_of_raising() -> None:
    assert (
        hana_client._ping_succeeds(cast(hana_client.HanaConnection, DeadHanaConnection())) is False
    )


def test_sap_hana_client_is_unavailable_without_the_hdbcli_driver() -> None:
    settings = unreachable_sap_settings(UNUSED_DATABASE_PATH)

    assert settings.use_mock_hana is False
    assert hana_client.is_available(settings) is False
    with pytest.raises(hana_client.HanaUnavailableError):
        hana_client.get_connection(settings)
    hana_client.reset_connection()


def test_role_embeddings_use_the_offline_hashing_backend_so_no_model_is_downloaded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(embedding_provider.BACKEND_ENV_VAR, raising=False)

    assert embedding_provider.is_model_available() is False
    assert embedding_provider.active_backend() == embedding_provider.HASHING_BACKEND
    assert embedding_provider.validate_embedding(embedding_provider.embed_text(KAVYA_TRANSCRIPT))


def test_every_sap_backed_response_is_schema_valid_even_with_sap_down(
    sap_surface: SapSurface,
) -> None:
    assert set(sap_surface.labels) == set(SURFACE_MODELS)

    for label, model in SURFACE_MODELS.items():
        document = sap_surface.payload(label)
        assert document
        model.model_validate(document)
        for path, value in collect_source_labels(document):
            assert value, f"{label}{path} carried an empty source label"
