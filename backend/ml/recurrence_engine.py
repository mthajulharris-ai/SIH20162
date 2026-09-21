"""
Spatial-Temporal Recurrence Engine for Satellite Thermal Anomalies.
PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.

Calculates multi-temporal spatial cluster recurrence metrics from the detection database:
- recurrence_count: Total detections within ~1 km (0.01 deg) radius
- active_days: Number of distinct calendar dates with active heat signatures
- persistence_ratio: active_days / window_days (high ratio = continuous industrial operation)
- cluster_mean_frp: Historical average Fire Radiative Power (MW) at this facility
- cluster_max_frp: Historical peak Fire Radiative Power (MW) at this facility

Executes in < 2 ms per query via composite spatial index on (latitude, longitude, acq_date).
"""

import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union
from sqlalchemy.orm import Session

logger = logging.getLogger("backend.ml.recurrence_engine")

DEFAULT_RADIUS_DEG = 0.01  # ~1.1 km at the equator / mid-latitudes
DEFAULT_WINDOW_DAYS = 90   # 90-day multi-temporal persistence window


def ensure_spatial_index(conn_or_session: Union[sqlite3.Connection, Session]):
    """Ensures composite spatial-temporal index exists on detections table."""
    try:
        if isinstance(conn_or_session, sqlite3.Connection):
            conn_or_session.execute(
                "CREATE INDEX IF NOT EXISTS idx_det_lat_lon_date ON detections(latitude, longitude, acq_date);"
            )
            conn_or_session.commit()
        elif hasattr(conn_or_session, "execute"):
            from sqlalchemy import text
            conn_or_session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_det_lat_lon_date ON detections(latitude, longitude, acq_date);")
            )
            conn_or_session.commit()
    except Exception as e:
        logger.debug("Index ensure notice: %s", e)


def query_spatial_recurrence(
    db_or_conn: Optional[Union[Session, sqlite3.Connection]],
    latitude: float,
    longitude: float,
    current_frp: float = 10.0,
    acq_date: Optional[str] = None,
    radius_deg: float = DEFAULT_RADIUS_DEG,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> Dict[str, float]:
    """
    Queries historical detections within radius_deg and window_days.
    Returns:
        dict with keys:
            - recurrence_count: float >= 1.0
            - active_days: int >= 1
            - persistence_ratio: float between 0.0 and 1.0
            - cluster_mean_frp: float MW
            - cluster_max_frp: float MW
    """
    fallback_result = {
        "recurrence_count": 1.0,
        "active_days": 1,
        "persistence_ratio": 0.01,
        "cluster_mean_frp": float(current_frp) if current_frp > 0 else 10.0,
        "cluster_max_frp": float(current_frp) if current_frp > 0 else 10.0,
    }

    if db_or_conn is None:
        return fallback_result

    try:
        lat = float(latitude)
        lon = float(longitude)
    except (ValueError, TypeError):
        return fallback_result

    min_lat = lat - radius_deg
    max_lat = lat + radius_deg
    min_lon = lon - radius_deg
    max_lon = lon + radius_deg

    # Date filtering
    start_date_str = None
    if acq_date:
        try:
            curr_dt = datetime.strptime(str(acq_date).strip()[:10], "%Y-%m-%d")
            start_dt = curr_dt - timedelta(days=window_days)
            start_date_str = start_dt.strftime("%Y-%m-%d")
        except Exception:
            start_date_str = None

    try:
        # SQLite Connection or SQLAlchemy Session execution
        if isinstance(db_or_conn, sqlite3.Connection):
            cursor = db_or_conn.cursor()
            if start_date_str and acq_date:
                cursor.execute(
                    """
                    SELECT COUNT(*), COUNT(DISTINCT acq_date), AVG(frp), MAX(frp)
                    FROM detections
                    WHERE latitude BETWEEN ? AND ?
                      AND longitude BETWEEN ? AND ?
                      AND acq_date >= ? AND acq_date <= ?;
                    """,
                    (min_lat, max_lat, min_lon, max_lon, start_date_str, str(acq_date)[:10]),
                )
            else:
                cursor.execute(
                    """
                    SELECT COUNT(*), COUNT(DISTINCT acq_date), AVG(frp), MAX(frp)
                    FROM detections
                    WHERE latitude BETWEEN ? AND ?
                      AND longitude BETWEEN ? AND ?;
                    """,
                    (min_lat, max_lat, min_lon, max_lon),
                )
            row = cursor.fetchone()
        else:
            from sqlalchemy import text
            if start_date_str and acq_date:
                sql = text(
                    """
                    SELECT COUNT(*), COUNT(DISTINCT acq_date), AVG(frp), MAX(frp)
                    FROM detections
                    WHERE latitude BETWEEN :min_lat AND :max_lat
                      AND longitude BETWEEN :min_lon AND :max_lon
                      AND acq_date >= :start_date AND acq_date <= :acq_date;
                    """
                )
                res = db_or_conn.execute(
                    sql,
                    {
                        "min_lat": min_lat,
                        "max_lat": max_lat,
                        "min_lon": min_lon,
                        "max_lon": max_lon,
                        "start_date": start_date_str,
                        "acq_date": str(acq_date)[:10],
                    },
                )
            else:
                sql = text(
                    """
                    SELECT COUNT(*), COUNT(DISTINCT acq_date), AVG(frp), MAX(frp)
                    FROM detections
                    WHERE latitude BETWEEN :min_lat AND :max_lat
                      AND longitude BETWEEN :min_lon AND :max_lon;
                    """
                )
                res = db_or_conn.execute(
                    sql,
                    {
                        "min_lat": min_lat,
                        "max_lat": max_lat,
                        "min_lon": min_lon,
                        "max_lon": max_lon,
                    },
                )
            row = res.fetchone()

        if row and row[0] is not None and row[0] > 0:
            count = int(row[0])
            active_days = int(row[1]) if row[1] is not None else 1
            avg_frp = float(row[2]) if row[2] is not None else float(current_frp)
            max_frp = float(row[3]) if row[3] is not None else float(current_frp)
            persistence_ratio = min(1.0, max(0.0, float(active_days) / float(window_days)))

            return {
                "recurrence_count": float(count),
                "active_days": active_days,
                "persistence_ratio": round(persistence_ratio, 4),
                "cluster_mean_frp": round(avg_frp, 2),
                "cluster_max_frp": round(max_frp, 2),
            }

        return fallback_result

    except Exception as exc:
        logger.debug("Error during spatial recurrence lookup: %s", exc)
        return fallback_result
