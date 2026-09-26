from typing import Annotated, Any, cast

from fastapi import APIRouter, HTTPException, Query, status

from app.mocks import employer_fixtures, market_fixtures
from app.models import (
    ROLE_QUERY_MAX_LENGTH,
    DisplacementRadarResponse,
    EmployerFilterRewriteRequest,
    EmployerFilterRewriteResponse,
)

router = APIRouter(tags=["market", "employer"])

RoleQuery = Annotated[str, Query(min_length=1, max_length=ROLE_QUERY_MAX_LENGTH)]
CityQuery = Annotated[str, Query(min_length=1, max_length=ROLE_QUERY_MAX_LENGTH)]


@router.get("/market/displacement-radar", response_model=DisplacementRadarResponse)
def displacement_radar(
    role: RoleQuery,
    city: CityQuery = market_fixtures.DEFAULT_CITY,
) -> DisplacementRadarResponse:
    entry = _radar_entry(role, city)
    return DisplacementRadarResponse(
        role=entry["role"],
        city=entry["city"],
        exposure=entry["exposure"],
        demand=entry["demand"],
        disclaimer=market_fixtures.DISCLAIMER,
    )


@router.post(
    "/employer/rewrite-filter",
    response_model=EmployerFilterRewriteResponse,
)
def rewrite_filter(
    request: EmployerFilterRewriteRequest,
) -> EmployerFilterRewriteResponse:
    post = employer_fixtures.JOB_POSTS_BY_ID.get(request.job_post_id)
    if post is None:
        known = ", ".join(sorted(employer_fixtures.JOB_POSTS_BY_ID))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unknown job_post_id; expected one of: {known}",
        )
    return EmployerFilterRewriteResponse(
        job_post_id=post["post_id"],
        role=post["role"],
        city=post["city"],
        filter_text_before=post["filter_text_before"],
        filter_text_after=post["filter_text_after"],
        restrictive_phrase=post["restrictive_phrase"],
        removed_criteria=list(post["removed_criteria"]),
        hidden_talent_count=post["hidden_talent_count"],
        rewrite_reason=post["rewrite_reason"],
        disclaimer=employer_fixtures.DISCLAIMER,
    )


def _radar_entry(role: str, city: str) -> dict[str, Any]:
    wanted_role = role.strip().casefold()
    wanted_city = city.strip().casefold()
    for entry in market_fixtures.DISPLACEMENT_RADAR:
        if entry["role"].casefold() != wanted_role:
            continue
        if entry["city"].casefold() == wanted_city:
            return cast(dict[str, Any], entry)
    known = ", ".join(sorted({entry["role"] for entry in market_fixtures.DISPLACEMENT_RADAR}))
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"no simulated radar entry for role {role!r} in {city!r}; expected one of: {known}",
    )
