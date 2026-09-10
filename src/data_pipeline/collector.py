"""
NASA FIRMS Satellite Thermal Data Collection Module.

Handles automated collection of real-world satellite thermal anomaly observations
from NASA's Fire Information for Resource Management System (FIRMS).

Features:
- Country-level Near Real-Time (NRT) queries (e.g. India - 'IND')
- Regional Bounding Box (BBOX) queries for major industrial clusters
- Support for VIIRS (S-NPP, NOAA-20, NOAA-21) and MODIS (Terra/Aqua)
- Strict storage of downloaded files in data/raw/ without mutation
- Clear error handling for missing API keys, rate limits, and network errors
- Zero fabrication: Real satellite downloads are kept strictly isolated from development sample data
"""

import os
import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Union, List, Tuple
import pandas as pd
import requests

from src.config import (
    RAW_DATA_DIR,
    NASA_FIRMS_MAP_KEY,
    SUPPORTED_SOURCES,
    STANDARD_COLUMNS,
    PROVENANCE_REAL_FIRMS
)

logger = logging.getLogger("satellite_pipeline.collector")

# Official NASA FIRMS API Endpoints
FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api"

# Major Indian Industrial Belts (Presets for PS 26162 Monitoring)
# Format: [min_lon, min_lat, max_lon, max_lat]
INDUSTRIAL_REGION_BOUNDS = {
    "JHARKHAND_STEEL_BELT": "84.5,22.0,87.0,24.5",       # Jamshedpur, Bokaro, Dhanbad
    "CHHATTISGARH_METALLURGY": "80.5,20.5,83.5,23.0",    # Bhilai, Durg, Korba
    "SINGRAULI_ENERGY_BELT": "82.0,23.5,83.5,24.5",      # Thermal Power & Coal Cluster
    "GUJARAT_PETROCHEMICAL": "69.0,21.0,73.5,23.5",      # Jamnagar, Dahej, Ankleshwar
    "ODISHA_MINERAL_BELT": "84.0,20.0,86.5,22.5",        # Rourkela, Angul, Kalinganagar
    "ALL_INDIA": "68.0,6.5,97.5,37.0"                    # Full Indian Subcontinent
}


class FirmsAPIError(Exception):
    """Raised when the NASA FIRMS API returns an error status or message."""
    pass


