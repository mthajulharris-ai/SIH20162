"""
Satellite Constellation & NASA FIRMS Telemetry Endpoints.
PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.models.detection import Detection
from backend.services.firms_service import (
    FirmsService,
    get_firms_service,
    FirmsServiceException,
    DEFAULT_BBOX,
    DEFAULT_SATELLITE,
    DEFAULT_DAY_RANGE,
    REGIONS,
)
from src.config import PROVENANCE_REAL_FIRMS

router = APIRouter()


class ChatQueryRequest(BaseModel):
    query: Optional[str] = Field(None, description="Natural language question about satellite thermal observations")
    message: Optional[str] = Field(None, description="Alias for query")

    def get_text(self) -> str:
        return (self.query or self.message or "").strip()


# 1. LIVE SATELLITE STATUS (Section 9 & 10)
@router.get(
    "/status",
    summary="Get NASA FIRMS Connection & Constellation Status",
    description="Returns real connection health, API key presence, last sync timestamp, and total REAL_FIRMS records in database.",
)
def get_satellite_status(
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    """
    Returns connection telemetry without exposing sensitive credentials.
    """
    return firms.get_status(db)


# 2. DIAGNOSTIC HEALTH REPORT (Section 3 & 20)
@router.get(
    "/firms/health",
    summary="Get NASA FIRMS Service Diagnostic Health Report",
    description="Returns diagnostic telemetry, API reachability, and sync metrics without exposing credentials.",
)
def get_firms_health(
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    return firms.get_health_report(db)


# 3. AREA API QUERY & INGESTION (Section 2, 3, 4)
@router.get(
    "/firms",
    summary="Query and Ingest NASA FIRMS Satellite Area Telemetry",
    description=(
        "Queries NASA FIRMS Area API, parses CSV, runs new observations through AI model, "
        "and persists classified records to the database with REAL_FIRMS provenance."
    ),
)
def fetch_firms_data(
    region: Optional[str] = Query(
        None,
        description="Geographic region alias ('india', 'global', 'south_asia')",
    ),
    satellite: str = Query(
        DEFAULT_SATELLITE,
        description="NASA FIRMS satellite product code (e.g. VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, VIIRS_SNPP_NRT, MODIS_NRT, or ALL)",
    ),
    west: Optional[float] = Query(
        None,
        ge=-180.0,
        le=180.0,
        description="Bounding box Western longitude coordinate",
    ),
    south: Optional[float] = Query(
        None,
        ge=-90.0,
        le=90.0,
        description="Bounding box Southern latitude coordinate",
    ),
    east: Optional[float] = Query(
        None,
        ge=-180.0,
        le=180.0,
        description="Bounding box Eastern longitude coordinate",
    ),
    north: Optional[float] = Query(
        None,
        ge=-90.0,
        le=90.0,
        description="Bounding box Northern latitude coordinate",
    ),
    days: int = Query(
        DEFAULT_DAY_RANGE,
        ge=1,
        le=10,
        description="Observation day range window (1 to 10 days as enforced by NASA FIRMS)",
    ),
    date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Acquisition date in YYYY-MM-DD format (defaults to latest available)",
    ),
    store: bool = Query(
        True,
        description="Whether to commit observations to the database and trigger AI classification",
    ),
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    """
    Executes live satellite synchronization against NASA FIRMS Area API.
    Supports region='india', region='global', or custom coordinates.
    """
    # Resolve geographic bounds
    if region and region.lower() in REGIONS:
        r_bbox = REGIONS[region.lower()]
        target_west = r_bbox["west"]
        target_south = r_bbox["south"]
        target_east = r_bbox["east"]
        target_north = r_bbox["north"]
    else:
        target_west = west if west is not None else DEFAULT_BBOX["west"]
        target_south = south if south is not None else DEFAULT_BBOX["south"]
        target_east = east if east is not None else DEFAULT_BBOX["east"]
        target_north = north if north is not None else DEFAULT_BBOX["north"]

    try:
        result = firms.fetch_and_ingest(
            db=db,
            satellite=satellite,
            west=target_west,
            south=target_south,
            east=target_east,
            north=target_north,
            day_range=days,
            date_str=date,
            store=store,
        )
        return result
    except FirmsServiceException as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "error": exc.error_code,
                "message": exc.message,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "INTERNAL_SERVER_ERROR",
                "message": f"Unexpected error executing NASA FIRMS synchronization: {str(exc)}",
            },
        )


# 4. RECENT SATELLITE DETECTIONS (Section 9 & 12)
@router.get(
    "/detections/recent",
    summary="Get Most Recent Satellite Detections",
    description="Retrieve the latest NASA FIRMS thermal detections sorted by satellite acquisition time.",
)
def get_recent_satellite_detections(
    limit: int = Query(20, ge=1, le=200, description="Max number of detections to return"),
    provenance_only: bool = Query(True, description="Filter strictly for REAL_FIRMS provenance observations"),
    db: Session = Depends(get_db),
):
    query = db.query(Detection)
    if provenance_only:
        # Prioritize REAL_FIRMS, fallback to all if no real records yet
        has_real = db.query(Detection.id).filter(Detection.data_provenance == PROVENANCE_REAL_FIRMS).first()
        if has_real:
            query = query.filter(Detection.data_provenance == PROVENANCE_REAL_FIRMS)

    detections = query.order_by(
        Detection.acq_date.desc(),
        Detection.acq_time.desc(),
        Detection.id.desc(),
    ).limit(limit).all()

    return [d.to_dict() for d in detections]


# 5. ALL SATELLITE DETECTIONS LIST (Section 9)
@router.get(
    "/detections",
    summary="List Satellite Detections",
    description="Retrieve list of satellite thermal anomaly records from database with optional filters.",
)
def list_satellite_detections(
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    satellite: Optional[str] = Query(None, description="Filter by satellite (e.g. VIIRS_NOAA20_NRT, MODIS_NRT)"),
    alert_level: Optional[str] = Query(None, description="Filter by risk level"),
    real_firms_only: bool = Query(False, description="Filter exclusively for REAL_FIRMS records"),
    db: Session = Depends(get_db),
):
    query = db.query(Detection)
    if real_firms_only:
        query = query.filter(Detection.data_provenance == PROVENANCE_REAL_FIRMS)
    if satellite:
        query = query.filter(Detection.source == satellite)
    if alert_level:
        query = query.filter(Detection.alert_level == alert_level)

    total = query.count()
    items = query.order_by(
        Detection.acq_date.desc(),
        Detection.acq_time.desc(),
        Detection.id.desc(),
    ).offset(skip).limit(limit).all()

    return {
        "total": total,
        "count": len(items),
        "items": [d.to_dict() for d in items],
    }


# 6. SATELLITE DETECTION BY ID (Section 9 & 11)
@router.get(
    "/detections/{detection_id}",
    summary="Get Satellite Detection by ID",
    description="Retrieve full details for a single satellite observation, including raw radiometry and SATRA AI analysis.",
)
def get_satellite_detection_by_id(
    detection_id: int,
    db: Session = Depends(get_db),
):
    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Satellite observation #{detection_id} not found in SATRA database.",
        )
    return detection.to_dict()


# 7. LOCATION PROXIMITY SEARCH (Section 16)
@router.get(
    "/search",
    summary="Search Thermal Hotspots Near Coordinates",
    description="Query actual NASA FIRMS observations within a given radius (km) of specified latitude/longitude.",
)
def search_location(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Target Latitude"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Target Longitude"),
    radius_km: float = Query(100.0, ge=1.0, le=1000.0, description="Search radius in kilometers"),
    limit: int = Query(50, ge=1, le=200, description="Max observations to return"),
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    return firms.search_detections_near(db=db, lat=lat, lon=lon, radius_km=radius_km, limit=limit)


# 8. SATRA AI CHATBOT NATURAL LANGUAGE QUERY (Section 14)
@router.post(
    "/chat",
    summary="SATRA AI Chatbot Query",
    description="Ask natural language questions about current satellite thermal observations grounded in live database data.",
)
def chat_satellite_ai(
    req: ChatQueryRequest,
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    return firms.query_chat(db=db, query=req.get_text())


# 9. MANUAL SYNC TRIGGER
@router.post(
    "/sync",
    summary="Trigger NASA FIRMS Live Synchronization",
    description="Manual operational trigger to ingest fresh NASA FIRMS observations across VIIRS and MODIS.",
)
def trigger_firms_sync(
    region: Optional[str] = Query("india"),
    satellite: str = Query("ALL"),
    days: int = Query(DEFAULT_DAY_RANGE),
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    return fetch_firms_data(
        region=region,
        satellite=satellite,
        west=None,
        south=None,
        east=None,
        north=None,
        days=days,
        date=date,
        store=True,
        db=db,
        firms=firms,
    )
