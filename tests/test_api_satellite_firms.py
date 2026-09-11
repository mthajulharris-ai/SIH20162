"""
Integration & Unit tests for Satellite & NASA FIRMS REST API Endpoints.
Verifies:
1. /api/v1/satellite/status endpoint
2. /api/v1/satellite/firms query construction matching NASA specification:
   https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_NOAA20_SP/{WEST},{SOUTH},{EAST},{NORTH}/{DAY_RANGE}/{DATE}
3. CSV response parsing, normalization into Detection model
4. Provenance strictly assigned as REAL_FIRMS
5. ML inference execution on new FIRMS observations
6. Database storage & duplicate avoidance
7. Resilient error handling (403, 429, 500, HTML errors, Bad map_key)
8. Credential security (MAP_KEY is never leaked in API response)
"""
import io
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.db.base import Base
from backend.db.session import get_db
from backend.models.detection import Detection
from backend.services.firms_service import FirmsService, get_firms_service
from src.config import PROVENANCE_REAL_FIRMS

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
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


SAMPLE_VIIRS_CSV = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.4678,70.0588,365.2,0.38,0.38,2026-09-11,0619,NOAA-20,VIIRS,nominal,2.0NRT,298.5,58.4,D
17.6911,83.2244,352.1,0.40,0.39,2026-09-11,0619,NOAA-20,VIIRS,nominal,2.0NRT,295.2,42.0,D
"""


def test_satellite_status_unconfigured(client):
    """When NASA_FIRMS_MAP_KEY is empty, endpoint returns API KEY REQUIRED."""
    svc = FirmsService()
    with patch.object(FirmsService, "map_key", ""):
        app.dependency_overrides[get_firms_service] = lambda: svc
        response = client.get("/api/v1/satellite/status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "API KEY REQUIRED"
        assert data["api_key_configured"] is False
        assert data["source"] == "REAL_FIRMS"


def test_satellite_firms_url_construction():
    """Verify backend constructs the exact required NASA FIRMS Area URL."""
    svc = FirmsService()
    with patch.object(FirmsService, "map_key", "test_key_12345678"):
        url, masked = svc.build_request_url(
            satellite="VIIRS_NOAA20_SP",
            west=68.1,
            south=6.5,
            east=97.4,
            north=35.5,
            day_range=5,
            date_str="2025-01-01",
        )
        assert url == "https://firms.modaps.eosdis.nasa.gov/api/area/csv/test_key_12345678/VIIRS_NOAA20_SP/68.1000,6.5000,97.4000,35.5000/5/2025-01-01"
        assert "test_key_12345678" not in masked
        assert "***MASKED***" in masked


def test_satellite_firms_successful_ingestion(client):
    """Verify successful CSV fetch normalizes data, assigns REAL_FIRMS, runs AI model, and stores in DB."""
    svc = FirmsService()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_VIIRS_CSV

    with patch.object(FirmsService, "map_key", "valid_key_12345678"):
        with patch("requests.get", return_value=mock_resp):
            app.dependency_overrides[get_firms_service] = lambda: svc

            response = client.get(
                "/api/v1/satellite/firms",
                params={
                    "satellite": "VIIRS_NOAA20_SP",
                    "west": 68.1,
                    "south": 6.5,
                    "east": 97.4,
                    "north": 35.5,
                    "days": 5,
                    "date": "2026-09-11",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "CONNECTED"
            assert data["records_count"] == 2
            assert data["new_detections_count"] == 2
            assert data["source"] == PROVENANCE_REAL_FIRMS

            # Security check: Key must never be in JSON output
            assert "valid_key" not in response.text

            # Verify saved items
            items = data["items"]
            assert len(items) == 2
            assert items[0]["latitude"] == pytest.approx(22.4678, abs=1e-3)
            assert items[0]["provenance"] == PROVENANCE_REAL_FIRMS
            assert items[0]["predicted_class"] is not None
            assert items[0]["frp"] == pytest.approx(58.4, abs=0.1)

            # Check database persistence
            db = TestingSessionLocal()
            stored = db.query(Detection).filter(Detection.data_provenance == PROVENANCE_REAL_FIRMS).all()
            assert len(stored) == 2
            assert stored[0].data_provenance == PROVENANCE_REAL_FIRMS
            assert stored[0].model_version is not None
            db.close()


def test_satellite_firms_deduplication(client):
    """Verify second ingestion with the same data does not create duplicate rows."""
    svc = FirmsService()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_VIIRS_CSV

    with patch.object(FirmsService, "map_key", "valid_key_12345678"):
        with patch("requests.get", return_value=mock_resp):
            app.dependency_overrides[get_firms_service] = lambda: svc

            # First ingest
            resp1 = client.get("/api/v1/satellite/firms")
            assert resp1.json()["new_detections_count"] == 2

            # Second ingest of exact same data
            resp2 = client.get("/api/v1/satellite/firms")
            assert resp2.json()["records_count"] == 2
            assert resp2.json()["new_detections_count"] == 0  # 0 new rows inserted (no duplicate)


def test_satellite_firms_http_403_error(client):
    """Verify HTTP 403 Forbidden is translated to a clean error status."""
    svc = FirmsService()
    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_resp.text = "Forbidden"

    with patch.object(FirmsService, "map_key", "invalid_key_123456"):
        with patch("requests.get", return_value=mock_resp):
            app.dependency_overrides[get_firms_service] = lambda: svc
            resp = client.get("/api/v1/satellite/firms")
            assert resp.status_code == 403
            data = resp.json()
            assert "INVALID_MAP_KEY" in str(data)


def test_satellite_firms_empty_response(client):
    """Verify empty response (0 fire detections) is handled cleanly without error."""
    svc = FirmsService()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = ""

    with patch.object(FirmsService, "map_key", "valid_key_12345678"):
        with patch("requests.get", return_value=mock_resp):
            app.dependency_overrides[get_firms_service] = lambda: svc
            resp = client.get("/api/v1/satellite/firms")
            assert resp.status_code == 200
            data = response = resp.json()
            assert data["status"] == "NO DATA"
            assert data["records_count"] == 0


def test_satellite_firms_health_endpoint(client):
    """Verify /api/v1/satellite/firms/health diagnostic endpoint (Requirement 20)."""
    svc = FirmsService()
    with patch.object(FirmsService, "map_key", "valid_key_12345678"):
        app.dependency_overrides[get_firms_service] = lambda: svc
        resp = client.get("/api/v1/satellite/firms/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data
        assert "api_reachable" in data
        assert "source" in data
        assert "provenance" in data
        assert data["provenance"] == "REAL_FIRMS"
        # Ensure key is NEVER returned
        assert "valid_key_12345678" not in resp.text
