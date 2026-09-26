import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue

from app import orchestrator
from app.config import Settings
from app.main import create_app
from app.models import AgentEvent, AgentName, SessionState
from app.orchestrator import (
    AGENT_BY_NODE,
    MAX_UPDATE_ATTEMPTS,
    NODE_ORDER,
    EventEmitter,
    OrchestrationResult,
    OrchestrationState,
    run_orchestration,
)
from app.storage.session_store import (
    SessionStore,
    SessionVersionConflictError,
)

KAVYA_TRANSCRIPT = (
    "I spent six years as a manual tester. I wrote regression test cases in Jira, "
    "reproduced production defects, and maintained Postman collections for API testing. "
    "I also wrote Selenium scripts for smoke tests and helped validate SQL data."
)

EXPECTED_AGENTS: tuple[AgentName, ...] = (
    "ORCHESTRATOR",
    "SKILLS DISCOVERY",
    "MARKET INTELLIGENCE",
    "LEARNING PATHWAY",
    "INCLUSIVE MATCHING",
    "EMPLOYER READINESS",
    "BIAS AUDIT",
    "ORCHESTRATOR",
)

SIMULATED_AGENTS: frozenset[AgentName] = frozenset(
    {
        "SKILLS DISCOVERY",
        "MARKET INTELLIGENCE",
        "LEARNING PATHWAY",
        "INCLUSIVE MATCHING",
        "EMPLOYER READINESS",
    }
)

STALE_UPDATES = 2


@dataclass(frozen=True, slots=True)
class Outcome:
    result: OrchestrationResult
    emitted: list[AgentEvent]
    session: SessionState


class StaleVersionStore:
    """A store that loses the first ``STALE_UPDATES`` races it takes part in.

    The losing writer really commits through the inner store before the conflict
    is reported, so the orchestrator has to re-read and merge, exactly as it
    would against a second writer touching the same session.
    """

    def __init__(self, inner: SessionStore) -> None:
        self._inner = inner
        self.injected = 0
        self.updates = 0

    async def initialize(self) -> None:
        await self._inner.initialize()

    async def create(self, session: SessionState) -> None:
        await self._inner.create(session)

    async def update(self, session: SessionState, expected_version: int) -> SessionState:
        self.updates += 1
        if self.injected < STALE_UPDATES:
            self.injected += 1
            await self._inner.update(
                session.model_copy(update={"version": expected_version}),
                expected_version,
            )
            raise SessionVersionConflictError(session.session_id)
        return await self._inner.update(session, expected_version)

    async def upsert(self, session: SessionState, expected_version: int) -> SessionState:
        return await self._inner.upsert(session, expected_version)

    async def get(self, session_id: str) -> SessionState | None:
        return await self._inner.get(session_id)

    async def close(self) -> None:
        await self._inner.close()


def build_store(tmp_path: Path) -> tuple[Settings, SessionStore]:
    settings = Settings(
        database_path=tmp_path / "reroute.db",
        use_mock_hana=True,
        use_mock_genai=True,
    )
    application = create_app(settings)
    with TestClient(application) as client:
        assert client.get("/health").status_code == 200
    return settings, cast(SessionStore, application.state.session_store)


def make_session(session_id: str) -> SessionState:
    now = datetime.now(UTC)
    return SessionState(
        session_id=session_id,
        input_type="text",
        content=KAVYA_TRANSCRIPT,
        persona="Kavya",
        status="started",
        source="simulated",
        state={},
        version=0,
        created_at=now,
        updated_at=now,
    )


async def drive(settings: Settings, store: SessionStore, session: SessionState) -> Outcome:
    emitted: list[AgentEvent] = []

    async def on_event(event: AgentEvent) -> None:
        emitted.append(event)

    result = await run_orchestration(
        settings=settings,
        session=session,
        store=store,
        on_event=on_event,
    )
    stored = await store.get(session.session_id)
    assert stored is not None
    return Outcome(result=result, emitted=emitted, session=stored)


def run_pipeline(settings: Settings, store: SessionStore, session_id: str) -> Outcome:
    return asyncio.run(_run_pipeline(settings, store, session_id))


async def _run_pipeline(
    settings: Settings,
    store: SessionStore,
    session_id: str,
) -> Outcome:
    session = await store.get(session_id)
    if session is None:
        session = make_session(session_id)
        await store.create(session)
    return await drive(settings, store, session)


