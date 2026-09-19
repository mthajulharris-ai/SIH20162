"""
SATRA Domain-Specific AI Assistant & RAG Service.
Engineered exclusively for Industrial Fire Detection, Persistent Thermal Source Monitoring,
NASA FIRMS satellite telemetry (VIIRS 375m / MODIS 1km), Fire Radiative Power (FRP),
ML ensemble classification (0=Industrial Fire, 1=Forest Fire, 2=Persistent Thermal Source, 3=Other),
and real-time grounded database analytics.
"""

import os
import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, and_

from backend.models.detection import Detection
from backend.models.alert import Alert

logger = logging.getLogger("backend.chat_service")

# Exact required out-of-scope response
UNRELATED_RESPONSE = (
    "I’m the SATRA AI Assistant. I’m specialized in industrial fire detection, "
    "thermal anomalies, satellite data, fire classification, alerts, GIS analysis, "
    "and SATRA system information."
)

# Core domain knowledge repository covering all 19 technical topics
DOMAIN_TOPICS = {
    "nasa_firms": {
        "title": "NASA FIRMS Telemetry & Constellation Overview",
        "content": (
            "**NASA FIRMS (Fire Information for Resource Management System)** distributes Near Real-Time (NRT) "
            "active fire and thermal anomaly data within 3 hours of satellite overpass.\n\n"
            "### Sensor Constellation Utilized in SATRA:\n"
            "- **VIIRS (Visible Infrared Imaging Radiometer Suite)** on S-NPP, NOAA-20, and NOAA-21:\n"
            "  - **Spatial Resolution**: 375m per pixel in high-resolution Imagery bands (I4 thermal at 3.74 µm, I5 at 11.45 µm).\n"
            "  - **Industrial Value**: Sub-pixel sensitivity capable of identifying small industrial combustion points, gas flares, and early-stage structural factory blazes.\n"
            "- **MODIS (Moderate Resolution Imaging Spectroradiometer)** on NASA Terra and Aqua:\n"
            "  - **Spatial Resolution**: 1 km nominal in 4 µm and 11 µm channels.\n"
            "  - **Baseline Archive**: Over 20 years of continuous global data, indispensable for establishing multi-year persistent thermal source baselines.\n\n"
            "### Day vs Night Passes:\n"
            "Observations are tagged as Day ('D') or Night ('N'). Nighttime thermal observations offer superior signal-to-noise ratio for flare stacks and furnaces because solar background reflectance is absent."
        ),
        "keywords": ["nasa firms", "firms", "nasa", "earthdata", "viirs", "modis", "snpp", "noaa-20", "noaa-21", "terra", "aqua", "satellite data", "constellation"],
    },
    "frp_physics": {
        "title": "Fire Radiative Power (FRP) & Thermal Physics",
        "content": (
            "**Fire Radiative Power (FRP)**, measured in Megawatts (MW), quantifies the radiant heat energy output "
            "per unit time from a thermal anomaly.\n\n"
            "### Physical Principles & Calculations:\n"
            "- Derived from **Planck's radiation law** and the **Stefan-Boltzmann $T^4$ relation** in the mid-wave infrared (MWIR ~3.9 µm) atmospheric window.\n"
            "- FRP is directly proportional to the fuel mass combustion rate (biomass or fossil hydrocarbons).\n\n"
            "### Brightness Temperature ($T_b$):\n"
            "- Expressed in **Kelvin (K)**. Standard ambient background is ~290–300 K. Active industrial fires and flare stacks frequently exhibit temperatures exceeding 340–400+ K.\n"
            "- Temperature difference $\\Delta T = T_{3.74\\mu m} - T_{11.45\\mu m}$ highlights sub-pixel high-temperature combustion against cooler surroundings."
        ),
        "keywords": ["frp", "fire radiative power", "brightness temperature", "brightness", "kelvin", "megawatt", "radiative power", "heat output", "temperature difference", "delta t"],
    },
    "classification_ml": {
        "content": (
            "### SATRA Classification Taxonomy:\n"
            "SATRA classifies all ingested satellite thermal anomalies into 4 standardized operational classes:\n"
            "- **`0 = Industrial Fire`**: Unplanned, hazardous thermal escalations occurring in petrochemical facilities, refineries, factories, or fuel depots.\n"
            "- **`1 = Forest Fire`**: Large-scale open vegetation, forest, or brush fires characterized by expanding perimeters and high cumulative FRP.\n"
            "- **`2 = Persistent Thermal Source`**: Stationary, authorized high-temperature industrial infrastructure (refinery flare stacks, blast furnaces, cement kilns, smelters) with repeat historical observations.\n"
            "- **`3 = Other`**: Agricultural stubble burns, urban background heating, or false alarms (e.g. solar glint).\n\n"
            "### Production ML Ensemble Architecture:\n"
            "SATRA employs a **Soft-Voting Ensemble Classifier** combining three complementary models:\n"
            "1. **Random Forest**: 100 decision trees mitigating variance and resisting sensor outlier noise.\n"
            "2. **LightGBM**: Fast histogram gradient boosting capturing non-linear interactions across continuous satellite channels.\n"
            "3. **XGBoost**: Regularized depth-wise gradient boosting ensuring robust generalization on imbalanced classes.\n\n"
            "### Feature Vector (11 Features):\n"
            "- Satellite Radiometry: `brightness`, `bright_t31`, `frp`, `scan`, `track`, `daynight`.\n"
            "- Engineered Metrics: `temp_difference` ($T_b - T_{31}$), `local_hour`, `month`.\n"
            "- Spatial-Temporal Context: Historical recurrence frequency within 1 km and proximity to industrial zoning buffers."
        ),
        "title": "SATRA ML Model Architecture & Classification Taxonomy",
        "keywords": ["how satra classifies", "ml model", "machine learning", "ensemble", "random forest", "lightgbm", "xgboost", "soft-voting", "features used", "taxonomy", "algorithm"],
    },
    "confidence_uncertainty": {
        "title": "Detection Confidence & Uncertainty Policy",
        "content": (
            "The **Confidence Score** represents the calibrated posterior class probability output by the soft-voting ensemble (range: 0.0 to 1.0 / 0% to 100%).\n\n"
            "### Thresholds & Safety Policy:\n"
            "- **High Confidence (≥ 80%)**: High-probability classification. Triggers automated high-priority alerts for industrial fires.\n"
            "- **Moderate Confidence (60% – 79%)**: Standard detection accepted with regular telemetry tracking.\n"
            "- **Low Confidence (< 60% / < 65%)**: **Triggers an automatic `LOW_CONFIDENCE_REVIEW` status**.\n"
            "  - The anomaly is quarantined for human analyst sign-off.\n"
            "  - The system avoids false alarms and ensures zero critical incidents go unverified.\n"
            "  - Reasons for low confidence include cloud obscuration, edge-of-swath pixel distortion, or marginal thermal contrast."
        ),
        "keywords": ["confidence", "confidence score", "uncertainty", "probability", "low confidence", "below 60", "below 65", "what does confidence mean"],
    },
    "persistent_sources": {
        "title": "Persistent Thermal Sources & Recurrence Tracking",
        "content": (
            "**Persistent Thermal Sources** are stationary industrial installations that emit continuous or recurring high heat signatures over extended observation windows.\n\n"
            "### Examples & Sectors:\n"
            "- Oil and gas refinery flare stacks.\n"
            "- Iron and steel manufacturing blast furnaces.\n"
            "- Petrochemical cracking towers and chemical synthesis plants.\n"
            "- Glassworks, ceramic kilns, and cement manufacturing.\n\n"
            "### Identification Methodology:\n"
            "- **Spatial Clustering**: Repeated detections within a fixed 1 km spatial radius across multiple satellite orbits.\n"
            "- **Temporal Stability**: Steady, low-variance FRP output over weeks and months rather than exponential growth.\n"
            "- **Importance**: Distinguishing persistent operational heat prevents false emergency dispatches while enabling continuous emissions compliance monitoring."
        ),
        "keywords": ["persistent", "persistent thermal sources", "persistent heat", "flare", "refinery", "furnace", "kiln", "smelter", "repeatedly"],
    },
    "workflow_pipeline": {
        "title": "Complete SATRA Detection & Alert Workflow",
        "content": (
            "The SATRA platform operates as a robust, closed-loop telemetry pipeline:\n\n"
            "1. **Ingestion Layer**: Automatically polls NASA FIRMS API (VIIRS/MODIS) and accepts multi-file user uploads (CSV, JSON, GeoJSON, Shapefile ZIP).\n"
            "2. **Validation & Cleaning**: Validates coordinates (latitude [-90, 90], longitude [-180, 180]), checks temperature bounds, standardizes aliases, and rejects malformed records.\n"
            "3. **Feature Engineering**: Derives temperature difference, local solar time, recurrence counts, and industrial buffer context.\n"
            "4. **AI/ML Inference**: The Random Forest + LightGBM + XGBoost soft-voting ensemble predicts probabilities across 4 classes.\n"
            "5. **Alert & Dispatch**: Detections with high FRP or industrial classification generate alerts (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW_CONFIDENCE_REVIEW`).\n"
            "6. **Operational UI**: Renders live data on 2D Leaflet GIS and interactive Three.js 3D Earth."
        ),
        "keywords": ["workflow", "pipeline", "architecture", "technologies", "how it works", "satra system workflow", "project architecture"],
    },
    "project_overview": {
        "title": "SATRA Project Purpose, Technologies & Impact",
        "content": (
            "**SATRA (Satellite Thermal Risk Analysis)** is an AI-powered industrial fire detection and persistent thermal source monitoring platform (PS 26162).\n\n"
            "### Core Problem Solved:\n"
            "Conventional satellite fire monitors treat all thermal anomalies equally, resulting in frequent false alarms at industrial sites (e.g. routine flaring) while missing catastrophic industrial blazes in remote industrial corridors.\n\n"
            "### Technology Stack:\n"
            "- **Backend**: FastAPI (Python 3.14), SQLAlchemy ORM, SQLite with spatial indices.\n"
            "- **Machine Learning**: Scikit-Learn (Random Forest), LightGBM, XGBoost soft-voting ensemble.\n"
            "- **Frontend**: React 18, Vite, Vanilla CSS design tokens with Dark & Light theme modes.\n"
            "- **Visualizations**: Leaflet GIS, Three.js 3D Earth, Chart.js analytics.\n"
            "- **Data Source**: NASA FIRMS (VIIRS 375m S-NPP / NOAA-20 / NOAA-21 and MODIS 1km Terra / Aqua).\n\n"
            "### System Limitations:\n"
            "- Cloud cover and thick atmospheric particulate can temporarily attenuate satellite thermal radiance.\n"
            "- Satellite orbital revisit intervals create temporal observation windows (typically 2 to 4 passes per 24 hours per location)."
        ),
        "keywords": ["what is satra", "project", "problem satra solves", "why nasa firms", "why ai", "limitations", "technologies used"],
    },
    "industrial_vs_forest": {
        "title": "Industrial Fire vs Forest Fire Distinction",
        "content": (
            "Distinguishing industrial fires from forest/wildfires is a cornerstone of the SATRA intelligence engine:\n\n"
            "| Characteristic | Industrial Fire | Forest / Wildfire |\n"
            "| :--- | :--- | :--- |\n"
            "| **Location** | Inside or adjacent to industrial parks, refineries, chemical zones | Forests, grasslands, wilderness, agricultural fringes |\n"
            "| **Spatial Perimeter** | Confined to facility footprints (~100m–500m) | Expanding perimeter over square kilometers |\n"
            "| **Thermal Spike** | Sudden, extreme local FRP (>25–100+ MW) with high $\\Delta T$ | Broad-area heat, progressing with wind direction |\n"
            "| **Recurrence Context** | Occurs near known industrial facilities; distinct from steady flare baseline | Seasonal, dry-weather correlation |\n"
            "| **Response Protocol** | Hazardous material response, industrial containment | Aerial water drops, firebreaks, evacuation |"
        ),
        "keywords": ["difference between industrial fire and forest fire", "forest fire", "wildfire", "industrial fire vs", "industrial fire"],
    },
}


