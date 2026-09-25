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


def test_role_id_changes_the_role_match_score() -> None:
    profile = valid_profile()

    assert score_candidate(profile, "role-42") != score_candidate(profile, "role-43")


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
    actual_score = score_candidate(profile, "role-42")
    outcome = run_ghost_twin_audit(profile, "role-42")

    assert all(twin.delta == twin.score - actual_score for twin in outcome.twins)
    assert outcome.max_delta == max(abs(twin.delta) for twin in outcome.twins)
    assert outcome.max_delta >= 0


def test_threshold_boundary_is_pass_at_limit_and_flagged_above_limit() -> None:
    profile = valid_profile()
    unconstrained = run_ghost_twin_audit(profile, "role-42", threshold=100)
    assert unconstrained.max_delta > 0

    at_limit = run_ghost_twin_audit(profile, "role-42", threshold=unconstrained.max_delta)
    above_limit = run_ghost_twin_audit(profile, "role-42", threshold=unconstrained.max_delta - 1)

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
