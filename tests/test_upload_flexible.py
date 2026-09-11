"""
Comprehensive Test Suite for SATRA AI Flexible Satellite Observation File Ingestion.
Tests:
1. MODIS standard CSV (e.g., modis_2021_India.csv)
2. VIIRS standard CSV (e.g., VIIRS_India_2024.csv)
3. Custom user CSV with generic column variations (e.g., fire_detections.csv)
4. JSON observations array (observations.json)
5. GeoJSON FeatureCollection
6. Multi-file upload combining datasets while preserving source filename
7. Missing optional fields (no brightness, no FRP) handled gracefully without crashing
8. Incompatible file rejected with the required professional error message
9. Filename independence: any valid filename is accepted based on content
"""

import io
import json
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

MODIS_CSV_CONTENT = """latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.4707,70.0577,362.5,1.0,1.0,2021-04-15,1030,Terra,MODIS,85,6.1NRT,295.4,54.0,D
22.4810,70.0612,355.1,1.0,1.0,2021-04-15,1030,Terra,MODIS,78,6.1NRT,293.1,42.3,D
"""

VIIRS_CSV_CONTENT = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
21.1702,72.8311,378.2,0.37,0.35,2024-03-02,1845,N,VIIRS,high,2.0NRT,312.0,68.4,N
21.1805,72.8420,365.4,0.38,0.36,2024-03-02,1845,N,VIIRS,nominal,2.0NRT,305.2,45.1,N
"""

CUSTOM_USER_CSV_CONTENT = """lat,lon,temp,FRP,conf,date,time,sat
22.8046,86.2029,345.2,35.4,high,2024-05-10,0745,VIIRS
22.8100,86.2100,340.1,28.2,nominal,2024-05-10,0745,VIIRS
"""

JSON_OBSERVATIONS_CONTENT = json.dumps([
    {
        "latitude": 23.6102,
        "longitude": 85.2799,
        "brightness": 352.0,
        "frp": 38.5,
        "confidence": "high",
        "acq_date": "2024-06-01",
        "acq_time": "1320",
        "satellite": "VIIRS (S-NPP)",
        "instrument": "VIIRS"
    },
    {
        "latitude": 23.6210,
        "longitude": 85.2910,
        "brightness": 348.5,
        "frp": 29.0,
        "confidence": "nominal",
        "acq_date": "2024-06-01",
        "acq_time": "1320",
        "satellite": "VIIRS (S-NPP)",
        "instrument": "VIIRS"
    }
])

GEOJSON_CONTENT = json.dumps({
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [86.2029, 22.8046]
            },
            "properties": {
                "bright_ti4": 365.2,
                "frp": 44.0,
                "confidence": "high",
                "acq_date": "2024-07-15",
                "acq_time": "0800",
                "instrument": "VIIRS"
            }
        }
    ]
})

INCOMPATIBLE_CSV_CONTENT = """student_id,name,grade,subject
101,Alice,A,Physics
102,Bob,B,Chemistry
103,Charlie,A,Mathematics
"""


def test_upload_modis_standard_filename_accepted():
    """Verify standard MODIS file (e.g., modis_2021_India.csv) is accepted and parsed."""
    file_bytes = io.BytesIO(MODIS_CSV_CONTENT.encode("utf-8"))
    files = {"file": ("modis_2021_India.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["total_records"] == 2
    assert abs(data["exact_location"]["latitude"] - 22.4707) < 1e-4
    assert data["analysis_summary"] is not None
    assert data["analysis_summary"]["total_records"] == 2
    assert "latitude" in data["analysis_summary"]["available_fields"]
    assert "brightness" in data["analysis_summary"]["available_fields"]
    assert "frp" in data["analysis_summary"]["available_fields"]


def test_upload_viirs_standard_filename_accepted():
    """Verify standard VIIRS file (e.g., VIIRS_India_2024.csv) with bright_ti4 is accepted."""
    file_bytes = io.BytesIO(VIIRS_CSV_CONTENT.encode("utf-8"))
    files = {"file": ("VIIRS_India_2024.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["total_records"] == 2
    assert abs(data["exact_location"]["latitude"] - 21.1702) < 1e-4
    assert abs(data["thermal_data"]["brightness"] - 378.2) < 1e-2


def test_upload_generic_user_csv_accepted():
    """Verify user CSV with custom column aliases (lat, lon, temp, conf) is normalized and accepted."""
    file_bytes = io.BytesIO(CUSTOM_USER_CSV_CONTENT.encode("utf-8"))
    files = {"file": ("fire_detections.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert abs(data["exact_location"]["latitude"] - 22.8046) < 1e-4
    assert abs(data["exact_location"]["longitude"] - 86.2029) < 1e-4


def test_upload_json_observations_accepted():
    """Verify JSON file format (observations.json) is accepted and analyzed."""
    file_bytes = io.BytesIO(JSON_OBSERVATIONS_CONTENT.encode("utf-8"))
    files = {"file": ("observations.json", file_bytes, "application/json")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["total_records"] == 2
    assert abs(data["exact_location"]["latitude"] - 23.6102) < 1e-4


def test_upload_geojson_observations_accepted():
    """Verify GeoJSON FeatureCollection format is accepted and coordinates extracted."""
    file_bytes = io.BytesIO(GEOJSON_CONTENT.encode("utf-8"))
    files = {"file": ("thermal_features.geojson", file_bytes, "application/geo+json")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert abs(data["exact_location"]["latitude"] - 22.8046) < 1e-4
    assert abs(data["exact_location"]["longitude"] - 86.2029) < 1e-4


def test_upload_multiple_files_combined():
    """Verify uploading multiple observation files combines datasets and records file provenance."""
    f1_bytes = io.BytesIO(MODIS_CSV_CONTENT.encode("utf-8"))
    f2_bytes = io.BytesIO(VIIRS_CSV_CONTENT.encode("utf-8"))

    files = [
        ("files", ("modis_2021_India.csv", f1_bytes, "text/csv")),
        ("files", ("VIIRS_India_2024.csv", f2_bytes, "text/csv")),
    ]

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["total_records"] == 4  # 2 from MODIS + 2 from VIIRS

    # Check file contributions summary
    summary = data["analysis_summary"]
    assert summary is not None
    assert len(summary["files_summary"]) == 2
    f_names = [f["filename"] for f in summary["files_summary"]]
    assert "modis_2021_India.csv" in f_names
    assert "VIIRS_India_2024.csv" in f_names


def test_upload_missing_optional_fields_graceful():
    """Verify file without brightness or without FRP does not crash, does not invent data, and succeeds."""
    sparse_csv = """latitude,longitude,confidence,acq_date,acq_time,satellite
22.8046,86.2029,high,2024-08-01,1200,VIIRS
"""
    file_bytes = io.BytesIO(sparse_csv.encode("utf-8"))
    files = {"file": ("sparse_observations.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["thermal_data"]["brightness"] is None
    assert data["thermal_data"]["frp"] is None
    # In analysis summary, frp_analysis and brightness_analysis should be None
    assert data["analysis_summary"]["frp_analysis"] is None
    assert data["analysis_summary"]["brightness_analysis"] is None


def test_upload_incompatible_file_rejected_with_exact_message():
    """Verify incompatible file with no coordinates/thermal data is rejected with the exact required error."""
    file_bytes = io.BytesIO(INCOMPATIBLE_CSV_CONTENT.encode("utf-8"))
    files = {"file": ("grades.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 422
    err_text = response.json().get("detail", "")
    assert "Unsupported observation format" in err_text
    assert "We could not identify sufficient satellite thermal/fire observation fields" in err_text
    assert "Please upload a NASA FIRMS, MODIS, VIIRS-compatible CSV or JSON file" in err_text
    # Verify it does NOT mention any hardcoded specific filename
    assert "satra_thermal_detections" not in err_text