class FirmsDataCollector:
    """
    Client for collecting real-world NASA FIRMS satellite thermal data.
    """

    def __init__(
        self,
        map_key: Optional[str] = None,
        raw_storage_dir: Optional[Path] = None
    ):
        # Resolve API Map Key: parameter -> config -> environment variable
        self.map_key = map_key or NASA_FIRMS_MAP_KEY or os.getenv("NASA_FIRMS_MAP_KEY", "").strip()
        self.raw_dir = raw_storage_dir or RAW_DATA_DIR
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def is_api_key_configured(self) -> bool:
        """Checks whether a non-empty NASA FIRMS Map Key is available."""
        return bool(self.map_key and len(self.map_key) >= 10)

    def _require_api_key(self):
        """Raises FirmsAPIError if no valid API key is present."""
        if not self.is_api_key_configured():
            raise FirmsAPIError(
                "NASA FIRMS MAP_KEY is not configured.\n"
                "1. Obtain a free NASA MAP_KEY at: https://firms.modaps.eosdis.nasa.gov/api/map_key/\n"
                "2. Set it in your environment: export NASA_FIRMS_MAP_KEY='your_key'\n"
                "   or add it to your .env file: NASA_FIRMS_MAP_KEY=your_key\n"
                "   or pass it directly: FirmsDataCollector(map_key='your_key')"
            )

    def _process_response(
        self,
        response: requests.Response,
        source: str,
        identifier: str,
        day_range: int,
        date_str: Optional[str],
        save_to_raw: bool
    ) -> Tuple[pd.DataFrame, Optional[Path]]:
        """
        Parses and validates raw HTTP response from NASA FIRMS API.
        Enforces strict zero-fabrication and sets explicit data provenance.
        """
        # Specific HTTP status error checks
        if response.status_code == 403:
            raise FirmsAPIError(
                "NASA FIRMS API request failed: HTTP 403 Forbidden. "
                "The supplied MAP_KEY is invalid or unauthorized."
            )
        elif response.status_code == 429:
            raise FirmsAPIError(
                "NASA FIRMS API rate limit exceeded (HTTP 429). "
                "Please wait before submitting additional satellite queries."
            )
        elif response.status_code in (500, 502, 503, 504):
            raise FirmsAPIError(
                f"NASA FIRMS API server error (HTTP {response.status_code}). "
                "NASA Earthdata services may be undergoing maintenance."
            )

        response.raise_for_status()
        text_content = response.text.strip()

        # Handle empty response (0 fire detections in requested area/date)
        if not text_content:
            logger.info("NASA FIRMS returned 0 observations (empty response) for %s.", identifier)
            empty_df = pd.DataFrame(columns=STANDARD_COLUMNS + ["data_provenance"])
            return empty_df, None

        # Check for HTML error payload
        if text_content.startswith("<") and ("<html" in text_content.lower() or "<!doctype" in text_content.lower()):
            raise FirmsAPIError(f"NASA FIRMS API returned unexpected HTML error instead of CSV: {text_content[:200]}")

        # Check for textual API error messages returned with HTTP 200
        if "Bad map_key" in text_content or "Invalid" in text_content or "Error" in text_content or "not authorized" in text_content.lower():
            raise FirmsAPIError(f"NASA FIRMS API returned an error: {text_content}")

        # Parse CSV response
        try:
            df = pd.read_csv(io.StringIO(text_content))
        except Exception as exc:
            raise FirmsAPIError(f"Failed to parse NASA FIRMS CSV response: {exc}") from exc

        # Handle header-only response (0 rows detected)
        if df.empty:
            logger.info("NASA FIRMS returned CSV header only (0 hotspot detections) for %s.", identifier)
            df["data_provenance"] = pd.Series(dtype="object")
            return df, None

        logger.info("Successfully fetched %d satellite thermal records for '%s'.", len(df), identifier)

        # Save unmodified raw data into data/raw/
        saved_path = None
        if save_to_raw:
            timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            date_tag = date_str or f"last_{day_range}d"
            filename = f"raw_firms_{source}_{identifier}_{date_tag}_{timestamp_str}.csv"
            saved_path = self.raw_dir / filename
            # Save exact byte content directly to preserve NASA raw record integrity
            with open(saved_path, "w", encoding="utf-8") as f:
                f.write(text_content + "\n")
            logger.info("Stored untouched raw satellite data to: %s", saved_path)

        # Tag in-memory observations with explicit data provenance (Phase 2C)
        df["data_provenance"] = PROVENANCE_REAL_FIRMS

        return df, saved_path

    def fetch_country_data(
        self,
        country_code: str = "IND",
        source: str = "VIIRS_SNPP_NRT",
        day_range: int = 1,
        date_str: Optional[str] = None,
        save_to_raw: bool = True
    ) -> Tuple[pd.DataFrame, Optional[Path]]:
        """
        Retrieves real-time satellite fire/thermal anomaly observations for a country.
        
        API Endpoint: /api/country/csv/[MAP_KEY]/[SOURCE]/[COUNTRY]/[DAY_RANGE]/[DATE]
        
        Args:
            country_code: ISO 3166-1 alpha-3 country code ('IND', 'USA', etc.)
            source: Satellite instrument ('VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT')
            day_range: Number of observation days (1 to 10)
            date_str: Optional date in YYYY-MM-DD format (defaults to latest available)
            save_to_raw: If True, saves unaltered CSV into data/raw/
            
        Returns:
            Tuple of (DataFrame, saved_file_path)
        """
        self._require_api_key()

        if day_range < 1 or day_range > 10:
            raise ValueError(f"NASA FIRMS day_range must be between 1 and 10. Received: {day_range}")

        url_parts = [FIRMS_API_BASE, "country", "csv", self.map_key, source, country_code, str(day_range)]
        if date_str:
            url_parts.append(date_str)

        request_url = "/".join(url_parts)
        masked_url = "/".join(url_parts[:-4] + ["***"] + url_parts[-3:])
        logger.info("Querying NASA FIRMS API: %s", masked_url)

        try:
            response = requests.get(request_url, timeout=45)
            return self._process_response(
                response=response,
                source=source,
                identifier=country_code,
                day_range=day_range,
                date_str=date_str,
                save_to_raw=save_to_raw
            )
        except FirmsAPIError:
            raise
        except requests.RequestException as exc:
            logger.error("Network or HTTP error communicating with NASA FIRMS API: %s", exc)
            raise FirmsAPIError(f"Network error communicating with NASA FIRMS API: {exc}") from exc

    def fetch_area_data(
        self,
        bbox: str,
        source: str = "VIIRS_SNPP_NRT",
        day_range: int = 1,
        date_str: Optional[str] = None,
        region_label: str = "custom_area",
        save_to_raw: bool = True
    ) -> Tuple[pd.DataFrame, Optional[Path]]:
        """
        Retrieves real-time satellite thermal anomaly observations for a bounding box.
        
        API Endpoint: /api/area/csv/[MAP_KEY]/[SOURCE]/[BBOX]/[DAY_RANGE]/[DATE]
        
        Args:
            bbox: Bounding box string formatted as 'min_lon,min_lat,max_lon,max_lat'
                  (or preset name from INDUSTRIAL_REGION_BOUNDS)
            source: Satellite sensor product
            day_range: Number of observation days (1 to 10)
            date_str: Optional YYYY-MM-DD date
            region_label: Descriptive name for file naming
            save_to_raw: If True, saves raw CSV to data/raw/
        """
        self._require_api_key()

        # Resolve preset name if supplied
        if bbox.upper() in INDUSTRIAL_REGION_BOUNDS:
            resolved_bbox = INDUSTRIAL_REGION_BOUNDS[bbox.upper()]
            region_tag = bbox.lower()
        else:
            resolved_bbox = bbox.strip()
            region_tag = region_label

        url_parts = [FIRMS_API_BASE, "area", "csv", self.map_key, source, resolved_bbox, str(day_range)]
        if date_str:
            url_parts.append(date_str)

        request_url = "/".join(url_parts)
        masked_url = "/".join(url_parts[:-5] + ["***"] + url_parts[-4:])
        logger.info("Querying NASA FIRMS Area API: %s", masked_url)

        try:
            response = requests.get(request_url, timeout=45)
            return self._process_response(
                response=response,
                source=source,
                identifier=region_tag,
                day_range=day_range,
                date_str=date_str,
                save_to_raw=save_to_raw
            )
        except FirmsAPIError:
            raise
        except requests.RequestException as exc:
            logger.error("Network or HTTP error communicating with NASA FIRMS API: %s", exc)
            raise FirmsAPIError(f"Network error communicating with NASA FIRMS API: {exc}") from exc

    def list_existing_raw_files(self) -> List[Path]:
        """Lists all raw satellite CSV files stored in data/raw/."""
        if not self.raw_dir.exists():
            return []
        return sorted(list(self.raw_dir.glob("*.csv")))
