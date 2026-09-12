"""
Thermal Detection and Classification Endpoints.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.db.session import get_db
from backend.models.detection import Detection
from backend.schemas.detection import (
    DetectionCreate,
    DetectionResponse,
    DetectionListResponse,
)

from backend.services.alert_service import create_alert_if_eligible

router = APIRouter()


@router.post(
    "",
    response_model=DetectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest new thermal detection",
    description="Record a new classified satellite thermal observation in the database.",
)
def create_detection(
    detection_in: DetectionCreate,
    db: Session = Depends(get_db),
) -> DetectionResponse:
    """
    Ingests a thermal anomaly record with ML classification outputs
    and triggers alert evaluation for important events.
    """
    db_obj = Detection(**detection_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)

    # Evaluate if this event triggers an operational alert
    create_alert_if_eligible(db, db_obj)

    return db_obj


@router.get(
    "",
    response_model=DetectionListResponse,
    summary="List and filter thermal detections",
    description=(
        "Retrieve paginated thermal detections with optional filters for source, "
        "confidence, date range, classification, and geographic bounding box."
    ),
)
def get_detections(
    db: Session = Depends(get_db),
    source: Optional[str] = Query(
        None,
        description="Filter by satellite data source (e.g. 'VIIRS_SNPP_NRT', 'MODIS_NRT')",
    ),
    predicted_class: Optional[str] = Query(
        None,
        description="Filter by AI class (e.g. 'industrial_fire', 'persistent_thermal_source', 'wildfire')",
    ),
    min_confidence: Optional[float] = Query(
        None,
        ge=0.0,
        le=1.0,
        description="Filter by minimum AI prediction confidence score (0.0 to 1.0)",
    ),
    sensor_confidence: Optional[str] = Query(
        None,
        description="Filter by raw satellite sensor confidence (e.g. 'nominal', 'high')",
    ),
    start_date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Start acquisition date inclusive (YYYY-MM-DD)",
    ),
    end_date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="End acquisition date inclusive (YYYY-MM-DD)",
    ),
    min_lat: Optional[float] = Query(
        None,
        ge=-90.0,
        le=90.0,
        description="South bounding box latitude",
    ),
    max_lat: Optional[float] = Query(
        None,
        ge=-90.0,
        le=90.0,
        description="North bounding box latitude",
    ),
    min_lon: Optional[float] = Query(
        None,
        ge=-180.0,
        le=180.0,
        description="West bounding box longitude",
    ),
    max_lon: Optional[float] = Query(
        None,
        ge=-180.0,
        le=180.0,
        description="East bounding box longitude",
    ),
    is_persistent: Optional[bool] = Query(
        None,
        description="Filter by persistent thermal anomaly flag",
    ),
    data_provenance: Optional[str] = Query(
        None,
        description="Filter by data provenance ('REAL_FIRMS', 'USER_UPLOADED', 'PROTOTYPE_LABELLED')",
    ),
    alert_level: Optional[str] = Query(
        None,
        description="Filter by alert level ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOW_CONFIDENCE_REVIEW')",
    ),
    model_version: Optional[str] = Query(
        None,
        description="Filter by model version",
    ),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=1000, description="Max number of records to return"),
) -> DetectionListResponse:
    """
    Query thermal detections with multi-dimensional filtering.
    """
    query = db.query(Detection)

    # 1. Source filter
    if source:
        query = query.filter(Detection.source == source)

    # 2. Predicted class filter
    if predicted_class:
        query = query.filter(Detection.predicted_class == predicted_class)

    # 3. Confidence filters
    if min_confidence is not None:
        query = query.filter(Detection.prediction_confidence >= min_confidence)
    if sensor_confidence:
        query = query.filter(Detection.confidence == sensor_confidence)

    # 4. Date range filters
    if start_date:
        query = query.filter(Detection.acq_date >= start_date)
    if end_date:
        query = query.filter(Detection.acq_date <= end_date)

    # 5. Geographic bounding box filters
    if min_lat is not None:
        query = query.filter(Detection.latitude >= min_lat)
    if max_lat is not None:
        query = query.filter(Detection.latitude <= max_lat)
    if min_lon is not None:
        query = query.filter(Detection.longitude >= min_lon)
    if max_lon is not None:
        query = query.filter(Detection.longitude <= max_lon)

    # 6. Persistence filter
    if is_persistent is not None:
        query = query.filter(Detection.is_persistent == is_persistent)

    # 7. Provenance filter
    if data_provenance:
        query = query.filter(Detection.data_provenance == data_provenance)

    # 8. Alert level filter
    if alert_level:
        query = query.filter(Detection.alert_level == alert_level)

    # 9. Model version filter
    if model_version:
        query = query.filter(Detection.model_version == model_version)

    # Total count for pagination
    total = query.count()

    # Apply ordering and pagination
    items = query.order_by(Detection.acq_date.desc(), Detection.acq_time.desc(), Detection.id.desc()).offset(skip).limit(limit).all()

    page = math.floor(skip / limit) + 1 if limit > 0 else 1

    return DetectionListResponse(
        total=total,
        page=page,
        limit=limit,
        items=items,
    )


@router.get(
    "/{detection_id}",
    response_model=DetectionResponse,
    summary="Get detection by ID",
    description="Retrieve a single thermal detection record by its unique database ID.",
)
def get_detection_by_id(
    detection_id: int,
    db: Session = Depends(get_db),
) -> DetectionResponse:
    """
    Fetch a detection by primary key ID.
    Raises HTTP 404 if record is not found.
    """
    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Thermal detection record with ID {detection_id} not found.",
        )
    return detection
