import json
import logging
import re
from collections.abc import Mapping
from typing import Any

import httpx

from app.config import Settings
from app.mocks.genai_fixtures import (
    CREDENTIAL_THRESHOLD,
    NEEDS_PROOF_TERMS,
    SKILL_CATALOG,
    proof_request_for,
)
from app.models import (
    ExtractedSkill,
    SkillExtractionResponse,
    WorkSampleResponse,
)

logger = logging.getLogger(__name__)

_TOKEN_PATTERN = re.compile(r"[a-z0-9+#.]+")
_STOP_WORDS = frozenset(
    {
        "and",
        "the",
        "for",
        "with",
        "from",
        "that",
        "this",
        "have",
        "has",
        "was",
        "were",
        "are",
        "but",
        "not",
        "you",
        "your",
        "our",
        "into",
        "out",
        "over",
        "about",
        "been",
        "they",
        "them",
        "their",
        "then",
        "than",
        "when",
        "while",
        "where",
        "which",
        "who",
        "will",
        "would",
        "could",
        "should",
        "after",
        "before",
        "also",
        "just",
        "like",
        "some",
        "more",
        "most",
        "other",
        "such",
        "only",
        "very",
        "many",
        "much",
        "each",
        "both",
        "because",
        "during",
        "through",
        "using",
        "used",
        "years",
        "year",
        "months",
        "month",
        "back",
        "worked",
        "work",
        "experience",
        "experienced",
    }
)


def extract_skills(transcript: str, settings: Settings) -> SkillExtractionResponse:
    if settings.use_mock_genai:
        return _mock_extraction(transcript)
    try:
        return _live_extraction(transcript, settings)
    except Exception:
        logger.warning(
            "SAP Generative AI Hub skills extraction failed; serving simulated fixture",
            exc_info=True,
        )
        return _mock_extraction(transcript)


def score_work_sample(
    skill_id: str,
    submission: str,
    settings: Settings,
) -> WorkSampleResponse:
    if settings.use_mock_genai:
        return _mock_work_sample(skill_id, submission)
    try:
        return _live_work_sample(skill_id, submission, settings)
    except Exception:
        logger.warning(
            "SAP Generative AI Hub work-sample scoring failed; serving simulated fixture",
            exc_info=True,
        )
        return _mock_work_sample(skill_id, submission)


def _live_extraction(transcript: str, settings: Settings) -> SkillExtractionResponse:
    payload = _orchestration_payload(
        settings=settings,
        prompt=(
            "Extract durable, evidence-backed skills from the career transcript. "
            "Return JSON with skills (name, confidence between 0 and 1) and "
            "needs_proof as a list of skill names."
        ),
        input_text=transcript,
    )
    response = _post_orchestration(payload, settings)
    return _parse_extraction(response)


def _live_work_sample(
    skill_id: str,
    submission: str,
    settings: Settings,
) -> WorkSampleResponse:
    payload = _orchestration_payload(
        settings=settings,
        prompt=(
            "Score the candidate work sample for the named skill from 0 to 100. "
            "Return JSON with score and credential_issued (true only at or above 70)."
        ),
        input_text=f"skill_id: {skill_id}\nsubmission:\n{submission}",
    )
    response = _post_orchestration(payload, settings)
    return _parse_work_sample(response)


def _orchestration_payload(
    settings: Settings,
    prompt: str,
    input_text: str,
) -> dict[str, Any]:
    return {
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": input_text},
        ],
        "model": settings.genai_hub_model,
    }


