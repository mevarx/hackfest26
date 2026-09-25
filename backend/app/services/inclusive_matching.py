"""Inclusive role matching for displaced manual testers.

Scoring policy, applied identically in the live and the simulated pathway:

* ``similarity`` is the cosine similarity between the candidate skill text and
  the role text, clamped into ``[0, 1]``.
* Constraints never hard-filter a role, so the demo table is never empty.
  Commute, weekly hours and language subtract a bounded penalty from the
  score instead: a longer commute or more hours than the candidate can give
  makes a role less attractive, and a language mismatch costs the most.
* The Wage-Scar Guardrail blocks a role whose annual pay is more than
  ``MatchResponse.guardrail_threshold_pct`` below the candidate's current pay
  unless the candidate accepted a pay cut. A blocked match keeps its
  similarity, is capped at ``BLOCKED_SCORE_CEILING``, is always sorted below
  every allowed role, and carries a human-readable reason.
* ``source`` is ``"live"`` only when SAP HANA answered the cosine query for that
  match. Every other outcome, including a live query that raised, is
  ``"simulated"``; the local JSON fixtures are never reported as their own
  source. The live query reads ``ROLE_ID``, ``EMBEDDING`` and
  ``COSINE_SIMILARITY`` from ``ROLE_EMBEDDINGS`` and prefers the role
  attributes from the same table, falling back to the fixture catalogue for a
  table that only carries ``ROLE_ID`` and ``EMBEDDING``.
* ``target_role`` promotes one role to the front of the ranking when the
  request names a known role id or title. An unknown target is logged and the
  full ranking is returned unchanged.
"""

import json
import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final

from app.config import Settings
from app.mocks.role_fixtures import ROLE_PROFILES, ROLE_PROFILES_BY_ID, role_embedding_text
from app.models import (
    DataSource,
    MatchConstraints,
    MatchResponse,
    RankedMatch,
    RoleProfile,
    SkillClaim,
)
from app.services import embedding_provider, hana_client

logger = logging.getLogger(__name__)

GUARDRAIL_THRESHOLD_PCT: Final[float] = float(
    MatchResponse.model_fields["guardrail_threshold_pct"].default
)
DEFAULT_CANDIDATE_ANNUAL_PAY: Final[int] = 660_000
DEFAULT_PASSPORT_ID: Final[str] = "passport-anonymous"
MAX_CANDIDATE_SKILLS: Final[int] = 12
BLOCKED_SCORE_CEILING: Final[float] = 0.25
COMMUTE_PENALTY: Final[float] = 0.15
HOURS_PENALTY: Final[float] = 0.12
LANGUAGE_PENALTY: Final[float] = 0.20
SIMILARITY_PRECISION: Final[int] = 4
SCORE_PRECISION: Final[int] = 4
GUARDRAIL_REASON: Final[str] = (
    "Pay cut of {pay_cut:.1f}% exceeds the {threshold:.0f}% wage-scar guardrail"
)
FALLBACK_ROLE_EMBEDDINGS_PATH: Final[Path] = (
    Path(__file__).resolve().parents[1] / "mocks" / "role_embeddings.json"
)
DEFAULT_PASSPORT_SKILLS: Final[tuple[SkillClaim, ...]] = (
    SkillClaim(name="Regression testing", confidence=0.9, verified=True),
    SkillClaim(name="Defect triage", confidence=0.85, verified=True),
    SkillClaim(name="Test case design", confidence=0.8),
    SkillClaim(name="API testing", confidence=0.75),
    SkillClaim(name="Compatibility testing", confidence=0.7),
)

LIVE_SIMILARITY_SQL: Final[str] = """
SELECT ROLE_ID,
       TITLE,
       CITY,
       LANGUAGE,
       COMMUTE_KM,
       WEEKLY_HOURS,
       ANNUAL_PAY,
       REQUIRED_SKILLS,
       EMBEDDING,
       COSINE_SIMILARITY(EMBEDDING, TO_REAL_VECTOR(:query_embedding)) AS SIMILARITY
FROM ROLE_EMBEDDINGS
ORDER BY SIMILARITY DESC
"""
LIVE_SIMILARITY_FALLBACK_SQL: Final[str] = """
SELECT ROLE_ID,
       EMBEDDING,
       COSINE_SIMILARITY(EMBEDDING, TO_REAL_VECTOR(:query_embedding)) AS SIMILARITY
FROM ROLE_EMBEDDINGS
ORDER BY SIMILARITY DESC
"""


