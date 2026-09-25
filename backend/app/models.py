from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

InputType = Literal["voice", "text"]
SessionStatus = Literal["started", "running", "waiting", "completed", "failed"]
AuditVerdict = Literal["PASS", "FLAGGED"]
GhostTwinAttribute = Literal["career_gap", "gender", "age", "college_tier", "city"]
Gender = Literal["female", "male", "non_binary", "other", "not_disclosed"]
CollegeTier = Literal["tier_1", "tier_2", "tier_3"]
DataSource = Literal["live", "simulated", "local"]
SessionSource = Literal["simulated", "local"]


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CareerGap(APIModel):
    months: float | None = Field(default=None, ge=0, le=600)
    years: float | None = Field(default=None, ge=0, le=50)

    @model_validator(mode="after")
    def require_exactly_one_unit(self) -> Self:
        if (self.months is None) == (self.years is None):
            raise ValueError("career_gap must specify exactly one of months or years")
        return self


class GhostTwinCandidateProfile(APIModel):
    career_gap: float | int | str | CareerGap
    gender: Gender
    age: int = Field(ge=18, le=100, strict=True)
    college_tier: CollegeTier
    city: str = Field(min_length=1)
    skill_score: int = Field(default=85, ge=0, le=100, strict=True)


class SkillClaim(APIModel):
    name: str
    confidence: float = Field(ge=0, le=1)
    verified: bool = False


class SkillPassport(APIModel):
    passport_id: str
    owner: str
    skills: list[SkillClaim]
    credentials: list[str]
    source: DataSource


class RouteLeg(APIModel):
    skill: str
    hours: int = Field(ge=0)


class Route(APIModel):
    legs: list[RouteLeg]
    total_hours: int = Field(ge=0)
    paid_bridge: dict[str, JsonValue] | None = None
    source: DataSource


class MatchResult(APIModel):
    role: str
    score: float
    pay_delta_pct: float
    blocked_by_guardrail: bool
    source: DataSource


class GhostTwinVariant(APIModel):
    variant: str
    attribute: GhostTwinAttribute
    original_value: JsonValue = None
    counterfactual_value: JsonValue
    score: int = Field(ge=0, le=100)
    delta: int
    source: Literal["local", "live"] = "local"


class GhostTwinResult(APIModel):
    actual_score: int = Field(ge=0, le=100)
    twins: list[GhostTwinVariant]
    max_delta: int = Field(ge=0)
    result: AuditVerdict
    threshold: int = Field(default=5, ge=0)
    source: Literal["local", "live"] = "local"
    engine: Literal["pure_python"] = "pure_python"
    status: Literal["completed"] = "completed"


class SessionStartRequest(APIModel):
    input_type: InputType
    content: str = Field(min_length=1)
    persona: str = Field(min_length=1)


class SessionStartResponse(APIModel):
    session_id: str
    source: SessionSource
    status: Literal["started"] = "started"


class SessionState(APIModel):
    session_id: str
    input_type: InputType
    content: str
    persona: str
    status: SessionStatus = "started"
    source: SessionSource = "local"
    state: dict[str, JsonValue] = Field(default_factory=dict)
    passport: SkillPassport | None = None
    route: Route | None = None
    matches: list[MatchResult] = Field(default_factory=list)
    audit_result: GhostTwinResult | None = None
    version: int = Field(default=0, ge=0)
    created_at: datetime
    updated_at: datetime


class GhostTwinAuditRequest(APIModel):
    candidate_profile: GhostTwinCandidateProfile
    role_id: str = Field(min_length=1)
    threshold: int | None = Field(default=None, ge=0)
    simulate_legacy_ats: bool = Field(default=False, strict=True)


class IntegrationModeStatus(APIModel):
    mode: Literal["mock", "live"]
    source: DataSource
    integration_status: Literal["not_implemented"] = "not_implemented"


class HealthResponse(APIModel):
    status: Literal["ok"]
    hana: IntegrationModeStatus
    genai: IntegrationModeStatus
