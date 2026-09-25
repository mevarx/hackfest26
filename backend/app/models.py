from datetime import UTC, datetime
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


class ExtractedSkill(APIModel):
    name: str = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)


class SkillExtractionRequest(APIModel):
    transcript: str = Field(min_length=1)
    session_id: str | None = None


class SkillExtractionResponse(APIModel):
    skills: list[ExtractedSkill]
    needs_proof: list[str]
    source: Literal["live", "simulated"]


class WorkSampleRequest(APIModel):
    skill_id: str = Field(min_length=1)
    submission: str = Field(min_length=1)
    session_id: str | None = None


class WorkSampleResponse(APIModel):
    score: int = Field(ge=0, le=100)
    credential_issued: bool
    source: Literal["live", "simulated"]


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


class RouteRequest(APIModel):
    from_skill: str = Field(min_length=1)
    target_role: str = Field(min_length=1)
    hours_per_week: int = Field(default=10, ge=1, le=40)


class RouteResponse(Route):
    from_skill: str
    target_role: str
    hours_per_week: int
    weeks: float = Field(gt=0)


class MatchConstraints(APIModel):
    commute_km: int = Field(default=25, ge=0, le=500)
    hours: int = Field(default=40, ge=1, le=80)
    language: str = Field(default="English", min_length=1)
    accept_pay_cut: bool = False


class MatchRequest(APIModel):
    passport_id: str = Field(min_length=1)
    session_id: str | None = None
    constraints: MatchConstraints = Field(default_factory=MatchConstraints)
    target_role: str | None = None


class RoleProfile(APIModel):
    role_id: str
    title: str
    city: str
    language: str
    commute_km: int = Field(ge=0)
    weekly_hours: int = Field(ge=1, le=80)
    annual_pay: int = Field(gt=0)
    required_skills: list[str] = Field(default_factory=list)


class RankedMatch(APIModel):
    role: str
    role_id: str
    title: str
    score: float = Field(ge=0, le=1)
    similarity: float = Field(ge=0, le=1)
    pay_delta_pct: float
    annual_pay: int = Field(gt=0)
    commute_km: int = Field(ge=0)
    blocked_by_guardrail: bool
    guardrail_reason: str | None = None
    source: DataSource


class MatchResponse(APIModel):
    passport_id: str
    matches: list[RankedMatch]
    source: DataSource
    guardrail_threshold_pct: float = 15.0


class WageScarThreshold(APIModel):
    max_pay_cut_pct: float = Field(default=15.0, ge=0, le=100)


AgentName = Literal[
    "ORCHESTRATOR",
    "SKILLS DISCOVERY",
    "MARKET INTELLIGENCE",
    "LEARNING PATHWAY",
    "INCLUSIVE MATCHING",
    "EMPLOYER READINESS",
    "BIAS AUDIT",
]
AgentStatus = Literal["running", "done", "waiting_consent"]


class AgentEvent(APIModel):
    session_id: str = Field(min_length=1)
    sequence: int = Field(ge=1)
    agent: AgentName
    status: AgentStatus
    message: str = Field(min_length=1)
    data: dict[str, JsonValue] = Field(default_factory=dict)
    source: Literal["live", "simulated", "local"]
    event_id: str = Field(min_length=1)
    timestamp: str = Field(min_length=1)


class DisplacementRadarResponse(APIModel):
    role: str
    city: str
    exposure: str = Field(min_length=1)
    demand: str = Field(min_length=1)
    source: Literal["simulated"] = "simulated"
    disclaimer: str


class EmployerFilterRewriteRequest(APIModel):
    job_post_id: str = Field(min_length=1)


class EmployerFilterRewriteResponse(APIModel):
    job_post_id: str
    role: str
    city: str
    filter_text_before: str
    filter_text_after: str
    restrictive_phrase: str
    removed_criteria: list[str]
    hidden_talent_count: int = Field(ge=0)
    rewrite_reason: str
    source: Literal["simulated"] = "simulated"
    disclaimer: str


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
    skills_source: Literal["live", "simulated"] | None = None
    events: list[AgentEvent] = Field(default_factory=list)

    def merged(self, **updates: object) -> "SessionState":
        return self.model_copy(update={"updated_at": datetime.now(UTC), **updates})


class GhostTwinAuditRequest(APIModel):
    candidate_profile: GhostTwinCandidateProfile
    role_id: str = Field(min_length=1)
    threshold: int | None = Field(default=None, ge=0)
    simulate_legacy_ats: bool = Field(default=False, strict=True)


IntegrationStatus = Literal["not_implemented", "configured"]


class IntegrationModeStatus(APIModel):
    mode: Literal["mock", "live"]
    source: DataSource
    integration_status: IntegrationStatus = "not_implemented"


class HealthResponse(APIModel):
    status: Literal["ok"]
    hana: IntegrationModeStatus
    genai: IntegrationModeStatus
