"""
Data loader module for NASA FIRMS satellite thermal data.
Supports loading local CSV files, scanning directories, and querying the NASA FIRMS REST API.
"""

import os
import logging
from pathlib import Path
from typing import Optional, Union, List
import pandas as pd
import requests

from src.config import NASA_FIRMS_MAP_KEY, SUPPORTED_SOURCES, RAW_DATA_DIR

logger = logging.getLogger("satellite_pipeline.loader")

# NASA FIRMS API Base URL
FIRMS_API_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api"


def load_csv(filepath: Union[str, Path]) -> pd.DataFrame:
    """
    Loads satellite thermal anomaly data from a single CSV file.
    
    Args:
        filepath: Path to the CSV file.
        
    Returns:
        pd.DataFrame containing the raw observations.
    """
    path = Path(filepath)
    if not path.exists():
        logger.error("File not found: %s", path)
        raise FileNotFoundError(f"Satellite data file not found: {path}")

    logger.info("Loading satellite observations from %s...", path.name)
    try:
        # Ignore initial comment lines if any (e.g. metadata header lines)
        df = pd.read_csv(path, comment="#")
        logger.info("Successfully loaded %d records from %s.", len(df), path.name)
        return df
    except Exception as e:
        logger.error("Failed to read CSV file %s: %s", path, e)
        raise e


def load_raw_directory(dir_path: Optional[Union[str, Path]] = None) -> pd.DataFrame:
    """
    Scans a directory for all satellite CSV files and aggregates them into a single DataFrame.
    
    Args:
        dir_path: Directory path (defaults to data/raw).
        
    Returns:
        Concatenated pd.DataFrame.
    """
    target_dir = Path(dir_path) if dir_path else RAW_DATA_DIR
    if not target_dir.exists():
        logger.warning("Target directory does not exist: %s", target_dir)
        return pd.DataFrame()

    csv_files = list(target_dir.glob("*.csv"))
    if not csv_files:
        logger.warning("No CSV files found in directory: %s", target_dir)
        return pd.DataFrame()

    logger.info("Found %d CSV file(s) in %s. Ingesting...", len(csv_files), target_dir)
    dataframes: List[pd.DataFrame] = []
    for csv_file in csv_files:
        try:
            df = load_csv(csv_file)
            if not df.empty:
                df["_source_file"] = csv_file.name
                dataframes.append(df)
        except Exception as err:
            logger.warning("Skipping corrupted file %s: %s", csv_file.name, err)

    if not dataframes:
        return pd.DataFrame()

    combined_df = pd.concat(dataframes, ignore_index=True)
    logger.info("Aggregated %d total observations from %d file(s).", len(combined_df), len(dataframes))
    return combined_df


def fetch_firms_api(
    map_key: Optional[str] = None,
    source: str = "VIIRS_SNPP_NRT",
    country: str = "IND",
    day_range: int = 1,
    date_str: Optional[str] = None,
    save_raw: bool = True
) -> pd.DataFrame:
    """
    Fetches real-time or historical satellite thermal anomaly data directly from NASA FIRMS API.
    
    NASA FIRMS API Documentation:
    https://firms.modaps.eosdis.nasa.gov/api/data_availability/
    
    Args:
        map_key: NASA FIRMS Map Key. If None, reads from NASA_FIRMS_MAP_KEY environment variable.
        source: Satellite source (e.g. 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT').
        country: ISO 3166-1 alpha-3 country code (e.g. 'IND' for India, 'USA' for United States).
        day_range: Number of days of data to retrieve (1 to 10).
        date_str: Optional acquisition date (YYYY-MM-DD). If omitted, defaults to latest available.
        save_raw: Whether to save the downloaded raw data to data/raw/ directory.
        
    Returns:
        pd.DataFrame containing the satellite thermal records fetched.
    """
    api_key = map_key or NASA_FIRMS_MAP_KEY
    if not api_key:
        raise ValueError(
            "NASA FIRMS MAP_KEY is required to query the API. "
            "Get a free key from: https://firms.modaps.eosdis.nasa.gov/api/map_key/ "
            "and set NASA_FIRMS_MAP_KEY in your environment or pass it as an argument."
        )

    if source not in SUPPORTED_SOURCES:
        logger.warning(
            "Source '%s' is not in standard supported sources (%s). Proceeding anyway.",
            source, list(SUPPORTED_SOURCES.keys())
        )

    # Construct FIRMS API country endpoint:
    # URL format: /api/country/csv/[MAP_KEY]/[SOURCE]/[COUNTRY]/[DAY_RANGE]/[DATE]
    url_parts = [FIRMS_API_BASE_URL, "country", "csv", api_key, source, country, str(day_range)]
    if date_str:
        url_parts.append(date_str)
        
    endpoint_url = "/".join(url_parts)
    logger.info("Requesting NASA FIRMS data from endpoint: %s (Key masked)", "/".join(url_parts[:-4] + ["***"]))

    try:
        response = requests.get(endpoint_url, timeout=30)
        response.raise_for_status()

        # Check if response returned an error message in text
        text_content = response.text.strip()
        if "Bad map_key" in text_content or "Invalid" in text_content or "Error" in text_content:
            logger.error("NASA FIRMS API returned error: %s", text_content)
            raise RuntimeError(f"NASA FIRMS API error: {text_content}")

        import io
        df = pd.read_csv(io.StringIO(text_content))
        logger.info("Successfully retrieved %d records from NASA FIRMS API.", len(df))

        if save_raw and not df.empty:
            RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
            filename = f"firms_{source}_{country}_{day_range}d.csv"
            out_path = RAW_DATA_DIR / filename
            df.to_csv(out_path, index=False)
            logger.info("Saved raw API response to %s", out_path)

        return df

    except requests.RequestException as e:
        logger.error("Network or HTTP error while calling NASA FIRMS API: %s", e)
        raise e