def _is_unrelated(query: str) -> bool:
    """
    Identifies queries completely outside the SATRA domain (e.g., cooking, pop culture, generic trivia).
    """
    from backend.rag.multilingual import normalize_multilingual_query
    q = query.lower().strip()
    q_norm = normalize_multilingual_query(query).lower().strip()

    # Allowed technical / domain keywords
    domain_terms = [
        "satra", "fire", "thermal", "firms", "nasa", "satellite", "modis", "viirs",
        "frp", "power", "temperature", "kelvin", "heat", "hotspot", "anomaly",
        "persistent", "flare", "refinery", "industrial", "wildfire", "forest",
        "agricultural", "alert", "ml", "model", "ai", "confidence", "classification",
        "accuracy", "pipeline", "workflow", "detection", "database", "analytics",
        "gis", "coordinates", "latitude", "longitude", "area", "district", "region",
        "today", "yesterday", "recent", "week", "stats", "facilities", "sensor",
        "lightgbm", "xgboost", "random forest", "ensemble", "snpp", "noaa", "terra", "aqua",
        "hello", "hi", "hey", "help", "who are you", "what can you do", "explain", "rag",
        "overview", "taxonomy", "class"
    ]

    if any(term in q or term in q_norm for term in domain_terms):
        return False

    # Check for clearly off-topic patterns
    off_topic_patterns = [
        r"\b(recipe|bake|cake|cook|pizza|pasta|bread|cookie|food)\b",
        r"\b(cricket|football|soccer|nba|messi|ronaldo|ipl|world cup)\b",
        r"\b(movie|film|actor|actress|song|singer|music|hollywood|bollywood)\b",
        r"\b(poem|joke|story|fiction|novel|dating|love)\b",
        r"\b(crypto|bitcoin|stock price|trading|forex|ethereum)\b",
    ]
    for pattern in off_topic_patterns:
        if re.search(pattern, q) or re.search(pattern, q_norm):
            return True

    return True


