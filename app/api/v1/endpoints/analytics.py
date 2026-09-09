"""
Analytics and Summary Aggregation Endpoints.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.detection import Detection
from app.models.alert import Alert
from app.services.alert_service import STATUS_REQUIRES_VERIFICATION

router = APIRouter()


@router.get(
    "/summary",
    summary="Get Dashboard Analytics Summary",
    description="Provides real-time aggregate KPI metrics for dashboard cards and visual charts.",
)
def get_analytics_summary(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Computes summary metrics directly from SQLite database.
    """
    total_detections = db.query(Detection).count()
    
    # Class counts
    class_counts_query = (
        db.query(Detection.predicted_class, func.count(Detection.id))
        .group_by(Detection.predicted_class)
        .all()
    )
    class_distribution = {p_class: count for p_class, count in class_counts_query}

    # Alert counts
    total_alerts = db.query(Alert).count()
    unverified_alerts = (
        db.query(Alert)
        .filter(Alert.verification_status == STATUS_REQUIRES_VERIFICATION)
        .count()
    )
    critical_alerts = (
        db.query(Alert)
        .filter(Alert.alert_level == "CRITICAL")
        .count()
    )

    # Specific classifications
    industrial_fires = sum(
        count for p_class, count in class_distribution.items()
        if "industrial" in p_class.lower()
    )
    persistent_sources = sum(
        count for p_class, count in class_distribution.items()
        if "persistent" in p_class.lower()
    )

    # FRP stats
    frp_stats = (
        db.query(
            func.avg(Detection.frp),
            func.max(Detection.frp),
        )
        .filter(Detection.frp.isnot(None))
        .first()
    )
    avg_frp = round(float(frp_stats[0]), 2) if frp_stats and frp_stats[0] is not None else 0.0
    max_frp = round(float(frp_stats[1]), 2) if frp_stats and frp_stats[1] is not None else 0.0

    # Source breakdown
    source_counts = (
        db.query(Detection.source, func.count(Detection.id))
        .group_by(Detection.source)
        .all()
    )
    source_distribution = {source: count for source, count in source_counts}

    # Recent date trend (last 7 recorded dates)
    date_trend_query = (
        db.query(Detection.acq_date, func.count(Detection.id))
        .group_by(Detection.acq_date)
        .order_by(Detection.acq_date.desc())
        .limit(7)
        .all()
    )
    date_trend = [{"date": d, "count": c} for d, c in reversed(date_trend_query)]

    return {
        "total_detections": total_detections,
        "industrial_fires": industrial_fires,
        "persistent_sources": persistent_sources,
        "total_alerts": total_alerts,
        "unverified_alerts": unverified_alerts,
        "critical_alerts": critical_alerts,
        "avg_frp_mw": avg_frp,
        "max_frp_mw": max_frp,
        "class_distribution": class_distribution,
        "source_distribution": source_distribution,
        "date_trend": date_trend,
        "data_source": "live_sqlite_database" if total_detections > 0 else "empty_database",
    }
