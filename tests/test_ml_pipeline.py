"""
Unit tests for Machine Learning Baseline Training, Evaluation, Serialization, and Prediction.
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path
import joblib

from src.ml.train import (
    get_candidate_models,
    train_and_compare_baselines,
    save_trained_model,
    run_full_training_pipeline
)
from src.ml.evaluate import evaluate_classifier, ModelEvaluationMetrics
from src.ml.predict import ThermalSourcePredictor
from src.data_pipeline.dataset_builder import ML_FEATURE_NAMES, CLASS_MAP


@pytest.fixture
def mock_train_val_test_data():
    """Generates synthetic feature matrices and targets across all 3 classes."""
    np.random.seed(42)
    n_samples = 45

    X = pd.DataFrame(
        np.random.randn(n_samples, len(ML_FEATURE_NAMES)),
        columns=ML_FEATURE_NAMES
    )
    # Balanced classes: 0, 1, 2 (15 each)
    y = pd.Series([0] * 15 + [1] * 15 + [2] * 15)

    # Train (30), Val (9), Test (6)
    X_train, y_train = X.iloc[:30], y.iloc[:30]
    X_val, y_val = X.iloc[30:39], y.iloc[30:39]
    X_test, y_test = X.iloc[39:], y.iloc[39:]

    return X_train, y_train, X_val, y_val, X_test, y_test


def test_candidate_models_definition():
    """Verify all 3 candidate models are defined with scalers and classifiers."""
    models = get_candidate_models()
    assert "Logistic Regression" in models
    assert "Random Forest" in models
    assert "Gradient Boosting" in models

    for name, pipe in models.items():
        assert "scaler" in pipe.named_steps
        assert "classifier" in pipe.named_steps


def test_train_and_compare_baselines(mock_train_val_test_data):
    """Verify baseline comparison selects a model based on validation metrics."""
    X_train, y_train, X_val, y_val, _, _ = mock_train_val_test_data
    best_name, best_pipeline, val_metrics = train_and_compare_baselines(
        X_train, y_train, X_val, y_val
    )

    assert best_name in ["Logistic Regression", "Random Forest", "Gradient Boosting"]
    assert best_pipeline is not None
    assert len(val_metrics) == 3
    for name, m in val_metrics.items():
        assert isinstance(m, ModelEvaluationMetrics)
        assert 0.0 <= m.accuracy <= 1.0
        assert 0.0 <= m.macro_f1 <= 1.0


def test_evaluation_metrics_and_confusion_matrix(mock_train_val_test_data):
    """Verify evaluation generates confusion matrix and per-class reports."""
    X_train, y_train, X_val, y_val, _, _ = mock_train_val_test_data
    models = get_candidate_models()
    rf = models["Random Forest"]
    rf.fit(X_train, y_train)

    metrics = evaluate_classifier(rf, X_val, y_val, model_name="Random Forest", dataset_split="validation")
    assert metrics.accuracy >= 0.0
    assert len(metrics.confusion_matrix) == 3
    assert len(metrics.confusion_matrix[0]) == 3
    assert "Industrial Fire" in metrics.per_class_metrics
    assert "Persistent Thermal Source" in metrics.per_class_metrics
    assert "Other" in metrics.per_class_metrics

    # Test report text generation
    report_text = metrics.to_text_report()
    assert "Confusion Matrix" in report_text
    assert "Macro F1-Score:" in report_text


def test_model_serialization_and_reloading(mock_train_val_test_data, tmp_path):
    """Verify joblib model dumping and reloading yields identical predictions."""
    X_train, y_train, X_val, y_val, _, _ = mock_train_val_test_data
    models = get_candidate_models()
    pipe = models["Random Forest"]
    pipe.fit(X_train, y_train)

    saved_file = tmp_path / "test_model.joblib"
    joblib.dump(pipe, saved_file)

    loaded_pipe = joblib.load(saved_file)
    preds_orig = pipe.predict(X_val)
    preds_loaded = loaded_pipe.predict(X_val)

    assert np.array_equal(preds_orig, preds_loaded)


def test_predictor_interface(mock_train_val_test_data, tmp_path):
    """Verify ThermalSourcePredictor produces structured output for backend consumption."""
    X_train, y_train, _, _, _, _ = mock_train_val_test_data
    models = get_candidate_models()
    pipe = models["Random Forest"]
    pipe.fit(X_train, y_train)

    saved_file = tmp_path / "predictor_test.joblib"
    joblib.dump(pipe, saved_file)

    predictor = ThermalSourcePredictor(model_path=saved_file)
    single_sample = {feat: 1.0 for feat in ML_FEATURE_NAMES}
    results = predictor.predict(single_sample)

    assert len(results) == 1
    res = results[0]
    assert "class_id" in res
    assert "class_name" in res
    assert "confidence_score" in res
    assert "alert_level" in res
    assert "class_probabilities" in res
    assert res["class_name"] in list(CLASS_MAP.values())
    assert res["alert_level"] in ["LOW", "MEDIUM", "CRITICAL"]