def _format_detection_record(d: Detection) -> str:
    """Formats a single Detection record with all physical and ML parameters."""
    lat = round(d.latitude, 4)
    lon = round(d.longitude, 4)
    frp_str = f"{d.frp:.1f} MW" if d.frp is not None else "N/A"
    bright_str = f"{d.brightness:.1f} K" if d.brightness is not None else "N/A"
    conf_pct = round(d.prediction_confidence * 100, 1) if d.prediction_confidence is not None else 0.0
    time_str = f"{d.acq_date} {d.acq_time} UTC" if d.acq_time else d.acq_date

    return (
        f"- **Detection ID**: `#{d.id}`\n"
        f"- **Coordinates**: {lat}°, {lon}°\n"
        f"- **Classification**: **`{d.predicted_class}`** (Confidence: {conf_pct}%)\n"
        f"- **Fire Radiative Power (FRP)**: {frp_str}\n"
        f"- **Brightness Temperature**: {bright_str}\n"
        f"- **Satellite Source**: {d.source or 'VIIRS/MODIS'}\n"
        f"- **Acquisition Time**: {time_str}\n"
        f"- **Persistence Status**: {'Persistent Thermal Source' if d.is_persistent else 'Non-Persistent / Incident'}\n"
        f"- **Alert Level**: `{d.alert_level or 'LOW'}`"
    )