async def build_emitter(store: SessionStore, session_id: str) -> EventEmitter:
    async def on_event(_event: AgentEvent) -> None:
        return None

    emitter = EventEmitter(session_id=session_id, store=store, on_event=on_event)
    await emitter.hydrate()
    return emitter


def agent_order(events: list[AgentEvent]) -> list[AgentName]:
    order: list[AgentName] = []
    for event in events:
        if not order or order[-1] != event.agent:
            order.append(event.agent)
    return order


def data_field(event: AgentEvent, key: str) -> JsonValue:
    return event.data[key]


def failed_events(events: list[AgentEvent]) -> list[AgentEvent]:
    return [event for event in events if event.data.get("failed") is True]


def assert_dense_stream(events: list[AgentEvent], session_id: str) -> None:
    assert [event.sequence for event in events] == list(range(1, len(events) + 1))
    assert [event.event_id for event in events] == [
        f"{session_id}:event:{number}" for number in range(1, len(events) + 1)
    ]
    assert len({event.event_id for event in events}) == len(events)


@pytest.fixture(scope="module")
def happy_path(tmp_path_factory: pytest.TempPathFactory) -> Outcome:
    directory = tmp_path_factory.mktemp("orchestrator")
    settings, store = build_store(directory)
    return run_pipeline(settings, store, "session-happy-path")


def test_node_order_matches_the_prd_agent_order() -> None:
    assert NODE_ORDER == (
        "skills_discovery",
        "market_intelligence",
        "learning_pathway",
        "inclusive_matching",
        "employer_readiness",
        "bias_audit",
        "two_key_wait",
    )
    assert [AGENT_BY_NODE[node] for node in NODE_ORDER] == list(EXPECTED_AGENTS[1:])


def test_graph_is_compiled_from_the_real_langgraph() -> None:
    if orchestrator._load_state_graph() is None:
        pytest.skip("langgraph is not installed in this environment")
    graph = orchestrator.build_graph()
    assert graph is not None
    assert orchestrator.build_graph() is graph


def test_graph_runs_every_agent_in_order(happy_path: Outcome) -> None:
    assert agent_order(happy_path.emitted) == list(EXPECTED_AGENTS)
    assert happy_path.result.used_langgraph is (orchestrator.build_graph() is not None)
    assert happy_path.result.failed_nodes == ()
    assert happy_path.result.session_id == "session-happy-path"
    assert happy_path.result.events == tuple(happy_path.emitted)


def test_every_event_is_well_formed(happy_path: Outcome) -> None:
    events = happy_path.emitted
    assert events
    for event in events:
        assert event.session_id == happy_path.result.session_id
        assert event.message.strip()
        assert event.data
        assert event.source in {"live", "simulated", "local"}
        assert event.agent in set(EXPECTED_AGENTS)
        assert event.status in {"running", "done", "waiting_consent"}
        assert datetime.fromisoformat(event.timestamp).utcoffset() == timedelta(0)


def test_sequences_are_dense_and_event_ids_unique(happy_path: Outcome) -> None:
    assert_dense_stream(happy_path.emitted, happy_path.result.session_id)


def test_mock_mode_never_claims_live(happy_path: Outcome) -> None:
    assert not any(event.source == "live" for event in happy_path.emitted)
    for event in happy_path.emitted:
        if event.agent == "BIAS AUDIT":
            assert event.source == "local"
        elif event.agent in SIMULATED_AGENTS:
            assert event.source == "simulated"


def test_result_events_repeat_their_own_source_label(happy_path: Outcome) -> None:
    for event in happy_path.emitted:
        if event.status == "done" and event.agent != "ORCHESTRATOR":
            assert data_field(event, "source") == event.source


def test_terminal_node_requests_consent_and_completes(happy_path: Outcome) -> None:
    events = happy_path.emitted
    statuses = [event.status for event in events]
    assert statuses[-1] == "done"
    assert statuses[-2] == "waiting_consent"
    assert data_field(events[-2], "keys") == ["evidence_disclosure", "plan_acceptance"]
    assert happy_path.result.status == "completed"
    assert happy_path.session.status == "completed"


