import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Literal

GhostTwinAttribute = Literal["career_gap", "gender", "age", "college_tier", "city"]
GHOST_TWIN_ATTRIBUTES: tuple[GhostTwinAttribute, ...] = (
    "career_gap",
    "gender",
    "age",
    "college_tier",
    "city",
)
AuditVerdict = Literal["PASS", "FLAGGED"]
_GAP_PATTERN = re.compile(r"^\s*([+-]?\d+(?:\.\d+)?)\s*(years?|yrs?|months?|mos?)\s*$", re.I)
_GENDER_TWINS = {
    "female": "male",
    "male": "female",
    "non_binary": "other",
    "other": "non_binary",
    "not_disclosed": "female",
}
_COLLEGE_TIER_TWINS = {"tier_1": "tier_2", "tier_2": "tier_1", "tier_3": "tier_2"}
_ROLE_CITIES = ("Chennai", "Bengaluru", "Hyderabad", "Pune")
_ROLE_TIERS = ("tier_1", "tier_2", "tier_3")


@dataclass(frozen=True, slots=True)
class RoleMatchCriteria:
    preferred_age: int
    preferred_city: str
    preferred_college_tier: str
    career_gap_allowance_months: int


@dataclass(frozen=True, slots=True)
class CounterfactualScore:
    attribute: GhostTwinAttribute
    original_value: object
    counterfactual_value: object
    score: int
    delta: int


@dataclass(frozen=True, slots=True)
class GhostTwinOutcome:
    actual_score: int
    twins: tuple[CounterfactualScore, ...]
    max_delta: int
    result: AuditVerdict
    threshold: int


_QUALITY_ANALYST_CRITERIA = RoleMatchCriteria(
    preferred_age=47,
    preferred_city="Bengaluru",
    preferred_college_tier="tier_2",
    career_gap_allowance_months=9,
)


def run_ghost_twin_audit(
    candidate_profile: Mapping[str, Any],
    role_id: str,
    threshold: int = 5,
    skill_score: int = 85,
    simulate_legacy_ats: bool = False,
) -> GhostTwinOutcome:
    if threshold < 0:
        raise ValueError("threshold must be non-negative")
    profile = validate_candidate_profile(candidate_profile)
    criteria = _role_match_criteria(role_id)
    actual_score = _score_valid_profile(
        profile,
        criteria,
        skill_score=skill_score,
        simulate_legacy_ats=simulate_legacy_ats,
    )
    twins: list[CounterfactualScore] = []
    for attribute in GHOST_TWIN_ATTRIBUTES:
        original_value = profile[attribute]
        counterfactual_value = _counterfactual_value(attribute, original_value)
        variant = dict(profile)
        variant[attribute] = counterfactual_value
        variant_score = _score_valid_profile(
            variant,
            criteria,
            skill_score=skill_score,
            simulate_legacy_ats=simulate_legacy_ats,
        )
        twins.append(
            CounterfactualScore(
                attribute=attribute,
                original_value=original_value,
                counterfactual_value=counterfactual_value,
                score=variant_score,
                delta=variant_score - actual_score,
            )
        )

    max_delta = max((abs(twin.delta) for twin in twins), default=0)
    return GhostTwinOutcome(
        actual_score=actual_score,
        twins=tuple(twins),
        max_delta=max_delta,
        result="FLAGGED" if max_delta > threshold else "PASS",
        threshold=threshold,
    )


def score_candidate(
    candidate_profile: Mapping[str, Any],
    role_id: str,
    skill_score: int = 85,
    simulate_legacy_ats: bool = False,
) -> int:
    profile = validate_candidate_profile(candidate_profile)
    return _score_valid_profile(
        profile,
        _role_match_criteria(role_id),
        skill_score=skill_score,
        simulate_legacy_ats=simulate_legacy_ats,
    )


