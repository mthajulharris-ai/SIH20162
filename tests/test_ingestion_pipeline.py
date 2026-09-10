"""
Unit tests for Task 1: Satellite Thermal Data Ingestion Pipeline.
"""

import pytest
import pandas as pd
from pathlib import Path

from src.data_pipeline.ingestion import (
    ThermalDataIngestionPipeline,
    IngestionValidationError,
    IngestionAuditSummary
)
from src.config import SAMPLES_DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR


@pytest.fixture
def pipeline():
    return ThermalDataIngestionPipeline()


def test_ingest_sample_csv_preserves_raw(pipeline, tmp_path):
    """Verify ingestion parses CSV, writes to processed, and leaves raw file unchanged."""
    sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
    with open(sample_file, "r") as f:
        original_raw_bytes = f.read()

    out_name = "test_ingested_output.csv"
    df_valid, summary = pipeline.ingest_from_csv(sample_file, output_filename=out_name)

    # 1. Raw file must be identical byte-for-byte
    with open(sample_file, "r") as f:
        current_raw_bytes = f.read()
    assert original_raw_bytes == current_raw_bytes

    # 2. Output file must exist in processed directory
    out_file = PROCESSED_DATA_DIR / out_name
    assert out_file.exists()
    assert len(df_valid) == 10
    assert summary.valid_records_retained == 10
    assert summary.data_retention_rate_pct == 100.0


def test_ingest_drops_malformed_coordinates(pipeline):
    """Verify out-of-bounds coordinates (>90 lat, >180 lon, null island) are dropped."""
    payload = [
        {"latitude": 28.6, "longitude": 77.2, "brightness": 320.0, "confidence": "n", "acq_date": "2024-03-01", "acq_time": "1200", "satellite": "N"},
        {"latitude": 95.0, "longitude": 77.2, "brightness": 320.0, "confidence": "n", "acq_date": "2024-03-01", "acq_time": "1200", "satellite": "N"},  # invalid lat
        {"latitude": 28.6, "longitude": 210.0, "brightness": 320.0, "confidence": "n", "acq_date": "2024-03-01", "acq_time": "1200", "satellite": "N"}, # invalid lon
        {"latitude": 0.0, "longitude": 0.0, "brightness": 320.0, "confidence": "n", "acq_date": "2024-03-01", "acq_time": "1200", "satellite": "N"}      # null island
    ]

    df_valid, summary = pipeline.ingest_from_api_payload(payload, save_raw_backup=False)
    assert len(df_valid) == 1
    assert df_valid.iloc[0]["latitude"] == 28.6
    assert summary.dropped_invalid_coordinates == 3


def test_ingest_drops_unphysical_temperatures(pipeline):
    """Verify temperatures outside [200K, 600K] and negative FRP are dropped."""
    payload = [
        {"latitude": 22.0, "longitude": 85.0, "brightness": 335.0, "confidence": "h", "acq_date": "2024-03-01", "acq_time": "0730", "satellite": "N", "frp": 15.0},
        {"latitude": 22.1, "longitude": 85.1, "brightness": 120.0, "confidence": "h", "acq_date": "2024-03-01", "acq_time": "0730", "satellite": "N", "frp": 15.0},  # unphysical 120K
        {"latitude": 22.2, "longitude": 85.2, "brightness": 750.0, "confidence": "h", "acq_date": "2024-03-01", "acq_time": "0730", "satellite": "N", "frp": 15.0},  # unphysical 750K
        {"latitude": 22.3, "longitude": 85.3, "brightness": 340.0, "confidence": "h", "acq_date": "2024-03-01", "acq_time": "0730", "satellite": "N", "frp": -20.0}   # negative FRP
    ]

    df_valid, summary = pipeline.ingest_from_api_payload(payload, save_raw_backup=False)
    assert len(df_valid) == 1
    assert df_valid.iloc[0]["brightness"] == 335.0
    assert summary.dropped_unphysical_temperatures == 3


def test_ingest_handles_malformed_times(pipeline):
    """Verify corrupt clock strings like 2599 or non-numeric strings are safely dropped."""
    payload = [
        {"latitude": 21.0, "longitude": 82.0, "brightness": 330.0, "confidence": "n", "acq_date": "2024-03-01", "acq_time": "0630", "satellite": "1"},
        {"latitude": 21.1, "longitude": 82.1, "brightness": 330.0, "confidence": "n", "acq_date": "2024-03-01", "acq_time": "2599", "satellite": "1"},  # hour 25 invalid
        {"latitude": 21.2, "longitude": 82.2, "brightness": 330.0, "confidence": "n", "acq_date": "2024-03-01", "acq_time": "invalid", "satellite": "1"}# non-numeric invalid
    ]

    df_valid, summary = pipeline.ingest_from_api_payload(payload, save_raw_backup=False)
    assert len(df_valid) == 1
    assert df_valid.iloc[0]["acq_time"] == "0630"
    assert summary.dropped_invalid_timestamps == 2


def test_ingest_standardizes_sensor_aliases(pipeline):
    """Verify VIIRS aliases (bright_ti4, bright_ti5, source) are harmonized."""
    payload = [{
        "latitude": 22.5,
        "longitude": 85.5,
        "bright_ti4": 342.0,
        "bright_ti5": 301.0,
        "source": "VIIRS_NOAA20",
        "confidence": "high",
        "acq_date": "2024-03-02",
        "acq_time": "0745"
    }]

    df_valid, _ = pipeline.ingest_from_api_payload(payload, save_raw_backup=False)
    assert "brightness" in df_valid.columns
    assert "bright_t31" in df_valid.columns
    assert "satellite" in df_valid.columns
    assert df_valid["brightness"].iloc[0] == 342.0
    assert df_valid["satellite"].iloc[0] == "VIIRS_NOAA20"


def test_ingest_missing_essential_fields_raises(pipeline):
    """Verify dataset missing essential coordinates raises IngestionValidationError."""
    broken_payload = [{"some_random_column": 123}]
    with pytest.raises(IngestionValidationError):
        pipeline.ingest_from_api_payload(broken_payload, save_raw_backup=False)
