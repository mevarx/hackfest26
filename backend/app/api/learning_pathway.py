from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.api.dependencies import SettingsDependency
from app.models import RouteRequest, RouteResponse
from app.services.learning_pathway import route

router = APIRouter(tags=["learning_pathway"])


@router.get("/route", response_model=RouteResponse)
def get_route(
    request: Annotated[RouteRequest, Query()],
    settings: SettingsDependency,
) -> RouteResponse:
    try:
        return route(
            settings,
            request.from_skill,
            request.target_role,
            request.hours_per_week,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
