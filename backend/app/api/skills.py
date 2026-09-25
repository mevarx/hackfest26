from typing import Literal

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import SessionStoreDependency, SettingsDependency
from app.models import (
    SkillClaim,
    SkillExtractionRequest,
    SkillExtractionResponse,
    SkillPassport,
    WorkSampleRequest,
    WorkSampleResponse,
)
from app.services import genai_hub

router = APIRouter(prefix="/skills", tags=["skills"])


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
    session = await session_store.get(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    needs_proof = set(response.needs_proof)
    current_skills = session.passport.skills if session.passport else []
    existing_claims = {claim.name: claim for claim in current_skills}
    claims = {
        name: SkillClaim(name=name, confidence=skill.confidence, verified=name not in needs_proof)
        for name, skill in ((skill.name, skill) for skill in response.skills)
    }
    claims.update(existing_claims)
    credentials = list(session.passport.credentials if session.passport else [])
    passport = SkillPassport(
        passport_id=f"passport-{session_id}",
        owner=session.persona,
        skills=sorted(claims.values(), key=lambda claim: (-claim.confidence, claim.name)),
        credentials=credentials,
        source=response.source,
    )
    updated = session.merged(
        passport=passport,
        skills_source=response.source,
        status="running",
    )
    await session_store.update(updated, expected_version=session.version)


async def _record_credential(
    session_store: SessionStoreDependency,
    session_id: str,
    skill_name: str,
    score: int,
    verified: bool,
    source: Literal["live", "simulated"],
) -> None:
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
    claims = {claim.name: claim for claim in session.passport.skills if claim.name != skill_name}
    claims[skill_name] = SkillClaim(
        name=skill_name,
        confidence=max(0.0, min(1.0, score / 100)),
        verified=verified,
    )
    credentials = list(session.passport.credentials)
    if verified and skill_name not in credentials:
        credentials.append(skill_name)
    passport = session.passport.model_copy(
        update={
            "skills": sorted(claims.values(), key=lambda claim: (-claim.confidence, claim.name)),
            "credentials": credentials,
            "source": source,
        }
    )
    await session_store.update(
        session.merged(passport=passport, skills_source=source),
        expected_version=session.version,
    )
