from fastapi import APIRouter

from app.api.dependencies import SettingsDependency
from app.models import HealthResponse, IntegrationModeStatus

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(settings: SettingsDependency) -> HealthResponse:
    return HealthResponse(
        status="ok",
        hana=_integration_status(settings.use_mock_hana),
        genai=_integration_status(settings.use_mock_genai),
    )


def _integration_status(use_mock: bool) -> IntegrationModeStatus:
    return IntegrationModeStatus(
        mode="mock" if use_mock else "live",
        source="simulated" if use_mock else "local",
    )
