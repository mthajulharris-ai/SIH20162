"""
Unit & Integration Tests for Analytics & Dashboard Summary Endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db

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


def test_analytics_summary_empty_database(client):
    """Test analytics endpoint when database has zero records."""
    response = client.get("/api/v1/analytics/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["total_detections"] == 0
    assert data["industrial_fire_predictions"] == 0
    assert data["persistent_source_predictions"] == 0
    assert data["other_predictions"] == 0
    assert data["high_confidence_detections"] == 0
    assert data["avg_frp_mw"] == 0.0
    assert "verification_breakdown" in data
    assert "geographic_distribution" in data
    assert "detections_over_time" in data


def test_analytics_summary_with_records(client):
    """Test analytics metrics computation with sample detections."""
    # Ingest record 1: Industrial Fire, high confidence
    p1 = {
        "latitude": 21.1702,
        "longitude": 72.8311,
        "brightness": 380.0,
        "confidence": "high",
        "acq_date": "2026-09-09",
        "acq_time": "1430",
        "source": "VIIRS_SNPP_NRT",
        "frp": 50.0,
        "predicted_class": "Industrial Fire",
        "prediction_confidence": 0.95,
    }
    client.post("/api/v1/detections", json=p1)

    # Ingest record 2: Persistent Thermal Source
    p2 = {
        "latitude": 22.4707,
        "longitude": 70.0577,
        "brightness": 350.0,
        "confidence": "nominal",
        "acq_date": "2026-09-09",
        "acq_time": "1500",
        "source": "MODIS_NRT",
        "frp": 30.0,
        "predicted_class": "Persistent Thermal Source",
        "prediction_confidence": 0.85,
    }
    client.post("/api/v1/detections", json=p2)

    response = client.get("/api/v1/analytics/summary")
    assert response.status_code == 200
    data = response.json()

    assert data["total_detections"] == 2
    assert data["industrial_fire_predictions"] == 1
    assert data["persistent_source_predictions"] == 1
    assert data["high_confidence_detections"] == 2
    assert data["avg_frp_mw"] == 40.0
    assert data["verification_breakdown"]["unverified_predictions"] >= 1
    assert len(data["detections_over_time"]) >= 1
    assert len(data["geographic_distribution"]) >= 1
