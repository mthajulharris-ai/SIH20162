"""
Alert and Verification Status REST Endpoints.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.alert import Alert
from app.schemas.alert import (
    AlertResponse,
    AlertStatusUpdate,
    AlertListResponse,
)
from app.services.alert_service import STATUS_REQUIRES_VERIFICATION

router = APIRouter()


@router.get(
    "",
    response_model=AlertListResponse,
    summary="List and filter alerts",
    description=(
        "Retrieve alerts for important AI-detected thermal events. "
        "Supports filtering by severity level, verification status, and date range."
    ),
)
def get_alerts(
    db: Session = Depends(get_db),
    alert_level: Optional[str] = Query(
        None,
        description="Filter by severity ('CRITICAL', 'HIGH', 'MEDIUM', 'ADVISORY')",
    ),
    verification_status: Optional[str] = Query(
        None,
        description="Filter by verification state ('REQUIRES_VERIFICATION', 'UNDER_REVIEW', 'VERIFIED', 'DISMISSED')",
    ),
    predicted_class: Optional[str] = Query(
        None,
        description="Filter by predicted class",
    ),
    start_date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Start acquisition date (YYYY-MM-DD)",
    ),
    end_date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="End acquisition date (YYYY-MM-DD)",
    ),
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(50, ge=1, le=500, description="Max items to return"),
) -> AlertListResponse:
    """
    Retrieve filtered alerts along with operational verification metrics.
    """
    query = db.query(Alert)

    if alert_level:
        query = query.filter(Alert.alert_level == alert_level.upper())
    if verification_status:
        query = query.filter(Alert.verification_status == verification_status.upper())
    if predicted_class:
        query = query.filter(Alert.predicted_class == predicted_class)
    if start_date:
        query = query.filter(Alert.acq_date >= start_date)
    if end_date:
        query = query.filter(Alert.acq_date <= end_date)

    total = query.count()
    items = query.order_by(Alert.id.desc()).offset(skip).limit(limit).all()

    # Aggregate counts
    unverified_count = db.query(Alert).filter(Alert.verification_status == STATUS_REQUIRES_VERIFICATION).count()
    critical_count = db.query(Alert).filter(Alert.alert_level == "CRITICAL").count()

    return AlertListResponse(
        total=total,
        unverified_count=unverified_count,
        critical_count=critical_count,
        items=items,
    )


@router.get(
    "/recent",
    response_model=List[AlertResponse],
    summary="Get recent critical and high alerts",
    description="Retrieve the most recent active alerts requiring verification for the dashboard alert ticker.",
)
def get_recent_alerts(
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=50, description="Number of recent alerts to fetch"),
) -> List[AlertResponse]:
    """
    Fetches the newest alerts with priority on unverified and critical/high alerts.
    """
    alerts = (
        db.query(Alert)
        .order_by(Alert.id.desc())
        .limit(limit)
        .all()
    )
    return alerts


@router.get(
    "/{alert_id}",
    response_model=AlertResponse,
    summary="Get alert by ID",
    description="Retrieve details of an alert record including sensory snapshot and verification status.",
)
def get_alert_by_id(
    alert_id: int,
    db: Session = Depends(get_db),
) -> AlertResponse:
    """
    Fetch an alert by its primary key ID.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert record with ID {alert_id} not found.",
        )
    return alert


@router.patch(
    "/{alert_id}/status",
    response_model=AlertResponse,
    summary="Update alert verification status",
    description="Update verification lifecycle status (e.g., mark 'UNDER_REVIEW', 'VERIFIED', or 'DISMISSED').",
)
def update_alert_status(
    alert_id: int,
    status_update: AlertStatusUpdate,
    db: Session = Depends(get_db),
) -> AlertResponse:
    """
    Update verification status and operational review notes.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert record with ID {alert_id} not found.",
        )

    alert.verification_status = status_update.verification_status
    if status_update.verification_notes is not None:
        alert.verification_notes = status_update.verification_notes

    db.commit()
    db.refresh(alert)
    return alert
