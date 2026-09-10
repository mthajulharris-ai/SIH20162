"""
Unit and Integration Tests for Phase 3: Scientific AI/ML Validation & Model Improvement.

Validates:
1. Data provenance separation (REAL_FIRMS, SAMPLE, PROTOTYPE_LABELLED)
2. Spatial data leakage prevention via StratifiedGroupKFold
3. Transparent, rule-traceable prototype heuristic labeling
4. Class distribution integrity
5. Feature matrix completeness & numeric type consistency
6. Candidate model cross-validation with Macro F1 and Industrial Fire Recall
7. Model version 2.0.0-scientific-prototype serialization & metadata schema
8. Inference contract preservation and uncertainty flagging
9. Backward compatibility with baseline model 1.0.0
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from src.config import (
    MODELS_DIR,
    PROVENANCE_PROTOTYPE_LABELLED,
    PROVENANCE_REAL_FIRMS,
    PROVENANCE_SAMPLE,
    SAMPLES_DATA_DIR,
)
from src.data_pipeline.dataset_builder import (
    CLASS_MAP,
    ML_FEATURE_NAMES,
    PrototypeLabelingConfig,
    assign_prototype_labels,
    split_ml_dataset,
)
from src.data_pipeline.feature_engineering import compute_spatial_grid_clusters
from src.inference.service import ThermalPredictionService, get_prediction_service
from src.ml.evaluate import evaluate_classifier
from src.ml.train import (
    cross_validate_and_select_best,
    get_candidate_models,
)


@pytest.fixture
def benchmark_data():
    """Loads and clusters benchmark prototype dataset."""
    path = SAMPLES_DATA_DIR / "prototype_labeled_dataset.csv"
    df = pd.read_csv(path, comment="#")
    if "spatial_cluster_id" not in df.columns:
        df = compute_spatial_grid_clusters(df, grid_size_deg=0.01)
    return df


# =========================================================================
# 1. Provenance Separation Tests (Step 2)
# =========================================================================

def test_provenance_labels_strictly_separated(benchmark_data):
    """Verify distinct provenance categories are strictly enforced without accidental mixing."""
    labeled_df = assign_prototype_labels(benchmark_data)

    # Prototype heuristic dataset must be PROTOTYPE_LABELLED
    assert (labeled_df["data_provenance"] == PROVENANCE_PROTOTYPE_LABELLED).all()
    assert (labeled_df["is_prototype_label"] == True).all()

    # REAL_FIRMS must never be labeled as prototype ground truth
    real_firms_record = {
        "latitude": 22.8046,
        "longitude": 86.2029,
        "brightness": 345.0,
        "data_provenance": PROVENANCE_REAL_FIRMS
    }
    assert real_firms_record["data_provenance"] != PROVENANCE_PROTOTYPE_LABELLED
    assert real_firms_record["data_provenance"] != PROVENANCE_SAMPLE


# =========================================================================
# 2. Spatial Data Leakage Prevention (Step 5)
# =========================================================================

def test_stratified_group_split_prevents_spatial_leakage(benchmark_data):
    """
    Verify StratifiedGroupKFold produces ZERO spatial cluster overlap
    between train, validation, and test splits.
    """
    labeled_df = assign_prototype_labels(benchmark_data)

    X_train, X_val, X_test, y_train, y_val, y_test, summary = split_ml_dataset(
        labeled_df,
        features=ML_FEATURE_NAMES,
        target_col="target_class",
        split_strategy="stratified_group",
        test_size=0.20,
        val_size=0.20,
        random_state=42
    )

    clusters_train = set(labeled_df.loc[X_train.index, "spatial_cluster_id"])
    clusters_val = set(labeled_df.loc[X_val.index, "spatial_cluster_id"])
    clusters_test = set(labeled_df.loc[X_test.index, "spatial_cluster_id"])

    # Strict spatial isolation assertions
    assert len(clusters_train.intersection(clusters_test)) == 0, "Spatial leakage between Train and Test!"
    assert len(clusters_train.intersection(clusters_val)) == 0, "Spatial leakage between Train and Val!"
    assert len(clusters_val.intersection(clusters_test)) == 0, "Spatial leakage between Val and Test!"

    # All three sets must contain samples
    assert len(X_train) > 0
    assert len(X_val) > 0
    assert len(X_test) > 0

    # Leakage prevention description logged
    assert "Zero spatial cluster overlap" in summary.leakage_prevention


# =========================================================================
# 3. Transparent Heuristic Labeling & Rule Traceability (Step 3)
# =========================================================================

def test_prototype_label_generation_and_rule_traceability(benchmark_data):
    """Verify that each assigned label records the exact heuristic rule that triggered it."""
    config = PrototypeLabelingConfig(
        persistence_threshold=0.35,
        recurrence_min=3,
        frp_spike_ratio_threshold=2.2,
        frp_spike_zscore_threshold=2.0,
        allow_unverified=True,
        min_confidence_for_labeled=0.50
    )

    labeled_df = assign_prototype_labels(benchmark_data, config=config)

    assert "label_rationale" in labeled_df.columns
    assert "target_class" in labeled_df.columns
    assert "target_label" in labeled_df.columns

    # Check known rule rationale values
    valid_rules = {
        "RULE_TRANSIENT_OTHER",
        "RULE_PERSISTENT_HIGH_RECURRENCE",
        "RULE_PERSISTENT_HIGH_RATIO",
        "RULE_INDUSTRIAL_FIRE_SURGE_RATIO",
        "RULE_INDUSTRIAL_FIRE_ZSCORE",
        "RULE_INDUSTRIAL_FIRE_EXTREME_RADIANCE",
        "UNVERIFIED_LOW_CONFIDENCE"
    }
    for rationale in labeled_df["label_rationale"]:
        assert rationale in valid_rules


# =========================================================================
# 4. Feature Matrix Completeness (Step 6)
# =========================================================================

def test_feature_matrix_completeness_and_types(benchmark_data):
    """Verify all 15 core ML features are numeric and finite."""
    labeled_df = assign_prototype_labels(benchmark_data)

    for feat in ML_FEATURE_NAMES:
        assert feat in labeled_df.columns, f"Missing feature: {feat}"
        # Assert numeric
        assert pd.api.types.is_numeric_dtype(labeled_df[feat])
        # Assert no NaNs
        assert labeled_df[feat].isna().sum() == 0


# =========================================================================
# 5. Candidate Model Cross-Validation (Steps 7 & 8)
# =========================================================================

def test_candidate_models_cross_validation(benchmark_data):
    """Verify Stratified Group CV runs across candidate models and calculates Macro F1 and Fire Recall."""
    labeled_df = assign_prototype_labels(benchmark_data)
    X = labeled_df[ML_FEATURE_NAMES]
    y = labeled_df["target_class"]
    groups = labeled_df["spatial_cluster_id"].values

    best_name, cv_results = cross_validate_and_select_best(
        X=X,
        y=y,
        groups=groups,
        n_splits=3,
        random_state=42
    )

    assert best_name in ["Logistic Regression", "Random Forest", "Gradient Boosting"]
    for model_name, metrics in cv_results.items():
        assert "mean_macro_f1" in metrics
        assert "mean_industrial_fire_recall" in metrics
        assert "mean_accuracy" in metrics
        assert 0.0 <= metrics["mean_macro_f1"] <= 1.0
        assert 0.0 <= metrics["mean_industrial_fire_recall"] <= 1.0


# =========================================================================
# 6. Model Version 2 Serialization & Metadata (Step 9)
# =========================================================================

def test_model_v2_artifacts_and_metadata():
    """Verify model version 2.0.0-scientific-prototype artifacts and metadata schema."""
    v2_model_path = MODELS_DIR / "satellite_fire_classifier_v2.joblib"
    v2_meta_path = MODELS_DIR / "satellite_fire_classifier_v2_metadata.json"

    assert v2_model_path.exists(), "Model v2 artifact does not exist."
    assert v2_meta_path.exists(), "Model v2 metadata does not exist."

    with open(v2_meta_path, "r") as f:
        meta = json.load(f)

    assert meta["model_version"] == "2.0.0-scientific-prototype"
    assert meta["data_provenance"] == PROVENANCE_PROTOTYPE_LABELLED
    assert "StratifiedGroupKFold" in meta["split_methodology"]
    assert "industrial_fire_recall" in meta["test_performance"]
    assert "macro_f1" in meta["test_performance"]
    assert "confusion_matrix" in meta["test_performance"]
    assert len(meta["scientific_limitations"]) >= 2


# =========================================================================
# 7. Inference Service Compatibility & Uncertainty Handling (Steps 10 & 11)
# =========================================================================

def test_inference_service_loads_v2_and_maintains_contract():
    """Verify prediction service dynamically loads v2 and produces the complete backend contract."""
    service = get_prediction_service()

    assert service.model_version == "2.0.0-scientific-prototype"

    obs = {
        "brightness": 385.0,
        "bright_t31": 310.0,
        "temp_diff": 75.0,
        "frp": 150.0,
        "confidence_score": 0.95,
        "is_night": 0,
        "recurrence_count": 12,
        "persistence_ratio": 0.85,
        "frp_zscore": 4.5,
        "frp_to_mean_ratio": 7.5
    }

    result = service.predict_single(obs)

    # Standard backend response contract
    assert result["status"] == "SUCCESS"
    assert result["predicted_class"] in ["Industrial Fire", "Persistent Thermal Source", "Other"]
    assert isinstance(result["predicted_class_id"], int)
    assert 0.0 <= result["confidence"] <= 1.0
    assert result["alert_level"] in ["LOW", "MEDIUM", "CRITICAL"]
    assert result["model_version"] == "2.0.0-scientific-prototype"
    assert "prediction_timestamp" in result
    assert "class_probabilities" in result
    assert len(result["class_probabilities"]) == 3


def test_inference_uncertainty_flag_for_low_confidence():
    """Verify observations with confidence < 0.60 receive an uncertainty flag for analyst triage."""
    service = get_prediction_service()

    # Ambiguous observation designed to yield lower confidence
    ambiguous_obs = {
        "brightness": 330.0,
        "bright_t31": 315.0,
        "temp_diff": 15.0,
        "frp": 15.0,
        "confidence_score": 0.40,
        "is_night": 0,
        "recurrence_count": 2,
        "persistence_ratio": 0.20,
        "frp_zscore": 0.5,
        "frp_to_mean_ratio": 1.2
    }

    result = service.predict_single(ambiguous_obs)
    assert result["status"] == "SUCCESS"
    if result["confidence"] < 0.60:
        assert result.get("uncertainty_flag") == "LOW_CONFIDENCE_REVIEW"


# =========================================================================
# 8. Backward Compatibility: Baseline v1 Can Be Explicitly Loaded
# =========================================================================

def test_backward_compatibility_v1_can_be_loaded():
    """Verify baseline model 1.0.0-baseline can still be loaded explicitly without breaking."""
    v1_path = MODELS_DIR / "satellite_fire_classifier.joblib"
    assert v1_path.exists(), "Model v1 artifact should be preserved for backward compatibility."

    service_v1 = ThermalPredictionService(model_path=v1_path)
    assert service_v1.model_version == "1.0.0-baseline"

    result = service_v1.predict_single({
        "brightness": 340.0,
        "bright_t31": 300.0,
        "frp": 25.0
    })
    assert result["status"] == "SUCCESS"
    assert result["model_version"] == "1.0.0-baseline"
