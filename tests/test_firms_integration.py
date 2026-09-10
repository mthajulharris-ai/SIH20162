"""
Unit and Integration Tests for Phase 2: Real NASA FIRMS Satellite Data Integration.

Validates:
- FIRMS API configuration (detection & missing key handling)
- HTTP error codes (403 Unauthorized, 429 Rate Limit, 500/503 Server Error)
- Empty response & header-only response handling (0 detections)
- Malformed & HTML error payload rejection
- Raw file isolation (unmodified NASA data saved to disk)
- Data provenance assignment (REAL_FIRMS, SAMPLE, PROTOTYPE_LABELLED)
- Multi-temporal duplicate vs recurrence preservation
- Full end-to-end pipeline compatibility with existing ML model
- Inference contract compliance for backend integration

ALL network operations are mocked via unittest.mock.patch (zero network requests during tests).
"""

import io
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from src.config import (
    PROVENANCE_PROTOTYPE_LABELLED,
    PROVENANCE_REAL_FIRMS,
    PROVENANCE_SAMPLE,
    STANDARD_COLUMNS,
)
from src.data_pipeline.cleaner import remove_duplicates
from src.data_pipeline.collector import (
    INDUSTRIAL_REGION_BOUNDS,
    FirmsAPIError,
    FirmsDataCollector,
)
from src.data_pipeline.ingestion import ThermalDataIngestionPipeline
from src.data_pipeline.preprocessor import SatelliteDataCleaner
from src.inference.service import get_prediction_service
from src.pipeline_runner import SatelliteMLPipeline

# Sample standard VIIRS CSV response as returned by NASA FIRMS API
SAMPLE_VIIRS_NASA_CSV = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
    "22.8046,86.2029,345.2,0.39,0.36,2024-03-01,0730,N,VIIRS,nominal,2.0NRT,298.2,28.5,D\n"
    "22.8051,86.2035,352.8,0.40,0.37,2024-03-01,0730,N,VIIRS,high,2.0NRT,301.0,42.1,D\n"
    "21.1904,81.3809,368.5,0.41,0.37,2024-03-01,0800,1,VIIRS,high,2.0NRT,305.2,85.4,D\n"
)


# =========================================================================
# 1. API Configuration & Missing Key Tests
# =========================================================================

def test_collector_api_key_configuration():
    """Verify collector detects valid vs missing API keys correctly."""
    valid_col = FirmsDataCollector(map_key="abcdef1234567890")
    assert valid_col.is_api_key_configured() is True

    empty_col = FirmsDataCollector(map_key="")
    assert empty_col.is_api_key_configured() is False

    short_col = FirmsDataCollector(map_key="short")
    assert short_col.is_api_key_configured() is False


def test_collector_missing_key_raises_informative_error(tmp_path):
    """Verify missing API key raises FirmsAPIError with clear acquisition instructions."""
    collector = FirmsDataCollector(map_key="", raw_storage_dir=tmp_path)
    with pytest.raises(FirmsAPIError) as exc_info:
        collector.fetch_country_data(country_code="IND")

    error_msg = str(exc_info.value)
    assert "NASA FIRMS MAP_KEY is not configured" in error_msg
    assert "https://firms.modaps.eosdis.nasa.gov/api/map_key/" in error_msg


# =========================================================================
# 2. HTTP Error & Network Handling Tests (MOCKED)
# =========================================================================

