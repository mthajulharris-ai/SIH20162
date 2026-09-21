"""
Geographic Information System (GIS) Endpoints.
PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.
Queries real OpenStreetMap physical features (industrial, transport, vegetation, settlements)
around satellite thermal detection coordinates.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field

from backend.services.gis_service import gis_service

logger = logging.getLogger(__name__)

router = APIRouter()


class DetectionCoords(BaseModel):
    latitude: float = Field(..., description="Detection latitude WGS84")
    longitude: float = Field(..., description="Detection longitude WGS84")


class GisFeatureItem(BaseModel):
    id: str = Field(..., description="Unique OSM feature identifier")
    type: str = Field(..., description="Normalized category key: industrial, roads, forest, etc.")
    subcategory: str = Field(..., description="Granular subcategory")
    category_label: str = Field(..., description="Human-readable category name")
    name: str = Field(..., description="Authentic mapped name or honest descriptor")
    latitude: float = Field(..., description="Feature center latitude")
    longitude: float = Field(..., description="Feature center longitude")
    distance_m: int = Field(..., description="Geodesic distance from detection in meters")
    direction: str = Field(..., description="8-point compass bearing: N, NE, E, SE, S, SW, W, NW")
    tags: Dict[str, Any] = Field(default_factory=dict, description="Raw OSM tags")


class GisSummaryCounts(BaseModel):
    industrial: int = Field(0, description="Total nearby industrial features")
    factories: int = Field(0, description="Total nearby factories/plants")
    roads: int = Field(0, description="Total nearby roads and transport ways")
    buildings: int = Field(0, description="Total nearby building structures")
    forest: int = Field(0, description="Total nearby forest and woodland areas")
    settlements: int = Field(0, description="Total nearby settlements / populated places")
    water: int = Field(0, description="Total nearby water bodies")
    other: int = Field(0, description="Other mapped infrastructure POIs")


class NearbyGisResponse(BaseModel):
    detection: DetectionCoords
    radius_m: int = Field(..., description="Query radius in meters")
    status: str = Field(..., description="'success' or 'unavailable'")
    message: Optional[str] = Field(None, description="Informational message or error notice")
    features: List[GisFeatureItem] = Field(default_factory=list, description="List of nearby real OSM features")
    summary: GisSummaryCounts = Field(default_factory=GisSummaryCounts, description="Counts by category")


@router.get(
    "/nearby",
    response_model=NearbyGisResponse,
    status_code=status.HTTP_200_OK,
    summary="Query real nearby GIS features from OpenStreetMap",
    description=(
        "Retrieves real physical GIS infrastructure around exact thermal detection coordinates "
        "using OpenStreetMap Overpass API with caching and distance calculations. "
        "Strictly real mapped data; zero mock or simulated features."
    ),
)
def get_nearby_features(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
    radius: int = Query(default=1000, ge=100, le=10000, description="Investigation radius in meters (default: 1000)"),
) -> Dict[str, Any]:
    """
    Returns normalized nearby GIS context including category counts, individual mapped features,
    exact distances from the thermal detection, and compass directions.
    """
    return gis_service.query_nearby(lat=lat, lon=lon, radius_m=radius)
