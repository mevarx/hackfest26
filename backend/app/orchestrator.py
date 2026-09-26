"""ReRoute orchestration graph: seven agents, one event stream, one session.

Node order, straight from the PRD:

    skills_discovery -> market_intelligence -> learning_pathway ->
    inclusive_matching -> employer_readiness -> bias_audit -> two_key_wait

Every node emits at least one ``running`` event and one terminal event through an
async callback, writes its result into the session with the optimistic
versioned update pattern, and never aborts the run: a node that raises is
reported with a ``done`` event carrying the failure and the graph keeps going.
Only a session that cannot be read at all fails the run.

Public surface for the transport layer (the WebSocket handler in
``app.api.sessions``)::

    async def run_orchestration(
        *,
        settings: Settings,
        session: SessionState,
        store: SessionStore,
        on_event: Callable[[AgentEvent], Awaitable[None]],
        target_role: str = "qa-analyst",
        hours_per_week: int = 10,
        city: str = "Chennai",
    ) -> OrchestrationResult

``on_event`` is awaited once per event as the event is produced, so the caller
can push it straight to a socket. The caller must not raise from it: a raising
callback is logged and ignored so a dead socket cannot kill the run. The
returned ``OrchestrationResult.events`` is the exact list handed to ``on_event``
in order, and the same events are persisted in ``session.events`` so a
reconnecting client can replay history.

The graph prefers a real ``langgraph`` ``StateGraph``. LangGraph is imported
lazily inside ``build_graph``; when it is missing, ``run_orchestration`` walks
the identical node order through the built-in sequential runner and reports
``used_langgraph=False``. Nothing in this module reaches the network on its own:
the SAP-backed services already own their own timeouts and label their own
fallbacks, and every event this module writes repeats that label instead of
inventing one.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import lru_cache
from typing import TYPE_CHECKING, Any, Final, TypedDict, cast

from pydantic import JsonValue, TypeAdapter

from app.config import Settings, session_source
from app.domain.ghost_twin import GhostTwinOutcome, run_ghost_twin_audit
from app.domain.passport import merge_skill_passport
from app.mocks.employer_fixtures import employer_readiness_brief
from app.mocks.hana_fixtures import SKILL_NODES
from app.mocks.market_fixtures import DEFAULT_CITY, market_brief
from app.models import (
    AgentEvent,
    AgentName,
    AgentStatus,
    CareerGap,
    DataSource,
    GhostTwinCandidateProfile,
    GhostTwinResult,
    GhostTwinVariant,
    MatchConstraints,
    MatchResponse,
    MatchResult,
    Route,
    SessionState,
    SessionStatus,
    SkillExtractionResponse,
    SkillPassport,
)
from app.services import genai_hub, inclusive_matching, learning_pathway
from app.storage.session_store import (
    SessionNotFoundError,
    SessionStore,
    SessionVersionConflictError,
)

if TYPE_CHECKING:
    from langgraph.graph.state import StateGraph

logger = logging.getLogger(__name__)

EventCallback = Callable[[AgentEvent], Awaitable[None]]
NodeFunction = Callable[["OrchestrationState"], Awaitable["OrchestrationState"]]

NODE_ORDER: Final[tuple[str, ...]] = (
    "skills_discovery",
    "market_intelligence",
    "learning_pathway",
    "inclusive_matching",
    "employer_readiness",
    "bias_audit",
    "two_key_wait",
)

AGENT_BY_NODE: Final[dict[str, AgentName]] = {
    "skills_discovery": "SKILLS DISCOVERY",
    "market_intelligence": "MARKET INTELLIGENCE",
    "learning_pathway": "LEARNING PATHWAY",
    "inclusive_matching": "INCLUSIVE MATCHING",
    "employer_readiness": "EMPLOYER READINESS",
    "bias_audit": "BIAS AUDIT",
    "two_key_wait": "ORCHESTRATOR",
}

MAX_UPDATE_ATTEMPTS: Final[int] = 3
MAX_MATCHES: Final[int] = 3
DEFAULT_TARGET_ROLE: Final[str] = "qa-analyst"
DEFAULT_HOURS_PER_WEEK: Final[int] = 10
FALLBACK_START_SKILL: Final[str] = "Manual testing"
DEFAULT_SKILL_SCORE: Final[int] = 85

_json_value_adapter: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)


@dataclass(frozen=True, slots=True)
class OrchestrationResult:
    """What one orchestration run produced, for the transport layer to read."""

    session_id: str
    status: SessionStatus
    session: SessionState
    events: tuple[AgentEvent, ...]
    failed_nodes: tuple[AgentName, ...]
    used_langgraph: bool


@dataclass(slots=True)
class EventEmitter:
    """Stamps, persists and delivers one ordered event stream per session."""

    session_id: str
    store: SessionStore
    on_event: EventCallback
    sequence: int = 0
    emitted: list[AgentEvent] = field(default_factory=list)

    async def hydrate(self) -> None:
        session = await self.store.get(self.session_id)
        if session is None:
            return
        self.sequence = max((event.sequence for event in session.events), default=0)

    async def emit(
        self,
        *,
        agent: AgentName,
        status: AgentStatus,
        message: str,
        data: dict[str, JsonValue],
        source: DataSource,
    ) -> AgentEvent:
        self.sequence += 1
        event = AgentEvent(
            session_id=self.session_id,
            sequence=self.sequence,
            agent=agent,
            status=status,
            message=message,
            data=data,
            source=source,
            event_id=f"{self.session_id}:event:{self.sequence}",
            timestamp=datetime.now(UTC).isoformat(),
        )
        await _append_event(self.store, event)
        self.emitted.append(event)
        await _deliver(self.on_event, event)
        return event


class OrchestrationState(TypedDict, total=False):
    """The LangGraph state. Absent keys mean the node has not run yet."""

    settings: Settings
    store: SessionStore
    emitter: EventEmitter
    session_id: str
    persona: str
    city: str
    target_role: str
    hours_per_week: int
    passport: SkillPassport
    route: Route
    matches: list[MatchResult]
    market: dict[str, JsonValue]
    employer: dict[str, JsonValue]
    audit: GhostTwinResult
    failures: list[AgentName]


async def run_orchestration(
    *,
    settings: Settings,
    session: SessionState,
    store: SessionStore,
    on_event: EventCallback,
    target_role: str = DEFAULT_TARGET_ROLE,
    hours_per_week: int = DEFAULT_HOURS_PER_WEEK,
    city: str = DEFAULT_CITY,
) -> OrchestrationResult:
    """Run the seven agents for one session and return the ordered event log.

    The session must already exist in ``store``; a missing session is the one
    case that fails the run, and it does so with a terminal event rather than an
    exception. The session is left ``completed`` when the terminal node runs,
    which is the documented demo behaviour: ``two_key_wait`` emits
    ``waiting_consent`` and then the final ``done`` event instead of parking the
    session in a non-terminal ``waiting`` state.
    """
    emitter = EventEmitter(session_id=session.session_id, store=store, on_event=on_event)
    await emitter.hydrate()
    graph = build_graph()
    stored = await store.get(session.session_id)
    if stored is None:
        logger.warning("session %s is not stored; the run cannot start", session.session_id)
        await emitter.emit(
            agent="ORCHESTRATOR",
            status="done",
            message=f"Session {session.session_id} could not start: no stored session",
            data={"phase": "orchestration_start", "failed": True, "plan": list(NODE_ORDER)},
            source="local",
        )
        return OrchestrationResult(
            session_id=session.session_id,
            status="failed",
            session=session,
            events=tuple(emitter.emitted),
            failed_nodes=("ORCHESTRATOR",),
            used_langgraph=graph is not None,
        )

    initial: OrchestrationState = {
        "settings": settings,
        "store": store,
        "emitter": emitter,
        "session_id": session.session_id,
        "persona": session.persona,
        "city": city,
        "target_role": target_role,
        "hours_per_week": hours_per_week,
    }
    await _update_session(store, session.session_id, fields={"status": "running"})
    await emitter.emit(
        agent="ORCHESTRATOR",
        status="running",
        message=f"Session opened for {session.persona} · {len(NODE_ORDER)} agents queued",
        data={
            "phase": "orchestration_start",
            "persona": session.persona,
            "input_type": session.input_type,
            "plan": [AGENT_BY_NODE[node] for node in NODE_ORDER],
        },
        source=session_source(settings),
    )
    final = await _invoke(graph, initial, session.session_id)
    closed = await store.get(session.session_id)
    return OrchestrationResult(
        session_id=session.session_id,
        status=closed.status if closed is not None else "completed",
        session=closed if closed is not None else stored,
        events=tuple(emitter.emitted),
        failed_nodes=tuple(final.get("failures", ())),
        used_langgraph=graph is not None,
    )


@lru_cache(maxsize=1)
def build_graph() -> Any:
    """Compile the LangGraph chain, or return None when LangGraph is absent.

    The compiled object is a
    ``CompiledStateGraph[OrchestrationState, None, OrchestrationState, OrchestrationState]``.
    It is spelled ``Any`` because LangGraph is an optional dependency that this
    module imports lazily, and only ``ainvoke`` is used on the result. The result
    is cached because the first import of LangGraph costs the better part of a
    second, and a compiled graph without a checkpointer holds no per-run state.
    """
    loader = _load_state_graph()
    if loader is None:
        return None
    graph_type, start, end = loader
    builder = graph_type(OrchestrationState)
    previous = start
    for node in NODE_ORDER:
        builder.add_node(node, cast(Any, NODE_FUNCTIONS[node]))
        builder.add_edge(previous, node)
        previous = node
    builder.add_edge(previous, end)
    return builder.compile()


async def _skills_discovery(state: OrchestrationState) -> OrchestrationState:
    emitter = state["emitter"]
    settings = state["settings"]
    store = state["store"]
    session_id = state["session_id"]
    try:
        session = await store.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        await emitter.emit(
            agent="SKILLS DISCOVERY",
            status="running",
            message="Reading transcript for durable skill signals",
            data={
                "phase": "skills_discovery",
                "input_type": session.input_type,
                "characters": len(session.content),
            },
            source=session_source(settings),
        )
        response = await asyncio.to_thread(
            genai_hub.extract_skills,
            session.content,
            settings,
        )
        passport = _build_passport(session, response)
        await _update_session(
            store,
            session_id,
            fields={
                "passport": passport,
                "skills_source": response.source,
                "status": "running",
            },
        )
        await emitter.emit(
            agent="SKILLS DISCOVERY",
            status="done",
            message=(
                f"{len(passport.skills)} skill claims extracted"
                f" · {len(response.needs_proof)} awaiting proof evidence"
            ),
            data={
                "phase": "skills_discovery",
                "passport_id": passport.passport_id,
                "source": response.source,
                "skill_count": len(passport.skills),
                "needs_proof": [name for name in response.needs_proof],
            },
            source=response.source,
        )
        return {**state, "passport": passport}
    except Exception as error:
        return await _record_failure(state, "SKILLS DISCOVERY", error)


async def _market_intelligence(state: OrchestrationState) -> OrchestrationState:
    emitter = state["emitter"]
    store = state["store"]
    session_id = state["session_id"]
    city = state.get("city", DEFAULT_CITY)
    try:
        await emitter.emit(
            agent="MARKET INTELLIGENCE",
            status="running",
            message="Checking displacement exposure and paid bridge demand",
            data={"phase": "market_intelligence", "city": city},
            source="simulated",
        )
        brief = market_brief(city)
        await _update_session(store, session_id, state_entry=("market_intelligence", brief))
        await emitter.emit(
            agent="MARKET INTELLIGENCE",
            status="done",
            message=(
                f"{brief['entry_count']} simulated radar rows"
                f" · {brief['openings']} openings in {brief['city']}"
            ),
            data={"phase": "market_intelligence", "source": "simulated", "brief": brief},
            source="simulated",
        )
        return {**state, "market": brief}
    except Exception as error:
        return await _record_failure(state, "MARKET INTELLIGENCE", error)


async def _learning_pathway(state: OrchestrationState) -> OrchestrationState:
    emitter = state["emitter"]
    settings = state["settings"]
    store = state["store"]
    session_id = state["session_id"]
    passport = state.get("passport")
    target_role = state.get("target_role", DEFAULT_TARGET_ROLE)
    hours_per_week = state.get("hours_per_week", DEFAULT_HOURS_PER_WEEK)
    try:
        await emitter.emit(
            agent="LEARNING PATHWAY",
            status="running",
            message="Mapping transferable skills to target roles",
            data={
                "phase": "learning_pathway",
                "target_role": target_role,
                "hours_per_week": hours_per_week,
            },
            source=session_source(settings),
        )
        response = await asyncio.to_thread(
            learning_pathway.route,
            settings,
            _route_start_skill(passport),
            target_role,
            hours_per_week,
        )
        route = Route(
            legs=response.legs,
            total_hours=response.total_hours,
            paid_bridge=response.paid_bridge,
            source=response.source,
        )
        legs: list[JsonValue] = [leg.skill for leg in route.legs]
        await _update_session(
            store,
            session_id,
            fields={"route": route, "status": "running"},
            state_entry=(
                "learning_pathway",
                {
                    "source": response.source,
                    "from_skill": response.from_skill,
                    "target_role": response.target_role,
                    "total_hours": response.total_hours,
                    "weeks": response.weeks,
                    "skills": legs,
                    "paid_bridge": response.paid_bridge,
                },
            ),
        )
        await emitter.emit(
            agent="LEARNING PATHWAY",
            status="done",
            message=(
                f"{response.total_hours} bridge hours"
                f" · {len(route.legs)} skills · {response.weeks} weeks at"
                f" {hours_per_week}h"
            ),
            data={
                "phase": "learning_pathway",
                "source": response.source,
                "from_skill": response.from_skill,
                "target_role": response.target_role,
                "total_hours": response.total_hours,
                "weeks": response.weeks,
                "legs": legs,
            },
            source=response.source,
        )
        return {**state, "route": route}
    except Exception as error:
        return await _record_failure(state, "LEARNING PATHWAY", error)


async def _inclusive_matching(state: OrchestrationState) -> OrchestrationState:
    emitter = state["emitter"]
    settings = state["settings"]
    store = state["store"]
    session_id = state["session_id"]
    passport = state.get("passport")
    target_role = state.get("target_role", DEFAULT_TARGET_ROLE)
    try:
        await emitter.emit(
            agent="INCLUSIVE MATCHING",
            status="running",
            message="Comparing role fit against fair-work constraints",
            data={"phase": "inclusive_matching", "target_role": target_role},
            source=session_source(settings),
        )
        skills = (
            list(passport.skills)
            if passport is not None
            else list(inclusive_matching.DEFAULT_PASSPORT_SKILLS)
        )
        response = await asyncio.to_thread(
            inclusive_matching.match,
            settings,
            skills,
            MatchConstraints(),
        )
        matches = _match_results(response)
        blocked = sum(1 for match in matches if match.blocked_by_guardrail)
        await _update_session(
            store,
            session_id,
            fields={"matches": matches, "status": "running"},
            state_entry=(
                "inclusive_matching",
                {
                    "source": response.source,
                    "match_count": len(matches),
                    "blocked_count": blocked,
                    "guardrail_threshold_pct": response.guardrail_threshold_pct,
                    "matches": [
                        {
                            "role": match.role,
                            "score": match.score,
                            "pay_delta_pct": match.pay_delta_pct,
                            "blocked_by_guardrail": match.blocked_by_guardrail,
                            "source": match.source,
                        }
                        for match in matches
                    ],
                },
            ),
        )
        await emitter.emit(
            agent="INCLUSIVE MATCHING",
            status="done",
            message=f"{len(matches)} ranked matches ready · {blocked} blocked by the guardrail",
            data={
                "phase": "inclusive_matching",
                "source": response.source,
                "match_count": len(matches),
                "blocked_count": blocked,
                "matches": [
                    {
                        "role": match.role,
                        "score": match.score,
                        "pay_delta_pct": match.pay_delta_pct,
                        "blocked_by_guardrail": match.blocked_by_guardrail,
                        "source": match.source,
                    }
                    for match in matches
                ],
            },
            source=response.source,
        )
        return {**state, "matches": matches}
    except Exception as error:
        return await _record_failure(state, "INCLUSIVE MATCHING", error)


async def _employer_readiness(state: OrchestrationState) -> OrchestrationState:
    emitter = state["emitter"]
    store = state["store"]
    session_id = state["session_id"]
    city = state.get("city", DEFAULT_CITY)
    matches = state.get("matches", [])
    role = matches[0].role if matches else state.get("target_role", DEFAULT_TARGET_ROLE)
    try:
        await emitter.emit(
            agent="EMPLOYER READINESS",
            status="running",
            message="Rewriting restrictive shortlist signals",
            data={"phase": "employer_readiness", "role": role},
            source="simulated",
        )
        brief = employer_readiness_brief(role, city)
        await _update_session(store, session_id, state_entry=("employer_readiness", brief))
        await emitter.emit(
            agent="EMPLOYER READINESS",
            status="done",
            message=(
                f"{brief['hidden_talent_count']} previously hidden candidates surfaced"
                f" across {brief['post_count']} rewritten posts"
            ),
            data={"phase": "employer_readiness", "source": "simulated", "brief": brief},
            source="simulated",
        )
        return {**state, "employer": brief}
    except Exception as error:
        return await _record_failure(state, "EMPLOYER READINESS", error)


async def _bias_audit(state: OrchestrationState) -> OrchestrationState:
    emitter = state["emitter"]
    settings = state["settings"]
    store = state["store"]
    session_id = state["session_id"]
    passport = state.get("passport")
    matches = state.get("matches", [])
    role_id = matches[0].role if matches else state.get("target_role", DEFAULT_TARGET_ROLE)
    city = state.get("city", DEFAULT_CITY)
    try:
        await emitter.emit(
            agent="BIAS AUDIT",
            status="running",
            message="Re-running matches across Ghost Twin variants",
            data={
                "phase": "bias_audit",
                "role_id": role_id,
                "threshold": settings.ghost_twin_threshold,
            },
            source="local",
        )
        profile = _candidate_profile(city, _skill_score(passport))
        profile_input: dict[str, Any] = profile.model_dump(mode="json", exclude_none=True)
        outcome = await asyncio.to_thread(
            run_ghost_twin_audit,
            candidate_profile=profile_input,
            role_id=role_id,
            threshold=settings.ghost_twin_threshold,
            skill_score=profile.skill_score,
        )
        audit = _ghost_twin_result(outcome)
        await _update_session(
            store,
            session_id,
            fields={"audit_result": audit, "status": "running"},
            state_entry=(
                "bias_audit",
                {
                    "source": "local",
                    "engine": audit.engine,
                    "result": audit.result,
                    "max_delta": audit.max_delta,
                    "threshold": audit.threshold,
                    "actual_score": audit.actual_score,
                    "candidate_profile": _json_value(profile_input),
                },
            ),
        )
        await emitter.emit(
            agent="BIAS AUDIT",
            status="done",
            message=f"{audit.result} · maximum score delta {audit.max_delta} points",
            data={
                "phase": "bias_audit",
                "source": "local",
                "engine": audit.engine,
                "result": audit.result,
                "max_delta": audit.max_delta,
                "threshold": audit.threshold,
                "actual_score": audit.actual_score,
                "twins": [
                    {
                        "variant": twin.variant,
                        "attribute": twin.attribute,
                        "score": twin.score,
                        "delta": twin.delta,
                    }
                    for twin in audit.twins
                ],
            },
            source="local",
        )
        return {**state, "audit": audit}
    except Exception as error:
        return await _record_failure(state, "BIAS AUDIT", error)


async def _two_key_wait(state: OrchestrationState) -> OrchestrationState:
    """The human sign-off step, and the terminal node of the demo run.

    The PRD pauses here for a human decision. This build emits the
    ``waiting_consent`` event and then immediately emits the terminal ``done``
    event and sets ``status="completed"``, so the demo always ends instead of
    hanging on a prompt. A real consent round trip belongs in front of this node
    and would branch out of the graph here.
    """
    emitter = state["emitter"]
    settings = state["settings"]
    store = state["store"]
    session_id = state["session_id"]
    source = session_source(settings)
    try:
        await emitter.emit(
            agent="ORCHESTRATOR",
            status="waiting_consent",
            message="Confirm the two keys: evidence disclosure and the re-routed plan",
            data={
                "phase": "two_key_wait",
                "keys": ["evidence_disclosure", "plan_acceptance"],
                "blocking": False,
            },
            source=source,
        )
        await _update_session(
            store,
            session_id,
            fields={"status": "completed"},
            state_entry=(
                "consent",
                {
                    "phase": "two_key_wait",
                    "keys": ["evidence_disclosure", "plan_acceptance"],
                    "state": "auto_accepted_for_demo",
                    "blocking": False,
                },
            ),
        )
        await emitter.emit(
            agent="ORCHESTRATOR",
            status="done",
            message="Demo sign-off recorded · the re-routed plan is ready for review",
            data={
                "phase": "two_key_wait",
                "keys": ["evidence_disclosure", "plan_acceptance"],
                "terminal": True,
                "session_status": "completed",
            },
            source=source,
        )
    except Exception as error:
        return await _record_failure(state, "ORCHESTRATOR", error)
    return state


NODE_FUNCTIONS: Final[dict[str, NodeFunction]] = {
    "skills_discovery": _skills_discovery,
    "market_intelligence": _market_intelligence,
    "learning_pathway": _learning_pathway,
    "inclusive_matching": _inclusive_matching,
    "employer_readiness": _employer_readiness,
    "bias_audit": _bias_audit,
    "two_key_wait": _two_key_wait,
}


async def _record_failure(
    state: OrchestrationState,
    agent: AgentName,
    error: Exception,
) -> OrchestrationState:
    logger.warning("agent %s could not finish; the run continues", agent, exc_info=error)
    await state["emitter"].emit(
        agent=agent,
        status="done",
        message=f"{agent} could not complete: {type(error).__name__}: {error}",
        data={
            "phase": _phase_for(agent),
            "failed": True,
            "error_type": type(error).__name__,
            "detail": str(error),
        },
        source="simulated",
    )
    return {**state, "failures": [*state.get("failures", []), agent]}


def _phase_for(agent: AgentName) -> str:
    for node, name in AGENT_BY_NODE.items():
        if name == agent:
            return node
    return "orchestration"


async def _invoke(graph: Any, state: OrchestrationState, session_id: str) -> OrchestrationState:
    if graph is None:
        return await _run_sequential(state)
    return await _run_graph(graph, state, session_id)


async def _run_graph(graph: Any, state: OrchestrationState, session_id: str) -> OrchestrationState:
    try:
        return cast(OrchestrationState, await graph.ainvoke(state))
    except Exception:
        logger.warning("the orchestration graph aborted for %s", session_id, exc_info=True)
        await _close_failed_run(state)
        return state


async def _run_sequential(state: OrchestrationState) -> OrchestrationState:
    logger.warning("running the built-in sequential node runner instead of LangGraph")
    current = state
    for node in NODE_ORDER:
        current = await NODE_FUNCTIONS[node](current)
    return current


async def _close_failed_run(state: OrchestrationState) -> None:
    """Close out a run whose graph raised, so the session does not look successful.

    This is only ever reached from the graph's failure handler, so the session is
    marked ``failed``. Reporting ``completed`` here made a crashed run render as a
    success for any client polling ``GET /session/{id}``.
    """
    emitter = state["emitter"]
    await emitter.emit(
        agent="ORCHESTRATOR",
        status="done",
        message="The graph aborted · the session is closed with partial results",
        data={"phase": "orchestration_end", "failed": True, "terminal": True},
        source="local",
    )
    await _update_session(
        state["store"],
        state["session_id"],
        fields={"status": "failed"},
        state_entry=("orchestration", {"graph_aborted": True, "terminal": True}),
    )


def _load_state_graph() -> tuple[type["StateGraph[OrchestrationState]"], str, str] | None:
    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError:
        logger.warning("langgraph is not importable; using the built-in sequential node runner")
        return None
    return StateGraph, START, END


async def _append_event(store: SessionStore, event: AgentEvent) -> None:
    for _ in range(MAX_UPDATE_ATTEMPTS):
        session = await store.get(event.session_id)
        if session is None:
            logger.warning(
                "session %s is gone; %s is not persisted", event.session_id, event.event_id
            )
            return
        if any(stored.event_id == event.event_id for stored in session.events):
            return
        updated = session.merged(events=[*session.events, event])
        try:
            await store.update(updated, expected_version=session.version)
        except SessionVersionConflictError:
            logger.info("session %s moved under %s; retrying", event.session_id, event.event_id)
            continue
        return
    logger.warning("%s was dropped after %d version conflicts", event.event_id, MAX_UPDATE_ATTEMPTS)


async def _update_session(
    store: SessionStore,
    session_id: str,
    *,
    fields: dict[str, object] | None = None,
    state_entry: tuple[str, JsonValue] | None = None,
) -> SessionState | None:
    for _ in range(MAX_UPDATE_ATTEMPTS):
        session = await store.get(session_id)
        if session is None:
            logger.warning("session %s is gone; the update is dropped", session_id)
            return None
        updates: dict[str, object] = dict(fields or {})
        if state_entry is not None:
            key, value = state_entry
            updates["state"] = {**session.state, key: value}
        try:
            return await store.update(session.merged(**updates), expected_version=session.version)
        except SessionVersionConflictError:
            logger.info("session %s moved under the orchestrator; retrying", session_id)
    logger.warning(
        "session %s stayed locked after %d attempts; the update is dropped",
        session_id,
        MAX_UPDATE_ATTEMPTS,
    )
    return None


async def _deliver(on_event: EventCallback, event: AgentEvent) -> None:
    try:
        await on_event(event)
    except Exception:
        logger.warning("the event transport rejected %s", event.event_id, exc_info=True)


def _build_passport(
    session: SessionState,
    response: SkillExtractionResponse,
) -> SkillPassport:
    return merge_skill_passport(session, response)


def _route_start_skill(passport: SkillPassport | None) -> str:
    canonical = {name.casefold(): name for _, name in SKILL_NODES}
    if passport is not None:
        for claim in passport.skills:
            found = canonical.get(claim.name.casefold())
            if found is not None:
                return found
    return FALLBACK_START_SKILL


def _match_results(response: MatchResponse) -> list[MatchResult]:
    return [
        MatchResult(
            role=candidate.role,
            score=candidate.score,
            pay_delta_pct=candidate.pay_delta_pct,
            blocked_by_guardrail=candidate.blocked_by_guardrail,
            source=candidate.source,
        )
        for candidate in response.matches[:MAX_MATCHES]
    ]


def _candidate_profile(city: str, skill_score: int) -> GhostTwinCandidateProfile:
    return GhostTwinCandidateProfile(
        career_gap=CareerGap(months=18),
        gender="female",
        age=29,
        college_tier="tier_2",
        city=city,
        skill_score=skill_score,
    )


def _skill_score(passport: SkillPassport | None) -> int:
    if passport is None or not passport.skills:
        return DEFAULT_SKILL_SCORE
    top_confidence = max(claim.confidence for claim in passport.skills)
    return max(0, min(100, round(top_confidence * 100)))


def _ghost_twin_result(outcome: GhostTwinOutcome) -> GhostTwinResult:
    twins = [
        GhostTwinVariant(
            variant=f"{twin.attribute}_counterfactual",
            attribute=twin.attribute,
            original_value=_json_value_adapter.validate_python(twin.original_value),
            counterfactual_value=_json_value_adapter.validate_python(twin.counterfactual_value),
            score=twin.score,
            delta=twin.delta,
        )
        for twin in outcome.twins
    ]
    return GhostTwinResult(
        actual_score=outcome.actual_score,
        twins=twins,
        max_delta=outcome.max_delta,
        result=outcome.result,
        threshold=outcome.threshold,
    )


def _json_value(payload: object) -> JsonValue:
    return _json_value_adapter.validate_python(payload)