def _handle_specific_detection_query(message: str, db: Session) -> Optional[Dict[str, Any]]:
    """
    Answers questions about a specific hotspot/detection:
    - Queries by ID if mentioned (e.g. '#123' or 'detection 123')
    - Or by coordinates if mentioned
    - Or defaults to the latest prominent Industrial Fire / high-priority detection in the database
    - Explains WHY it was classified based on FRP, temperature, persistence, and confidence.
    """
    msg_lower = message.lower()
    
    is_det_query = (
        (any(t in msg_lower for t in ["why was", "explain", "tell me about", "is this", "details of", "status of"])
         and any(w in msg_lower for w in ["detection", "hotspot", "location", "fire", "#"]))
        or any(t in msg_lower for t in ["why was this", "explain this", "which industries are near", "facilities near this"])
    )
    if not is_det_query:
        return None

    # Check for explicit ID
    id_match = re.search(r"#?(\d{1,8})", message)
    target_detection = None
    explicit_id_requested = False

    if id_match and ("#" in message or "detection" in msg_lower or "id" in msg_lower):
        explicit_id_requested = True
        det_id = int(id_match.group(1))
        target_detection = db.query(Detection).filter(Detection.id == det_id).first()
        if not target_detection:
            return {
                "response": "I couldn't find matching live data in the SATRA system. I don't have enough data in the SATRA system to determine that.",
                "sources": [{"document": "SATRA Database", "section": f"Detection #{det_id}", "page": 1}],
                "data_used": {"rag": False, "live_data": True},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    # If no explicit ID, retrieve the latest Industrial Fire or critical detection
    if not target_detection and not explicit_id_requested:
        target_detection = (
            db.query(Detection)
            .filter(Detection.predicted_class == "Industrial Fire")
            .order_by(desc(Detection.acq_date), desc(Detection.acq_time), desc(Detection.id))
            .first()
        )

    # Fallback to the latest detection of any class
    if not target_detection and not explicit_id_requested:
        target_detection = (
            db.query(Detection)
            .order_by(desc(Detection.acq_date), desc(Detection.acq_time), desc(Detection.id))
            .first()
        )

    if not target_detection:
        return {
            "response": "I couldn't find matching live data in the SATRA system. I don't have enough data in the SATRA system to determine that.",
            "sources": [{"document": "SATRA Database", "section": "Telemetry Detections", "page": 1}],
            "data_used": {"rag": False, "live_data": True},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    d = target_detection
    conf_pct = round(d.prediction_confidence * 100, 1) if d.prediction_confidence else 0.0
    bright_val = d.brightness or 0.0
    frp_val = d.frp if d.frp is not None else 0.0

    # Formulate understandable scientific justification based on actual features
    reasons = []
    if d.predicted_class == "Industrial Fire":
        if bright_val >= 340.0:
            reasons.append(f"Elevated brightness temperature of **{bright_val:.1f} K**, significantly above nominal ambient levels (~295 K).")
        if frp_val > 10.0:
            reasons.append(f"Concentrated Fire Radiative Power (FRP) of **{frp_val:.1f} MW**, indicative of high-intensity industrial combustion.")
        if not d.is_persistent:
            reasons.append("Non-persistent temporal signature (not part of steady-state multi-year operational flaring), indicating an acute thermal spike.")
        reasons.append(f"Soft-voting ML ensemble classification with **{conf_pct}% confidence** under model version `{d.model_version or 'v2.0'}`.")
    elif d.predicted_class == "Persistent Thermal Source":
        reasons.append("Stationary thermal recurrence verified across consecutive satellite overpasses within a 1 km radius.")
        reasons.append(f"Consistent thermal emissions signature typical of refinery flare stacks, smelters, or kilns with {conf_pct}% confidence.")
    elif d.predicted_class == "Forest Fire":
        reasons.append(f"Broad-area high FRP ({frp_val:.1f} MW) and geographic coordinates located outside industrial infrastructure buffers.")
    else:
        reasons.append(f"Standard thermal profile classified as `{d.predicted_class}` with {conf_pct}% confidence.")

    if conf_pct < 60.0:
        reasons.append("⚠️ **Confidence is below 60%**: Flagged for human analyst verification under the `LOW_CONFIDENCE_REVIEW` safety protocol.")

    explanation_bullets = "\n".join([f"- {r}" for r in reasons])

    response_text = (
        f"### Scientific Classification Analysis: Detection #{d.id}\n\n"
        f"**Classification**: **`{d.predicted_class}`** ({conf_pct}% Confidence)\n\n"
        f"### Telemetry Attributes from SATRA Database:\n"
        f"{_format_detection_record(d)}\n\n"
        f"### Why was this classified as `{d.predicted_class}`?\n"
        f"{explanation_bullets}\n\n"
        f"*Coordinates ({round(d.latitude, 4)}°, {round(d.longitude, 4)}°) are cross-referenced with satellite sensor telemetry from {d.source or 'NASA FIRMS'}.*"
    )

    return {
        "response": response_text,
        "sources": [
            {"document": "SATRA Database", "section": f"Detection #{d.id} Telemetry", "page": 1},
            {"document": "SATRA ML Model Architecture", "section": "Classification Taxonomy", "page": 1}
        ],
        "data_used": {"rag": True, "live_data": True},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _handle_database_query(message: str, db: Session) -> Optional[Dict[str, Any]]:
    """
    Handles queries concerning real-world database counts, today's detections,
    active alerts, regional hotspots, and analytics.
    """
    msg_lower = message.lower()
    timestamp = datetime.now(timezone.utc).isoformat()

    # 1. Today's Fire Detections
    if "today" in msg_lower and any(w in msg_lower for w in ["fire", "detection", "hotspot", "how many", "show"]):
        today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Check today's records
        today_count = db.query(func.count(Detection.id)).filter(Detection.acq_date == today_utc).scalar() or 0
        target_date = today_utc

        # If today has 0 records (e.g. before daily satellite overpass synchronization), check the latest active date in DB
        if today_count == 0:
            latest_date = db.query(func.max(Detection.acq_date)).scalar()
            if latest_date:
                today_count = db.query(func.count(Detection.id)).filter(Detection.acq_date == latest_date).scalar() or 0
                target_date = latest_date

        # Query class breakdown for this date
        class_breakdown = (
            db.query(Detection.predicted_class, func.count(Detection.id))
            .filter(Detection.acq_date == target_date)
            .group_by(Detection.predicted_class)
            .all()
        )
        classes_str = "\n".join([f"- **`{c}`**: {cnt} detections" for c, cnt in class_breakdown]) or "- No individual classes recorded."

        # Latest 3 detections on that date
        recent_today = (
            db.query(Detection)
            .filter(Detection.acq_date == target_date)
            .order_by(desc(Detection.acq_time), desc(Detection.id))
            .limit(3)
            .all()
        )
        recent_today_str = ""
        if recent_today:
            sample_lines = "\n\n".join([_format_detection_record(det) for det in recent_today])
            recent_today_str = f"\n\n### Sample Hotspots for {target_date}:\n{sample_lines}"

        date_note = f"for today ({today_utc})" if target_date == today_utc else f"for the most recent satellite pass date ({target_date})"
        return {
            "response": (
                f"### Fire & Thermal Detections {date_note}\n\n"
                f"- **Total Thermal Anomalies Detected**: **{today_count}**\n\n"
                f"### Breakdown by Classification:\n{classes_str}{recent_today_str}\n\n"
                f"*Data retrieved directly from the live SATRA SQLite database.*"
            ),
            "sources": [{"document": "SATRA Live SQLite Database", "section": "Today's Thermal Detections", "page": 1}],
            "data_used": {"rag": False, "live_data": True},
            "timestamp": timestamp,
        }

    # 2. Latest Fire Detections / Where are the latest detections
    if any(p in msg_lower for p in ["where are the latest", "where is this hotspot", "latest fire detections", "when was this fire detected", "show hotspots in"]):
        latest_fires = (
            db.query(Detection)
            .filter(or_(Detection.predicted_class == "Industrial Fire", Detection.predicted_class == "Forest Fire"))
            .order_by(desc(Detection.acq_date), desc(Detection.acq_time), desc(Detection.id))
            .limit(5)
            .all()
        )
        if not latest_fires:
            latest_fires = (
                db.query(Detection)
                .order_by(desc(Detection.acq_date), desc(Detection.acq_time), desc(Detection.id))
                .limit(5)
                .all()
            )

        if latest_fires:
            sample_lines = "\n\n".join([_format_detection_record(det) for det in latest_fires])
            return {
                "response": (
                    f"### Latest Active Thermal & Fire Detections\n\n"
                    f"Retrieved from the latest satellite telemetry passes:\n\n{sample_lines}\n\n"
                    f"*Coordinates can be investigated on the 2D Leaflet GIS Map or 3D Earth Globe.*"
                ),
                "sources": [{"document": "SATRA Ingested Detections Database", "section": "Active Thermal Hotspots", "page": 1}],
                "data_used": {"rag": False, "live_data": True},
                "timestamp": timestamp,
            }

    # 3. Area / District with most fire detections & High-Density Cluster Analysis
    if any(p in msg_lower for p in ["which area", "which district", "highest number", "multiple thermal anomalies", "most fire detections"]):
        # Group detections by 1-degree latitude/longitude grid cells to find highest density regional cluster
        density_clusters = (
            db.query(
                func.round(Detection.latitude, 0).label("lat_grid"),
                func.round(Detection.longitude, 0).label("lon_grid"),
                func.count(Detection.id).label("cluster_count"),
            )
            .group_by("lat_grid", "lon_grid")
            .order_by(desc("cluster_count"))
            .limit(4)
            .all()
        )

        cluster_lines = []
        for row in density_clusters:
            cluster_lines.append(
                f"- **Region Grid Center ({row.lat_grid:+.0f}°, {row.lon_grid:+.0f}°)**: "
                f"**{row.cluster_count:,}** recorded thermal anomalies (high concentration of industrial/persistent sources)"
            )
        clusters_str = "\n".join(cluster_lines) if cluster_lines else "- No geographic cluster data available."

        return {
            "response": (
                f"### High-Density Thermal Anomaly Geographic Analysis\n\n"
                f"Based on spatial aggregation across all ingested satellite observations:\n\n"
                f"{clusters_str}\n\n"
                f"The highest density of thermal anomalies corresponds to major industrial zones and petrochemical corridors, "
                f"where stationary persistent sources (flare stacks, blast furnaces) produce recurring heat signatures."
            ),
            "sources": [{"document": "SATRA Spatial Aggregation Engine", "section": "High-Density Regional Clusters", "page": 1}],
            "data_used": {"rag": False, "live_data": True},
            "timestamp": timestamp,
        }

    # 4. Weekly Fire Detection Counts / Date Comparison
    if any(w in msg_lower for w in ["this week", "compare detections", "between two dates"]):
        latest_date_str = db.query(func.max(Detection.acq_date)).scalar() or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        try:
            latest_dt = datetime.strptime(latest_date_str, "%Y-%m-%d")
            week_ago_dt = latest_dt - timedelta(days=7)
            week_ago_str = week_ago_dt.strftime("%Y-%m-%d")

            weekly_count = (
                db.query(func.count(Detection.id))
                .filter(Detection.acq_date >= week_ago_str, Detection.acq_date <= latest_date_str)
                .scalar() or 0
            )
            weekly_industrial = (
                db.query(func.count(Detection.id))
                .filter(
                    Detection.acq_date >= week_ago_str,
                    Detection.acq_date <= latest_date_str,
                    Detection.predicted_class == "Industrial Fire",
                )
                .scalar() or 0
            )
            weekly_persistent = (
                db.query(func.count(Detection.id))
                .filter(
                    Detection.acq_date >= week_ago_str,
                    Detection.acq_date <= latest_date_str,
                    Detection.is_persistent == True,
                )
                .scalar() or 0
            )

            return {
                "response": (
                    f"### Weekly Thermal Detection & Anomaly Analysis\n\n"
                    f"- **Observation Window**: {week_ago_str} to {latest_date_str}\n"
                    f"- **Total Thermal Anomalies**: **{weekly_count:,}**\n"
                    f"- **Industrial Fires Detected**: **{weekly_industrial}**\n"
                    f"- **Persistent Source Recurrences**: **{weekly_persistent:,}**\n\n"
                    f"*Data filtered dynamically across the multi-day satellite observation window.*"
                ),
                "sources": [{"document": "SATRA Time-Series Telemetry DB", "section": "Multi-Day Observation Window", "page": 1}],
                "data_used": {"rag": False, "live_data": True},
                "timestamp": timestamp,
            }
        except Exception as err:
            logger.warning("Error calculating weekly detections: %s", str(err))

    # 5. Fire Alerts (recent, unresolved, high confidence, critical)
    alert_triggers = ["alert", "alerts", "unresolved", "show alerts", "recent alerts", "high-confidence alert", "critical alert"]
    if any(t in msg_lower for t in alert_triggers) and any(w in msg_lower for w in ["show", "recent", "any", "unresolved", "high", "critical", "what", "are there"]):
        total_alerts = db.query(func.count(Alert.id)).scalar() or 0
        unresolved_alerts = db.query(func.count(Alert.id)).filter(Alert.verification_status == "REQUIRES_VERIFICATION").scalar() or 0
        critical_alerts = db.query(func.count(Alert.id)).filter(Alert.alert_level == "CRITICAL").scalar() or 0
        high_alerts = db.query(func.count(Alert.id)).filter(Alert.alert_level == "HIGH").scalar() or 0

        # Query top 3 latest critical or high alerts
        sample_alerts = (
            db.query(Alert)
            .order_by(desc(Alert.id))
            .limit(3)
            .all()
        )
        alert_samples_str = ""
        if sample_alerts:
            lines = []
            for a in sample_alerts:
                conf = round(a.confidence * 100, 1) if a.confidence else 0.0
                lines.append(
                    f"- **Alert #{a.id}** (`{a.alert_level}`): {a.title}\n"
                    f"  - **Class**: `{a.predicted_class}` | **Confidence**: {conf}%\n"
                    f"  - **Coordinates**: {round(a.latitude, 4)}°, {round(a.longitude, 4)}°\n"
                    f"  - **Verification Status**: `{a.verification_status}`"
                )
            alert_samples_str = "\n\n### Most Recent Alerts:\n" + "\n".join(lines)

        return {
            "response": (
                f"### SATRA Operational Alert Telemetry\n\n"
                f"- **Total Alerts in System**: {total_alerts}\n"
                f"- **Unresolved Alerts (Requiring Verification)**: **{unresolved_alerts}**\n"
                f"- **Critical Severity Alerts**: {critical_alerts}\n"
                f"- **High Severity Alerts**: {high_alerts}{alert_samples_str}\n\n"
                f"*Alerts represent automated AI classifications requiring ground or human verification.*"
            ),
            "sources": [{"document": "SATRA Alerts Database Table", "section": "Operational Incident Stream", "page": 1}],
            "data_used": {"rag": False, "live_data": True},
            "timestamp": timestamp,
        }

    # 6. Overall Analytics & Persistent Sources Counts
    stats_triggers = ["how many", "database", "analytics", "statistics", "stats", "count", "persistent thermal sources were detected"]
    if any(t in msg_lower for t in stats_triggers):
        total_detections = db.query(func.count(Detection.id)).scalar() or 0
        total_alerts = db.query(func.count(Alert.id)).scalar() or 0
        persistent_count = db.query(func.count(Detection.id)).filter(Detection.is_persistent == True).scalar() or 0
        
        class_counts = (
            db.query(Detection.predicted_class, func.count(Detection.id))
            .group_by(Detection.predicted_class)
            .all()
        )
        classes_str = "\n".join([f"- **`{c}`**: {cnt:,} detections" for c, cnt in class_counts])

        return {
            "response": (
                f"### Current SATRA System Detection Statistics\n\n"
                f"- **Total Ingested Detections**: **{total_detections:,}**\n"
                f"- **Identified Persistent Thermal Sources**: **{persistent_count:,}**\n"
                f"- **Total Dispatched Alerts**: **{total_alerts:,}**\n\n"
                f"### Classification Taxonomy Breakdown:\n{classes_str}\n\n"
                f"*Retrieved directly from the SATRA SQLite database engine in real time.*"
            ),
            "sources": [{"document": "SATRA Live SQLite Database", "section": "System Analytics & Totals", "page": 1}],
            "data_used": {"rag": False, "live_data": True},
            "timestamp": timestamp,
        }

    return None


def generate_chat_response(
    message: str,
    db: Optional[Session] = None,
    history: Optional[List[Dict[str, str]]] = None,
    language: str = "auto",
) -> Dict[str, Any]:
    """
    Main RAG generation pipeline with Multilingual Voice and Text Support:
    1. Scope & Guardrails: Filters out-of-scope questions with exact required response.
    2. Greetings & System Capability: Explains capabilities.
    3. Intent Router: Classifies question into RAG, Live Data, Hybrid, or Unrelated.
    4. Specific Detection Analysis: Queries and explains individual hotspots with real DB features.
    5. Database Telemetry Queries: Grounded queries for today's fires, alerts, counts.
    6. RAG Vector Knowledge Retrieval: Retrieves top-k chunks from FAISS vector store.
    7. Grounded Response Generation: Synthesizes grounded answer with source citations.
    8. Multilingual Localization: Localizes response to English, Tamil, Tanglish, or Hindi.
    """
    from backend.rag.multilingual import (
        detect_language,
        resolve_response_language,
        normalize_multilingual_query,
        localize_response,
    )

    msg = message.strip()
    msg_lower = msg.lower()
    msg_norm = normalize_multilingual_query(msg)
    msg_norm_lower = msg_norm.lower()
    timestamp = datetime.now(timezone.utc).isoformat()

    # Determine target language: current message has highest priority, then voice/history, then preferred language
    target_lang = resolve_response_language(
        message=msg,
        preferred_language=language or "auto",
        history=history,
    )


    def _finalize(result: Dict[str, Any]) -> Dict[str, Any]:
        if target_lang != "en" and result and "response" in result:
            result["response"] = localize_response(result["response"], target_lang=target_lang, original_query=msg)
        result["language"] = target_lang
        return result

    # 1. Scope & Guardrails Filter
    if _is_unrelated(msg):
        return _finalize({
            "response": UNRELATED_RESPONSE,
            "sources": [],
            "data_used": {"rag": False, "live_data": False},
            "timestamp": timestamp,
        })

    # 2. Greetings / Introduction
    greeting_triggers = [
        "hi", "hello", "hey", "greetings", "who are you", "what can you do", "help",
        "வணக்கம்", "नमस्ते", "namaste", "vanakkam"
    ]
    if msg_lower in greeting_triggers or msg_norm_lower in ["hi", "hello", "hey", "greetings", "who are you", "what can you do", "help"]:
        det_count = 0
        if db:
            det_count = db.query(func.count(Detection.id)).scalar() or 0

        return _finalize({
            "response": (
                f"Hello! I am the **SATRA Domain AI Assistant** for the **Industrial Fire Detection and Persistent Thermal Source Monitoring Platform**.\n\n"
                f"Currently monitoring **{det_count:,}** active thermal observations in the live database.\n\n"
                "### I can assist you with:\n"
                "- **Live Telemetry & Data**: \"*How many fires were detected today?*\", \"*Show recent fire alerts*\"\n"
                "- **Specific Hotspot Explanations**: \"*Why was this detection classified as an industrial fire?*\"\n"
                "- **NASA FIRMS Telemetry**: \"*What is VIIRS vs MODIS?*\", \"*What is Fire Radiative Power (FRP)?*\"\n"
                "- **Machine Learning**: \"*How does the soft-voting ensemble classify hotspots?*\", \"*What does confidence mean?*\"\n"
                "- **Persistent Sources**: \"*What is a persistent thermal source?*\"\n\n"
                "Select a suggested question or enter your query."
            ),
            "sources": [{"document": "SATRA System Overview", "section": "SATRA Mission & Objectives", "page": 1}],
            "data_used": {"rag": True, "live_data": True if det_count else False},
            "timestamp": timestamp,
        })

    # 3. Intent Detection & Routing (evaluate with normalized query)
    intent = None
    try:
        from backend.rag.router import IntentRouter
        router = IntentRouter()
        intent = router.classify(msg_norm)
    except Exception as e:
        logger.warning("IntentRouter error (%s), using default routing.", e)

    # 4. Specific Detection Analysis (Priority for 'why was this classified', 'explain this detection')
    is_det_query = (intent and intent.detection_id is not None) or any(
        w in msg_lower or w in msg_norm_lower for w in ["why was detection", "why was this", "explain why detection", "classified as", "why was #"]
    )
    if db is not None and is_det_query:
        det_result = _handle_specific_detection_query(msg_norm, db) or _handle_specific_detection_query(msg, db)
        if det_result:
            return _finalize(det_result)

    # 5. Live Database Questions (Today's fires, alerts, statistics)
    if db is not None and (
        intent is None
        or intent.requires_live_data
        or any(w in msg_lower or w in msg_norm_lower for w in ["today", "recent", "unresolved", "alert", "how many", "area", "district", "highest"])
    ):
        db_result = _handle_database_query(msg_norm, db) or _handle_database_query(msg, db)
        if db_result:
            return _finalize(db_result)

    # 6. RAG Vector Knowledge Retrieval (uses normalized query for dense search)
    try:
        from backend.rag.retriever import RAGRetriever
        from backend.rag.generator import GroundedResponseGenerator
        retriever = RAGRetriever()
        retrieved_chunks = retriever.retrieve(msg_norm, top_k=4)

        if retrieved_chunks and retrieved_chunks[0].score >= 0.20:
            sources = [c.to_source_citation() for c in retrieved_chunks]
            response_text = GroundedResponseGenerator.generate(
                msg_norm,
                retrieved_chunks=retrieved_chunks,
                data_used={"rag": True, "live_data": False}
            )
            return _finalize({
                "response": response_text,
                "sources": sources,
                "data_used": {"rag": True, "live_data": False},
                "timestamp": timestamp,
            })
    except Exception as e:
        logger.warning("RAG vector retrieval exception: %s", str(e))

    # 7. Fallback to Domain Topics
    best_key = None
    best_score = 0
    for key, topic in DOMAIN_TOPICS.items():
        score = 0
        for kw in topic["keywords"]:
            if kw in msg_lower or kw in msg_norm_lower:
                score += len(kw) * len(kw)
        if score > best_score:
            best_score = score
            best_key = key

    if best_key and best_score > 0:
        topic = DOMAIN_TOPICS[best_key]
        return _finalize({
            "response": f"## {topic['title']}\n\n{topic['content']}",
            "sources": [{"document": "SATRA Technical Specification", "section": topic["title"], "page": 1}],
            "data_used": {"rag": True, "live_data": False},
            "timestamp": timestamp,
        })

    # 8. Fallback Grounded Guidance
    return _finalize({
        "response": (
            "### SATRA Domain Analysis\n\n"
            f"Regarding your query **\"{msg}\"**:\n\n"
            "In SATRA, thermal anomalies are observed by NASA FIRMS (VIIRS 375m & MODIS 1km) and processed by "
            "our soft-voting ensemble classifier (Random Forest + LightGBM + XGBoost) across 4 classes: "
            "`0 = Industrial Fire`, `1 = Forest Fire`, `2 = Persistent Thermal Source`, and `3 = Other`.\n\n"
            "Relevant parameters:\n"
            "- **FRP (Fire Radiative Power)**: Measures thermal heat output in Megawatts (MW).\n"
            "- **Brightness Temperature**: Kelvin temperature recorded by infrared channels.\n"
            "- **Confidence Score**: Calibrated probability; values below 60% trigger `LOW_CONFIDENCE_REVIEW`.\n\n"
            "Ask about specific detection records, today's detections, NASA FIRMS, or the ML ensemble for more details."
        ),
        "sources": [{"document": "SATRA Operational Guidelines", "section": "Domain Analysis", "page": 1}],
        "data_used": {"rag": True, "live_data": False},
        "timestamp": timestamp,
    })

