"""
Integration & Unit tests for Thermal Detections REST API Endpoints.
Uses FastAPI TestClient with an isolated in-memory SQLite database.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.models.detection import Detection

# In-memory test SQLite database setup with StaticPool to share connection across threads
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
def setup_database():
    """Create fresh tables before each test and drop after."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


SAMPLE_DETECTION_PAYLOAD = {
    "latitude": 21.1702,
    "longitude": 72.8311,
    "brightness": 348.2,
    "confidence": "nominal",
    "acq_date": "2026-09-09",
    "acq_time": "1415",
    "source": "VIIRS_SNPP_NRT",
    "instrument": "VIIRS",
    "frp": 52.4,
    "daynight": "D",
    "predicted_class": "industrial_fire",
    "prediction_confidence": 0.95,
    "is_persistent": False,
}


def test_create_detection_success(client):
    """Test POST /api/v1/detections with valid payload creates record."""
    response = client.post("/api/v1/detections", json=SAMPLE_DETECTION_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["latitude"] == 21.1702
    assert data["longitude"] == 72.8311
    assert data["predicted_class"] == "industrial_fire"
    assert data["prediction_confidence"] == 0.95
    assert "created_at" in data


def test_create_detection_validation_error(client):
    """Test POST /api/v1/detections rejects invalid coordinates and probabilities."""
    # Invalid latitude > 90
    bad_payload = SAMPLE_DETECTION_PAYLOAD.copy()
    bad_payload["latitude"] = 125.0
    response = client.post("/api/v1/detections", json=bad_payload)
    assert response.status_code == 422
    data = response.json()
    assert data["status"] == "error"
    assert data["code"] == 422

    # Invalid prediction confidence > 1.0
    bad_conf = SAMPLE_DETECTION_PAYLOAD.copy()
    bad_conf["prediction_confidence"] = 1.5
    response = client.post("/api/v1/detections", json=bad_conf)
    assert response.status_code == 422


def test_get_detection_by_id(client):
    """Test GET /api/v1/detections/{id} retrieves existing record."""
    # First create
    create_resp = client.post("/api/v1/detections", json=SAMPLE_DETECTION_PAYLOAD)
    created_id = create_resp.json()["id"]

    # Retrieve by ID
    get_resp = client.get(f"/api/v1/detections/{created_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == created_id
    assert get_resp.json()["predicted_class"] == "industrial_fire"


def test_get_detection_by_id_not_found(client):
    """Test GET /api/v1/detections/{id} returns 404 for missing record."""
    response = client.get("/api/v1/detections/99999")
    assert response.status_code == 404
    data = response.json()
    assert data["status"] == "error"
    assert data["code"] == 404
    assert "not found" in data["message"].lower()


def test_filter_detections_by_source_and_class(client):
    """Test filtering detections by satellite source and predicted class."""
    # Ingest record 1: VIIRS industrial fire
    client.post("/api/v1/detections", json=SAMPLE_DETECTION_PAYLOAD)

    # Ingest record 2: MODIS persistent thermal source
    p2 = SAMPLE_DETECTION_PAYLOAD.copy()
    p2["source"] = "MODIS_NRT"
    p2["predicted_class"] = "persistent_thermal_source"
    p2["is_persistent"] = True
    client.post("/api/v1/detections", json=p2)

    # Filter by source: MODIS_NRT
    resp_source = client.get("/api/v1/detections?source=MODIS_NRT")
    assert resp_source.status_code == 200
    data_source = resp_source.json()
    assert data_source["total"] == 1
    assert data_source["items"][0]["source"] == "MODIS_NRT"

    # Filter by class: persistent_thermal_source
    resp_class = client.get("/api/v1/detections?predicted_class=persistent_thermal_source")
    assert resp_class.status_code == 200
    data_class = resp_class.json()
    assert data_class["total"] == 1
    assert data_class["items"][0]["predicted_class"] == "persistent_thermal_source"


def test_filter_detections_by_date_and_confidence(client):
    """Test filtering by date range and minimum prediction confidence."""
    # Record on 2026-09-01, conf=0.70
    p1 = SAMPLE_DETECTION_PAYLOAD.copy()
    p1["acq_date"] = "2026-09-01"
    p1["prediction_confidence"] = 0.70
    client.post("/api/v1/detections", json=p1)

    # Record on 2026-09-09, conf=0.95
    p2 = SAMPLE_DETECTION_PAYLOAD.copy()
    p2["acq_date"] = "2026-09-09"
    p2["prediction_confidence"] = 0.95
    client.post("/api/v1/detections", json=p2)

    # Filter confidence >= 0.90
    resp_conf = client.get("/api/v1/detections?min_confidence=0.90")
    assert resp_conf.status_code == 200
    assert resp_conf.json()["total"] == 1
    assert resp_conf.json()["items"][0]["prediction_confidence"] == 0.95

    # Filter date range: start_date=2026-09-05
    resp_date = client.get("/api/v1/detections?start_date=2026-09-05")
    assert resp_date.status_code == 200
    assert resp_date.json()["total"] == 1
    assert resp_date.json()["items"][0]["acq_date"] == "2026-09-09"


def test_filter_detections_by_geographic_area(client):
    """Test spatial bounding box filtering (min_lat, max_lat, min_lon, max_lon)."""
    # Location 1: Mumbai area (lat: 19.07, lon: 72.87)
    p_mumbai = SAMPLE_DETECTION_PAYLOAD.copy()
    p_mumbai["latitude"] = 19.0760
    p_mumbai["longitude"] = 72.8777
    client.post("/api/v1/detections", json=p_mumbai)

    # Location 2: Kolkata area (lat: 22.57, lon: 88.36)
    p_kolkata = SAMPLE_DETECTION_PAYLOAD.copy()
    p_kolkata["latitude"] = 22.5726
    p_kolkata["longitude"] = 88.3639
    client.post("/api/v1/detections", json=p_kolkata)

    # Query bounding box covering West India (lat: 18.0 - 20.0, lon: 72.0 - 74.0)
    resp = client.get("/api/v1/detections?min_lat=18.0&max_lat=20.0&min_lon=72.0&max_lon=74.0")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["latitude"] == 19.0760


def test_detections_pagination(client):
    """Test pagination metadata: total, page, limit."""
    # Ingest 3 records
    for i in range(3):
        p = SAMPLE_DETECTION_PAYLOAD.copy()
        p["acq_time"] = f"140{i}"
        client.post("/api/v1/detections", json=p)

    resp = client.get("/api/v1/detections?skip=1&limit=1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["page"] == 2
    assert data["limit"] == 1
    assert len(data["items"]) == 1
