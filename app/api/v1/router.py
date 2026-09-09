"""
Central API v1 Router aggregation.
"""
from fastapi import APIRouter
from app.api.v1.endpoints import health, detections, inference

api_router = APIRouter()

# Include health endpoints
api_router.include_router(health.router, tags=["Health"])

# Include detections endpoints
api_router.include_router(detections.router, prefix="/detections", tags=["Detections"])

# Include ML inference pipeline endpoints
api_router.include_router(inference.router, prefix="/inference", tags=["Inference & AI"])
