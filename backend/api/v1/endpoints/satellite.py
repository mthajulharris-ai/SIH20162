"""
Satellite Constellation & NASA FIRMS Telemetry Endpoints.
PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.services.firms_service import (
    FirmsService,
    get_firms_service,
    FirmsServiceException,
    DEFAULT_BBOX,
    DEFAULT_SATELLITE,
    DEFAULT_DAY_RANGE,
)

router = APIRouter()


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


@router.get(
    "/firms/health",
    summary="Get NASA FIRMS Service Diagnostic Health Report",
    description="Returns diagnostic telemetry, API reachability, and sync metrics without exposing credentials.",
)
def get_firms_health(
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    """
    Diagnostic health report endpoint (Requirement 20).
    Safely reports configuration, NASA reachability, row statistics, and provenance.
    Never exposes MAP_KEY.
    """
    return firms.get_health_report(db)


@router.get(
    "/firms",
    summary="Query and Ingest NASA FIRMS Satellite Area Telemetry",
    description=(
        "Queries NASA FIRMS Area API, parses CSV, runs new observations through AI model, "
        "and persists classified records to the database with REAL_FIRMS provenance."
    ),
)
def fetch_firms_data(
    satellite: str = Query(
        DEFAULT_SATELLITE,
        description="NASA FIRMS satellite product code (e.g. VIIRS_NOAA20_SP, VIIRS_SNPP_NRT, MODIS_NRT)",
    ),
    west: float = Query(
        DEFAULT_BBOX["west"],
        ge=-180.0,
        le=180.0,
        description="Bounding box Western longitude coordinate",
    ),
    south: float = Query(
        DEFAULT_BBOX["south"],
        ge=-90.0,
        le=90.0,
        description="Bounding box Southern latitude coordinate",
    ),
    east: float = Query(
        DEFAULT_BBOX["east"],
        ge=-180.0,
        le=180.0,
        description="Bounding box Eastern longitude coordinate",
    ),
    north: float = Query(
        DEFAULT_BBOX["north"],
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
    """
    try:
        result = firms.fetch_and_ingest(
            db=db,
            satellite=satellite,
            west=west,
            south=south,
            east=east,
            north=north,
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


@router.post(
    "/sync",
    summary="Trigger NASA FIRMS Live Synchronization",
    description="Manual operational trigger to ingest fresh NASA FIRMS observations.",
)
def trigger_firms_sync(
    satellite: str = Query(DEFAULT_SATELLITE),
    days: int = Query(DEFAULT_DAY_RANGE),
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    firms: FirmsService = Depends(get_firms_service),
):
    """
    Triggers live satellite sync and returns summary.
    """
    return fetch_firms_data(
        satellite=satellite,
        west=DEFAULT_BBOX["west"],
        south=DEFAULT_BBOX["south"],
        east=DEFAULT_BBOX["east"],
        north=DEFAULT_BBOX["north"],
        days=days,
        date=date,
        store=True,
        db=db,
        firms=firms,
    )