def test_collector_http_403_forbidden(tmp_path):
    """Verify HTTP 403 returns explicit invalid map key error."""
    collector = FirmsDataCollector(map_key="invalid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 403

    with patch("requests.get", return_value=mock_resp):
        with pytest.raises(FirmsAPIError) as exc_info:
            collector.fetch_country_data(country_code="IND")
        assert "403 Forbidden" in str(exc_info.value)
        assert "MAP_KEY is invalid" in str(exc_info.value)


def test_collector_http_429_rate_limit(tmp_path):
    """Verify HTTP 429 returns clear rate limit guidance."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 429

    with patch("requests.get", return_value=mock_resp):
        with pytest.raises(FirmsAPIError) as exc_info:
            collector.fetch_country_data(country_code="IND")
        assert "rate limit exceeded" in str(exc_info.value)


def test_collector_http_500_server_error(tmp_path):
    """Verify HTTP 500/503 indicates NASA server maintenance."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 503

    with patch("requests.get", return_value=mock_resp):
        with pytest.raises(FirmsAPIError) as exc_info:
            collector.fetch_country_data(country_code="IND")
        assert "server error (HTTP 503)" in str(exc_info.value)


# =========================================================================
# 3. Empty Response & Malformed Response Tests
# =========================================================================

def test_collector_empty_response_returns_empty_dataframe(tmp_path):
    """Verify completely empty response (0 detections) returns empty DataFrame without crashing."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = ""

    with patch("requests.get", return_value=mock_resp):
        df, saved_path = collector.fetch_country_data(country_code="IND")
        assert df.empty
        assert "data_provenance" in df.columns
        assert saved_path is None


def test_collector_header_only_response(tmp_path):
    """Verify CSV with only headers (0 observations) returns empty DataFrame gracefully."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = (
        "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
    )

    with patch("requests.get", return_value=mock_resp):
        df, saved_path = collector.fetch_country_data(country_code="IND")
        assert df.empty
        assert "data_provenance" in df.columns
        assert saved_path is None


def test_collector_html_error_response_raises(tmp_path):
    """Verify unexpected HTML error page (e.g. gateway error) raises FirmsAPIError."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "<html><body><h1>502 Bad Gateway</h1></body></html>"

    with patch("requests.get", return_value=mock_resp):
        with pytest.raises(FirmsAPIError) as exc_info:
            collector.fetch_country_data(country_code="IND")
        assert "unexpected HTML error" in str(exc_info.value)


def test_collector_bad_map_key_body_raises(tmp_path):
    """Verify NASA error text in HTTP 200 response raises FirmsAPIError."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "Bad map_key"

    with patch("requests.get", return_value=mock_resp):
        with pytest.raises(FirmsAPIError) as exc_info:
            collector.fetch_country_data(country_code="IND")
        assert "Bad map_key" in str(exc_info.value)


# =========================================================================
# 4. Successful Parsing, Raw Isolation, and Provenance Labeling
# =========================================================================

