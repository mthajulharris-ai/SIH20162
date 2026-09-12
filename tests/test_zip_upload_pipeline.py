"""
Unit and Integration Tests for SATRA ZIP Dataset Upload and Extraction Pipeline.
PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.
"""
import io
import json
import zipfile
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

SAMPLE_MODIS_RECORD = {
    "latitude": 22.4707,
    "longitude": 70.0577,
    "brightness": 362.5,
    "bright_t31": 305.8,
    "frp": 54.0,
    "confidence": "nominal",
    "acq_date": "2026-05-01",
    "acq_time": "1030",
    "satellite": "Terra",
    "instrument": "MODIS",
    "scan": 1.0,
    "track": 1.0,
    "daynight": "D",
    "version": "6.1NRT"
}

SAMPLE_VIIRS_CSV = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
22.8046,86.2029,335.4,0.39,0.36,2026-05-02,0730,N,VIIRS,high,2.0NRT,298.2,18.5,D
21.1702,72.8311,378.2,0.37,0.35,2026-05-02,1845,N,VIIRS,high,2.0NRT,312.0,68.4,N
"""


def test_validate_dataset_endpoint_with_valid_zip():
    """Verify /validate-dataset endpoint accepts a zip with satellite data and returns structured preview."""
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, "w") as zf:
        zf.writestr("Readme.txt", "Download notices from NASA FIRMS.")
        zf.writestr("fire_nrt_MODIS.json", json.dumps([SAMPLE_MODIS_RECORD]))

    files = {"file": ("DL_FIRE_TEST.zip", mem_zip.getvalue(), "application/zip")}
    response = client.post("/api/v1/inference/validate-dataset", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "VALID"
    assert data["filename"] == "DL_FIRE_TEST.zip"
    assert data["identified_file"] == "fire_nrt_MODIS.json"
    assert data["record_count"] == 1
    assert "NASA FIRMS MODIS" in data["format_detected"]
    assert "latitude" in data["detected_fields"]
    assert "longitude" in data["detected_fields"]
    assert "brightness" in data["detected_fields"]
    assert data["sample_preview"]["latitude"] == pytest.approx(22.4707, rel=1e-3)


def test_validate_dataset_rejects_incompatible_zip():
    """Verify ZIP with no compatible observation file returns 422 with the exact required error message."""
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, "w") as zf:
        zf.writestr("Readme.txt", "Only notes and documentation here.")
        zf.writestr("document.pdf", b"%PDF-1.4 dummy binary content")

    files = {"file": ("incompatible.zip", mem_zip.getvalue(), "application/zip")}
    response = client.post("/api/v1/inference/validate-dataset", files=files)
    assert response.status_code == 422
    data = response.json()
    err_text = data.get("detail") or data.get("error") or data.get("message")
    assert "No compatible NASA FIRMS / VIIRS / MODIS observation file found inside ZIP." in err_text


def test_upload_and_analyze_zip_executes_ai_inference():
    """Verify uploading a ZIP through upload-and-analyze extracts data, runs AI inference, and persists."""
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, "w") as zf:
        zf.writestr("Readme.txt", "NASA FIRMS readme notice.")
        zf.writestr("fire_archive_dummy.json", json.dumps([SAMPLE_MODIS_RECORD]))
        # NRT file should be prioritized over archive
        zf.writestr("fire_nrt_active.json", json.dumps([SAMPLE_MODIS_RECORD]))

    files = {"file": ("DL_FIRE_M-C61_SAMPLE.zip", mem_zip.getvalue(), "application/zip")}
    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["total_records"] == 1
    assert data["prediction"]["model_version"] == "2.0.0-scientific-prototype"
    assert data["prediction"]["predicted_class"] in ["Industrial Fire", "Persistent Thermal Source", "Other"]
    assert data["prediction"]["confidence"] > 0.0
    assert data["exact_location"]["latitude"] == pytest.approx(22.4707, rel=1e-3)
    assert data["exact_location"]["longitude"] == pytest.approx(70.0577, rel=1e-3)


def test_upload_zip_containing_csv_observation():
    """Verify ZIP containing compatible CSV observation file is parsed and analyzed."""
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, "w") as zf:
        zf.writestr("metadata.txt", "Sample metadata")
        zf.writestr("nested/observations/viirs_data.csv", SAMPLE_VIIRS_CSV)

    files = {"file": ("viirs_bundle.zip", mem_zip.getvalue(), "application/zip")}
    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["total_records"] == 2
    assert "VIIRS" in data["all_detections"][0]["instrument"]


def test_zip_path_traversal_protection():
    """Verify ZIP containing relative path traversal (..) is rejected securely."""
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, "w") as zf:
        zf.writestr("../../etc/passwd", "root:x:0:0:")

    files = {"file": ("malicious.zip", mem_zip.getvalue(), "application/zip")}
    response = client.post("/api/v1/inference/validate-dataset", files=files)
    assert response.status_code == 422
    assert "unsafe path traversal" in response.text.lower()
