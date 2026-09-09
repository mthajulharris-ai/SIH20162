"""
Integration tests for ML Inference Service Integration and Pipeline.
Tests the full pipeline:
Thermal Observation -> Validation -> ML Inference -> SQLite Database -> API Response.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.services.ml_service import (
    get_ml_service,
    MLInferenceService,
    MLModelNotLoadedException,
)

# Test SQLite in-memory database setup
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


CONTROLLED_SAMPLE_OBSERVATION = {
    "latitude": 21.1702,
    "longitude": 72.8311,
    "brightness": 365.4,
    "bright_t31": 298.2,
    "frp": 68.5,
    "confidence": "nominal",
    "acq_date": "2026-09-09",
    "acq_time": "1430",
    "source": "VIIRS_SNPP_NRT",
    "instrument": "VIIRS",
    "scan": 0.375,
    "track": 0.375,
    "daynight": "D",
    "hour_utc": 14,
}


def test_model_status_when_not_loaded(client):
    """
    Test that when the ML model artifact is missing, the endpoint
    returns a meaningful status instead of crashing silently.
    """
    # Create mock service simulating unloaded model
    mock_service = MagicMock(spec=MLInferenceService)
    mock_service.is_available.return_value = False

    app.dependency_overrides[get_ml_service] = lambda: mock_service

    response = client.get("/api/v1/inference/model-status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "model_not_loaded"
    assert data["is_available"] is False
    assert "not loaded" in data["message"].lower()


def test_predict_and_store_graceful_error_when_model_unavailable(client):
    """
    Test that if ML model loading fails, a structured 503 error is returned
    instead of an unhandled 500 crash.
    """
    mock_service = MagicMock(spec=MLInferenceService)
    mock_service.predict.side_effect = MLModelNotLoadedException(
        "Model weights file 'satellite_fire_classifier.joblib' was not found."
    )

    app.dependency_overrides[get_ml_service] = lambda: mock_service

    response = client.post(
        "/api/v1/inference/predict-and-store",
        json=CONTROLLED_SAMPLE_OBSERVATION,
    )
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "error"
    assert data["code"] == 503
    assert "Service Unavailable" in data["message"]


def test_predict_and_store_full_pipeline_success(client):
    """
    Test the complete successful pipeline:
    thermal observation -> validation -> ML prediction -> database -> API response.
    """
    # Controlled mock ML service matching exact ML module contract
    mock_service = MagicMock(spec=MLInferenceService)
    mock_service.is_available.return_value = True
    mock_service.predict.return_value = {
        "status": "SUCCESS",
        "predicted_class": "Industrial Fire",
        "predicted_class_id": 2,
        "confidence": 0.9620,
        "alert_level": "CRITICAL",
        "class_probabilities": {
            "Other": 0.0120,
            "Persistent Thermal Source": 0.0260,
            "Industrial Fire": 0.9620,
        },
        "model_version": "1.0.0-baseline",
        "prediction_timestamp": "2026-09-09T14:30:00+00:00",
    }

    app.dependency_overrides[get_ml_service] = lambda: mock_service

    # Execute POST predict-and-store
    response = client.post(
        "/api/v1/inference/predict-and-store",
        json=CONTROLLED_SAMPLE_OBSERVATION,
    )
    assert response.status_code == 201
    data = response.json()

    # 1. Check top-level response envelope
    assert data["status"] == "SUCCESS"
    assert "detection" in data
    assert "prediction" in data

    # 2. Check persisted database detection entity
    detection = data["detection"]
    assert detection["id"] is not None
    assert detection["latitude"] == 21.1702
    assert detection["longitude"] == 72.8311
    assert detection["predicted_class"] == "Industrial Fire"
    assert detection["prediction_confidence"] == 0.9620
    assert detection["frp"] == 68.5

    # 3. Check ML prediction details
    prediction = data["prediction"]
    assert prediction["predicted_class"] == "Industrial Fire"
    assert prediction["predicted_class_id"] == 2
    assert prediction["alert_level"] == "CRITICAL"
    assert prediction["confidence"] == 0.9620
    assert prediction["class_probabilities"]["Industrial Fire"] == 0.9620

    # 4. Verify record is now queryable via REST detection endpoint from Step 3
    db_record_id = detection["id"]
    get_resp = client.get(f"/api/v1/detections/{db_record_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == db_record_id
    assert get_resp.json()["predicted_class"] == "Industrial Fire"


def test_observation_input_validation_failure(client):
    """
    Test input validation catches bad sensory data before reaching ML service.
    """
    bad_observation = CONTROLLED_SAMPLE_OBSERVATION.copy()
    bad_observation["brightness"] = -50.0  # Invalid negative Kelvin

    response = client.post(
        "/api/v1/inference/predict-and-store",
        json=bad_observation,
    )
    assert response.status_code == 422
    data = response.json()
    assert data["status"] == "error"
    assert data["code"] == 422