@dataclass(frozen=True, slots=True)
class ScoredRole:
    profile: RoleProfile
    similarity: float
    source: DataSource


@dataclass(frozen=True, slots=True)
class WeightedSkill:
    name: str
    weight: float
    verified: bool


def match(
    settings: Settings,
    passport_skills: Sequence[SkillClaim] | Sequence[str],
    constraints: MatchConstraints | None = None,
    target_role: str | None = None,
    candidate_annual_pay: int | None = None,
    passport_id: str = DEFAULT_PASSPORT_ID,
) -> MatchResponse:
    """Rank the fixture roles for a candidate and apply the Wage-Scar Guardrail.

    ``passport_skills`` accepts either ``SkillClaim`` objects or plain skill
    names, ``candidate_annual_pay`` defaults to the Chennai manual-tester salary
    in ``DEFAULT_CANDIDATE_ANNUAL_PAY``, and the guardrail threshold is read
    from ``MatchResponse.guardrail_threshold_pct`` so the UI and this logic can
    never disagree about the 15% limit.
    """
    resolved_constraints = constraints if constraints is not None else MatchConstraints()
    candidate_pay = (
        candidate_annual_pay if candidate_annual_pay is not None else DEFAULT_CANDIDATE_ANNUAL_PAY
    )
    if candidate_pay <= 0:
        raise ValueError("candidate_annual_pay must be greater than zero")
    query_vector = embedding_provider.embed_text(candidate_skill_text(passport_skills))
    scored_roles, source = _scored_roles(settings, query_vector)
    if not scored_roles:
        logger.warning("no role embeddings were available; returning an empty match list")
        return MatchResponse(passport_id=passport_id, matches=[], source=source)
    ranked = sorted(
        (_rank_match(scored, resolved_constraints, candidate_pay) for scored in scored_roles),
        key=lambda candidate: (
            candidate.blocked_by_guardrail,
            -candidate.score,
            -candidate.similarity,
            candidate.role_id,
        ),
    )
    return MatchResponse(
        passport_id=passport_id,
        matches=_promote_target_role(ranked, target_role),
        source=source,
        guardrail_threshold_pct=GUARDRAIL_THRESHOLD_PCT,
    )


def candidate_skill_text(passport_skills: Sequence[SkillClaim] | Sequence[str]) -> str:
    """Render the single candidate text that is embedded for the whole request.

    Claims are weighted by confidence, a verified claim outranks an unverified
    one, and only the strongest claims are kept so one long transcript cannot
    drown out the skills that matter.
    """
    weighted = _weighted_skills(passport_skills)
    if not weighted:
        return "Candidate skills: no extracted skills."
    names = [skill.name for skill in weighted]
    verified = [skill.name for skill in weighted if skill.verified]
    text = f"Candidate skills: {', '.join(names)}."
    if verified:
        text = f"{text} Verified evidence: {', '.join(verified)}."
    return text


def load_role_embeddings(path: Path | None = None) -> dict[str, list[float]]:
    """Return the role embeddings from the seeded JSON file, empty when absent.

    A missing file, malformed JSON, a non-object payload or a vector with the
    wrong dimension all return an empty mapping so the caller recomputes the
    same vectors in process from the fixtures instead of failing the request.
    """
    target = path if path is not None else role_embeddings_path()
    if not target.is_file():
        return {}
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("role embeddings file %s is unreadable; recomputing", target, exc_info=True)
        return {}
    if not isinstance(payload, Mapping):
        logger.warning("role embeddings file %s is not a role mapping", target)
        return {}
    embeddings: dict[str, list[float]] = {}
    for role_id, vector in payload.items():
        if not isinstance(role_id, str) or not isinstance(vector, list):
            logger.warning("role embeddings file %s holds a malformed entry", target)
            return {}
        try:
            embeddings[role_id] = embedding_provider.validate_embedding(
                vector, f"embedding for {role_id!r}"
            )
        except (TypeError, ValueError):
            logger.warning("role embeddings file %s holds a bad vector", target)
            return {}
    return embeddings


def role_embeddings_path() -> Path:
    """Return the seeded local embeddings path owned by the seed script."""
    try:
        from scripts.seed_role_embeddings import ROLE_EMBEDDINGS_PATH
    except ImportError:
        return FALLBACK_ROLE_EMBEDDINGS_PATH
    return Path(ROLE_EMBEDDINGS_PATH)


