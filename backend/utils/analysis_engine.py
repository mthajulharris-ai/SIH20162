"""
Dynamic Analysis Engine for Satellite Thermal Observation Datasets.
Computes multi-dimensional analytics:
- Hotspot spatial clustering & density
- Fire Radiative Power (FRP) statistics
- Brightness temperature analysis
- Confidence distribution
- Temporal trends and diurnal (day/night) cycles
- High-risk hotspots identification
- Satellite / sensor provenance breakdown
- Gracefully handles missing fields with None (no invented numbers)
"""

from collections import Counter
from statistics import mean, median
from typing import Any, Dict, List, Optional, Set

from backend.schemas.observation import (
    BrightnessAnalysisSummary,
    ConfidenceAnalysisSummary,
    DatasetAnalysisSummary,
    FileContributionSummary,
    FRPAnalysisSummary,
    HighRiskHotspotSummary,
    SpatialAnalysisSummary,
    SpatialClusterSummary,
    TemporalAnalysisSummary,
)


def compute_dataset_analysis(
    validated_records: List[Any],
    detections: List[Any],
    predictions: List[Dict[str, Any]],
    files_info: List[Dict[str, Any]],
    global_available_fields: Set[str],
    global_unavailable_fields: Set[str],
) -> DatasetAnalysisSummary:
    """
    Dynamically analyzes the complete set of uploaded satellite observations.
    Gracefully excludes metrics for missing fields without inventing values.
    """
    total = len(detections)
    if total == 0:
        return DatasetAnalysisSummary(
            total_records=0,
            available_fields=list(global_available_fields),
            unavailable_fields=list(global_unavailable_fields),
        )

    # 1. Multi-file summaries
    file_contributions = [
        FileContributionSummary(
            filename=f.get("filename", "unknown"),
            record_count=f.get("record_count", 0),
            format_detected=f.get("format_detected", "CSV"),
        )
        for f in files_info
    ]

    # 2. Risk & Classification distributions
    risk_counts = Counter()
    class_counts = Counter()
    for det in detections:
        alert = getattr(det, "alert_level", "LOW") or "LOW"
        cls_name = getattr(det, "predicted_class", "Other") or "Other"
        risk_counts[alert] += 1
        class_counts[cls_name] += 1

    # 3. FRP Analysis (Only if FRP values present)
    frp_vals = [
        float(det.frp)
        for det in detections
        if getattr(det, "frp", None) is not None
    ]
    frp_summary: Optional[FRPAnalysisSummary] = None
    if frp_vals:
        frp_summary = FRPAnalysisSummary(
            min=round(min(frp_vals), 2),
            max=round(max(frp_vals), 2),
            mean=round(mean(frp_vals), 2),
            median=round(median(frp_vals), 2),
            sum=round(sum(frp_vals), 2),
            unit="MW",
        )

    # 4. Brightness Temperature Analysis (Only if brightness values present)
    bright_vals = [
        float(det.brightness)
        for det in detections
        if getattr(det, "brightness", None) is not None
    ]
    bright_summary: Optional[BrightnessAnalysisSummary] = None
    if bright_vals:
        bright_summary = BrightnessAnalysisSummary(
            min=round(min(bright_vals), 2),
            max=round(max(bright_vals), 2),
            mean=round(mean(bright_vals), 2),
            unit="K",
        )

    # 5. Confidence Analysis
    high_conf_count = 0
    nom_conf_count = 0
    low_conf_count = 0
    conf_scores: List[float] = []

    for det in detections:
        raw_conf = str(getattr(det, "confidence", "") or "").lower()
        if not raw_conf:
            continue
        if raw_conf in ("high", "h") or (raw_conf.isdigit() and int(raw_conf) >= 80):
            high_conf_count += 1
            conf_scores.append(0.90)
        elif raw_conf in ("low", "l") or (raw_conf.isdigit() and int(raw_conf) < 50):
            low_conf_count += 1
            conf_scores.append(0.35)
        else:
            nom_conf_count += 1
            conf_scores.append(0.65)

    conf_summary: Optional[ConfidenceAnalysisSummary] = None
    if (high_conf_count + nom_conf_count + low_conf_count) > 0:
        conf_summary = ConfidenceAnalysisSummary(
            high_count=high_conf_count,
            nominal_count=nom_conf_count,
            low_count=low_conf_count,
            mean_confidence=round(mean(conf_scores), 2) if conf_scores else 0.65,
        )

    # 6. Temporal Analysis (Dates & Day/Night)
    dates_list = [getattr(det, "acq_date", "") for det in detections if getattr(det, "acq_date", None)]
    day_count = sum(1 for det in detections if str(getattr(det, "daynight", "D")).upper() == "D")
    night_count = sum(1 for det in detections if str(getattr(det, "daynight", "D")).upper() == "N")

    temp_summary: Optional[TemporalAnalysisSummary] = None
    if dates_list:
        sorted_dates = sorted(dates_list)
        date_dist = dict(Counter(sorted_dates))
        temp_summary = TemporalAnalysisSummary(
            earliest_date=sorted_dates[0],
            latest_date=sorted_dates[-1],
            daily_distribution=date_dist,
            day_count=day_count,
            night_count=night_count,
        )

    # 7. Spatial Analysis (Bounding Box, Center, Density, Clusters)
    lats = [float(det.latitude) for det in detections]
    lons = [float(det.longitude) for det in detections]

    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)
    center_lat = round(mean(lats), 5)
    center_lon = round(mean(lons), 5)

    lat_span = max(0.01, max_lat - min_lat)
    lon_span = max(0.01, max_lon - min_lon)
    area_deg2 = lat_span * lon_span
    density = round(total / area_deg2, 2)

    # Simple spatial grid clustering (~0.05 deg ~ 5 km resolution)
    cluster_grid: Dict[Tuple[int, int], List[Any]] = {}
    for det in detections:
        grid_key = (round(float(det.latitude) * 20), round(float(det.longitude) * 20))
        cluster_grid.setdefault(grid_key, []).append(det)

    clusters: List[SpatialClusterSummary] = []
    for idx, (grid_k, cluster_dets) in enumerate(cluster_grid.items()):
        c_lats = [float(d.latitude) for d in cluster_dets]
        c_lons = [float(d.longitude) for d in cluster_dets]
        c_frps = [float(d.frp) for d in cluster_dets if getattr(d, "frp", None) is not None]
        clusters.append(
            SpatialClusterSummary(
                cluster_id=idx + 1,
                center_latitude=round(mean(c_lats), 5),
                center_longitude=round(mean(c_lons), 5),
                observation_count=len(cluster_dets),
                peak_frp=round(max(c_frps), 2) if c_frps else None,
            )
        )

    # Sort clusters by size descending
    clusters.sort(key=lambda c: c.observation_count, reverse=True)

    spatial_summary = SpatialAnalysisSummary(
        bounding_box={
            "min_latitude": round(min_lat, 5),
            "max_latitude": round(max_lat, 5),
            "min_longitude": round(min_lon, 5),
            "max_longitude": round(max_lon, 5),
        },
        center={"latitude": center_lat, "longitude": center_lon},
        hotspot_density=density,
        clusters=clusters[:10],  # Top 10 clusters
    )

    # 8. High-Risk Areas (Ranked by Alert Severity, FRP, Confidence)
    def severity_rank(det: Any) -> Tuple[int, float, float]:
        level = getattr(det, "alert_level", "LOW") or "LOW"
        level_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW_CONFIDENCE_REVIEW": 1, "LOW": 0}
        rank_val = level_order.get(level, 0)
        frp_val = float(getattr(det, "frp", 0.0) or 0.0)
        conf_val = float(getattr(det, "prediction_confidence", 0.0) or 0.0)
        return (rank_val, frp_val, conf_val)

    sorted_detections = sorted(detections, key=severity_rank, reverse=True)
    top_high_risk: List[HighRiskHotspotSummary] = []

    for det in sorted_detections[:10]:
        top_high_risk.append(
            HighRiskHotspotSummary(
                latitude=float(det.latitude),
                longitude=float(det.longitude),
                predicted_class=getattr(det, "predicted_class", "Other"),
                confidence=float(getattr(det, "prediction_confidence", 0.0)),
                alert_level=getattr(det, "alert_level", "LOW") or "LOW",
                frp=getattr(det, "frp", None),
                brightness=getattr(det, "brightness", None),
                source_file=getattr(det, "source_file", None),
            )
        )

    # 9. Satellite Sources List
    sources_set = set()
    for det in detections:
        src = getattr(det, "source", None)
        inst = getattr(det, "instrument", None)
        if src and inst:
            sources_set.add(f"{src} ({inst})")
        elif src:
            sources_set.add(str(src))
        elif inst:
            sources_set.add(str(inst))

    return DatasetAnalysisSummary(
        total_records=total,
        files_summary=file_contributions,
        available_fields=sorted(list(global_available_fields)),
        unavailable_fields=sorted(list(global_unavailable_fields)),
        risk_distribution=dict(risk_counts),
        class_distribution=dict(class_counts),
        frp_analysis=frp_summary,
        brightness_analysis=bright_summary,
        confidence_analysis=conf_summary,
        temporal_analysis=temp_summary,
        spatial_analysis=spatial_summary,
        high_risk_areas=top_high_risk,
        satellite_sources=sorted(list(sources_set)),
    )
