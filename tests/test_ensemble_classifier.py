"""
Unit and Integration Tests for SATRA Soft-Voting Ensemble Classifier (RF + LightGBM + XGBoost).

Tests:
1. Six-feature strict validation in exact order
2. Missing-feature rejection (no arbitrary defaults)
3. Soft-voting ensemble construction and probability estimation
4. Low confidence thresholding (<0.60 -> LOW_CONFIDENCE_REVIEW)
5. YOLOv11 visual fusion (TABULAR_ONLY vs TABULAR_PLUS_VISUAL)
6. Model loader behavior on missing model file (no fake model)
7. Dataset label validation in training pipeline (halts if classes missing)
"""

from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import VotingClassifier

from backend.ml.ensemble_classifier import (
    CLASS_ID_TO_NAME,
    CLASS_NAME_TO_ID,
    LOW_CONFIDENCE_THRESHOLD,
    MissingLabelsError,
    SoftVotingEnsembleWrapper,
    build_ensemble_classifier,
    train_ensemble_pipeline,
)
from backend.ml.feature_extractor import (
    REQUIRED_FEATURES,
    FeatureValidationError,
    extract_features_from_observation,
    validate_feature_vector,
)
from backend.ml.model_loader import ModelNotLoadedError, load_model
from backend.ml.yolo_fusion import fuse_confidences


# =========================================================================
# 1. Strict Six-Feature Validation Tests
# =========================================================================

def test_valid_six_feature_dict():
    """Verify that a valid dictionary with exact 6 features passes validation."""
    sample = {
        "FRP": 45.0,
        "T4": 340.5,
        "delta_T": 38.2,
        "day_night_flag": 1,
        "observation_density": 120.0,
        "cluster_intensity": 150.0,
    }
    arr = validate_feature_vector(sample)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (1, 6)
    np.testing.assert_allclose(arr[0], [45.0, 340.5, 38.2, 1.0, 120.0, 150.0])


def test_missing_feature_rejected():
    """Verify that missing ANY of the 6 features raises FeatureValidationError."""
    # Missing 'delta_T'
    incomplete = {
        "FRP": 45.0,
        "T4": 340.5,
        "day_night_flag": 0,
        "observation_density": 120.0,
        "cluster_intensity": 150.0,
    }
    with pytest.raises(FeatureValidationError) as exc_info:
        validate_feature_vector(incomplete)

    assert "Missing required feature" in str(exc_info.value)
    assert "delta_T" in str(exc_info.value)


def test_invalid_feature_values_rejected():
    """Verify invalid numeric ranges and types are rejected."""
    # Negative T4 brightness temperature
    with pytest.raises(FeatureValidationError):
        validate_feature_vector({
            "FRP": 10.0,
            "T4": -5.0,
            "delta_T": 10.0,
            "day_night_flag": 0,
            "observation_density": 50.0,
            "cluster_intensity": 50.0,
        })

    # Negative FRP
    with pytest.raises(FeatureValidationError):
        validate_feature_vector({
            "FRP": -1.0,
            "T4": 320.0,
            "delta_T": 10.0,
            "day_night_flag": 0,
            "observation_density": 50.0,
            "cluster_intensity": 50.0,
        })

    # Invalid day_night_flag
    with pytest.raises(FeatureValidationError):
        validate_feature_vector({
            "FRP": 10.0,
            "T4": 320.0,
            "delta_T": 10.0,
            "day_night_flag": 99,
            "observation_density": 50.0,
            "cluster_intensity": 50.0,
        })


def test_extract_features_from_raw_observation():
    """Verify mapping of raw satellite telemetry fields to 6 canonical features."""
    raw_obs = {
        "frp": 85.0,
        "brightness": 365.0,
        "bright_t31": 305.0,
        "daynight": "N",
        "scan": 0.5,
        "track": 0.5,
        "recurrence_count": 5,
        "frp_local_mean": 20.0,
    }
    extracted = extract_features_from_observation(raw_obs)
    assert extracted["FRP"] == 85.0
    assert extracted["T4"] == 365.0
    assert extracted["delta_T"] == 60.0
    assert extracted["day_night_flag"] == 1.0
    assert extracted["observation_density"] == 85.0 / (0.5 * 0.5)
    assert extracted["cluster_intensity"] == 5 * 20.0


# =========================================================================
# 2. Soft-Voting Ensemble Architecture Tests
# =========================================================================

def test_ensemble_architecture_components():
    """Verify that ensemble contains RF, LightGBM, and XGBoost with soft voting and weights [1.0, 1.2, 1.2]."""
    ensemble = build_ensemble_classifier()
    assert isinstance(ensemble, VotingClassifier)
    assert ensemble.voting == "soft"
    assert ensemble.weights == [1.0, 1.2, 1.2]

    estimator_names = [name for name, _ in ensemble.estimators]
    assert estimator_names == ["rf", "lgbm", "xgb"]

    rf = ensemble.named_estimators["rf"]
    assert rf.n_estimators == 300
    assert rf.class_weight == "balanced"
    assert rf.random_state == 42

    lgbm = ensemble.named_estimators["lgbm"]
    assert lgbm.n_estimators == 300
    assert lgbm.learning_rate == 0.05
    assert lgbm.num_leaves == 31
    assert lgbm.class_weight == "balanced"

    xgb = ensemble.named_estimators["xgb"]
    assert xgb.n_estimators == 300
    assert xgb.learning_rate == 0.05
    assert xgb.max_depth == 6
    assert xgb.objective == "multi:softprob"
    assert xgb.get_params()["num_class"] == 4


# =========================================================================
# 3. Confidence Thresholding & Status Tests
# =========================================================================

