"""
Scientific AI/ML Training, Cross-Validation, and Model Selection Script (Phase 3).

Demonstrates and enforces:
1. Complete data provenance separation (PROVENANCE_PROTOTYPE_LABELLED)
2. Transparent, rule-traceable prototype heuristic labeling
3. Strict spatial data leakage prevention via StratifiedGroupKFold on spatial_cluster_id
4. Multi-model candidate comparison (Logistic Regression, Random Forest, HistGradientBoosting)
5. Non-accuracy metric optimization (Macro F1 and Industrial Fire Recall)
6. Model versioning as 2.0.0-scientific-prototype without overwriting baseline 1.0.0
7. Comprehensive metadata serialization
"""

import json
import logging
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.config import (
    MODELS_DIR,
    PROCESSED_DATA_DIR,
    SAMPLES_DATA_DIR,
    PROVENANCE_PROTOTYPE_LABELLED
)
from src.data_pipeline.dataset_builder import (
    CLASS_MAP,
    ML_FEATURE_NAMES,
    PrototypeLabelingConfig,
    assign_prototype_labels,
    split_ml_dataset
)
from src.data_pipeline.feature_engineering import compute_spatial_grid_clusters
from src.ml.evaluate import evaluate_classifier
from src.ml.train import (
    cross_validate_and_select_best,
    get_candidate_models,
    save_trained_model
)


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def main():
    setup_logging()
    print("=" * 68)
    print("   SIH PS 26162: SCIENTIFIC AI/ML VALIDATION & MODEL IMPROVEMENT")
    print("   Model Version: 2.0.0-scientific-prototype")
    print("=" * 68)

    # 1. Load benchmark dataset
    dataset_path = SAMPLES_DATA_DIR / "prototype_labeled_dataset.csv"
    print(f"\n[STEP 1] Loading benchmark dataset from: {dataset_path.name}")
    df_raw = pd.read_csv(dataset_path, comment="#")
    print(f"Total Observations: {len(df_raw)}")

    # Ensure spatial cluster IDs are present for spatial leakage prevention
    if "spatial_cluster_id" not in df_raw.columns:
        df_raw = compute_spatial_grid_clusters(df_raw, grid_size_deg=0.01)

    unique_clusters = df_raw["spatial_cluster_id"].nunique()
    print(f"Distinct Spatial Facility Clusters: {unique_clusters}")

    # 2. Assign prototype labels with full rule traceability
    print("\n[STEP 2] Applying Transparent Prototype Heuristic Labeling...")
    config = PrototypeLabelingConfig(
        persistence_threshold=0.35,
        recurrence_min=3,
        industrial_loc_recurrence_min=2,
        industrial_loc_persistence_min=0.25,
        frp_spike_ratio_threshold=2.2,
        frp_spike_zscore_threshold=2.0,
        absolute_fire_frp_min=80.0,
        absolute_fire_brightness_min=350.0,
        allow_unverified=False
    )
    df_labeled = assign_prototype_labels(df_raw, config=config)

    print("\nLabel Distribution & Rule Traceability:")
    for rule, count in df_labeled["label_rationale"].value_counts().items():
        print(f"  - {rule:<38} : {count:>3} records")

    print("\nTarget Class Distribution:")
    for cls_name, count in df_labeled["target_label"].value_counts().items():
        print(f"  - {cls_name:<26} : {count:>3} records ({count/len(df_labeled)*100:.1f}%)")

    # 3. Spatial Group Split (Zero Geographic Leakage)
    print("\n[STEP 3] Performing Leakage-Free Stratified Group Split...")
    X_train, X_val, X_test, y_train, y_val, y_test, split_summary = split_ml_dataset(
        df_labeled,
        features=ML_FEATURE_NAMES,
        target_col="target_class",
        split_strategy="stratified_group",
        test_size=0.20,
        val_size=0.20,
        random_state=42
    )

    clusters_train = set(df_labeled.loc[X_train.index, "spatial_cluster_id"])
    clusters_val = set(df_labeled.loc[X_val.index, "spatial_cluster_id"])
    clusters_test = set(df_labeled.loc[X_test.index, "spatial_cluster_id"])

    leakage_train_test = len(clusters_train.intersection(clusters_test))
    leakage_train_val = len(clusters_train.intersection(clusters_val))
    leakage_val_test = len(clusters_val.intersection(clusters_test))

    print(f"Train Set:      {len(X_train):>2} samples across {len(clusters_train):>2} spatial clusters")
    print(f"Validation Set: {len(X_val):>2} samples across {len(clusters_val):>2} spatial clusters")
    print(f"Test Set:       {len(X_test):>2} samples across {len(clusters_test):>2} spatial clusters")
    print(f"Spatial Cluster Overlap Verification: Train-Test={leakage_train_test}, Train-Val={leakage_train_val}, Val-Test={leakage_val_test}")
    assert leakage_train_test == 0 and leakage_train_val == 0 and leakage_val_test == 0, "Spatial Leakage Detected!"
    print("[LEAKAGE CHECK] PASSED: ZERO geographic clusters overlap across splits.")

    # 4. Multi-Model Candidate Cross-Validation
    print("\n[STEP 4] Cross-Validating Candidate Architectures (Stratified Group CV)...")
    X_train_val = pd.concat([X_train, X_val], ignore_index=True)
    y_train_val = pd.concat([y_train, y_val], ignore_index=True)
    groups_train_val = df_labeled.loc[list(X_train.index) + list(X_val.index), "spatial_cluster_id"].values

    best_model_name, cv_results = cross_validate_and_select_best(
        X=X_train_val,
        y=y_train_val,
        groups=groups_train_val,
        n_splits=4,
        random_state=42
    )

    print("\n" + "-" * 68)
    print(f"{'Model Architecture':<24} {'Macro F1':<12} {'Fire Recall':<14} {'Accuracy':<10}")
    print("-" * 68)
    for name, res in cv_results.items():
        winner_tag = " [WINNER]" if name == best_model_name else ""
        print(
            f"{name:<24} {res['mean_macro_f1']:.4f} (+/-{res['std_macro_f1']:.2f}) "
            f"{res['mean_industrial_fire_recall']:<14.4f} {res['mean_accuracy']:<10.4f}{winner_tag}"
        )
    print("-" * 68)

    # 5. Retrain Selected Winner and Evaluate on Unseen Hold-Out Test Set
    print(f"\n[STEP 5] Retraining Selected Winner: {best_model_name} on Combined Train+Val ({len(X_train_val)} samples)...")
    candidates = get_candidate_models(random_state=42)
    final_pipeline = candidates[best_model_name]
    final_pipeline.fit(X_train_val, y_train_val)

    print("\n[STEP 6] Final Unbiased Evaluation on Held-Out Spatial Test Set...")
    test_metrics = evaluate_classifier(
        final_pipeline,
        X_test,
        y_test,
        model_name=best_model_name,
        dataset_split="test"
    )
    print("\n" + test_metrics.to_text_report())

    # 6. Model Serialization with Version 2.0.0-scientific-prototype
    version_tag = "2.0.0-scientific-prototype"
    filename = "satellite_fire_classifier_v2.joblib"
    print(f"\n[STEP 7] Serializing Model Version: {version_tag} -> {filename}...")

    saved_model_path, saved_meta_path = save_trained_model(
        model_pipeline=final_pipeline,
        model_name=best_model_name,
        test_metrics=test_metrics,
        feature_names=ML_FEATURE_NAMES,
        filename=filename,
        model_version=version_tag,
        data_provenance=PROVENANCE_PROTOTYPE_LABELLED,
        split_methodology="Stratified Group Split (StratifiedGroupKFold on spatial_cluster_id)",
        training_sample_count=len(X_train_val),
        validation_metrics=cv_results,
        scientific_limitations=[
            "Trained and evaluated on prototype-labeled data; does NOT represent certified ground truth.",
            "NASA FIRMS provides physical radiometric observations, NOT incident root-cause labels.",
            "Operational alerts must carry REQUIRES_VERIFICATION until confirmed by local industrial authority."
        ]
    )

    print(f"Model Artifact:  {saved_model_path}")
    print(f"Model Metadata:  {saved_meta_path}")
    print("\n" + "=" * 68)
    print("   SCIENTIFIC AI/ML VALIDATION & MODEL IMPROVEMENT COMPLETE")
    print("=" * 68)


if __name__ == "__main__":
    main()
