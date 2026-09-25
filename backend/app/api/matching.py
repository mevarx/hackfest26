"""HTTP surface for inclusive role matching.

The router is created with the ``/match`` prefix and a single empty route path,
so registering ``app.include_router(matching.router)`` in ``app.main`` exposes
exactly one endpoint: ``POST /match``.
"""

import logging
from typing import Final

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import SessionStoreDependency, SettingsDependency
from app.models import MatchRequest, MatchResponse, SessionState, SkillClaim
from app.services import inclusive_matching
from app.storage.session_store import SessionStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/match", tags=["matching"])
PAY_STATE_KEYS: Final[tuple[str, ...]] = ("candidate_annual_pay", "annual_pay")


@router.post("", response_model=MatchResponse)
async def create_match(
    request: MatchRequest,
    session_store: SessionStoreDependency,
    settings: SettingsDependency,
) -> MatchResponse:
    """Rank roles for the skill passport and apply the Wage-Scar Guardrail."""
    skills, candidate_pay, passport_id = await _resolve_candidate(request, session_store)
    return inclusive_matching.match(
        settings,
        skills,
        constraints=request.constraints,
        target_role=request.target_role,
        candidate_annual_pay=candidate_pay,
        passport_id=passport_id,
    )


async def _resolve_candidate(
    request: MatchRequest,
    session_store: SessionStore,
) -> tuple[list[SkillClaim], int, str]:
    if request.session_id is None:
        logger.info(
            "no session supplied; matching %s against the baseline manual tester passport",
            request.passport_id,
        )
        return (
            list(inclusive_matching.DEFAULT_PASSPORT_SKILLS),
            inclusive_matching.DEFAULT_CANDIDATE_ANNUAL_PAY,
            request.passport_id,
        )
    session = await session_store.get(request.session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.passport is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session has no skill passport yet",
        )
    return (
        list(session.passport.skills),
        _candidate_pay_from_state(session),
        session.passport.passport_id,
    )


def _candidate_pay_from_state(session: SessionState) -> int:
    for key in PAY_STATE_KEYS:
        value = session.state.get(key)
        if isinstance(value, bool) or not isinstance(value, int):
            continue
        if value > 0:
            return value
    return inclusive_matching.DEFAULT_CANDIDATE_ANNUAL_PAY
