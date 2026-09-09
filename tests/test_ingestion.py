"""
Unit tests for satellite thermal data ingestion, validation, and cleaning.
"""

import pytest
import pandas as pd
from pathlib import Path

from src.config import SAMPLES_DATA_DIR
from src.data_pipeline.loader import load_csv
from src.data_pipeline.validator import (
    validate_coordinates,
    validate_physical_ranges,
    validate_satellite_data,
    DataValidationError
)
from src.data_pipeline.cleaner import (
    standardize_columns,
    parse_satellite_timestamp,
    normalize_confidence,
    clean_satellite_data
)
from src.data_pipeline.pipeline import run_ingestion_pipeline


def test_load_sample_csv():
    """Verify that sample satellite CSV loads correctly without errors."""
    sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
    assert sample_file.exists(), "Sample FIRMS CSV file must exist."

    df = load_csv(sample_file)
    assert not df.empty
    assert len(df) == 10
    assert "latitude" in df.columns
    assert "longitude" in df.columns


def test_validator_detects_missing_schema():
    """Verify that validator raises DataValidationError when critical fields are absent."""
    broken_df = pd.DataFrame({"some_random_column": [1, 2, 3]})
    with pytest.raises(DataValidationError):
        validate_satellite_data(broken_df)


def test_validator_drops_invalid_coordinates():
    """Verify out-of-bound geographic coordinates are dropped."""
    test_df = pd.DataFrame({
        "latitude": [28.6, 95.0, -100.0, 15.0],  # 95 and -100 are invalid
        "longitude": [77.2, 80.0, 85.0, 200.0]   # 200 is invalid
    })
    valid_df = validate_coordinates(test_df)
    assert len(valid_df) == 1
    assert valid_df.iloc[0]["latitude"] == 28.6


def test_validator_drops_unphysical_brightness():
    """Verify temperatures outside scientific limits (200K - 600K) are dropped."""
    test_df = pd.DataFrame({
        "latitude": [20.0, 20.0, 20.0],
        "longitude": [80.0, 80.0, 80.0],
        "brightness": [330.0, 150.0, 850.0],  # 150K and 850K are invalid
        "frp": [10.0, 10.0, -5.0]
    })
    valid_df = validate_physical_ranges(test_df)
    assert len(valid_df) == 1
    assert valid_df.iloc[0]["brightness"] == 330.0


def test_cleaner_standardizes_sensor_aliases():
    """Verify VIIRS aliases like bright_ti4 are converted to standard brightness."""
    viirs_df = pd.DataFrame({
        "latitude": [20.0],
        "longitude": [80.0],
        "bright_ti4": [345.5],
        "bright_ti5": [300.2]
    })
    standardized = standardize_columns(viirs_df)
    assert "brightness" in standardized.columns
    assert "bright_t31" in standardized.columns
    assert standardized["brightness"].iloc[0] == 345.5


def test_cleaner_timestamp_and_features():
    """Verify acq_date and acq_time are transformed into UTC timestamp and temporal columns."""
    test_df = pd.DataFrame({
        "acq_date": ["2024-03-01", "2024-03-02"],
        "acq_time": ["0730", 1845]
    })
    parsed = parse_satellite_timestamp(test_df)
    assert "timestamp" in parsed.columns
    assert "hour_utc" in parsed.columns
    assert parsed["hour_utc"].iloc[0] == 7
    assert parsed["hour_utc"].iloc[1] == 18


def test_cleaner_confidence_normalization():
    """Verify confidence mapping works for categorical and percentage values."""
    test_df = pd.DataFrame({
        "confidence": ["l", "n", "h", "85", "20"]
    })
    norm = normalize_confidence(test_df)
    assert "confidence_category" in norm.columns
    assert "confidence_score" in norm.columns
    categories = norm["confidence_category"].tolist()
    assert categories == ["low", "nominal", "high", "high", "low"]


def test_end_to_end_ingestion_pipeline():
    """Verify the full pipeline on sample data produces clean, validated results."""
    sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
    raw_df = load_csv(sample_file)
    processed_df, metrics = run_ingestion_pipeline(raw_df, output_filename="test_processed_output.csv")

    assert not processed_df.empty
    assert metrics["pass_rate_pct"] == 100.0
    assert "timestamp" in processed_df.columns
    assert "brightness" in processed_df.columns
    assert "confidence_score" in processed_df.columns
