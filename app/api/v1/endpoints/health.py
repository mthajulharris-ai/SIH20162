"""
Health check and system status endpoint.
"""
from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel
from app.core.config import settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    timestamp: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Check the operational health and status of the FastAPI backend.",
)
def get_health() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        app=settings.PROJECT_NAME,
        version=settings.VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
