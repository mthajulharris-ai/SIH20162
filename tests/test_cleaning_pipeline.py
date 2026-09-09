"""
Unit tests for the Satellite Thermal Data Cleaning Pipeline and Data Quality Reporting.
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path

from src.data_pipeline.preprocessor import (
    SatelliteDataCleaner,
    DataQualityReport,
    LATITUDE_MIN, LATITUDE_MAX,
    LONGITUDE_MIN, LONGITUDE_MAX,
    BRIGHTNESS_KELVIN_MIN, BRIGHTNESS_KELVIN_MAX
)
from src.config import SAMPLES_DATA_DIR, PROCESSED_DATA_DIR


@pytest.fixture
def cleaner():
    return SatelliteDataCleaner()


@pytest.fixture
def dirty_sample_df():
    """
    Constructs a controlled, intentionally dirty DataFrame with all edge cases:
    - Missing values (FRP, coordinates, daynight)
    - Invalid coordinates (>90 lat, >180 lon, null island 0,0)
    - Unphysical temperatures (<200K, >600K)
    - Malformed clock times (hour 25, minute 70, strings)
    - Inconsistent confidence (VIIRS 'l', 'h', MODIS 85, 20)
    - Duplicate observations
    """
    return pd.DataFrame({
        "latitude": [28.6139, 28.6139, 95.5, 25.0, 0.0, 22.5, 23.0, 24.0, np.nan],
        "longitude": [77.2090, 77.2090, 77.2, 195.0, 0.0, 85.0, 86.0, 87.0, 78.0],
        "brightness": [325.0, 325.0, 320.0, 310.0, 330.0, 150.0, 750.0, 335.0, 320.0],  # 150K and 750K invalid
        "acq_date": ["2024-03-01", "2024-03-01", "2024-03-01", "2024-03-01", "2024-03-01", "2024-03-02", "2024-03-02", "2024-03-03", "2024-03-03"],
        "acq_time": ["0630", "0630", "0630", "0630", "0630", "0700", "0800", "2599", "0900"],  # "2599" is invalid time
        "confidence": ["nominal", "nominal", "h", "l", "85", "high", "low", "95", "h"],
        "frp": [15.2, 15.2, 10.0, 8.0, 12.0, -5.0, 20.0, 18.0, np.nan],  # -5.0 is invalid FRP
        "satellite": ["N", "N", "N", "N", "N", "N", "1", "1", "1"],
        "instrument": ["VIIRS", "VIIRS", "VIIRS", "VIIRS", "VIIRS", "VIIRS", "VIIRS", "VIIRS", "VIIRS"]
    })


def test_missing_values_handling(cleaner):
    """Test that missing coordinates drop row, but missing FRP/daynight are cleanly imputed."""
    df = pd.DataFrame({
        "latitude": [22.0, np.nan, 23.0],
        "longitude": [85.0, 85.0, 86.0],
        "brightness": [330.0, 340.0, 320.0],
        "acq_date": ["2024-01-01", "2024-01-01", "2024-01-02"],
        "acq_time": ["0400", "0500", "1400"],
        "confidence": ["h", "h", "nominal"],
        "frp": [np.nan, 10.0, np.nan]
    })
    clean_df, report = cleaner.clean(df)
    # Row with NaN latitude should be dropped
    assert len(clean_df) == 2
    # Missing FRP should be imputed to 0.0
    assert (clean_df["frp"] == 0.0).all()
    # Missing daynight imputed based on hour (04:00 UTC -> N, 14:00 UTC -> D)
    assert "daynight" in clean_df.columns
    assert clean_df["daynight"].iloc[0] == "N"
    assert clean_df["daynight"].iloc[1] == "D"


def test_invalid_coordinates_filtering(cleaner):
    """Ensure coordinates exceeding [-90, 90] and [-180, 180] or null island (0,0) are dropped."""
    df = pd.DataFrame({
        "latitude": [28.6, 91.0, -95.0, 0.0, 25.0],
        "longitude": [77.2, 77.0, 80.0, 0.0, 185.0],
        "brightness": [320.0, 320.0, 320.0, 320.0, 320.0],
        "acq_date": ["2024-02-01"] * 5,
        "acq_time": ["1200"] * 5,
        "confidence": ["n"] * 5
    })
    clean_df, report = cleaner.clean(df)
    assert len(clean_df) == 1
    assert clean_df.iloc[0]["latitude"] == 28.6
    assert report.dropped_invalid_coords >= 4


def test_duplicate_observations_removal(cleaner):
    """Ensure duplicate observations with identical coordinate and timestamp are removed."""
    df = pd.DataFrame({
        "latitude": [21.5, 21.50001, 21.5],  # 21.50001 rounds to 21.5000 at precision 4
        "longitude": [82.0, 82.00002, 82.0],
        "brightness": [330.0, 330.0, 330.0],
        "acq_date": ["2024-03-01", "2024-03-01", "2024-03-01"],
        "acq_time": ["0600", "0600", "0600"],
        "confidence": ["h", "h", "h"],
        "satellite": ["N", "N", "N"]
    })
    clean_df, report = cleaner.clean(df)
    assert len(clean_df) == 1
    assert report.duplicate_count == 2


def test_invalid_dates_and_times_handling(cleaner):
    """Test that invalid clock times (e.g. 25:99, 14:80) or broken date formats are dropped."""
    df = pd.DataFrame({
        "latitude": [20.0, 21.0, 22.0, 23.0],
        "longitude": [80.0, 81.0, 82.0, 83.0],
        "brightness": [320.0, 320.0, 320.0, 320.0],
        "acq_date": ["2024-03-01", "not-a-date", "2024-03-01", "2024-03-01"],
        "acq_time": ["1230", "1230", "2500", "1475"],  # 2500 is hour 25, 1475 is minute 75
        "confidence": ["n", "n", "n", "n"]
    })
    clean_df, report = cleaner.clean(df)
    assert len(clean_df) == 1
    assert clean_df.iloc[0]["latitude"] == 20.0
    assert report.dropped_invalid_timestamps == 3


def test_inconsistent_confidence_values(cleaner):
    """Verify confidence values across VIIRS letters and MODIS percentages are normalized."""
    df = pd.DataFrame({
        "latitude": [20.0, 21.0, 22.0, 23.0, 24.0],
        "longitude": [80.0, 81.0, 82.0, 83.0, 84.0],
        "brightness": [320.0] * 5,
        "acq_date": ["2024-03-01"] * 5,
        "acq_time": ["1000"] * 5,
        "confidence": ["l", "n", "high", "95", "15"]
    })
    clean_df, report = cleaner.clean(df)
    assert list(clean_df["confidence_category"]) == ["low", "nominal", "high", "high", "low"]
    assert clean_df["confidence_score"].iloc[3] == 0.95
    assert clean_df["confidence_score"].iloc[4] == 0.15


def test_invalid_numeric_values_handling(cleaner):
    """Verify temperatures outside [200K, 600K] and negative FRP are dropped."""
    df = pd.DataFrame({
        "latitude": [20.0, 21.0, 22.0, 23.0],
        "longitude": [80.0, 81.0, 82.0, 83.0],
        "brightness": [320.0, 120.0, 750.0, 340.0],  # 120K, 750K invalid
        "acq_date": ["2024-03-01"] * 4,
        "acq_time": ["1000"] * 4,
        "confidence": ["n"] * 4,
        "frp": [10.0, 10.0, 10.0, -10.0]  # negative FRP invalid
    })
    clean_df, report = cleaner.clean(df)
    assert len(clean_df) == 1
    assert clean_df.iloc[0]["latitude"] == 20.0


def test_data_quality_report_contents(cleaner, dirty_sample_df):
    """Verify that DataQualityReport contains all mandatory fields."""
    clean_df, report = cleaner.clean(dirty_sample_df)
    report_dict = report.to_dict()

    assert "input_rows" in report_dict
    assert "output_rows" in report_dict
    assert "missing_values_before" in report_dict
    assert "missing_values_after" in report_dict
    assert "duplicate_count" in report_dict
    assert "valid_coordinate_count" in report_dict
    assert "available_columns" in report_dict
    assert "date_range_start" in report_dict
    assert "date_range_end" in report_dict

    # Check text report generation
    summary_text = report.to_text_summary()
    assert "SATELLITE DATA QUALITY AUDIT REPORT" in summary_text
    assert "Observation Date Range:" in summary_text


def test_process_and_save_preserves_raw_data(cleaner):
    """Verify that process_and_save writes to data/processed without touching source data."""
    sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
    with open(sample_file, "r") as f:
        original_content = f.read()

    from src.data_pipeline.loader import load_csv
    raw_df = load_csv(sample_file)
    
    clean_df, report, csv_path, txt_path = cleaner.process_and_save(raw_df, "test_clean_output")

    # Raw file must remain completely untouched
    with open(sample_file, "r") as f:
        current_content = f.read()
    assert original_content == current_content

    # Output files must exist in data/processed
    assert csv_path.exists()
    assert txt_path.exists()
    assert Path(str(txt_path).replace(".txt", ".json")).exists()