def validate_candidate_profile(candidate_profile: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(candidate_profile, Mapping):
        raise ValueError("candidate_profile must be an object")
    if any(not isinstance(attribute, str) for attribute in candidate_profile):
        raise ValueError("candidate attribute names must be strings")
    required_attributes = set(GHOST_TWIN_ATTRIBUTES)
    missing_attributes = required_attributes.difference(candidate_profile)
    unsupported_attributes = set(candidate_profile).difference(required_attributes)
    if missing_attributes:
        raise ValueError(f"missing candidate attributes: {sorted(missing_attributes)}")
    if unsupported_attributes:
        raise ValueError(f"unsupported candidate attributes: {sorted(unsupported_attributes)}")

    profile = dict(candidate_profile)
    if not isinstance(profile["gender"], str) or profile["gender"] not in _GENDER_TWINS:
        raise ValueError("gender must be one of female, male, non_binary, other, not_disclosed")
    age = profile["age"]
    if isinstance(age, bool) or not isinstance(age, int) or not 18 <= age <= 100:
        raise ValueError("age must be an integer from 18 through 100")
    if profile["college_tier"] not in _COLLEGE_TIER_TWINS:
        raise ValueError("college_tier must be one of tier_1, tier_2, tier_3")
    if not isinstance(profile["city"], str) or not profile["city"].strip():
        raise ValueError("city must be a non-empty string")
    _career_gap_months(profile["career_gap"])
    profile["city"] = profile["city"].strip()
    return profile


def _role_match_criteria(role_id: str) -> RoleMatchCriteria:
    if not isinstance(role_id, str) or not role_id.strip():
        raise ValueError("role_id must be a non-empty string")
    normalized_role_id = role_id.strip()
    if normalized_role_id == "quality-analyst":
        return _QUALITY_ANALYST_CRITERIA
    role_digest = sha256(normalized_role_id.encode("utf-8")).digest()
    return RoleMatchCriteria(
        preferred_age=24 + role_digest[0] % 37,
        preferred_city=_ROLE_CITIES[role_digest[1] % len(_ROLE_CITIES)],
        preferred_college_tier=_ROLE_TIERS[role_digest[2] % len(_ROLE_TIERS)],
        career_gap_allowance_months=role_digest[3] % 25,
    )


def _score_valid_profile(
    candidate_profile: Mapping[str, Any],
    criteria: RoleMatchCriteria,
    skill_score: int = 85,
    simulate_legacy_ats: bool = False,
) -> int:
    if (
        isinstance(skill_score, bool)
        or not isinstance(skill_score, int)
        or not 0 <= skill_score <= 100
    ):
        raise ValueError("skill_score must be an integer from 0 through 100")
    if not isinstance(simulate_legacy_ats, bool):
        raise ValueError("simulate_legacy_ats must be a boolean")
    score = skill_score
    age_value = candidate_profile["age"]
    city_value = candidate_profile["city"]
    college_tier_value = candidate_profile["college_tier"]
    if not isinstance(age_value, int) or isinstance(age_value, bool):
        raise ValueError("age must be an integer")
    if not isinstance(city_value, str) or not isinstance(college_tier_value, str):
        raise ValueError("city and college_tier must be strings")
    gap_months = _career_gap_months(candidate_profile["career_gap"])
    if simulate_legacy_ats:
        score += max(0, 10 - abs(age_value - criteria.preferred_age) // 5)
        if city_value.casefold() == criteria.preferred_city.casefold():
            score += 4
        if college_tier_value == criteria.preferred_college_tier:
            score += 3
        if gap_months <= criteria.career_gap_allowance_months:
            score += 4
        else:
            score -= min(12, int((gap_months - criteria.career_gap_allowance_months) // 4))
    return max(0, min(100, score))


def _counterfactual_value(attribute: GhostTwinAttribute, original_value: object) -> object:
    if attribute == "career_gap":
        return {"months": 6} if _career_gap_months(original_value) == 0 else {"months": 0}
    if attribute == "gender":
        return _GENDER_TWINS[str(original_value)]
    if attribute == "age":
        return 31 if original_value == 30 else 30
    if attribute == "college_tier":
        return _COLLEGE_TIER_TWINS[str(original_value)]
    city = str(original_value).casefold()
    if city == "chennai":
        return "Bengaluru"
    if city == "bengaluru" or city == "remote":
        return "Chennai"
    return "Chennai"


def _career_gap_months(value: object) -> float:
    if isinstance(value, bool):
        raise ValueError("career_gap must be a non-negative duration")
    if isinstance(value, Mapping):
        unsupported_units = set(value).difference({"months", "years"})
        if unsupported_units:
            raise ValueError("career_gap mapping supports only months or years")
        units = [unit for unit in ("months", "years") if unit in value]
        if len(units) != 1:
            raise ValueError("career_gap mapping must specify exactly one duration unit")
        amount = _finite_non_negative_number(value[units[0]], "career_gap")
        months = amount * 12 if units[0] == "years" else amount
    elif isinstance(value, str):
        match = _GAP_PATTERN.match(value)
        if match is None:
            raise ValueError("career_gap strings must include years or months")
        amount = float(match.group(1))
        months = amount * 12 if match.group(2).lower().startswith("y") else amount
    elif isinstance(value, (int, float)):
        months = _finite_non_negative_number(value, "career_gap") * 12
    else:
        raise ValueError("career_gap must be a number, duration string, or duration mapping")
    if not math.isfinite(months) or not 0 <= months <= 600:
        raise ValueError("career_gap must be between 0 and 600 months")
    return months


def _finite_non_negative_number(value: object, attribute: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError(f"{attribute} must be a finite non-negative number")
    try:
        number = float(value)
    except ValueError as error:
        raise ValueError(f"{attribute} must be a finite non-negative number") from error
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"{attribute} must be a finite non-negative number")
    return number
