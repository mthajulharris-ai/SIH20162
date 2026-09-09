"""
Unit tests for the backend prediction service interface.
"""

import pytest
from datetime import datetime
from src.inference import (
    ThermalPredictionService,
    predict_thermal_observation,
    get_prediction_service
)


@pytest.fixture
def service():
    return get_prediction_service()


def test_predict_single_observation(service):
    """Verify single observation prediction produces all required fields."""
    sample_obs = {
        "brightness": 380.0,
        "bright_t31": 310.0,
        "temp_diff": 70.0,
        "frp": 150.0,
        "confidence_score": 0.95,
        "is_night": 0,
        "recurrence_count": 12,
        "persistence_ratio": 0.80,
        "frp_zscore": 4.5,
        "frp_to_mean_ratio": 7.0
    }

    result = service.predict_single(sample_obs)

    # Validate required output fields
    assert "predicted_class" in result
    assert "confidence" in result
    assert "model_version" in result
    assert "prediction_timestamp" in result

    # Validate types and values
    assert result["predicted_class"] in ["Industrial Fire", "Persistent Thermal Source", "Other"]
    assert 0.0 <= result["confidence"] <= 1.0
    assert result["status"] == "SUCCESS"
    assert "class_probabilities" in result
    assert len(result["class_probabilities"]) == 3
    assert result["alert_level"] in ["LOW", "MEDIUM", "CRITICAL"]

    # Validate timestamp format (ISO 8601)
    ts = result["prediction_timestamp"]
    assert "T" in ts


def test_predict_batch_observations(service):
    """Verify batch prediction works across diverse inputs."""
    batch = [
        # Suspected flare-up
        {"brightness": 385.0, "bright_t31": 315.0, "frp": 160.0, "persistence_ratio": 0.8, "frp_zscore": 5.0},
        # Persistent source
        {"brightness": 338.0, "bright_t31": 300.0, "frp": 20.0, "persistence_ratio": 0.8, "frp_zscore": 0.1},
        # Transient / Other
        {"brightness": 314.0, "bright_t31": 292.0, "frp": 5.0, "persistence_ratio": 0.05, "frp_zscore": 0.0}
    ]

    results = service.predict_batch(batch)
    assert len(results) == 3
    for r in results:
        assert "predicted_class" in r
        assert "confidence" in r
        assert "model_version" in r
        assert "prediction_timestamp" in r


def test_predict_thermal_observation_helper():
    """Verify top-level helper function supports both single dict and list."""
    single_res = predict_thermal_observation({
        "brightness": 340.0,
        "bright_t31": 300.0,
        "frp": 25.0
    })
    assert isinstance(single_res, dict)
    assert "predicted_class" in single_res

    batch_res = predict_thermal_observation([
        {"brightness": 340.0, "bright_t31": 300.0, "frp": 25.0},
        {"brightness": 315.0, "bright_t31": 295.0, "frp": 8.0}
    ])
    assert isinstance(batch_res, list)
    assert len(batch_res) == 2


def test_derivation_of_missing_features(service):
    """Verify service gracefully derives temp_diff, frp_density, hour_sin/cos when omitted."""
    minimal_obs = {
        "brightness": 350.0,
        "bright_t31": 305.0,
        "frp": 45.0,
        "hour_utc": 14
    }

    result = service.predict_single(minimal_obs)
    assert result["status"] == "SUCCESS"
    assert result["predicted_class"] in ["Industrial Fire", "Persistent Thermal Source", "Other"]
    assert result["confidence"] > 0.0


def test_invalid_input_type_raises():
    """Verify invalid input type raises ValueError."""
    with pytest.raises(ValueError):
        predict_thermal_observation("invalid string input")
