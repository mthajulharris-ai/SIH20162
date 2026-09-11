"""
Test suite for SATRA Core Pipeline Upload & Analyze Endpoint.
Tests:
- Upload of valid NASA FIRMS CSV format
- Extraction of exact latitude & longitude coordinates
- Validation errors on out-of-bounds latitude/longitude
- AI classification response and alert evaluation
- Provenance and persistence in SQLite database
"""
import io
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

SAMPLE_FIRMS_CSV = """# NOTICE: TEST NASA FIRMS OBSERVATION
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.8046,86.2029,335.4,0.39,0.36,2024-03-01,0730,N,VIIRS,high,2.0NRT,298.2,18.5,D
"""

def test_upload_and_analyze_valid_firms_csv():
    """Verify valid NASA FIRMS CSV file upload executes AI classification and preserves exact coordinates."""
    file_bytes = io.BytesIO(SAMPLE_FIRMS_CSV.encode("utf-8"))
    files = {"file": ("firms_viirs_test.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"

    data = response.json()
    assert data["status"] == "SUCCESS"

    # Verify exact coordinates are preserved
    assert abs(data["exact_location"]["latitude"] - 22.8046) < 1e-4
    assert abs(data["exact_location"]["longitude"] - 86.2029) < 1e-4

    # Verify observation details
    assert data["observation"]["acq_date"] == "2024-03-01"
    assert data["observation"]["acq_time"] == "0730"
    assert data["observation"]["instrument"] == "VIIRS"

    # Verify thermal data
    assert abs(data["thermal_data"]["brightness"] - 335.4) < 1e-2
    assert abs(data["thermal_data"]["frp"] - 18.5) < 1e-2

    # Verify AI prediction
    assert "predicted_class" in data["prediction"]
    assert data["prediction"]["confidence"] > 0.0
    assert "model_version" in data["prediction"]

    # Verify risk and alert
    assert "alert_level" in data["risk"]

    # Verify detection persistence in response
    assert data["detection"]["id"] is not None
    assert abs(data["detection"]["latitude"] - 22.8046) < 1e-4
    assert abs(data["detection"]["longitude"] - 86.2029) < 1e-4


def test_upload_invalid_latitude_rejected():
    """Verify out-of-bounds latitude (> 90.0) is rejected with 422 Unprocessable Entity."""
    bad_csv = """latitude,longitude,brightness
95.4321,80.1234,340.0
"""
    file_bytes = io.BytesIO(bad_csv.encode("utf-8"))
    files = {"file": ("bad_lat.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 422
    err_text = str(response.json().get("message") or response.json().get("detail") or "").lower()
    assert "out of valid range" in err_text or "validation" in err_text


def test_upload_invalid_longitude_rejected():
    """Verify out-of-bounds longitude (> 180.0) is rejected with 422 Unprocessable Entity."""
    bad_csv = """latitude,longitude,brightness
22.4321,195.1234,340.0
"""
    file_bytes = io.BytesIO(bad_csv.encode("utf-8"))
    files = {"file": ("bad_lon.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 422
    err_text = str(response.json().get("message") or response.json().get("detail") or "").lower()
    assert "out of valid range" in err_text or "validation" in err_text


def test_upload_missing_file_rejected():
    """Verify request without file is rejected."""
    response = client.post("/api/v1/inference/upload-and-analyze")
    assert response.status_code in (400, 422)


def test_upload_empty_file_rejected():
    """Verify empty file is rejected with 422."""
    file_bytes = io.BytesIO(b"   \n\n")
    files = {"file": ("empty.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 422
