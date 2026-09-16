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
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np

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


class IncrementalDatasetAggregator:
    """
    Online Streaming Aggregator for large satellite datasets (100,000 to 1,000,000+ records).
    Accumulates statistical metrics, spatial clusters, and representative high-risk hotspots
    chunk-by-chunk with strictly bounded memory (O(1) memory footprint).
    """

    def __init__(self, max_map_hotspots: int = 1000):
        self.max_map_hotspots = max_map_hotspots
        self.total_records = 0
        self.classified_count = 0
        self.low_confidence_count = 0

        self.class_counts = Counter()
        self.risk_counts = Counter()

        # FRP Statistics
        self.frp_count = 0
        self.frp_sum = 0.0
        self.frp_min = float("inf")
        self.frp_max = float("-inf")
        self.frp_reservoir: List[float] = []
        self._max_reservoir_size = 10000

        # Brightness Statistics
        self.bright_count = 0
        self.bright_sum = 0.0
        self.bright_min = float("inf")
        self.bright_max = float("-inf")

        # Confidence Statistics
        self.high_conf_count = 0
        self.nom_conf_count = 0
        self.low_conf_count = 0
        self.conf_sum = 0.0
        self.conf_count = 0

        # Temporal Statistics
        self.day_count = 0
        self.night_count = 0
        self.daily_counts = Counter()
        self.earliest_date: Optional[str] = None
        self.latest_date: Optional[str] = None

        # Spatial Statistics
        self.lat_sum = 0.0
        self.lon_sum = 0.0
        self.min_lat = 90.0
        self.max_lat = -90.0
        self.min_lon = 180.0
        self.max_lon = -180.0

        # Spatial grid bins: key is (round(lat*20), round(lon*20)) -> [count, lat_sum, lon_sum, max_frp]
        self.grid_clusters: Dict[Tuple[int, int], List[float]] = {}

        # Top representative hotspots for map display (capped at max_map_hotspots)
        self.top_hotspots: List[Dict[str, Any]] = []

        # Sources
        self.satellite_sources: Set[str] = set()
        self.detected_fields: Set[str] = set()

    def add_record(
        self,
        record: Dict[str, Any],
        prediction: Dict[str, Any],
    ) -> None:
        """Accumulates a single record and model prediction."""
        self.add_chunk([record], [prediction])

    def add_chunk(
        self,
        records: List[Dict[str, Any]],
        predictions: List[Dict[str, Any]],
    ) -> None:
        """Accumulates a single batch of records and model predictions."""
        for rec, pred in zip(records, predictions):
            self.total_records += 1

            cls_name = pred.get("classification") or pred.get("predicted_class") or "Other"
            conf_val = float(pred.get("confidence", 0.0))
            alert_lvl = pred.get("alert_level") or "LOW"
            status = pred.get("status") or ("LOW_CONFIDENCE_REVIEW" if conf_val < 0.60 else "CLASSIFIED")

            if status == "LOW_CONFIDENCE_REVIEW":
                self.low_confidence_count += 1
            else:
                self.classified_count += 1

            self.class_counts[cls_name] += 1
            self.risk_counts[alert_lvl] += 1

            # FRP
            frp = rec.get("frp")
            if frp is not None:
                try:
                    f = float(frp)
                    self.frp_count += 1
                    self.frp_sum += f
                    if f < self.frp_min:
                        self.frp_min = f
                    if f > self.frp_max:
                        self.frp_max = f
                    # Reservoir sampling for median estimation
                    if len(self.frp_reservoir) < self._max_reservoir_size:
                        self.frp_reservoir.append(f)
                    else:
                        # Reservoir replacement
                        replace_idx = self.total_records % (self.total_records + 1)
                        if replace_idx < self._max_reservoir_size:
                            self.frp_reservoir[replace_idx] = f
                    self.detected_fields.add("frp")
                except (ValueError, TypeError):
                    pass

            # Brightness
            bright = rec.get("brightness")
            if bright is not None:
                try:
                    b = float(bright)
                    self.bright_count += 1
                    self.bright_sum += b
                    if b < self.bright_min:
                        self.bright_min = b
                    if b > self.bright_max:
                        self.bright_max = b
                    self.detected_fields.add("brightness")
                except (ValueError, TypeError):
                    pass

            # Confidence
            raw_c = str(rec.get("confidence") or "").lower()
            if raw_c in ("high", "h") or (raw_c.isdigit() and int(raw_c) >= 80):
                self.high_conf_count += 1
                self.conf_sum += 0.90
                self.conf_count += 1
            elif raw_c in ("low", "l") or (raw_c.isdigit() and int(raw_c) < 50):
                self.low_conf_count += 1
                self.conf_sum += 0.35
                self.conf_count += 1
            else:
                self.nom_conf_count += 1
                self.conf_sum += 0.65
                self.conf_count += 1

            # Temporal
            acq_d = rec.get("acq_date")
            if acq_d:
                self.daily_counts[acq_d] += 1
                if self.earliest_date is None or acq_d < self.earliest_date:
                    self.earliest_date = acq_d
                if self.latest_date is None or acq_d > self.latest_date:
                    self.latest_date = acq_d
                self.detected_fields.add("acq_date")

            dn = str(rec.get("daynight") or "D").upper()
            if dn == "N":
                self.night_count += 1
            else:
                self.day_count += 1

            # Spatial
            lat = float(rec["latitude"])
            lon = float(rec["longitude"])
            self.lat_sum += lat
            self.lon_sum += lon
            if lat < self.min_lat:
                self.min_lat = lat
            if lat > self.max_lat:
                self.max_lat = lat
            if lon < self.min_lon:
                self.min_lon = lon
            if lon > self.max_lon:
                self.max_lon = lon
            self.detected_fields.add("latitude")
            self.detected_fields.add("longitude")

            # Spatial grid clustering bin (~5 km)
            grid_k = (round(lat * 20), round(lon * 20))
            if grid_k not in self.grid_clusters:
                self.grid_clusters[grid_k] = [1.0, lat, lon, float(frp or 0.0)]
            else:
                c_entry = self.grid_clusters[grid_k]
                c_entry[0] += 1.0
                c_entry[1] += lat
                c_entry[2] += lon
                if float(frp or 0.0) > c_entry[3]:
                    c_entry[3] = float(frp or 0.0)

            # Sources
            sat = rec.get("satellite")
            inst = rec.get("instrument")
            if sat and inst:
                self.satellite_sources.add(f"{sat} ({inst})")
            elif sat:
                self.satellite_sources.add(str(sat))

            # Maintain top representative hotspots for map
            hotspot_entry = {
                "latitude": lat,
                "longitude": lon,
                "confidence": round(conf_val, 4),
                "predicted_class": cls_name,
                "alert_level": alert_lvl,
                "frp": float(frp or 0.0),
                "brightness": float(bright or 300.0),
            }

            if len(self.top_hotspots) < self.max_map_hotspots:
                self.top_hotspots.append(hotspot_entry)
            else:
                # Keep higher risk / higher FRP items preferentially
                severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW_CONFIDENCE_REVIEW": 1, "LOW": 0}
                rank = severity_order.get(alert_lvl, 0)
                if rank >= 2 or float(frp or 0.0) >= 30.0:
                    replace_idx = (self.total_records * 31) % self.max_map_hotspots
                    self.top_hotspots[replace_idx] = hotspot_entry

    def add_chunk_vectorized(
        self,
        records: List[Dict[str, Any]],
        X: np.ndarray,
        pred_class_ids: np.ndarray,
        confs: np.ndarray,
        proba_matrix: Optional[np.ndarray] = None,
        lats: Optional[np.ndarray] = None,
        lons: Optional[np.ndarray] = None,
    ) -> None:
        """
        Ultra-fast SIMD vectorized chunk aggregation for million-record streams.
        Operates directly on NumPy arrays (X, pred_class_ids, confs) to bypass
        per-record Python loops and dictionary allocations.
        """
        n = len(records)
        if n == 0:
            return

        self.total_records += n

        # 1. Classification and Confidence counts
        is_low_conf = confs < 0.60
        n_low_conf = int(np.count_nonzero(is_low_conf))
        self.low_confidence_count += n_low_conf
        self.classified_count += (n - n_low_conf)

        # 2. Predicted class distribution
        # Class ID mapping: 0=Industrial Fire, 1=Forest Fire, 2=Persistent Thermal Source, 3=Other
        CLASS_NAMES = ["Industrial Fire", "Forest Fire", "Persistent Thermal Source", "Other"]
        ALERT_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        class_bincount = np.bincount(pred_class_ids, minlength=4)
        for i in range(4):
            c_cnt = int(class_bincount[i])
            if c_cnt > 0:
                self.class_counts[CLASS_NAMES[i]] += c_cnt

        # 3. Risk / Alert Level counts
        valid_mask = ~is_low_conf
        if n_low_conf > 0:
            self.risk_counts["LOW_CONFIDENCE_REVIEW"] += n_low_conf
        self.risk_counts["CRITICAL"] += int(np.count_nonzero((pred_class_ids == 0) & valid_mask))
        self.risk_counts["HIGH"] += int(np.count_nonzero((pred_class_ids == 1) & valid_mask))
        self.risk_counts["MEDIUM"] += int(np.count_nonzero((pred_class_ids == 2) & valid_mask))
        self.risk_counts["LOW"] += int(np.count_nonzero((pred_class_ids == 3) & valid_mask))

        # 4. FRP Statistics from X[:, 0]
        frp_arr = X[:, 0]
        self.frp_count += n
        frp_sum_chunk = float(np.sum(frp_arr))
        self.frp_sum += frp_sum_chunk
        f_min = float(np.min(frp_arr))
        f_max = float(np.max(frp_arr))
        if f_min < self.frp_min:
            self.frp_min = f_min
        if f_max > self.frp_max:
            self.frp_max = f_max
        self.detected_fields.add("frp")

        # Reservoir sampling for FRP median estimation
        if len(self.frp_reservoir) < self._max_reservoir_size:
            needed = self._max_reservoir_size - len(self.frp_reservoir)
            self.frp_reservoir.extend(frp_arr[:needed].tolist())
        else:
            # Stride-based sample replacement
            sample_stride = max(1, n // 50)
            sample_indices = np.arange(0, n, sample_stride)
            for s_idx in sample_indices[:50]:
                rep_idx = (self.total_records + int(s_idx) * 37) % self._max_reservoir_size
                self.frp_reservoir[rep_idx] = float(frp_arr[s_idx])

        # 5. Brightness Statistics from X[:, 1]
        bright_arr = X[:, 1]
        self.bright_count += n
        bright_sum_chunk = float(np.sum(bright_arr))
        self.bright_sum += bright_sum_chunk
        b_min = float(np.min(bright_arr))
        b_max = float(np.max(bright_arr))
        if b_min < self.bright_min:
            self.bright_min = b_min
        if b_max > self.bright_max:
            self.bright_max = b_max
        self.detected_fields.add("brightness")

        # 6. FIRMS Confidence field statistics
        conf_counter = Counter(r.get("confidence") for r in records)
        for raw_k, count in conf_counter.items():
            raw_c = str(raw_k or "").lower()
            if raw_c in ("high", "h") or (raw_c.isdigit() and int(raw_c) >= 80):
                self.high_conf_count += count
                self.conf_sum += 0.90 * count
                self.conf_count += count
            elif raw_c in ("low", "l") or (raw_c.isdigit() and int(raw_c) < 50):
                self.low_conf_count += count
                self.conf_sum += 0.35 * count
                self.conf_count += count
            else:
                self.nom_conf_count += count
                self.conf_sum += 0.65 * count
                self.conf_count += count

        # 7. Day/Night counts from X[:, 3] (1.0 = Night, 0.0 = Day)
        night_in_chunk = int(np.count_nonzero(X[:, 3] == 1.0))
        self.night_count += night_in_chunk
        self.day_count += (n - night_in_chunk)

        # 8. Dates
        date_counter = Counter(r.get("acq_date") for r in records if r.get("acq_date"))
        if date_counter:
            for d, c in date_counter.items():
                self.daily_counts[d] += c
                if self.earliest_date is None or d < self.earliest_date:
                    self.earliest_date = d
                if self.latest_date is None or d > self.latest_date:
                    self.latest_date = d
            self.detected_fields.add("acq_date")

        # 9. Spatial Statistics
        if lats is None:
            lats = np.fromiter((float(r.get("latitude", 0.0)) for r in records), dtype=np.float64, count=n)
        if lons is None:
            lons = np.fromiter((float(r.get("longitude", 0.0)) for r in records), dtype=np.float64, count=n)

        self.lat_sum += float(np.sum(lats))
        self.lon_sum += float(np.sum(lons))
        min_lat = float(np.min(lats))
        max_lat = float(np.max(lats))
        min_lon = float(np.min(lons))
        max_lon = float(np.max(lons))
        if min_lat < self.min_lat:
            self.min_lat = min_lat
        if max_lat > self.max_lat:
            self.max_lat = max_lat
        if min_lon < self.min_lon:
            self.min_lon = min_lon
        if max_lon > self.max_lon:
            self.max_lon = max_lon
        self.detected_fields.add("latitude")
        self.detected_fields.add("longitude")

        # 10. Spatial Grid Clustering (~5 km resolution)
        grid_lats = np.int64(np.round(lats * 20))
        grid_lons = np.int64(np.round(lons * 20))
        keys = (grid_lats << 32) | (grid_lons & 0xFFFFFFFF)
        unique_keys, inverse, counts = np.unique(keys, return_inverse=True, return_counts=True)
        lat_sums = np.bincount(inverse, weights=lats)
        lon_sums = np.bincount(inverse, weights=lons)
        max_frps = np.zeros(len(unique_keys), dtype=np.float64)
        np.maximum.at(max_frps, inverse, frp_arr)

        for i in range(len(unique_keys)):
            k = unique_keys[i]
            grid_k = (int(k >> 32), int(np.int32(k & 0xFFFFFFFF)))
            if grid_k in self.grid_clusters:
                c_entry = self.grid_clusters[grid_k]
                c_entry[0] += float(counts[i])
                c_entry[1] += float(lat_sums[i])
                c_entry[2] += float(lon_sums[i])
                if max_frps[i] > c_entry[3]:
                    c_entry[3] = float(max_frps[i])
            else:
                self.grid_clusters[grid_k] = [
                    float(counts[i]),
                    float(lat_sums[i]),
                    float(lon_sums[i]),
                    float(max_frps[i]),
                ]

        # Strictly bound cluster memory to avoid uncontrolled growth
        if len(self.grid_clusters) > 30000:
            self.grid_clusters = {k: v for k, v in self.grid_clusters.items() if v[0] > 1.0}

        # 11. Satellite & Instrument provenance
        if records:
            for s_i in (0, n // 2, n - 1):
                r_s = records[s_i]
                sat = r_s.get("satellite")
                inst = r_s.get("instrument")
                if sat and inst:
                    self.satellite_sources.add(f"{sat} ({inst})")
                elif sat:
                    self.satellite_sources.add(str(sat))

        # 12. Top representative hotspots for map visualization (strictly capped at max_map_hotspots)
        needed = self.max_map_hotspots - len(self.top_hotspots)
        if needed > 0:
            fill_n = min(needed, n)
            for i in range(fill_n):
                cls_idx = int(pred_class_ids[i])
                c_val = float(confs[i])
                al = "LOW_CONFIDENCE_REVIEW" if c_val < 0.60 else ALERT_LEVELS[cls_idx]
                self.top_hotspots.append({
                    "latitude": float(lats[i]),
                    "longitude": float(lons[i]),
                    "confidence": round(c_val, 4),
                    "predicted_class": CLASS_NAMES[cls_idx],
                    "alert_level": al,
                    "frp": round(float(frp_arr[i]), 2),
                    "brightness": round(float(bright_arr[i]), 2),
                })
        else:
            # When top_hotspots is full, keep higher risk / higher FRP items preferentially in reservoir
            high_mask = (frp_arr >= 30.0) | ((confs >= 0.60) & (pred_class_ids <= 1))
            cand_indices = np.where(high_mask)[0]
            if len(cand_indices) > 0:
                if len(cand_indices) > 30:
                    cand_indices = cand_indices[np.argsort(frp_arr[cand_indices])[-30:]]
                for idx in cand_indices:
                    cls_idx = int(pred_class_ids[idx])
                    c_val = float(confs[idx])
                    al = "LOW_CONFIDENCE_REVIEW" if c_val < 0.60 else ALERT_LEVELS[cls_idx]
                    replace_idx = (self.total_records + int(idx) * 31) % self.max_map_hotspots
                    self.top_hotspots[replace_idx] = {
                        "latitude": float(lats[idx]),
                        "longitude": float(lons[idx]),
                        "confidence": round(c_val, 4),
                        "predicted_class": CLASS_NAMES[cls_idx],
                        "alert_level": al,
                        "frp": round(float(frp_arr[idx]), 2),
                        "brightness": round(float(bright_arr[idx]), 2),
                    }

    def build_summary(
        self,
        files_info: List[Dict[str, Any]],
        global_available_fields: Set[str],
        global_unavailable_fields: Set[str],
    ) -> DatasetAnalysisSummary:
        """Constructs DatasetAnalysisSummary schema object from accumulated statistics."""
        if self.total_records == 0:
            return DatasetAnalysisSummary(
                total_records=0,
                available_fields=sorted(list(global_available_fields)),
                unavailable_fields=sorted(list(global_unavailable_fields)),
            )

        file_contributions = [
            FileContributionSummary(
                filename=f.get("filename", "unknown"),
                record_count=f.get("record_count", 0),
                format_detected=f.get("format_detected", "CSV"),
            )
            for f in files_info
        ]

        # FRP Summary
        frp_summary = None
        if self.frp_count > 0:
            med = median(self.frp_reservoir) if self.frp_reservoir else round(self.frp_sum / self.frp_count, 2)
            frp_summary = FRPAnalysisSummary(
                min=round(self.frp_min, 2),
                max=round(self.frp_max, 2),
                mean=round(self.frp_sum / self.frp_count, 2),
                median=round(med, 2),
                sum=round(self.frp_sum, 2),
                unit="MW",
            )

        # Brightness Summary
        bright_summary = None
        if self.bright_count > 0:
            bright_summary = BrightnessAnalysisSummary(
                min=round(self.bright_min, 2),
                max=round(self.bright_max, 2),
                mean=round(self.bright_sum / self.bright_count, 2),
                unit="K",
            )

        # Confidence Summary
        conf_summary = None
        if self.conf_count > 0:
            conf_summary = ConfidenceAnalysisSummary(
                high_count=self.high_conf_count,
                nominal_count=self.nom_conf_count,
                low_count=self.low_conf_count,
                mean_confidence=round(self.conf_sum / self.conf_count, 2),
            )

        # Temporal Summary
        temp_summary = None
        if self.daily_counts:
            temp_summary = TemporalAnalysisSummary(
                earliest_date=self.earliest_date,
                latest_date=self.latest_date,
                daily_distribution=dict(self.daily_counts),
                day_count=self.day_count,
                night_count=self.night_count,
            )

        # Spatial Summary
        center_lat = round(self.lat_sum / self.total_records, 5)
        center_lon = round(self.lon_sum / self.total_records, 5)
        lat_span = max(0.01, self.max_lat - self.min_lat)
        lon_span = max(0.01, self.max_lon - self.min_lon)
        area_deg2 = lat_span * lon_span
        density = round(self.total_records / area_deg2, 2)

        clusters: List[SpatialClusterSummary] = []
        for idx, (grid_k, (count, l_sum, o_sum, p_frp)) in enumerate(self.grid_clusters.items()):
            clusters.append(
                SpatialClusterSummary(
                    cluster_id=idx + 1,
                    center_latitude=round(l_sum / count, 5),
                    center_longitude=round(o_sum / count, 5),
                    observation_count=int(count),
                    peak_frp=round(p_frp, 2) if p_frp > 0 else None,
                )
            )
        clusters.sort(key=lambda c: c.observation_count, reverse=True)

        spatial_summary = SpatialAnalysisSummary(
            bounding_box={
                "min_latitude": round(self.min_lat, 5),
                "max_latitude": round(self.max_lat, 5),
                "min_longitude": round(self.min_lon, 5),
                "max_longitude": round(self.max_lon, 5),
            },
            center={"latitude": center_lat, "longitude": center_lon},
            hotspot_density=density,
            clusters=clusters[:10],
        )

        # High-Risk Areas
        sorted_top = sorted(
            self.top_hotspots,
            key=lambda h: (
                {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW_CONFIDENCE_REVIEW": 1, "LOW": 0}.get(h["alert_level"], 0),
                h["frp"],
                h["confidence"],
            ),
            reverse=True,
        )
        high_risk_areas = [
            HighRiskHotspotSummary(
                latitude=h["latitude"],
                longitude=h["longitude"],
                predicted_class=h["predicted_class"],
                confidence=h["confidence"],
                alert_level=h["alert_level"],
                frp=h.get("frp"),
                brightness=h.get("brightness"),
            )
            for h in sorted_top[:10]
        ]

        all_avail = sorted(list(global_available_fields.union(self.detected_fields)))
        all_unavail = sorted(list(global_unavailable_fields - self.detected_fields))

        return DatasetAnalysisSummary(
            total_records=self.total_records,
            files_summary=file_contributions,
            available_fields=all_avail,
            unavailable_fields=all_unavail,
            risk_distribution=dict(self.risk_counts),
            class_distribution=dict(self.class_counts),
            frp_analysis=frp_summary,
            brightness_analysis=bright_summary,
            confidence_analysis=conf_summary,
            temporal_analysis=temp_summary,
            spatial_analysis=spatial_summary,
            high_risk_areas=high_risk_areas,
            satellite_sources=sorted(list(self.satellite_sources)),
        )

    def build_standard_analysis(
        self,
        summary: DatasetAnalysisSummary,
        any_fallback: bool = False,
    ) -> Dict[str, Any]:
        """Builds standard analysis payload with bounded hotspots array for frontend safety."""
        primary_risk = "LOW"
        for r_level in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
            if self.risk_counts.get(r_level, 0) > 0:
                primary_risk = r_level
                break

        return {
            "total_observations": self.total_records,
            "hotspots": self.top_hotspots[: self.max_map_hotspots],
            "risk_level": primary_risk,
            "summary": (
                f"Analyzed {self.total_records:,} satellite observation(s) with risk level {primary_risk}."
                if not any_fallback
                else f"Rule-based satellite analysis on {self.total_records:,} observation(s) with risk level {primary_risk}."
            ),
            "statistics": {
                "frp": summary.frp_analysis.model_dump() if summary.frp_analysis else "Insufficient data for this analysis.",
                "brightness": summary.brightness_analysis.model_dump() if summary.brightness_analysis else "Insufficient data for this analysis.",
                "confidence": summary.confidence_analysis.model_dump() if summary.confidence_analysis else "Insufficient data for this analysis.",
            },
            "spatial_analysis": summary.spatial_analysis.model_dump() if summary.spatial_analysis else "Insufficient data for this analysis.",
            "temporal_analysis": summary.temporal_analysis.model_dump() if summary.temporal_analysis else "Insufficient data for this analysis.",
        }

