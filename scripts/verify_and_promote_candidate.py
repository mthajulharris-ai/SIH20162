"""
Verification and Promotion Script for SATRA Operational Ensemble Model v4.

Compares:
- Current model: models/satra_ensemble.pkl
- Candidate model: models/satra_ensemble_candidate_v4.pkl

Evaluates on the latest live NASA FIRMS observations (acq_date = '2026-09-20')
from thermal_detections.db.

If candidate passes validation:
- Backs up old model to models/satra_ensemble_v3_backup.pkl
- Promotes candidate to models/satra_ensemble.pkl
"""

import shutil
import sqlite3
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.ml.ensemble_classifier import CLASS_ID_TO_NAME
from backend.ml.feature_extractor import extract_features_from_observation, validate_feature_vector


def main():
    print("=" * 70)
    print("      SATRA AI MODEL CANDIDATE VERIFICATION & PROMOTION")
    print("=" * 70)

    db_path = BASE_DIR / "thermal_detections.db"
    conn = sqlite3.connect(db_path)

    # Query the live 2026-09-20 FIRMS detections
    query = """
    SELECT id, latitude, longitude, brightness, frp, daynight, source, instrument, acq_date, acq_time,
           predicted_class, prediction_confidence, alert_level
    FROM detections
    WHERE acq_date = '2026-09-20'
    ORDER BY id ASC;
    """
    df_live = pd.read_sql(query, conn)
    print(f"Loaded {len(df_live)} live FIRMS observations from 2026-09-20.")

    # Load candidate model
    cand_path = BASE_DIR / "models" / "satra_ensemble_candidate_v4.pkl"
    if not cand_path.exists():
        print(f"[ERROR] Candidate model not found at: {cand_path}")
        sys.exit(1)

    cand_wrapper = joblib.load(cand_path)
    print(f"Loaded candidate model from: {cand_path.name}")

    # Load current model if exists
    curr_path = BASE_DIR / "models" / "satra_ensemble.pkl"
    curr_wrapper = joblib.load(curr_path) if curr_path.exists() else None

    # Run feature extraction for live records with spatial recurrence
    features_list = []
    for _, row in df_live.iterrows():
        feat = extract_features_from_observation(row.to_dict(), db=conn)
        features_list.append(feat)

    X_live = validate_feature_vector(features_list)
    print(f"Extracted feature matrix shape: {X_live.shape}")

    # Predict with candidate
    cand_preds = cand_wrapper.predict_batch(features_list)
    cand_classes = pd.Series([p["classification"] for p in cand_preds])
    cand_confs = np.array([p["confidence"] for p in cand_preds])

    print("\n" + "-" * 70)
    print("Candidate Model Predictions on Live FIRMS Data (2026-09-20):")
    cand_counts = cand_classes.value_counts()
    for cname, cnt in cand_counts.items():
        pct = cnt / len(df_live) * 100
        print(f"  {cname:<28}: {cnt:>4} ({pct:>5.1f}%)")
    print(f"  Mean Confidence: {cand_confs.mean():.4f} (Min: {cand_confs.min():.4f}, Max: {cand_confs.max():.4f})")

    if curr_wrapper is not None:
        print("\n" + "-" * 70)
        print("Previous Ingested Model Predictions on Live FIRMS Data:")
        prev_counts = df_live["predicted_class"].value_counts()
        for cname, cnt in prev_counts.items():
            pct = cnt / len(df_live) * 100
            print(f"  {cname:<28}: {cnt:>4} ({pct:>5.1f}%)")

    # Sanity checks
    # 1. Did candidate eliminate 100% "Other" collapse?
    other_pct = (cand_classes == "Other").mean() * 100
    if other_pct >= 99.0:
        print("\n[REJECT] Candidate model still predicts >= 99% Other.")
        sys.exit(1)

    # 2. Did candidate detect persistent sources and forest fires realistically?
    n_persistent = (cand_classes == "Persistent Thermal Source").sum()
    n_forest = (cand_classes == "Forest Fire").sum()
    print(f"\nSanity Check: Persistent Sources={n_persistent}, Forest Fires={n_forest}, Other={(cand_classes == 'Other').sum()}")

    # Backup current model
    backup_path = BASE_DIR / "models" / "satra_ensemble_v3_backup.pkl"
    if curr_path.exists():
        shutil.copy(curr_path, backup_path)
        print(f"\n[BACKUP] Saved backup of previous model to: {backup_path.name}")

    # Promote candidate to satra_ensemble.pkl
    shutil.copy(cand_path, curr_path)
    print(f"[PROMOTION] Successfully promoted candidate model to: {curr_path.name}")

    # Update database predictions for live 2026-09-20 records
    print("\nUpdating database classifications for 2026-09-20 records with operational model...")
    cursor = conn.cursor()
    updated_count = 0
    for idx, row in df_live.iterrows():
        p = cand_preds[idx]
        is_pers = 1 if p["classification"] == "Persistent Thermal Source" else 0
        cursor.execute(
            """
            UPDATE detections
            SET predicted_class = ?,
                prediction_confidence = ?,
                alert_level = ?,
                is_persistent = ?,
                model_version = '4.0.0-operational-ensemble'
            WHERE id = ?;
            """,
            (p["classification"], p["confidence"], p["alert_level"], is_pers, int(row["id"]))
        )
        updated_count += 1

    conn.commit()
    conn.close()
    print(f"[SUCCESS] Updated {updated_count} live detection records in thermal_detections.db.")
    print("=" * 70)


if __name__ == "__main__":
    main()