class MockClassifier:
    """Mock for testing probability thresholding logic."""
    def __init__(self, probas):
        self.probas = np.array([probas])

    def predict_proba(self, X):
        return self.probas


def test_confidence_thresholding_high():
    """Verify high confidence (>= 0.60) yields status 'CLASSIFIED'."""
    # Class 1 (Forest Fire) with 85% probability
    mock_rf = MockClassifier([0.05, 0.85, 0.05, 0.05])
    wrapper = SoftVotingEnsembleWrapper(mock_rf)

    features = [50.0, 345.0, 40.0, 0, 100.0, 100.0]
    result = wrapper.predict_single(features)

    assert result["classification"] == "Forest Fire"
    assert result["predicted_class_id"] == 1
    assert result["confidence"] == 0.85
    assert result["status"] == "CLASSIFIED"


def test_confidence_thresholding_low():
    """Verify low confidence (< 0.60) yields status 'LOW_CONFIDENCE_REVIEW' without silent conversion."""
    # Plurality is Class 3 (Other) with 47% probability
    mock_rf = MockClassifier([0.20, 0.15, 0.18, 0.47])
    wrapper = SoftVotingEnsembleWrapper(mock_rf)

    features = [10.0, 310.0, 15.0, 0, 20.0, 20.0]
    result = wrapper.predict_single(features)

    assert result["classification"] == "Other"
    assert result["confidence"] == 0.47
    assert result["status"] == "LOW_CONFIDENCE_REVIEW"
    assert result["alert_level"] == "LOW_CONFIDENCE_REVIEW"


# =========================================================================
# 4. YOLOv11 Visual Fusion Tests
# =========================================================================

def test_yolo_fusion_without_image():
    """Verify that without visual confidence, tabular confidence is preserved and source is TABULAR_ONLY."""
    fused_conf, source = fuse_confidences(tabular_confidence=0.82, yolo_visual_confidence=None)
    assert fused_conf == 0.82
    assert source == "TABULAR_ONLY"


def test_yolo_fusion_with_image():
    """Verify 0.7 * tabular + 0.3 * visual confidence formula."""
    tab_conf = 0.80
    vis_conf = 0.90
    expected = round(0.7 * 0.80 + 0.3 * 0.90, 4)  # 0.56 + 0.27 = 0.83

    fused_conf, source = fuse_confidences(tabular_confidence=tab_conf, yolo_visual_confidence=vis_conf)
    assert fused_conf == expected
    assert source == "TABULAR_PLUS_VISUAL"


# =========================================================================
# 5. Model Loader Tests (No Fake Models)
# =========================================================================

def test_load_model_missing_file_raises_clear_error():
    """Verify load_model raises ModelNotLoadedError if satra_ensemble.pkl does not exist."""
    with pytest.raises(ModelNotLoadedError) as exc_info:
        load_model(model_path="models/non_existent_satra_model.pkl", force_reload=True)

    assert "Trained ensemble model file not found" in str(exc_info.value)
    assert "Please train the ensemble" in str(exc_info.value)


# =========================================================================
# 6. Training Pipeline Dataset Validation Tests (Real Data Integrity)
# =========================================================================

def test_training_pipeline_stops_when_classes_missing():
    """
    Verify training pipeline STOPS with MissingLabelsError when the dataset
    lacks any of the 4 required classes (e.g. Forest Fire).
    """
    # Prototype dataset lacks Forest Fire
    proto_csv = Path("data/samples/prototype_labeled_dataset.csv")
    if proto_csv.exists():
        with pytest.raises(MissingLabelsError) as exc_info:
            train_ensemble_pipeline(
                dataset_path=proto_csv,
                output_model_path="models/test_should_not_save.pkl"
            )

        assert "Dataset does not contain all required 4 classes" in str(exc_info.value)
        assert "Forest Fire" in str(exc_info.value)


# =========================================================================
# 7. Batch Inference & Fallback Prevention Regression Tests
# =========================================================================

def test_validate_feature_vector_list_of_dicts():
    """Verify that validate_feature_vector handles a list of dicts without TypeError."""
    records = [
        {"FRP": 10.0, "T4": 320.0, "delta_T": 15.0, "day_night_flag": 0, "observation_density": 50.0, "cluster_intensity": 60.0},
        {"FRP": 25.0, "T4": 345.0, "delta_T": 25.0, "day_night_flag": 1, "observation_density": 80.0, "cluster_intensity": 90.0},
    ]
    arr = validate_feature_vector(records)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (2, 6)
    np.testing.assert_allclose(arr[0], [10.0, 320.0, 15.0, 0.0, 50.0, 60.0])
    np.testing.assert_allclose(arr[1], [25.0, 345.0, 25.0, 1.0, 80.0, 90.0])


def test_extract_features_without_t31_and_batch_prediction():
    """Verify observations without bright_t31 derive physical baseline and predict successfully."""
    from backend.services.ml_service import get_ml_service

    service = get_ml_service()
    obs_batch = [
        {"brightness": 340.0, "frp": 22.0, "daynight": "D", "scan": 0.4, "track": 0.4},
        {"brightness": 360.0, "bright_t31": 305.0, "frp": 45.0, "daynight": "N", "scan": 0.38, "track": 0.36},
    ]

    results = service.predict_batch(obs_batch)
    assert len(results) == 2
    for r in results:
        assert "classification" in r
        assert "confidence" in r
        assert "status" in r
        assert "model_type" in r
        assert "fusion_source" in r
        assert r["model_type"] == "RF_LightGBM_XGBoost_SoftVoting"
        assert r["status"] in ("CLASSIFIED", "LOW_CONFIDENCE_REVIEW")
        assert r["fusion_source"] == "TABULAR_ONLY"
        assert r["classification"] in ("Industrial Fire", "Forest Fire", "Persistent Thermal Source", "Other")

