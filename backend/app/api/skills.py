import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import SessionStoreDependency, SettingsDependency
from app.domain.passport import merge_skill_passport
from app.models import (
    ProofRequest,
    SkillClaim,
    SkillExtractionRequest,
    SkillExtractionResponse,
    SkillPassport,
    WorkSampleRequest,
    WorkSampleResponse,
)
from app.services import genai_hub
from app.storage.session_store import SessionVersionConflictError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/skills", tags=["skills"])

SESSION_WRITE_ATTEMPTS = 3


@router.post("/extract", response_model=SkillExtractionResponse)
async def extract_skills(
    request: SkillExtractionRequest,
    session_store: SessionStoreDependency,
    settings: SettingsDependency,
) -> SkillExtractionResponse:
    response = genai_hub.extract_skills(request.transcript, settings)
    if request.session_id is not None:
        await _persist_passport(
            session_store=session_store,
            session_id=request.session_id,
            response=response,
        )
    return response


@router.get("/proof-requests", response_model=list[ProofRequest])
async def list_proof_requests() -> list[ProofRequest]:
    """The evidence each proof-gated skill needs before its claim can be trusted."""
    return [
        ProofRequest(skill=skill, request=proof)
        for skill, proof in genai_hub.proof_requests().items()
    ]


@router.post("/work-sample", response_model=WorkSampleResponse)
async def score_work_sample(
    request: WorkSampleRequest,
    session_store: SessionStoreDependency,
    settings: SettingsDependency,
) -> WorkSampleResponse:
    response = genai_hub.score_work_sample(
        request.skill_id,
        request.submission,
        settings,
    )
    if request.session_id is not None:
        await _record_credential(
            session_store=session_store,
            session_id=request.session_id,
            skill_name=request.skill_id,
            score=response.score,
            verified=response.credential_issued,
            source=response.source,
        )
    return response


async def _persist_passport(
    session_store: SessionStoreDependency,
    session_id: str,
    response: SkillExtractionResponse,
) -> None:
    for _ in range(SESSION_WRITE_ATTEMPTS):
        session = await session_store.get(session_id)
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
        passport = merge_skill_passport(session, response)
        try:
            await session_store.update(
                session.merged(
                    passport=passport,
                    skills_source=response.source,
                    status="running",
                ),
                expected_version=session.version,
            )
        except SessionVersionConflictError:
            logger.info("session %s moved under /skills/extract; retrying", session_id)
            continue
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Session is being updated concurrently; retry the request",
    )


async def _record_credential(
    session_store: SessionStoreDependency,
    session_id: str,
    skill_name: str,
    score: int,
    verified: bool,
    source: Literal["live", "simulated"],
) -> None:
    for _ in range(SESSION_WRITE_ATTEMPTS):
        session = await session_store.get(session_id)
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
        if session.passport is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session has no skill passport yet",
            )
        try:
            await session_store.update(
                session.merged(
                    passport=_merge_credential(
                        session.passport, skill_name, score, verified, source
                    )
                ),
                expected_version=session.version,
            )
        except SessionVersionConflictError:
            logger.info("session %s moved under /skills/work-sample; retrying", session_id)
            continue
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Session is being updated concurrently; retry the request",
    )


def _merge_credential(
    passport: SkillPassport,
    skill_name: str,
    score: int,
    verified: bool,
    source: Literal["live", "simulated"],
) -> SkillPassport:
    claims = {claim.name: claim for claim in passport.skills if claim.name != skill_name}
    claims[skill_name] = SkillClaim(
        name=skill_name,
        confidence=max(0.0, min(1.0, score / 100)),
        verified=verified,
    )
    credentials = list(passport.credentials)
    if verified and skill_name not in credentials:
        credentials.append(skill_name)
    return passport.model_copy(
        update={
            "skills": sorted(claims.values(), key=lambda claim: (-claim.confidence, claim.name)),
            "credentials": credentials,
            "source": source,
        }
    )