def _rank_match(
    scored: ScoredRole,
    constraints: MatchConstraints,
    candidate_pay: int,
) -> RankedMatch:
    profile = scored.profile
    similarity = _clamp(scored.similarity)
    score = similarity
    if profile.commute_km > constraints.commute_km:
        score -= COMMUTE_PENALTY
    if profile.weekly_hours > constraints.hours:
        score -= HOURS_PENALTY
    if profile.language.casefold() != constraints.language.casefold():
        score -= LANGUAGE_PENALTY
    pay_delta_pct = ((profile.annual_pay - candidate_pay) / candidate_pay) * 100
    blocked = pay_delta_pct < -GUARDRAIL_THRESHOLD_PCT and not constraints.accept_pay_cut
    guardrail_reason: str | None = None
    if blocked:
        score = min(score, BLOCKED_SCORE_CEILING)
        guardrail_reason = GUARDRAIL_REASON.format(
            pay_cut=abs(pay_delta_pct),
            threshold=GUARDRAIL_THRESHOLD_PCT,
        )
    return RankedMatch(
        role=profile.role_id,
        role_id=profile.role_id,
        title=profile.title,
        score=_clamp(score, SCORE_PRECISION),
        similarity=similarity,
        pay_delta_pct=round(pay_delta_pct, 1),
        annual_pay=profile.annual_pay,
        commute_km=profile.commute_km,
        blocked_by_guardrail=blocked,
        guardrail_reason=guardrail_reason,
        source=scored.source,
    )


def _promote_target_role(
    ranked: list[RankedMatch],
    target_role: str | None,
) -> list[RankedMatch]:
    if not target_role:
        return ranked
    wanted = target_role.strip().casefold()
    if not wanted:
        return ranked
    for index, candidate in enumerate(ranked):
        if candidate.role_id.casefold() == wanted or candidate.title.casefold() == wanted:
            promoted = ranked.pop(index)
            return [promoted, *ranked]
    logger.warning(
        "target role %r is not in the catalogue; returning the full ranking", target_role
    )
    return ranked


def _scored_roles(
    settings: Settings,
    query_vector: Sequence[float],
) -> tuple[list[ScoredRole], DataSource]:
    if hana_client.is_available(settings):
        try:
            return _live_scored_roles(settings, query_vector), "live"
        except Exception:
            logger.warning(
                "the SAP HANA role embedding query failed; serving simulated matches",
                exc_info=True,
            )
    return _simulated_scored_roles(query_vector), "simulated"


def _live_scored_roles(
    settings: Settings,
    query_vector: Sequence[float],
) -> list[ScoredRole]:
    parameters = {"query_embedding": _hana_vector_literal(query_vector)}
    rows = _live_rows(settings, parameters)
    scored: list[ScoredRole] = []
    for index, row in enumerate(rows):
        lookup = {str(key).casefold(): value for key, value in row.items()}
        role_id = str(_require_value(lookup, "role_id", index))
        similarity = _require_float(lookup, "similarity", index)
        embedding_provider.validate_embedding(
            _require_sequence(lookup, "embedding", index),
            f"ROLE_EMBEDDINGS.EMBEDDING for {role_id!r}",
        )
        profile = _row_profile(lookup, role_id, index)
        if profile is None:
            continue
        scored.append(ScoredRole(profile=profile, similarity=similarity, source="live"))
    if not scored:
        raise ValueError("SAP HANA returned no usable ROLE_EMBEDDINGS rows")
    return scored


def _live_rows(
    settings: Settings,
    parameters: dict[str, str],
) -> list[dict[str, Any]]:
    """Run the wide role-embedding query, then the two-column fallback.

    ``init_hana_schema.sql`` creates ``ROLE_EMBEDDINGS`` with ``ROLE_ID`` and
    ``EMBEDDING`` only. The wide query reads the role attributes from the same
    table for a later migration; until that migration lands the narrow query
    still gives HANA-owned similarities, and the role attributes come from the
    fixture catalogue, which is the single source of truth either way.
    """
    try:
        rows = hana_client.run_query(settings, LIVE_SIMILARITY_SQL, parameters)
    except Exception:
        logger.info(
            "ROLE_EMBEDDINGS has no role attribute columns; scoring with the two-column query",
            exc_info=True,
        )
        rows = hana_client.run_query(settings, LIVE_SIMILARITY_FALLBACK_SQL, parameters)
    if not rows:
        raise ValueError("SAP HANA returned no ROLE_EMBEDDINGS rows")
    return rows


