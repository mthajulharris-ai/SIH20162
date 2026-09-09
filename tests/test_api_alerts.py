"""
Unit & Integration Tests for Alert Generation, Verification Lifecycle, and Alert APIs.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db

# Isolated in-memory SQLite database setup
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


SAMPLE_INDUSTRIAL_DETECTION = {
    "latitude": 21.1702,
    "longitude": 72.8311,
    "brightness": 395.4,
    "confidence": "high",
    "acq_date": "2026-09-09",
    "acq_time": "1430",
    "source": "VIIRS_SNPP_NRT",
    "instrument": "VIIRS",
    "frp": 65.0,
    "daynight": "D",
    "predicted_class": "Industrial Fire",
    "prediction_confidence": 0.94,
    "is_persistent": False,
}


def test_alert_created_on_high_confidence_industrial_fire(client):
    """
    Test that ingesting a high-confidence industrial fire automatically triggers
    an operational alert with status 'REQUIRES_VERIFICATION'.
    """
    # 1. Ingest detection
    create_resp = client.post("/api/v1/detections", json=SAMPLE_INDUSTRIAL_DETECTION)
    assert create_resp.status_code == 201

    # 2. Query alerts
    alerts_resp = client.get("/api/v1/alerts")
    assert alerts_resp.status_code == 200
    data = alerts_resp.json()

    assert data["total"] == 1
    assert data["critical_count"] == 1
    assert data["unverified_count"] == 1

    alert = data["items"][0]
    assert alert["alert_level"] == "CRITICAL"
    assert alert["verification_status"] == "REQUIRES_VERIFICATION"
    assert alert["predicted_class"] == "Industrial Fire"
    assert alert["confidence"] == 0.94

    # Check required terminology
    title_clean = alert["title"].lower().replace("-", " ")
    assert "ai detected" in title_clean
    assert "requires verification" in alert["title"].lower()
    assert "requires" in alert["message"].lower()
    assert "disclaimer" in alert
    assert "requires ground/field verification" in alert["disclaimer"].lower()


def test_get_recent_alerts(client):
    """Test GET /api/v1/alerts/recent returns latest active alerts."""
    # Ingest detection
    client.post("/api/v1/detections", json=SAMPLE_INDUSTRIAL_DETECTION)

    recent_resp = client.get("/api/v1/alerts/recent?limit=5")
    assert recent_resp.status_code == 200
    items = recent_resp.json()
    assert len(items) == 1
    assert items[0]["alert_level"] == "CRITICAL"


def test_get_alert_by_id(client):
    """Test retrieving an individual alert by its ID."""
    client.post("/api/v1/detections", json=SAMPLE_INDUSTRIAL_DETECTION)
    alerts = client.get("/api/v1/alerts").json()["items"]
    alert_id = alerts[0]["id"]

    resp = client.get(f"/api/v1/alerts/{alert_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == alert_id

    # Nonexistent ID returns 404
    resp_404 = client.get("/api/v1/alerts/99999")
    assert resp_404.status_code == 404


def test_update_alert_status_lifecycle(client):
    """
    Test updating an alert's verification lifecycle status
    (e.g., from REQUIRES_VERIFICATION to UNDER_REVIEW).
    """
    client.post("/api/v1/detections", json=SAMPLE_INDUSTRIAL_DETECTION)
    alert_id = client.get("/api/v1/alerts").json()["items"][0]["id"]

    # Valid status update
    update_payload = {
        "verification_status": "UNDER_REVIEW",
        "verification_notes": "Operations dispatched local drone verification team.",
    }
    patch_resp = client.patch(f"/api/v1/alerts/{alert_id}/status", json=update_payload)
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["verification_status"] == "UNDER_REVIEW"
    assert "drone verification" in updated["verification_notes"]

    # Invalid status should be rejected by Pydantic validator with 422
    bad_payload = {"verification_status": "CONFIRMED_REAL_FIRE"}
    bad_resp = client.patch(f"/api/v1/alerts/{alert_id}/status", json=bad_payload)
    assert bad_resp.status_code == 422


def test_low_severity_detection_does_not_create_alert(client):
    """
    Test that a low-confidence false alarm or benign thermal reading
    does NOT trigger unnecessary alerts.
    """
    benign_payload = {
        "latitude": 28.7041,
        "longitude": 77.1025,
        "brightness": 305.0,
        "confidence": "low",
        "acq_date": "2026-09-09",
        "acq_time": "1000",
        "source": "VIIRS_SNPP_NRT",
        "instrument": "VIIRS",
        "frp": 2.1,
        "daynight": "D",
        "predicted_class": "false_alarm",
        "prediction_confidence": 0.40,
        "is_persistent": False,
    }
    client.post("/api/v1/detections", json=benign_payload)

    alerts_resp = client.get("/api/v1/alerts")
    assert alerts_resp.status_code == 200
    assert alerts_resp.json()["total"] == 0
