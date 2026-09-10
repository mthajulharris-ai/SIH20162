"""
End-to-End System Integration Tests.
Verifies the complete flow:
Satellite Observation
  -> Preprocessing & Pydantic Validation
  -> ML Classification
  -> SQLite Database Persistence
  -> Operational Alert Evaluation
  -> REST API Retrieval (Detections, Alerts, Analytics)
  -> Lifecycle Verification Transition
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
from app.services.ml_service import get_ml_service, MLInferenceService

# In-memory SQLite database for isolated test execution
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


def test_complete_end_to_end_pipeline_integration(client):
    """
    Validates the entire operational workflow from satellite input ingestion
    to GIS retrieval, alert generation, and analytics summary updates.
    """
    # 1. Setup mock ML service matching documented ML interface contract
    mock_ml = MagicMock(spec=MLInferenceService)
    mock_ml.is_available.return_value = True
    mock_ml.predict.return_value = {
        "status": "SUCCESS",
        "predicted_class": "Industrial Fire",
        "predicted_class_id": 2,
        "confidence": 0.954,
        "alert_level": "CRITICAL",
        "class_probabilities": {
            "Other": 0.012,
            "Persistent Thermal Source": 0.034,
            "Industrial Fire": 0.954,
        },
        "model_version": "1.0.0-baseline",
        "prediction_timestamp": "2026-09-09T14:30:00+00:00",
    }
    app.dependency_overrides[get_ml_service] = lambda: mock_ml

    # Step 1: Health check
    health_resp = client.get("/api/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "healthy"

    # Step 2: Ingest raw satellite observation through ML pipeline
    satellite_observation = {
        "latitude": 21.1702,
        "longitude": 72.8311,
        "brightness": 382.4,
        "bright_t31": 305.1,
        "frp": 72.5,
        "confidence": "high",
        "acq_date": "2026-09-09",
        "acq_time": "1430",
        "source": "VIIRS_SNPP_NRT",
        "instrument": "VIIRS",
        "scan": 0.375,
        "track": 0.375,
        "daynight": "D",
    }

    ingest_resp = client.post(
        "/api/v1/inference/predict-and-store",
        json=satellite_observation,
    )
    assert ingest_resp.status_code == 201
    ingest_data = ingest_resp.json()

    assert ingest_data["status"] == "SUCCESS"
    detection = ingest_data["detection"]
    detection_id = detection["id"]
    assert detection["predicted_class"] == "Industrial Fire"
    assert detection["prediction_confidence"] == 0.954

    # Step 3: Verify record is queryable via REST detections API with spatial filter
    det_query = client.get(
        f"/api/v1/detections?min_lat=20.0&max_lat=22.0&min_lon=71.0&max_lon=74.0&source=VIIRS_SNPP_NRT"
    )
    assert det_query.status_code == 200
    det_list = det_query.json()
    assert det_list["total"] == 1
    assert det_list["items"][0]["id"] == detection_id

    # Step 4: Verify that high-confidence industrial fire generated an operational alert
    alerts_query = client.get("/api/v1/alerts")
    assert alerts_query.status_code == 200
    alerts_data = alerts_query.json()
    assert alerts_data["total"] == 1
    assert alerts_data["critical_count"] == 1
    assert alerts_data["unverified_count"] == 1

    alert = alerts_data["items"][0]
    alert_id = alert["id"]
    assert alert["alert_level"] == "CRITICAL"
    assert alert["verification_status"] == "REQUIRES_VERIFICATION"
    assert "requires verification" in alert["title"].lower()

    # Step 5: Simulate operator updating verification status to UNDER_REVIEW
    update_resp = client.patch(
        f"/api/v1/alerts/{alert_id}/status",
        json={
            "verification_status": "UNDER_REVIEW",
            "verification_notes": "Operations dispatched thermal drone inspection.",
        },
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["verification_status"] == "UNDER_REVIEW"

    # Step 6: Verify Analytics reflects the new detection and updated lifecycle state
    analytics_resp = client.get("/api/v1/analytics/summary")
    assert analytics_resp.status_code == 200
    analytics_data = analytics_resp.json()

    assert analytics_data["total_detections"] == 1
    assert analytics_data["industrial_fire_predictions"] == 1
    assert analytics_data["high_confidence_detections"] == 1
    assert analytics_data["avg_frp_mw"] == 72.5
    assert analytics_data["verification_breakdown"]["under_review"] == 1
    assert analytics_data["verification_breakdown"]["unverified_predictions"] == 0
    assert len(analytics_data["geographic_distribution"]) >= 1


def test_live_trained_model_end_to_end(client):
    """
    Validates complete end-to-end flow using Swathi's REAL trained ML pipeline:
    Sample observation -> Live ML Model -> SQLite DB -> Detections API -> Alerts & Analytics.
    """
    # Sample clearly labelled test observation
    sample_obs = {
        "latitude": 21.1702,
        "longitude": 72.8311,
        "brightness": 385.0,
        "bright_t31": 310.0,
        "frp": 85.0,
        "confidence": "high",
        "acq_date": "2026-09-10",
        "acq_time": "1100",
        "source": "SAMPLE_TEST_VIIRS_SNPP",
    }

    # Step 1: Ingest observation directly into real ML model inference endpoint
    resp = client.post("/api/v1/inference/predict-and-store", json=sample_obs)
    assert resp.status_code == 201
    data = resp.json()

    assert data["status"] == "SUCCESS"
    assert "prediction" in data
    assert "detection" in data
    det_id = data["detection"]["id"]
    assert det_id is not None
    assert data["detection"]["model_version"] is not None

    # Step 2: Retrieve through detection REST API
    det_resp = client.get(f"/api/v1/detections/{det_id}")
    assert det_resp.status_code == 200
    retrieved = det_resp.json()
    assert retrieved["id"] == det_id
    assert retrieved["source"] == "SAMPLE_TEST_VIIRS_SNPP"

    # Step 3: Check analytics summary
    analytics_resp = client.get("/api/v1/analytics/summary")
    assert analytics_resp.status_code == 200
    assert analytics_resp.json()["total_detections"] >= 1

