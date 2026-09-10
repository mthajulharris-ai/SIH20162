"""
Phase 5 Comprehensive Smoke Test for SIH PS 26162.

Verifies the 12 key lifecycle steps:
1. Backend starts
2. Health endpoint responds (200 OK)
3. Database initializes cleanly
4. Observation enters pipeline
5. Real AI Model v2 prediction succeeds
6. Model version is recorded (2.0.0-scientific-prototype)
7. Provenance is preserved (e.g. SAMPLE or REAL_FIRMS)
8. Detection is stored in database
9. Alert logic executes (automatic alert created if appropriate)
10. Detection can be retrieved via REST API
11. Alert can be retrieved via REST API
12. Analytics summary endpoint responds with accurate aggregation
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.db.base import Base
from backend.db.session import get_db
from backend.services.ml_service import MLInferenceService, get_ml_service
from src.config import PROVENANCE_SAMPLE, PROVENANCE_REAL_FIRMS

# Dedicated isolated in-memory database for smoke testing
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


@pytest.fixture(scope="module")
def smoke_client():
    # Step 1 & 3: Database initialization
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    
    # Real ML inference service using Model v2
    real_ml = MLInferenceService()
    app.dependency_overrides[get_ml_service] = lambda: real_ml
    
    with TestClient(app) as client:
        yield client
        
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def test_full_system_smoke_workflow(smoke_client):
    """
    Executes an end-to-end smoke test covering all 12 operational steps.
    """
    client = smoke_client

    # Step 1 & 2: Backend starts & Health endpoint responds
    health_resp = client.get("/api/v1/health")
    assert health_resp.status_code == 200
    health_data = health_resp.json()
    assert health_data["status"] == "healthy"
    assert "version" in health_data

    # Step 4: Observation enters pipeline via /api/v1/inference/predict-and-store
    # High FRP + temperature differential observation representing an industrial flare / fire
    test_observation = {
        "latitude": 28.6139,
        "longitude": 77.2090,
        "brightness": 385.0,
        "bright_t31": 298.0,
        "temp_diff": 87.0,
        "frp": 160.0,
        "confidence_score": 0.95,
        "satellite": "Suomi-NPP",
        "instrument": "VIIRS",
        "acq_date": "2026-09-10",
        "acq_time": "1200",
        "is_night": 0,
        "recurrence_count": 14,
        "persistence_ratio": 0.88,
        "frp_zscore": 4.5,
        "frp_to_mean_ratio": 8.0,
        "data_provenance": PROVENANCE_SAMPLE
    }

    # Step 5, 6, 7, 8, 9: AI Prediction, Model Version, Provenance, Persistence, Alert
    infer_resp = client.post("/api/v1/inference/predict-and-store", json=test_observation)
    assert infer_resp.status_code == 201
    infer_result = infer_resp.json()
    assert infer_result["status"] == "SUCCESS"

    prediction = infer_result["prediction"]
    detection = infer_result["detection"]

    # Step 5: Prediction succeeds
    assert "predicted_class" in prediction
    assert prediction["predicted_class"] in ["Industrial Fire", "Persistent Thermal Source", "Other"]
    assert 0.0 <= prediction["confidence"] <= 1.0

    # Step 6: Model version is recorded
    assert prediction["model_version"] == "2.0.0-scientific-prototype"
    assert detection["model_version"] == "2.0.0-scientific-prototype"

    # Step 7: Provenance is preserved
    assert detection["data_provenance"] == PROVENANCE_SAMPLE

    # Step 8: Stored detection ID returned
    detection_id = detection["id"]
    assert detection_id is not None
    assert detection_id > 0

    # Step 10: Detection can be retrieved via REST API
    get_det_resp = client.get(f"/api/v1/detections/{detection_id}")
    assert get_det_resp.status_code == 200
    det_data = get_det_resp.json()
    assert det_data["id"] == detection_id
    assert det_data["latitude"] == pytest.approx(28.6139, abs=1e-4)
    assert det_data["longitude"] == pytest.approx(77.2090, abs=1e-4)
    assert det_data["data_provenance"] == PROVENANCE_SAMPLE
    assert det_data["model_version"] == "2.0.0-scientific-prototype"

    # Step 9 & 11: Alert logic executes & Alert can be retrieved
    alerts_resp = client.get("/api/v1/alerts")
    assert alerts_resp.status_code == 200
    alerts_data = alerts_resp.json()
    alerts = alerts_data["items"]
    
    # If high severity triggered an alert, verify alert properties
    if prediction.get("alert_level") in ["CRITICAL", "HIGH", "MEDIUM"]:
        matching_alerts = [a for a in alerts if a["detection_id"] == detection_id]
        assert len(matching_alerts) >= 1
        alert = matching_alerts[0]
        assert alert["verification_status"] == "REQUIRES_VERIFICATION"
        assert alert["alert_level"] in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

        # Test verification status transition
        update_resp = client.patch(
            f"/api/v1/alerts/{alert['id']}/status",
            json={"verification_status": "UNDER_REVIEW", "notes": "Analyst inspecting satellite imagery"}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["verification_status"] == "UNDER_REVIEW"

    # Step 12: Analytics endpoint responds with accurate counts
    analytics_resp = client.get("/api/v1/analytics/summary")
    assert analytics_resp.status_code == 200
    analytics_data = analytics_resp.json()
    assert analytics_data["total_detections"] >= 1
    assert "class_distribution" in analytics_data
    assert "severity_distribution" in analytics_data
    assert "provenance_distribution" in analytics_data
    assert analytics_data["provenance_distribution"].get(PROVENANCE_SAMPLE, 0) >= 1