def _row_profile(
    lookup: Mapping[str, Any],
    role_id: str,
    index: int,
) -> RoleProfile | None:
    if "title" not in lookup:
        catalogue = ROLE_PROFILES_BY_ID.get(role_id)
        if catalogue is None:
            logger.warning(
                "row %d is role %r, which is not in the catalogue; skipping it",
                index,
                role_id,
            )
            return None
        return catalogue
    payload: dict[str, Any] = {
        "role_id": role_id,
        "title": _require_value(lookup, "title", index),
        "city": _require_value(lookup, "city", index),
        "language": _require_value(lookup, "language", index),
        "commute_km": _require_float(lookup, "commute_km", index),
        "weekly_hours": _require_float(lookup, "weekly_hours", index),
        "annual_pay": _require_float(lookup, "annual_pay", index),
        "required_skills": _require_skills(lookup, index),
    }
    return RoleProfile.model_validate(payload)


def _hana_vector_literal(vector: Sequence[float]) -> str:
    """Render an embedding as the plain decimal literal TO_REAL_VECTOR accepts."""
    return ",".join(f"{float(value):.6f}" for value in vector)


def _require_value(lookup: Mapping[str, Any], column: str, index: int) -> Any:
    if column not in lookup:
        raise ValueError(f"row {index} is missing the {column.upper()} column")
    return lookup[column]


def _require_float(lookup: Mapping[str, Any], column: str, index: int) -> float:
    value = _require_value(lookup, column, index)
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError(f"row {index} holds a non-numeric {column.upper()}")
    return float(value)


def _require_sequence(lookup: Mapping[str, Any], column: str, index: int) -> list[Any]:
    value = _require_value(lookup, column, index)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError as error:
            raise ValueError(f"row {index} holds a malformed {column.upper()} vector") from error
        if not isinstance(parsed, list):
            raise ValueError(f"row {index} holds a malformed {column.upper()} vector")
        return parsed
    if isinstance(value, Sequence):
        return list(value)
    raise ValueError(f"row {index} holds an unreadable {column.upper()} column")


def _require_skills(lookup: Mapping[str, Any], index: int) -> list[str]:
    value = _require_value(lookup, "required_skills", index)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
            except ValueError as error:
                raise ValueError(f"row {index} holds malformed REQUIRED_SKILLS") from error
            if not isinstance(parsed, list):
                raise ValueError(f"row {index} holds malformed REQUIRED_SKILLS")
            return [str(skill) for skill in parsed]
        return [skill.strip() for skill in text.split(",") if skill.strip()]
    if isinstance(value, Iterable):
        return [str(skill) for skill in value]
    raise ValueError(f"row {index} holds an unreadable REQUIRED_SKILLS column")


def _simulated_scored_roles(query_vector: Sequence[float]) -> list[ScoredRole]:
    seeded = load_role_embeddings()
    missing = [profile.role_id for profile in ROLE_PROFILES if profile.role_id not in seeded]
    if missing:
        logger.info("recomputing %d role embeddings in process", len(missing))
    computed = embedding_provider.embed_texts(
        [role_embedding_text(profile) for profile in ROLE_PROFILES]
    )
    return [
        ScoredRole(
            profile=profile,
            similarity=embedding_provider.cosine_similarity(
                query_vector, seeded.get(profile.role_id, vector)
            ),
            source="simulated",
        )
        for profile, vector in zip(ROLE_PROFILES, computed, strict=True)
    ]


def _weighted_skills(
    passport_skills: Sequence[SkillClaim] | Sequence[str],
) -> list[WeightedSkill]:
    if not passport_skills:
        return []
    first = passport_skills[0]
    if isinstance(first, SkillClaim):
        return _ordered_skills(
            WeightedSkill(name=claim.name, weight=claim.confidence, verified=claim.verified)
            for claim in passport_skills
            if isinstance(claim, SkillClaim) and claim.name.strip()
        )
    return _ordered_skills(
        WeightedSkill(name=str(name), weight=0.5, verified=False)
        for name in passport_skills
        if str(name).strip()
    )


def _ordered_skills(skills: Iterable[WeightedSkill]) -> list[WeightedSkill]:
    ordered = sorted(
        {(skill.name.strip(), skill.verified): skill for skill in skills}.values(),
        key=lambda skill: (-skill.weight, not skill.verified, skill.name),
    )
    return ordered[:MAX_CANDIDATE_SKILLS]


def _clamp(value: float, precision: int = SIMILARITY_PRECISION) -> float:
    return round(max(0.0, min(1.0, value)), precision)
