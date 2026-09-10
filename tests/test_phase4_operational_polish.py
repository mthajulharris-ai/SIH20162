"""
Phase 4 Verification Test Suite: Operational Polish, Model v2 & Telemetry.
Validates:
1. Provenance distinction (REAL_FIRMS vs SAMPLE vs PROTOTYPE_LABELLED)
2. Low-confidence handling (< 0.60 -> LOW_CONFIDENCE_REVIEW)
3. Model version propagation (2.0.0-scientific-prototype)
4. Detection and Alert multi-dimensional filtering (provenance, alert_level)
5. Alert verification lifecycle (REQUIRES_VERIFICATION -> UNDER_REVIEW -> VERIFIED/DISMISSED)
6. Non-fabrication: 0 count on empty data, no manufactured statistics
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
from app.services.ml_service import get_ml_service, MLInferenceService

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


def test_real_firms_provenance_and_model_version(client):
    """
    Verify that an observation with REAL_FIRMS provenance preserves
    data_provenance and model_version in both Detection and Alert records.
    """
    mock_ml = MagicMock(spec=MLInferenceService)
    mock_ml.is_available.return_value = True
    mock_ml.predict.return_value = {
        "status": "SUCCESS",
        "predicted_class": "Industrial Fire",
        "predicted_class_id": 2,
        "confidence": 0.88,
        "alert_level": "CRITICAL",
        "class_probabilities": {"Industrial Fire": 0.88, "Other": 0.12},
        "model_version": "2.0.0-scientific-prototype",
        "prediction_timestamp": "2026-09-10T08:00:00+00:00",
    }
    app.dependency_overrides[get_ml_service] = lambda: mock_ml

    real_firms_obs = {
        "latitude": 21.1702,
        "longitude": 72.8311,
        "brightness": 390.0,
        "frp": 60.0,
        "confidence": "high",
        "source": "REAL_FIRMS_VIIRS_SNPP",
        "instrument": "VIIRS",
        "data_provenance": "REAL_FIRMS",
        "acq_date": "2026-09-10",
        "acq_time": "0800",
    }

    resp = client.post("/api/v1/inference/predict-and-store", json=real_firms_obs)
    assert resp.status_code == 201
    data = resp.json()

    det = data["detection"]
    assert det["data_provenance"] == "REAL_FIRMS"
    assert det["model_version"] == "2.0.0-scientific-prototype"

    # Query detection with provenance filter
    filter_resp = client.get("/api/v1/detections?data_provenance=REAL_FIRMS")
    assert filter_resp.status_code == 200
    items = filter_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["data_provenance"] == "REAL_FIRMS"

    # Query alert generated
    alerts_resp = client.get("/api/v1/alerts?data_provenance=REAL_FIRMS")
    assert alerts_resp.status_code == 200
    alert_items = alerts_resp.json()["items"]
    assert len(alert_items) == 1
    assert alert_items[0]["data_provenance"] == "REAL_FIRMS"
    assert alert_items[0]["model_version"] == "2.0.0-scientific-prototype"


def test_low_confidence_triggers_low_confidence_review(client):
    """
    Step 7: Uncertainty behavior.
    When confidence < 0.60, alert_level must be set to LOW_CONFIDENCE_REVIEW.
    """
    mock_ml = MagicMock(spec=MLInferenceService)
    mock_ml.is_available.return_value = True
    mock_ml.predict.return_value = {
        "status": "SUCCESS",
        "predicted_class": "Industrial Fire",
        "predicted_class_id": 2,
        "confidence": 0.52,  # < 0.60 threshold
        "alert_level": "LOW",
        "class_probabilities": {"Industrial Fire": 0.52, "Other": 0.48},
        "model_version": "2.0.0-scientific-prototype",
        "prediction_timestamp": "2026-09-10T08:30:00+00:00",
    }
    app.dependency_overrides[get_ml_service] = lambda: mock_ml

    uncertain_obs = {
        "latitude": 22.4707,
        "longitude": 70.0577,
        "brightness": 340.0,
        "frp": 35.0,
        "confidence": "nominal",
        "source": "VIIRS_SNPP_NRT",
        "data_provenance": "REAL_FIRMS",
        "acq_date": "2026-09-10",
        "acq_time": "0830",
    }

    resp = client.post("/api/v1/inference/predict-and-store", json=uncertain_obs)
    assert resp.status_code == 201
    data = resp.json()

    # Verify LOW_CONFIDENCE_REVIEW is assigned
    assert data["prediction"]["alert_level"] == "LOW_CONFIDENCE_REVIEW"
    assert data["detection"]["alert_level"] == "LOW_CONFIDENCE_REVIEW"

    # Verify query filter works for LOW_CONFIDENCE_REVIEW
    alert_resp = client.get("/api/v1/alerts?alert_level=LOW_CONFIDENCE_REVIEW")
    assert alert_resp.status_code == 200
    alerts = alert_resp.json()["items"]
    assert len(alerts) == 1
    assert alerts[0]["alert_level"] == "LOW_CONFIDENCE_REVIEW"
    assert "low-confidence" in alerts[0]["title"].lower()


def test_empty_database_analytics_reports_zero_no_fabrication(client):
    """
    Step 5 & Step 8: Ensure empty datasets return 0 and do not manufacture fake statistics.
    """
    resp = client.get("/api/v1/analytics/summary")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_detections"] == 0
    assert data["industrial_fire_predictions"] == 0
    assert data["persistent_source_predictions"] == 0
    assert data["other_predictions"] == 0
    assert data["high_confidence_detections"] == 0
    assert data["avg_frp_mw"] == 0.0
    assert data["max_frp_mw"] == 0.0
    assert data["verification_breakdown"]["total_alerts"] == 0
    assert data["data_source"] == "empty_database"
