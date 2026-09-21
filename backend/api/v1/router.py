"""
Central API v1 Router aggregation.
"""
from fastapi import APIRouter
from backend.api.v1.endpoints import health, detections, inference, alerts, analytics, satellite, chat, gis

api_router = APIRouter()

# Include health endpoints
api_router.include_router(health.router, tags=["Health"])

# Include detections endpoints
api_router.include_router(detections.router, prefix="/detections", tags=["Detections"])

# Include ML inference pipeline endpoints
api_router.include_router(inference.router, prefix="/inference", tags=["Inference & AI"])

# Include alerts endpoints
api_router.include_router(alerts.router, prefix="/alerts", tags=["Alerts & Status"])

# Include analytics endpoints
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics & KPIs"])

# Include satellite constellation & NASA FIRMS telemetry endpoints
api_router.include_router(satellite.router, prefix="/satellite", tags=["Satellite Telemetry"])

# Include AI Assistant chat endpoint
api_router.include_router(chat.router, prefix="/chat", tags=["AI Assistant"])

# Include GIS and Geospatial Intelligence endpoints
api_router.include_router(gis.router, prefix="/gis", tags=["GIS & Geospatial Intelligence"])

