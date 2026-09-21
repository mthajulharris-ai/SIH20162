"""
Builds the Operational Labelled Dataset for SATRA Ensemble Classifier.
Extracts 30,000 diverse real NASA FIRMS satellite observations from thermal_detections.db,
computes canonical 8 features (including multi-temporal spatial recurrence & persistence),
and applies the transparent 4-class prototype labeling taxonomy.

Canonical Classes:
0 = Industrial Fire
1 = Forest Fire
2 = Persistent Thermal Source
3 = Other

Provenance: PROTOTYPE_LABELLED
"""

import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.ml.feature_extractor import REQUIRED_FEATURES, validate_feature_vector
from src.data_pipeline.dataset_builder import CLASS_MAP

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_operational_dataset")

DB_PATH = BASE_DIR / "thermal_detections.db"
OUTPUT_CSV = BASE_DIR / "data" / "processed" / "operational_labeled_dataset.csv"
OUTPUT_META = BASE_DIR / "data" / "processed" / "operational_dataset_metadata.json"


def build_operational_dataset(sample_size: int = 30000):
    logger.info("Connecting to database: %s", DB_PATH)
    conn = sqlite3.connect(DB_PATH)

    # Ensure index exists
    conn.execute("CREATE INDEX IF NOT EXISTS idx_det_lat_lon_date ON detections(latitude, longitude, acq_date);")
    conn.commit()

    logger.info("Extracting diverse stratified sample of %d real satellite observations...", sample_size)
    query = f"""
    WITH cluster_agg AS (
        SELECT 
            ROUND(latitude, 2) as lat_c,
            ROUND(longitude, 2) as lon_c,
            COUNT(*) as total_obs,
            COUNT(DISTINCT acq_date) as active_days,
            AVG(frp) as cluster_mean_frp,
            MAX(frp) as cluster_max_frp,
            AVG(brightness) as cluster_mean_bright
        FROM detections
        GROUP BY lat_c, lon_c
    )
    SELECT 
        d.id,
        d.latitude,
        d.longitude,
        d.brightness,
        d.frp,
        d.daynight,
        d.source,
        d.instrument,
        d.acq_date,
        d.acq_time,
        c.total_obs as recurrence_count,
        c.active_days,
        c.cluster_mean_frp,
        c.cluster_max_frp
    FROM detections d
    JOIN cluster_agg c ON ROUND(d.latitude, 2) = c.lat_c AND ROUND(d.longitude, 2) = c.lon_c
    WHERE d.frp IS NOT NULL AND d.brightness IS NOT NULL AND d.frp > 0
    ORDER BY RANDOM()
    LIMIT {sample_size};
    """

    df = pd.read_sql_query(query, conn)
    conn.close()

    df = df.drop_duplicates(subset=["id"]).copy()
    logger.info("Extracted %d unique real satellite observations.", len(df))

    # Compute derived physical features
    df["persistence_ratio"] = (df["active_days"] / 90.0).clip(0.0, 1.0)
    df["observation_density"] = df["frp"] / 0.14  # standard 375m VIIRS footprint area ~ 0.14 km^2
    df["delta_T"] = np.maximum(0.0, df["brightness"] - 300.0)
    df["day_night_flag"] = (df["daynight"].astype(str).str.strip().str.upper() == "N").astype(float)
    df["cluster_intensity"] = df["recurrence_count"] * df["cluster_mean_frp"].fillna(df["frp"])
    df["frp_ratio"] = df["frp"] / df["cluster_mean_frp"].replace(0, 10.0)

    # 4-Class Prototype Labelling Rule-Engine
    # 0 = Industrial Fire
    # 1 = Forest Fire
    # 2 = Persistent Thermal Source
    # 3 = Other
    labels = []
    label_names = []
    rationale = []

    for idx, r in df.iterrows():
        frp = r['frp']
        bright = r['brightness']
        act_days = r['active_days']
        rec_count = r['recurrence_count']
        mean_frp = r['cluster_mean_frp'] if r['cluster_mean_frp'] > 0 else frp

        # 1. Industrial Fire (Class 0): acute flare-up at recurring facility
        if (act_days >= 3 or rec_count >= 5) and ((frp >= 2.0 * mean_frp and frp >= 25.0) or (frp >= 80.0 and bright >= 340.0)):
            labels.append(0)
            label_names.append("Industrial Fire")
            rationale.append("RULE_INDUSTRIAL_FIRE_FACILITY_SURGE")
        # 2. Persistent Thermal Source (Class 2): high multi-temporal recurrence with steady emissions
        elif (act_days >= 8 or rec_count >= 15) and (frp <= 2.2 * mean_frp):
            labels.append(2)
            label_names.append("Persistent Thermal Source")
            rationale.append("RULE_PERSISTENT_SPATIAL_CLUSTER")
        # 3. Forest Fire (Class 1): transient wildfire front with elevated thermal energy
        elif act_days <= 3 and ((bright >= 328.0 and frp >= 15.0) or (bright >= 340.0 and frp >= 10.0)):
            labels.append(1)
            label_names.append("Forest Fire")
            rationale.append("RULE_FOREST_FIRE_THERMAL_SIGNATURE")
        # 4. Other (Class 3): transient agricultural / stubble / low-power hotspots
        else:
            labels.append(3)
            label_names.append("Other")
            rationale.append("RULE_TRANSIENT_OTHER")

    df["target_class"] = labels
    df["target_label"] = label_names
    df["label_rationale"] = rationale
    df["data_provenance"] = "PROTOTYPE_LABELLED"

    # Assign spatial cluster group for spatial holdout split (~5.5 km grid)
    df["spatial_cluster_id"] = (
        np.round(df["latitude"] / 0.05).astype(str) + "_" +
        np.round(df["longitude"] / 0.05).astype(str)
    )

    # Standardize column names for canonical features
    df["FRP"] = df["frp"]
    df["T4"] = df["brightness"]

    # Validate feature vector
    X = validate_feature_vector(df[REQUIRED_FEATURES])
    logger.info("Validated feature matrix shape: %s", X.shape)

    # Export dataset
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    logger.info("Saved operational labelled dataset to: %s", OUTPUT_CSV)

    # Class distribution
    dist = {CLASS_MAP[c]: int(labels.count(c)) for c in range(4)}
    logger.info("Class distribution: %s", dist)

    metadata = {
        "dataset_name": "SATRA Operational Labeled Dataset",
        "provenance": "PROTOTYPE_LABELLED",
        "total_observations": len(df),
        "spatial_clusters_count": int(df["spatial_cluster_id"].nunique()),
        "class_distribution": dist,
        "features": REQUIRED_FEATURES,
        "source_database": str(DB_PATH.name),
        "source_satellites": list(df["source"].unique()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "integrity_notice": "NASA FIRMS provides physical radiometric measurements. Ground-truth fire causation is prototype-labelled."
    }

    with open(OUTPUT_META, "w") as f:
        json.dump(metadata, f, indent=2)
    logger.info("Saved metadata to: %s", OUTPUT_META)

    return df, metadata


if __name__ == "__main__":
    build_operational_dataset()