def test_session_state_is_populated_by_the_agents(happy_path: Outcome) -> None:
    session = happy_path.session
    passport = session.passport
    assert passport is not None
    assert passport.passport_id == f"passport-{session.session_id}"
    assert passport.owner == "Kavya"
    assert passport.skills
    assert passport.source == "simulated"
    assert session.skills_source == "simulated"
    assert any(claim.verified is False for claim in passport.skills)

    audit = session.audit_result
    assert audit is not None
    assert audit.source == "local"
    assert audit.engine == "pure_python"
    assert audit.result in {"PASS", "FLAGGED"}
    assert audit.threshold == 5
    assert len(audit.twins) == 5
    assert all(twin.source == "local" for twin in audit.twins)

    route = session.route
    assert route is not None
    assert route.source == "simulated"
    assert route.total_hours > 0

    assert session.matches
    assert all(match.source == "simulated" for match in session.matches)
    assert sorted(session.state) == [
        "bias_audit",
        "consent",
        "employer_readiness",
        "inclusive_matching",
        "learning_pathway",
        "market_intelligence",
    ]


def test_event_history_is_persisted_and_replayable(tmp_path: Path) -> None:
    settings, store = build_store(tmp_path)
    first = run_pipeline(settings, store, "session-replay")
    second = run_pipeline(settings, store, "session-replay")

    stored = second.session
    assert len(stored.events) == len(first.emitted) + len(second.emitted)
    assert [event.model_dump() for event in first.emitted] == [
        event.model_dump() for event in stored.events[: len(first.emitted)]
    ]
    assert [event.model_dump() for event in second.emitted] == [
        event.model_dump() for event in stored.events[len(first.emitted) :]
    ]
    assert second.emitted[0].sequence == first.emitted[-1].sequence + 1
    assert stored.version >= len(stored.events)


