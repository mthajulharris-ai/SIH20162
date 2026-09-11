"""
Test Suite for SATRA AI End-to-End Inference Execution Flow.
Validates:
A. One-observation VIIRS CSV (11.0168, 76.9558, conf 85, frp 42.5)
B. MODIS CSV
C. Multiple-observation CSV
D. JSON observations
E. Invalid / Incompatible CSV
F. Empty CSV
G. Missing required columns
H. AI service unavailable -> Deterministic Rule-Based Fallback
I. Model status & configuration check endpoint
J. Standardized response format (success, analysis, metadata)
"""

import io
import json
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.ml_service import MLServiceException

client = TestClient(app)

ONE_OBS_VIIRS_CSV = """latitude,longitude,confidence,frp,bright_ti4
11.0168,76.9558,85,42.5,362.4
"""

MODIS_CSV = """latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.4707,70.0577,362.5,1.0,1.0,2024-03-03,1030,Aqua,MODIS,nominal,6.1NRT,305.8,54.0,D
22.4810,70.0612,355.1,1.0,1.0,2024-03-03,1030,Aqua,MODIS,nominal,6.1NRT,301.2,38.0,D
"""

MULTIPLE_OBS_CSV = """lat,lon,frp,confidence,temp
22.8046,86.2029,45.2,high,345.2
22.8100,86.2100,28.4,nominal,338.0
22.8250,86.2300,68.0,high,365.1
"""

JSON_OBS = json.dumps([
    {
        "latitude": 11.0168,
        "longitude": 76.9558,
        "confidence": "85",
        "frp": 42.5,
        "brightness": 355.0
    }
])


def test_one_observation_viirs_csv_execution():
    """Requirement 7: Verify a 1-observation VIIRS CSV completes inference and returns valid results."""
    file_bytes = io.BytesIO(ONE_OBS_VIIRS_CSV.encode("utf-8"))
    files = {"file": ("viirs_1obs.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()

    # Verify top-level standardized response format (Requirement 9)
    assert data["success"] is True
    assert data["status"] == "SUCCESS"
    assert data["total_records"] == 1
    assert data["exact_location"]["latitude"] == pytest.approx(11.0168, rel=1e-3)
    assert data["exact_location"]["longitude"] == pytest.approx(76.9558, rel=1e-3)
    assert data["thermal_data"]["frp"] == 42.5

    # Verify analysis block
    assert "analysis" in data
    assert data["analysis"]["total_observations"] == 1
    assert "risk_level" in data["analysis"]
    assert len(data["analysis"]["hotspots"]) == 1

    # Verify metadata block
    assert "metadata" in data
    assert data["metadata"]["source_file"] == "viirs_1obs.csv"


def test_modis_csv_execution():
    """Requirement 13: Verify standard MODIS CSV executes inference cleanly."""
    file_bytes = io.BytesIO(MODIS_CSV.encode("utf-8"))
    files = {"file": ("modis_sample.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["total_records"] == 2


def test_multiple_observation_csv_execution():
    """Verify multi-observation CSV executes inference and dynamic analytics."""
    file_bytes = io.BytesIO(MULTIPLE_OBS_CSV.encode("utf-8"))
    files = {"file": ("multi_hotspots.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["total_records"] == 3
    assert data["analysis"]["total_observations"] == 3


def test_json_observations_execution():
    """Verify JSON satellite observations are parsed and analyzed."""
    file_bytes = io.BytesIO(JSON_OBS.encode("utf-8"))
    files = {"file": ("observations.json", file_bytes, "application/json")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["total_records"] == 1


def test_empty_csv_rejected_with_structured_error():
    """Requirement 4: Verify empty CSV returns 422 with structured error body."""
    file_bytes = io.BytesIO(b"")
    files = {"file": ("empty.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["success"] is False
    assert "error" in data


def test_missing_required_columns_rejected():
    """Requirement 4: Incompatible CSV without lat/lon is rejected with 422."""
    incompatible = "customer_id,name,balance\n1,Alice,100\n"
    file_bytes = io.BytesIO(incompatible.encode("utf-8"))
    files = {"file": ("incompatible.csv", file_bytes, "text/csv")}

    response = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["success"] is False
    assert "error" in data


def test_ai_service_unavailable_activates_rule_based_fallback():
    """
    Requirement 8: If the external AI service/model fails or is unavailable,
    SATRA activates deterministic rule-based satellite analysis with a clear notice banner.
    """
    with patch("backend.services.ml_service.MLInferenceService.predict") as mock_predict:
        mock_predict.side_effect = MLServiceException("AI service connection timeout / offline")

        file_bytes = io.BytesIO(ONE_OBS_VIIRS_CSV.encode("utf-8"))
        files = {"file": ("viirs_1obs.csv", file_bytes, "text/csv")}

        response = client.post("/api/v1/inference/upload-and-analyze", files=files)
        assert response.status_code == 201
        data = response.json()

        # Verify fallback indicators
        assert data["success"] is True
        assert data["is_fallback"] is True
        assert "AI service unavailable — displaying rule-based satellite analysis." in data["fallback_notice"]
        assert data["metadata"]["is_fallback"] is True
        assert data["prediction"]["model_version"] == "rule-based-fallback-v1"


def test_model_status_endpoint():
    """Requirement 5: Check model health and configuration status endpoint."""
    response = client.get("/api/v1/inference/model-status")
    assert response.status_code == 200
    data = response.json()
    assert "is_available" in data
    assert "fallback_available" in data
    assert data["fallback_available"] is True
