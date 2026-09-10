"""
Analytics and Summary Aggregation Endpoints.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from backend.db.session import get_db
from backend.models.detection import Detection
from backend.models.alert import Alert
from backend.services.alert_service import (
    STATUS_REQUIRES_VERIFICATION,
    STATUS_VERIFIED,
    STATUS_UNDER_REVIEW,
    STATUS_DISMISSED,
)

router = APIRouter()


@router.get(
    "/summary",
    summary="Get Dashboard Analytics Summary",
    description="Provides real-time aggregate KPI metrics and geographic breakdown calculated from SQLite database.",
)
def get_analytics_summary(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Computes summary metrics directly from SQLite database:
    - total detections
    - industrial fire predictions
    - persistent thermal source predictions
    - other predictions
    - high-confidence detections
    - detections over time
    - geographic distribution
    - confirmed incidents vs unverified predictions
    """
    total_detections = db.query(Detection).count()

    # Class breakdown
    class_counts_query = (
        db.query(Detection.predicted_class, func.count(Detection.id))
        .group_by(Detection.predicted_class)
        .all()
    )
    class_distribution = {p_class: count for p_class, count in class_counts_query}

    # 1. Industrial Fire Predictions
    industrial_fire_predictions = sum(
        count for p_class, count in class_distribution.items()
        if "industrial" in p_class.lower()
    )

    # 2. Persistent Thermal Source Predictions
    persistent_source_predictions = sum(
        count for p_class, count in class_distribution.items()
        if "persistent" in p_class.lower()
    )

    # 3. Other Predictions
    other_predictions = total_detections - (industrial_fire_predictions + persistent_source_predictions)
    if other_predictions < 0:
        other_predictions = 0

    # 4. High-Confidence Detections (confidence >= 0.80)
    high_confidence_detections = (
        db.query(Detection)
        .filter(Detection.prediction_confidence >= 0.80)
        .count()
    )

    # 5. Operational Verification Lifecycle (distinguishes AI predictions from confirmed incidents)
    total_alerts = db.query(Alert).count()
    unverified_predictions_count = (
        db.query(Alert)
        .filter(Alert.verification_status == STATUS_REQUIRES_VERIFICATION)
        .count()
    )
    under_review_count = (
        db.query(Alert)
        .filter(Alert.verification_status == STATUS_UNDER_REVIEW)
        .count()
    )
    confirmed_incidents_count = (
        db.query(Alert)
        .filter(Alert.verification_status == STATUS_VERIFIED)
        .count()
    )
    dismissed_alerts_count = (
        db.query(Alert)
        .filter(Alert.verification_status == STATUS_DISMISSED)
        .count()
    )
    critical_alerts_count = (
        db.query(Alert)
        .filter(Alert.alert_level == "CRITICAL")
        .count()
    )

    # 6. Radiative power metrics
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

    # 7. Satellite Source Distribution
    source_counts = (
        db.query(Detection.source, func.count(Detection.id))
        .group_by(Detection.source)
        .all()
    )
    source_distribution = {source: count for source, count in source_counts}

    # 7b. Alert Severity Breakdown
    severity_counts = (
        db.query(Alert.alert_level, func.count(Alert.id))
        .group_by(Alert.alert_level)
        .all()
    )
    severity_distribution = {level: count for level, count in severity_counts}

    # 7c. Provenance Breakdown
    provenance_counts = (
        db.query(Detection.data_provenance, func.count(Detection.id))
        .group_by(Detection.data_provenance)
        .all()
    )
    provenance_distribution = {prov or "UNKNOWN": count for prov, count in provenance_counts}

    # 8. Detections Over Time (Grouped by acquisition date)
    date_trend_query = (
        db.query(
            Detection.acq_date,
            func.count(Detection.id).label("total"),
            func.sum(
                case((Detection.predicted_class.ilike("%industrial%"), 1), else_=0)
            ).label("industrial"),
            func.sum(
                case((Detection.predicted_class.ilike("%persistent%"), 1), else_=0)
            ).label("persistent"),
        )
        .group_by(Detection.acq_date)
        .order_by(Detection.acq_date.desc())
        .limit(10)
        .all()
    )
    detections_over_time = [
        {
            "date": row[0],
            "total": int(row[1] or 0),
            "industrial": int(row[2] or 0),
            "persistent": int(row[3] or 0),
        }
        for row in reversed(date_trend_query)
    ]

    # 9. Geographic Distribution (Regional grouping across geographic quadrants)
    # North: lat >= 24.0
    # West: lat between 18.0 and 24.0, lon < 77.0
    # East: lat between 18.0 and 27.0, lon >= 77.0
    # South: lat < 18.0
    geo_query = (
        db.query(
            case(
                (Detection.latitude >= 24.0, "Northern Region"),
                ((Detection.latitude >= 18.0) & (Detection.longitude < 77.0), "Western Coastal Region"),
                ((Detection.latitude >= 18.0) & (Detection.longitude >= 77.0), "Eastern Industrial Belt"),
                else_="Southern Region"
            ).label("region"),
            func.count(Detection.id).label("count"),
            func.avg(Detection.frp).label("avg_frp")
        )
        .group_by("region")
        .all()
    )
    geographic_distribution = [
        {
            "region": row[0],
            "count": int(row[1]),
            "avg_frp": round(float(row[2] or 0.0), 1),
        }
        for row in geo_query
    ]

    return {
        "total_detections": total_detections,
        "industrial_fire_predictions": industrial_fire_predictions,
        "persistent_source_predictions": persistent_source_predictions,
        "other_predictions": other_predictions,
        "high_confidence_detections": high_confidence_detections,
        
        # Operational verification metrics (AI predictions vs confirmed incidents)
        "verification_breakdown": {
            "unverified_predictions": unverified_predictions_count,
            "under_review": under_review_count,
            "confirmed_incidents": confirmed_incidents_count,
            "dismissed_alerts": dismissed_alerts_count,
            "total_alerts": total_alerts,
            "critical_alerts": critical_alerts_count,
        },
        
        # Physical metrics
        "avg_frp_mw": avg_frp,
        "max_frp_mw": max_frp,
        
        # Categorical distributions
        "class_distribution": class_distribution,
        "source_distribution": source_distribution,
        "severity_distribution": severity_distribution,
        "provenance_distribution": provenance_distribution,
        
        # Trends & Geography
        "detections_over_time": detections_over_time,
        "geographic_distribution": geographic_distribution,
        
        # Telemetry info
        "data_source": "live_sqlite_database" if total_detections > 0 else "empty_database",
        "evaluation_notice": "Statistics reflect automated satellite detections and AI classifications. Incident verification requires physical or multi-source confirmation.",
    }
