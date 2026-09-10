"""
Unit tests for the NASA FIRMS Satellite Data Collection Module.
"""

import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from pathlib import Path

from src.data_pipeline.collector import (
    FirmsDataCollector,
    FirmsAPIError,
    INDUSTRIAL_REGION_BOUNDS
)


@pytest.fixture
def mock_collector(tmp_path):
    return FirmsDataCollector(map_key="test_map_key_12345", raw_storage_dir=tmp_path)


def test_collector_key_configured(mock_collector):
    """Verify collector detects configured API key."""
    assert mock_collector.is_api_key_configured() is True


def test_collector_missing_key_raises(tmp_path):
    """Verify collector raises FirmsAPIError when key is omitted."""
    collector = FirmsDataCollector(map_key="", raw_storage_dir=tmp_path)
    assert collector.is_api_key_configured() is False
    with pytest.raises(FirmsAPIError) as exc_info:
        collector.fetch_country_data(country_code="IND")
    assert "NASA FIRMS MAP_KEY is not configured" in str(exc_info.value)


def test_collector_day_range_validation(mock_collector):
    """Verify day_range must be between 1 and 10."""
    with pytest.raises(ValueError):
        mock_collector.fetch_country_data(country_code="IND", day_range=15)
    with pytest.raises(ValueError):
        mock_collector.fetch_country_data(country_code="IND", day_range=0)


def test_fetch_country_data_success(mock_collector, tmp_path):
    """Verify successful country data fetch parses CSV and writes raw file."""
    mock_csv_content = (
        "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
        "22.8046,86.2029,335.4,0.39,0.36,2024-03-01,0730,N,VIIRS,nominal,2.0NRT,298.2,18.5,D\n"
        "21.1904,81.3809,348.6,0.41,0.37,2024-03-01,0800,1,VIIRS,high,2.0NRT,305.2,32.4,D\n"
    )

    mock_resp = MagicMock()
    mock_resp.text = mock_csv_content
    mock_resp.status_code = 200

    with patch("requests.get", return_value=mock_resp):
        df, saved_path = mock_collector.fetch_country_data(
            country_code="IND",
            source="VIIRS_SNPP_NRT",
            day_range=1,
            save_to_raw=True
        )

        assert not df.empty
        assert len(df) == 2
        assert "latitude" in df.columns
        assert saved_path is not None
        assert saved_path.exists()

        # Check raw file content is identical
        with open(saved_path, "r") as f:
            content = f.read()
        assert "22.8046" in content


def test_fetch_area_data_with_preset(mock_collector, tmp_path):
    """Verify area fetch resolves industrial presets and fetches data."""
    mock_csv_content = (
        "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight\n"
        "22.8046,86.2029,335.4,0.39,0.36,2024-03-01,0730,N,nominal,2.0NRT,298.2,18.5,D\n"
    )

    mock_resp = MagicMock()
    mock_resp.text = mock_csv_content
    mock_resp.status_code = 200

    with patch("requests.get", return_value=mock_resp) as mock_get:
        df, saved_path = mock_collector.fetch_area_data(
            bbox="JHARKHAND_STEEL_BELT",
            source="VIIRS_SNPP_NRT",
            day_range=1,
            save_to_raw=True
        )

        # Ensure correct BBOX query string was passed
        expected_bbox = INDUSTRIAL_REGION_BOUNDS["JHARKHAND_STEEL_BELT"]
        assert expected_bbox in mock_get.call_args[0][0]

        assert len(df) == 1
        assert saved_path.exists()
        assert "jharkhand_steel_belt" in saved_path.name


def test_fetch_error_response_raises(mock_collector):
    """Verify error string in NASA FIRMS response raises FirmsAPIError."""
    mock_resp = MagicMock()
    mock_resp.text = "Bad map_key"
    mock_resp.status_code = 200

    with patch("requests.get", return_value=mock_resp):
        with pytest.raises(FirmsAPIError):
            mock_collector.fetch_country_data(country_code="IND")
