"""Merging of freshly extracted skill claims into a stored skill passport.

Both ``POST /skills/extract`` and the orchestrator's skills-discovery node need the
same rule, so it lives here rather than being written twice.
"""

from app.models import (
    SessionState,
    SkillClaim,
    SkillExtractionResponse,
    SkillPassport,
)

PASSPORT_ID_PREFIX = "passport-"


def merge_skill_passport(
    session: SessionState,
    response: SkillExtractionResponse,
) -> SkillPassport:
    """Fold ``response`` into whatever passport the session already carries.

    Re-extraction must be able to raise a stored claim's confidence, so a freshly
    extracted claim wins over the stored one for the same skill. Claims the fresh
    extraction did not mention are preserved, and a claim already marked
    ``verified`` by a work sample stays verified.
    """
    needs_proof = set(response.needs_proof)
    existing = session.passport
    claims: dict[str, SkillClaim] = (
        {claim.name: claim for claim in existing.skills} if existing else {}
    )
    for skill in response.skills:
        was_verified = claims[skill.name].verified if skill.name in claims else False
        claims[skill.name] = SkillClaim(
            name=skill.name,
            confidence=skill.confidence,
            verified=was_verified or skill.name not in needs_proof,
        )
    return SkillPassport(
        passport_id=f"{PASSPORT_ID_PREFIX}{session.session_id}",
        owner=session.persona,
        skills=sorted(claims.values(), key=lambda claim: (-claim.confidence, claim.name)),
        credentials=list(existing.credentials) if existing else [],
        source=response.source,
    )
