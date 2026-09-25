from fastapi import APIRouter

from app.api.dependencies import SettingsDependency
from app.config import Settings, hana_is_configured
from app.models import HealthResponse, IntegrationModeStatus, IntegrationStatus

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(settings: SettingsDependency) -> HealthResponse:
    return HealthResponse(
        status="ok",
        hana=_integration_status(settings.use_mock_hana, _hana_integration_status(settings)),
        genai=_integration_status(settings.use_mock_genai, _genai_integration_status(settings)),
    )


def _hana_integration_status(settings: Settings) -> IntegrationStatus:
    if settings.use_mock_hana:
        return "not_implemented"
    return "configured" if hana_is_configured(settings) else "not_implemented"


def _genai_integration_status(settings: Settings) -> IntegrationStatus:
    if settings.use_mock_genai:
        return "not_implemented"
    configured = all(
        value.strip()
        for value in (
            settings.genai_hub_endpoint,
            settings.genai_hub_client_id,
            settings.genai_hub_client_secret.get_secret_value(),
            settings.genai_hub_model,
        )
    )
    return "configured" if configured else "not_implemented"


def _integration_status(
    use_mock: bool,
    integration_status: IntegrationStatus,
) -> IntegrationModeStatus:
    if use_mock:
        return IntegrationModeStatus(mode="mock", source="simulated")
    return IntegrationModeStatus(mode="live", source="live", integration_status=integration_status)
