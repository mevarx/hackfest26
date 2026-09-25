"""Deterministic job posts for the Employer Readiness agent.

Each post carries the employer's own wording before and after the rewrite, the
one restrictive phrase ReRoute removes, and the number of candidates that phrase
had hidden. The hidden-talent counts are illustrative demo numbers for a Chennai
manual tester, not observed hiring data, so every payload is stamped
``source="simulated"`` and the Employer Readiness node never reports them as
``live``.
"""

from typing import Final, Literal, TypedDict

from pydantic import JsonValue

SIMULATED_LABEL: Final[str] = "simulated"
DISCLAIMER: Final[str] = (
    "Illustrative employer job posts bundled with the demo, not observed hiring data."
)

RestrictiveCriterion = Literal["gender", "age", "college_tier", "career_gap", "logistics"]

DEFAULT_CITY: Final[str] = "Chennai"


class JobPost(TypedDict):
    post_id: str
    role: str
    city: str
    posted_days_ago: int
    filter_text_before: str
    restrictive_phrase: str
    restrictive_criterion: RestrictiveCriterion
    removed_criteria: list[str]
    hidden_talent_count: int
    filter_text_after: str
    rewrite_reason: str


JOB_POSTS: Final[tuple[JobPost, ...]] = (
    JobPost(
        post_id="post-chennai-qa-analyst-118",
        role="qa-analyst",
        city="Chennai",
        posted_days_ago=4,
        filter_text_before=(
            "Looking for a QA analyst. Must be a graduate from a tier-1 college, "
            "aged 22-28, and only consider candidates with no career break so far. "
            "Female candidates preferred for the floor walk."
        ),
        restrictive_phrase="aged 22-28",
        restrictive_criterion="age",
        removed_criteria=[
            "must be a graduate from a tier-1 college",
            "aged 22-28",
            "only consider candidates with no career break so far",
            "Female candidates preferred for the floor walk",
        ],
        hidden_talent_count=12,
        filter_text_after=(
            "Looking for a QA analyst with documented regression, defect triage and "
            "API testing evidence. A career break is fine as long as the evidence is "
            "current. Every applicant is scored on the same criteria."
        ),
        rewrite_reason="Age, college tier and gender wording removed; evidence replaced pedigree.",
    ),
    JobPost(
        post_id="post-chennai-support-lead-207",
        role="support-operations-lead",
        city="Chennai",
        posted_days_ago=9,
        filter_text_before=(
            "Support operations lead. Freshers with no prior experience are welcome, "
            "but the shift is night-only and applicants must be able to report to the "
            "Perungudi campus at short notice."
        ),
        restrictive_phrase="freshers with no prior experience",
        restrictive_criterion="career_gap",
        removed_criteria=[
            "freshers with no prior experience are welcome",
            "night-only shift",
            "report to the Perungudi campus at short notice",
        ],
        hidden_talent_count=19,
        filter_text_after=(
            "Support operations lead. Manual testing and defect triage experience is "
            "valued. Day and night rotation is available, and the commute allowance "
            "covers the Perungudi campus."
        ),
        rewrite_reason="Experience-floor and logistics wording replaced with evidence and support.",
    ),
    JobPost(
        post_id="post-chennai-data-quality-311",
        role="data-quality-analyst",
        city="Chennai",
        posted_days_ago=15,
        filter_text_before=(
            "Data quality analyst. Only tier-2 or tier-1 engineering graduates from "
            "Chennai colleges will be considered. The role is on-site five days a week."
        ),
        restrictive_phrase="only tier-2 or tier-1 engineering graduates",
        restrictive_criterion="college_tier",
        removed_criteria=[
            "only tier-2 or tier-1 engineering graduates from Chennai colleges",
            "on-site five days a week",
        ],
        hidden_talent_count=8,
        filter_text_after=(
            "Data quality analyst. SQL data validation, reconciliation reporting and "
            "API testing evidence counts as a track record. Hybrid schedule after the "
            "first quarter."
        ),
        rewrite_reason="College tier replaced with skills evidence and a hybrid commitment.",
    ),
)

JOB_POSTS_BY_ID: Final[dict[str, JobPost]] = {post["post_id"]: post for post in JOB_POSTS}


def employer_readiness_brief(
    role: str | None = None,
    city: str = DEFAULT_CITY,
) -> dict[str, JsonValue]:
    """Return the simulated posts for one role, or the whole city when unset.

    An unknown role or city falls back to every bundled post so the Employer
    Readiness node always has a rewrite to show.
    """
    wanted = role.strip() if role else ""
    selected = tuple(
        post
        for post in JOB_POSTS
        if (not wanted or post["role"] == wanted) and post["city"] == city
    )
    if not selected:
        selected = tuple(post for post in JOB_POSTS if not wanted or post["role"] == wanted)
    if not selected:
        selected = JOB_POSTS
    posts: list[JsonValue] = [
        {
            "post_id": post["post_id"],
            "role": post["role"],
            "city": post["city"],
            "posted_days_ago": post["posted_days_ago"],
            "filter_text_before": post["filter_text_before"],
            "restrictive_phrase": post["restrictive_phrase"],
            "restrictive_criterion": post["restrictive_criterion"],
            "removed_criteria": [criterion for criterion in post["removed_criteria"]],
            "hidden_talent_count": post["hidden_talent_count"],
            "filter_text_after": post["filter_text_after"],
            "rewrite_reason": post["rewrite_reason"],
        }
        for post in selected
    ]
    removed: list[JsonValue] = [
        criterion for post in selected for criterion in post["removed_criteria"]
    ]
    return {
        "source": SIMULATED_LABEL,
        "city": city,
        "disclaimer": DISCLAIMER,
        "post_count": len(posts),
        "hidden_talent_count": sum(post["hidden_talent_count"] for post in selected),
        "removed_criteria": removed,
        "posts": posts,
    }
