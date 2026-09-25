from typing import Any

import pytest

from app.domain.ghost_twin import (
    GHOST_TWIN_ATTRIBUTES,
    run_ghost_twin_audit,
    score_candidate,
)


def valid_profile() -> dict[str, Any]:
    return {
        "career_gap": "18 months",
        "gender": "female",
        "age": 29,
        "college_tier": "tier_2",
        "city": "Chennai",
    }


def test_audit_is_deterministic() -> None:
    profile = valid_profile()

    first = run_ghost_twin_audit(profile, "role-42")
    second = run_ghost_twin_audit(profile, "role-42")

    assert first == second


def test_audit_parameters_can_be_supplied_in_the_candidate_profile() -> None:
    profile = {
        "career_gap": "18 months",
        "gender": "female",
        "age": 29,
        "college_tier": "tier_3",
        "city": "Chennai",
        "skill_score": 86,
        "simulate_legacy_ats": True,
    }

    outcome = run_ghost_twin_audit(profile, "quality-analyst")

    assert outcome.actual_score == 91
    assert outcome.max_delta == 6
    assert outcome.result == "FLAGGED"


def test_invalid_profile_level_audit_parameters_fail_clearly() -> None:
    profile = valid_profile()

    with pytest.raises(ValueError, match="skill_score"):
        run_ghost_twin_audit({**profile, "skill_score": "86"}, "role-42")
    with pytest.raises(ValueError, match="simulate_legacy_ats"):
        run_ghost_twin_audit({**profile, "simulate_legacy_ats": "yes"}, "role-42")


def test_role_id_changes_the_role_match_score_in_legacy_mode() -> None:
    profile = valid_profile()

    assert score_candidate(profile, "role-42", simulate_legacy_ats=True) != score_candidate(
        profile, "role-43", simulate_legacy_ats=True
    )


def test_audit_contains_every_twin() -> None:
    outcome = run_ghost_twin_audit(valid_profile(), "role-42")

    assert len(outcome.twins) == 5
    assert {twin.attribute for twin in outcome.twins} == set(GHOST_TWIN_ATTRIBUTES)


def test_counterfactuals_are_plausible_and_change_one_attribute() -> None:
    profile = valid_profile()
    expected = {
        "career_gap": {"months": 0},
        "gender": "male",
        "age": 30,
        "college_tier": "tier_1",
        "city": "Bengaluru",
    }

    outcome = run_ghost_twin_audit(profile, "role-42")

    assert {twin.attribute: twin.counterfactual_value for twin in outcome.twins} == expected
    for twin in outcome.twins:
        variant = dict(profile)
        variant[twin.attribute] = twin.counterfactual_value
        assert variant[twin.attribute] != profile[twin.attribute]
        assert all(
            variant[attribute] == value
            for attribute, value in profile.items()
            if attribute != twin.attribute
        )


def test_gender_is_a_protected_zero_effect_attribute() -> None:
    profile = valid_profile()
    outcome = run_ghost_twin_audit(profile, "role-42")
    gender_twin = next(twin for twin in outcome.twins if twin.attribute == "gender")

    assert gender_twin.delta == 0


def test_deltas_and_max_delta_use_strict_absolute_values() -> None:
    profile = valid_profile()
    actual_score = score_candidate(profile, "role-42", simulate_legacy_ats=True)
    outcome = run_ghost_twin_audit(profile, "role-42", simulate_legacy_ats=True)

    assert all(twin.delta == twin.score - actual_score for twin in outcome.twins)
    assert outcome.max_delta == max(abs(twin.delta) for twin in outcome.twins)
    assert outcome.max_delta >= 0


def test_fair_merit_mode_keeps_all_twin_scores_identical() -> None:
    outcome = run_ghost_twin_audit(valid_profile(), "role-42", skill_score=92)

    assert outcome.actual_score == 92
    assert all(twin.score == outcome.actual_score for twin in outcome.twins)
    assert outcome.max_delta == 0
    assert outcome.result == "PASS"


def test_legacy_mode_demonstrates_demographic_movement() -> None:
    outcome = run_ghost_twin_audit(valid_profile(), "role-42", simulate_legacy_ats=True)

    assert outcome.max_delta > 0
    assert any(
        twin.attribute in {"age", "city", "college_tier", "career_gap"} and twin.delta != 0
        for twin in outcome.twins
    )


def test_quality_analyst_demo_profile_is_fair_by_default_and_biased_in_legacy_mode() -> None:
    profile = {
        "career_gap": "18 months",
        "gender": "female",
        "age": 29,
        "college_tier": "tier_3",
        "city": "Chennai",
    }

    fair = run_ghost_twin_audit(profile, "quality-analyst", skill_score=86)
    legacy = run_ghost_twin_audit(
        profile,
        "quality-analyst",
        skill_score=86,
        simulate_legacy_ats=True,
    )

    assert fair.actual_score == 86
    assert all(twin.score == fair.actual_score for twin in fair.twins)
    assert fair.max_delta == 0
    assert fair.result == "PASS"
    assert legacy.max_delta > 5
    assert legacy.result == "FLAGGED"
    assert legacy.threshold == 5


def test_skill_score_controls_the_fair_base_score() -> None:
    profile = valid_profile()

    low_skill = run_ghost_twin_audit(profile, "role-42", skill_score=60)
    high_skill = run_ghost_twin_audit(profile, "role-42", skill_score=95)

    assert low_skill.actual_score == 60
    assert high_skill.actual_score == 95
    assert high_skill.actual_score - low_skill.actual_score == 35


def test_threshold_boundary_is_pass_at_limit_and_flagged_above_limit() -> None:
    profile = valid_profile()
    unconstrained = run_ghost_twin_audit(
        profile,
        "role-42",
        threshold=100,
        simulate_legacy_ats=True,
    )
    assert unconstrained.max_delta > 0

    at_limit = run_ghost_twin_audit(
        profile,
        "role-42",
        threshold=unconstrained.max_delta,
        simulate_legacy_ats=True,
    )
    above_limit = run_ghost_twin_audit(
        profile,
        "role-42",
        threshold=unconstrained.max_delta - 1,
        simulate_legacy_ats=True,
    )

    assert at_limit.result == "PASS"
    assert above_limit.result == "FLAGGED"


def test_supported_career_gap_forms_are_equivalent() -> None:
    profile = valid_profile()
    assert score_candidate({**profile, "career_gap": "18 months"}, "role-42") == score_candidate(
        {**profile, "career_gap": {"months": 18}}, "role-42"
    )
    assert score_candidate({**profile, "career_gap": "1.5 years"}, "role-42") == score_candidate(
        {**profile, "career_gap": 1.5}, "role-42"
    )


@pytest.mark.parametrize(
    "profile",
    [
        {**valid_profile(), "age": 17},
        {**valid_profile(), "gender": "unknown"},
        {**valid_profile(), "college_tier": "elite"},
        {**valid_profile(), "city": " "},
        {**valid_profile(), "career_gap": "18"},
        {**valid_profile(), "career_gap": {"months": 18, "years": 1}},
        {key: value for key, value in valid_profile().items() if key != "age"},
        {**valid_profile(), "unexpected": "value"},
    ],
)
def test_invalid_profiles_fail_clearly(profile: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        run_ghost_twin_audit(profile, "role-42")


def test_invalid_role_id_fails_clearly() -> None:
    with pytest.raises(ValueError, match="role_id"):
        run_ghost_twin_audit(valid_profile(), " ")