def test_collector_successful_viirs_parsing_and_provenance(tmp_path):
    """Verify real data download parses cleanly, sets REAL_FIRMS, and keeps raw file unmutated."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_VIIRS_NASA_CSV

    with patch("requests.get", return_value=mock_resp):
        df, saved_path = collector.fetch_country_data(country_code="IND", save_to_raw=True)

        # In-memory DataFrame assertions
        assert len(df) == 3
        assert "data_provenance" in df.columns
        assert (df["data_provenance"] == PROVENANCE_REAL_FIRMS).all()
        assert "latitude" in df.columns
        assert "frp" in df.columns

        # Raw file assertions (must be unaltered NASA output)
        assert saved_path is not None
        assert saved_path.exists()
        with open(saved_path, "r", encoding="utf-8") as f:
            raw_content = f.read()
        # Raw file must NOT contain fabricated columns
        assert "data_provenance" not in raw_content
        assert "predicted_class" not in raw_content
        assert "22.8046" in raw_content


def test_collector_modis_extensibility(tmp_path):
    """Verify collector supports MODIS product queries seamlessly."""
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_modis_csv = (
        "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight\n"
        "22.8046,86.2029,325.4,1.1,1.0,2024-03-01,0530,Terra,85,6.1NRT,295.2,35.0,D\n"
    )
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = mock_modis_csv

    with patch("requests.get", return_value=mock_resp) as mock_get:
        df, saved_path = collector.fetch_country_data(
            country_code="IND",
            source="MODIS_NRT",
            day_range=2
        )
        assert "MODIS_NRT" in mock_get.call_args[0][0]
        assert len(df) == 1
        assert df["data_provenance"].iloc[0] == PROVENANCE_REAL_FIRMS


# =========================================================================
# 5. Duplicate & Temporal Handling Tests (Phase 2D)
# =========================================================================

def test_safe_duplicate_vs_recurrence_handling():
    """
    Verify duplicate handling logic:
    - Same satellite pass with identical coordinates + same timestamp -> DROPPED as duplicate.
    - Multiple passes at same industrial coordinate with DIFFERENT timestamps -> PRESERVED for recurrence analysis.
    """
    cleaner = SatelliteDataCleaner(coordinate_precision_decimals=4)

    # DataFrame with:
    # Rows 0 & 1: Exact duplicate observation from same pass
    # Row 2: Recurring observation at exact same facility on the next day (should be PRESERVED)
    # Row 3: Distinct facility
    data = pd.DataFrame([
        {
            "latitude": 22.80461,
            "longitude": 86.20291,
            "brightness": 345.0,
            "confidence": "nominal",
            "acq_date": "2024-03-01",
            "acq_time": "0730",
            "satellite": "N",
            "data_provenance": PROVENANCE_REAL_FIRMS
        },
        {
            "latitude": 22.80464,  # Rounds to 22.8046 (same location)
            "longitude": 86.20294,  # Rounds to 86.2029 (same location)
            "brightness": 345.0,
            "confidence": "nominal",
            "acq_date": "2024-03-01",
            "acq_time": "0730",     # Same time -> Duplicate
            "satellite": "N",
            "data_provenance": PROVENANCE_REAL_FIRMS
        },
        {
            "latitude": 22.80462,  # Same facility
            "longitude": 86.20292,
            "brightness": 348.0,
            "confidence": "high",
            "acq_date": "2024-03-02",  # Next day -> Multi-temporal recurrence! Must be PRESERVED
            "acq_time": "0715",
            "satellite": "N",
            "data_provenance": PROVENANCE_REAL_FIRMS
        },
        {
            "latitude": 21.1904,
            "longitude": 81.3809,
            "brightness": 360.0,
            "confidence": "high",
            "acq_date": "2024-03-01",
            "acq_time": "0800",
            "satellite": "1",
            "data_provenance": PROVENANCE_REAL_FIRMS
        }
    ])

    cleaned_df, report = cleaner.clean(data)

    # Initial 4 rows -> exactly 1 duplicate dropped -> 3 records retained
    assert report.input_rows == 4
    assert report.duplicate_count == 1
    assert len(cleaned_df) == 3
    assert report.retention_rate_pct == 75.0

    # Both Day 1 (2024-03-01) and Day 2 (2024-03-02) observations at 22.8046 are present
    jharkhand_records = cleaned_df[cleaned_df["latitude"].round(4) == 22.8046]
    assert len(jharkhand_records) == 2
    assert set(jharkhand_records["acq_date"]) == {"2024-03-01", "2024-03-02"}


# =========================================================================
# 6. Provenance Tagging & Isolation Tests (Phase 2C)
# =========================================================================

def test_provenance_constants_and_labeling():
    """Verify distinct provenance categories are strictly enforced."""
    assert PROVENANCE_REAL_FIRMS == "REAL_FIRMS"
    assert PROVENANCE_SAMPLE == "SAMPLE"
    assert PROVENANCE_PROTOTYPE_LABELLED == "PROTOTYPE_LABELLED"

    # Verify ingestion assigns correct provenance
    ingestion = ThermalDataIngestionPipeline()
    sample_payload = [
        {
            "latitude": 22.80,
            "longitude": 86.20,
            "brightness": 330.0,
            "confidence": "nominal",
            "acq_date": "2024-03-01",
            "acq_time": "0730",
            "satellite": "N"
        }
    ]

    df_real, _ = ingestion.ingest_from_api_payload(
        sample_payload,
        data_provenance=PROVENANCE_REAL_FIRMS,
        save_raw_backup=False
    )
    assert df_real["data_provenance"].iloc[0] == PROVENANCE_REAL_FIRMS

    df_sample, _ = ingestion.ingest_from_api_payload(
        sample_payload,
        data_provenance=PROVENANCE_SAMPLE,
        save_raw_backup=False
    )
    assert df_sample["data_provenance"].iloc[0] == PROVENANCE_SAMPLE


# =========================================================================
# 7. End-to-End Real Data Pipeline Integration Test (Phase 2B)
# =========================================================================

def test_end_to_end_real_data_pipeline_flow(tmp_path):
    """
    Validates complete end-to-end flow:
    NASA FIRMS -> Ingestion/Collector -> Cleaning -> Feature Engineering -> ML Inference
    Verifies that:
    1. Provenance REAL_FIRMS flows all the way to final classified catalog.
    2. Prediction contracts match backend expectations.
    3. Alert levels and confidence scores are attached correctly.
    """
    collector = FirmsDataCollector(map_key="valid_test_key_12345", raw_storage_dir=tmp_path)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_VIIRS_NASA_CSV

    with patch("requests.get", return_value=mock_resp):
        df_real_raw, _ = collector.fetch_country_data(country_code="IND", save_to_raw=False)

    assert not df_real_raw.empty
    assert df_real_raw["data_provenance"].iloc[0] == PROVENANCE_REAL_FIRMS

    # Run complete Satellite Data & AI/ML Pipeline
    pipeline = SatelliteMLPipeline()
    out_filename = "test_real_firms_classified.csv"
    df_classified, summary = pipeline.run(
        raw_dataframe=df_real_raw,
        output_filename=out_filename,
        save_results=False,
        data_provenance=PROVENANCE_REAL_FIRMS
    )

    # Assert execution success
    assert summary.execution_status == "SUCCESS"
    assert summary.total_raw_records == 3
    assert summary.classified_records == 3

    # Assert required schema fields are present
    required_output_columns = [
        "latitude",
        "longitude",
        "brightness",
        "data_provenance",
        "predicted_class",
        "predicted_class_id",
        "prediction_confidence",
        "alert_level",
        "model_version",
        "prediction_timestamp",
        "prob_industrial_fire",
        "prob_persistent_source",
        "prob_other"
    ]
    for col in required_output_columns:
        assert col in df_classified.columns, f"Missing expected column: {col}"

    # Assert provenance is REAL_FIRMS across all classified rows
    assert (df_classified["data_provenance"] == PROVENANCE_REAL_FIRMS).all()

    # Assert predictions are within legitimate classes
    valid_classes = {"Industrial Fire", "Persistent Thermal Source", "Other"}
    for pred in df_classified["predicted_class"]:
        assert pred in valid_classes

    # Assert alert levels
    valid_alerts = {"LOW", "MEDIUM", "CRITICAL"}
    for alert in df_classified["alert_level"]:
        assert alert in valid_alerts

    # Assert confidence is valid probability [0.0, 1.0]
    for conf in df_classified["prediction_confidence"]:
        assert 0.0 <= conf <= 1.0


# =========================================================================
# 8. Inference Contract Compatibility (Backend Handover)
# =========================================================================

def test_inference_contract_compatibility():
    """
    Verify inference output adheres strictly to the contract expected by FastAPI backend:
    - predicted_class
    - confidence
    - alert_level
    - model_version
    - prediction_timestamp
    """
    service = get_prediction_service()
    test_observation = {
        "latitude": 22.8046,
        "longitude": 86.2029,
        "brightness": 350.0,
        "bright_t31": 298.0,
        "frp": 35.0,
        "confidence": "high",
        "daynight": "D",
        "hour_utc": 8,
        "data_provenance": PROVENANCE_REAL_FIRMS
    }

    result = service.predict_single(test_observation)

    assert result["status"] == "SUCCESS"
    assert "predicted_class" in result
    assert "confidence" in result
    assert "alert_level" in result
    assert "model_version" in result
    assert "prediction_timestamp" in result
    assert "class_probabilities" in result
    assert isinstance(result["confidence"], float)
    assert result["alert_level"] in ["LOW", "MEDIUM", "CRITICAL"]