def _post_orchestration(payload: dict[str, Any], settings: Settings) -> Any:
    _require_live_configuration(settings)
    auth = httpx.BasicAuth(
        settings.genai_hub_client_id,
        settings.genai_hub_client_secret.get_secret_value(),
    )
    timeout = settings.genai_hub_timeout_seconds
    with httpx.Client(timeout=timeout) as client:
        response = client.post(
            settings.genai_hub_endpoint,
            json=payload,
            auth=auth,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        return response.json()


def proof_requests() -> dict[str, str]:
    """Canonical skill name -> the evidence a worker must supply for it."""
    return dict(NEEDS_PROOF_TERMS)


def _require_live_configuration(settings: Settings) -> None:
    missing = [
        name
        for name, value in (
            ("GENAI_HUB_ENDPOINT", settings.genai_hub_endpoint),
            ("GENAI_HUB_CLIENT_ID", settings.genai_hub_client_id),
            ("GENAI_HUB_CLIENT_SECRET", settings.genai_hub_client_secret.get_secret_value()),
            ("GENAI_HUB_MODEL", settings.genai_hub_model),
        )
        if not value.strip()
    ]
    if missing:
        raise RuntimeError(f"missing GenAI Hub configuration: {', '.join(missing)}")


def _parse_extraction(response: Any) -> SkillExtractionResponse:
    document = _extract_json_document(response)
    if document is None or not isinstance(document, Mapping):
        raise ValueError("GenAI Hub response did not contain a JSON object")
    raw_skills = document.get("skills")
    if not isinstance(raw_skills, list) or not raw_skills:
        raise ValueError("GenAI Hub response is missing a skills list")
    skills = tuple(ExtractedSkill.model_validate(entry) for entry in raw_skills)
    raw_needs_proof = document.get("needs_proof", [])
    if not isinstance(raw_needs_proof, list):
        raise ValueError("GenAI Hub response needs_proof must be a list")
    needs_proof = tuple(
        name.strip() for name in raw_needs_proof if isinstance(name, str) and name.strip()
    )
    return SkillExtractionResponse(
        skills=list(skills),
        needs_proof=list(needs_proof),
        source="live",
    )


def _parse_work_sample(response: Any) -> WorkSampleResponse:
    document = _extract_json_document(response)
    if document is None or not isinstance(document, Mapping):
        raise ValueError("GenAI Hub response did not contain a JSON object")
    raw_score = document.get("score")
    if isinstance(raw_score, bool) or not isinstance(raw_score, (int, float)):
        raise ValueError("GenAI Hub response is missing a numeric score")
    score = max(0, min(100, int(raw_score)))
    return WorkSampleResponse(
        score=score,
        credential_issued=score >= CREDENTIAL_THRESHOLD,
        source="live",
    )


def _extract_json_document(response: Any) -> Any:
    if isinstance(response, str):
        return _coerce_text_document(response)
    if isinstance(response, Mapping):
        preferred = ("message", "content", "output", "results", "data", "value", "choices")
        for key in preferred:
            nested = response.get(key)
            if nested is not None:
                document = _extract_json_document(nested)
                if document is not None:
                    return document
        for nested in response.values():
            document = _extract_json_document(nested)
            if document is not None:
                return document
    if isinstance(response, list):
        for entry in response:
            document = _extract_json_document(entry)
            if document is not None:
                return document
    if _is_skill_document(response):
        return response
    return None


def _is_skill_document(candidate: object) -> bool:
    return isinstance(candidate, Mapping) and (
        "skills" in candidate or "score" in candidate or "needs_proof" in candidate
    )


def _coerce_text_document(text: str) -> Any:
    stripped = text.strip()
    if not stripped:
        return None
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[a-zA-Z]*\n?", "", stripped)
        stripped = re.sub(r"\n?```$", "", stripped)
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        document = json.loads(stripped[start : end + 1])
    except json.JSONDecodeError:
        return None
    return document if _is_skill_document(document) else None


def _mock_extraction(transcript: str) -> SkillExtractionResponse:
    tokens = _tokenize(transcript)
    skills: list[ExtractedSkill] = []
    for catalog_term, skill_name in SKILL_CATALOG:
        matching = sum(1 for token in tokens if catalog_term in token or token in catalog_term)
        if matching == 0:
            continue
        confidence = min(0.95, 0.6 + 0.05 * matching + 0.01 * (len(skill_name) % 5))
        skills.append(
            ExtractedSkill(
                name=skill_name,
                confidence=round(confidence, 2),
            )
        )
    if not skills:
        skills = [
            ExtractedSkill(name=skill_name, confidence=0.62) for _, skill_name in SKILL_CATALOG[:3]
        ]
    skills.sort(key=lambda skill: (-skill.confidence, skill.name))
    skills = skills[:8]
    needs_proof = [skill.name for skill in skills if proof_request_for(skill.name) is not None]
    if not needs_proof and skills:
        needs_proof = [skills[-1].name]
    return SkillExtractionResponse(
        skills=skills,
        needs_proof=needs_proof,
        source="simulated",
    )


def _mock_work_sample(skill_id: str, submission: str) -> WorkSampleResponse:
    token_count = len(_tokenize(submission))
    score = min(100, 45 + token_count * 4 + len(skill_id) % 7)
    return WorkSampleResponse(
        score=score,
        credential_issued=score >= CREDENTIAL_THRESHOLD,
        source="simulated",
    )


def _tokenize(text: str) -> tuple[str, ...]:
    return tuple(
        token
        for token in _TOKEN_PATTERN.findall(text.casefold())
        if len(token) > 2 and token not in _STOP_WORDS
    )
