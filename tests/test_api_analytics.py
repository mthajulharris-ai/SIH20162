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
    assert data["industrial_fires"] == 0
    assert data["total_alerts"] == 0
    assert data["avg_frp_mw"] == 0.0


def test_analytics_summary_with_records(client):
    """Test analytics metrics computation with sample detections."""
    payload = {
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
    client.post("/api/v1/detections", json=payload)

    response = client.get("/api/v1/analytics/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["total_detections"] == 1
    assert data["industrial_fires"] == 1
    assert data["avg_frp_mw"] == 50.0
    assert data["total_alerts"] == 1