def test_one_failing_node_does_not_abort_the_run(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def explode(*_args: object, **_kwargs: object) -> object:
        raise TimeoutError("SAP Generative AI Hub timed out")

    monkeypatch.setattr("app.services.genai_hub.extract_skills", explode)
    settings, store = build_store(tmp_path)
    outcome = run_pipeline(settings, store, "session-failure")

    assert outcome.result.status == "completed"
    assert outcome.result.failed_nodes == ("SKILLS DISCOVERY",)
    assert outcome.session.status == "completed"
    assert agent_order(outcome.emitted) == list(EXPECTED_AGENTS)
    assert_dense_stream(outcome.emitted, outcome.result.session_id)

    failures = failed_events(outcome.emitted)
    assert len(failures) == 1
    assert failures[0].agent == "SKILLS DISCOVERY"
    assert failures[0].status == "done"
    assert failures[0].source == "simulated"
    assert "TimeoutError" in failures[0].message
    assert data_field(failures[0], "error_type") == "TimeoutError"

    assert outcome.session.passport is None
    assert outcome.session.route is not None
    assert outcome.session.audit_result is not None
    assert outcome.session.state
    assert [event.model_dump() for event in outcome.emitted] == [
        event.model_dump() for event in outcome.session.events
    ]


def test_a_raising_transport_cannot_kill_the_run(tmp_path: Path) -> None:
    settings, store = build_store(tmp_path)
    session = make_session("session-transport")

    async def scenario() -> SessionState:
        async def explode(_event: AgentEvent) -> None:
            raise ConnectionResetError("the websocket closed")

        await store.create(session)
        await run_orchestration(
            settings=settings,
            session=session,
            store=store,
            on_event=explode,
        )
        stored = await store.get(session.session_id)
        assert stored is not None
        return stored

    stored = asyncio.run(scenario())
    assert stored.status == "completed"
    assert stored.events
    assert stored.audit_result is not None


def test_stale_version_is_retried_instead_of_raising(tmp_path: Path) -> None:
    settings, store = build_store(tmp_path)
    racing = StaleVersionStore(store)
    outcome = run_pipeline(settings, racing, "session-race")

    assert MAX_UPDATE_ATTEMPTS == 3
    assert racing.injected == STALE_UPDATES
    assert racing.updates > STALE_UPDATES
    assert outcome.result.failed_nodes == ()
    assert outcome.result.status == "completed"
    assert outcome.session.status == "completed"
    assert [event.model_dump() for event in outcome.session.events] == [
        event.model_dump() for event in outcome.emitted
    ]


def test_an_aborted_graph_marks_the_session_failed(tmp_path: Path) -> None:
    """A crashed graph must not be persisted as a successful run.

    ``_close_failed_run`` is only reached from the graph's failure handler, so
    reporting ``completed`` there made a failed run render as a success for any
    client polling ``GET /session/{id}``.
    """
    _settings, store = build_store(tmp_path)
    session = make_session("session-aborted")

    class ExplodingGraph:
        async def ainvoke(self, state: object) -> object:
            raise RuntimeError("a node blew up")

    async def scenario() -> SessionState:
        await store.create(session)
        emitted = await build_emitter(store, session.session_id)
        state = cast(
            "orchestrator.OrchestrationState",
            {"store": store, "session_id": session.session_id, "emitter": emitted},
        )
        await orchestrator._run_graph(ExplodingGraph(), state, session.session_id)
        stored = await store.get(session.session_id)
        assert stored is not None
        assert data_field(emitted.emitted[-1], "failed") is True
        assert data_field(emitted.emitted[-1], "terminal") is True
        return stored

    stored = asyncio.run(scenario())

    assert stored.status == "failed"
    assert stored.state["orchestration"] == {"graph_aborted": True, "terminal": True}


def test_the_terminal_node_also_survives_a_failing_transport(tmp_path: Path) -> None:
    """``_two_key_wait`` is the one node that lacked its siblings' isolation.

    An exception escaping it used to abort the whole graph instead of being
    reported as a node failure, contradicting the module docstring.
    """
    _settings, store = build_store(tmp_path)
    session = make_session("session-terminal")

    class ExplodingStore:
        def __init__(self, inner: SessionStore) -> None:
            self._inner = inner

        async def initialize(self) -> None:
            await self._inner.initialize()

        async def create(self, value: SessionState) -> None:
            await self._inner.create(value)

        async def update(self, value: SessionState, expected_version: int) -> SessionState:
            raise RuntimeError("the session store is unavailable")

        async def upsert(self, value: SessionState, expected_version: int) -> SessionState:
            return await self._inner.upsert(value, expected_version)

        async def get(self, session_id: str) -> SessionState | None:
            return await self._inner.get(session_id)

        async def close(self) -> None:
            await self._inner.close()

    async def scenario() -> OrchestrationState:
        await store.create(session)
        emitted = await build_emitter(store, session.session_id)
        state = cast(
            "orchestrator.OrchestrationState",
            {
                "settings": _settings,
                "store": ExplodingStore(store),
                "session_id": session.session_id,
                "emitter": emitted,
            },
        )
        return await orchestrator._two_key_wait(state)

    state = asyncio.run(scenario())

    assert "ORCHESTRATOR" in state["failures"]


def test_run_completes_without_langgraph(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(orchestrator, "_load_state_graph", lambda: None)
    orchestrator.build_graph.cache_clear()
    try:
        settings, store = build_store(tmp_path)
        outcome = run_pipeline(settings, store, "session-no-langgraph")
    finally:
        orchestrator.build_graph.cache_clear()

    assert outcome.result.used_langgraph is False
    assert outcome.result.status == "completed"
    assert agent_order(outcome.emitted) == list(EXPECTED_AGENTS)
    assert_dense_stream(outcome.emitted, outcome.result.session_id)
    assert outcome.session.audit_result is not None


def test_a_session_that_is_not_stored_fails_the_run(tmp_path: Path) -> None:
    settings, store = build_store(tmp_path)
    session = make_session("session-missing")

    async def scenario() -> Outcome:
        emitted: list[AgentEvent] = []

        async def on_event(event: AgentEvent) -> None:
            emitted.append(event)

        result = await run_orchestration(
            settings=settings,
            session=session,
            store=store,
            on_event=on_event,
        )
        return Outcome(result=result, emitted=emitted, session=session)

    outcome = asyncio.run(scenario())
    assert outcome.result.status == "failed"
    assert outcome.result.session_id == "session-missing"
    assert len(outcome.emitted) == 1
    assert outcome.emitted[0].agent == "ORCHESTRATOR"
    assert outcome.emitted[0].status == "done"
    assert data_field(outcome.emitted[0], "failed") is True
    assert outcome.session.events == []
