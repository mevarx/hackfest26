from fastapi import APIRouter, HTTPException
from pydantic import JsonValue, TypeAdapter

from app.api.dependencies import SettingsDependency
from app.domain.ghost_twin import run_ghost_twin_audit
from app.models import GhostTwinAuditRequest, GhostTwinResult, GhostTwinVariant

router = APIRouter(prefix="/audit", tags=["audit"])
_json_value_adapter: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)


@router.post("/ghost-twin", response_model=GhostTwinResult)
async def audit_ghost_twin(
    request: GhostTwinAuditRequest,
    settings: SettingsDependency,
) -> GhostTwinResult:
    if request.threshold is not None and request.threshold != settings.ghost_twin_threshold:
        raise HTTPException(
            status_code=422,
            detail="threshold must match the configured server guardrail",
        )
    try:
        outcome = run_ghost_twin_audit(
            candidate_profile=request.candidate_profile.model_dump(
                mode="json",
                exclude={"skill_score"},
                exclude_none=True,
            ),
            role_id=request.role_id,
            threshold=settings.ghost_twin_threshold,
            skill_score=request.candidate_profile.skill_score,
            simulate_legacy_ats=request.simulate_legacy_ats,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error
    twins = [
        GhostTwinVariant(
            variant=f"{twin.attribute}_counterfactual",
            attribute=twin.attribute,
            original_value=_json_value_adapter.validate_python(twin.original_value),
            counterfactual_value=_json_value_adapter.validate_python(twin.counterfactual_value),
            score=twin.score,
            delta=twin.delta,
        )
        for twin in outcome.twins
    ]
    return GhostTwinResult(
        actual_score=outcome.actual_score,
        twins=twins,
        max_delta=outcome.max_delta,
        result=outcome.result,
        threshold=outcome.threshold,
    )
