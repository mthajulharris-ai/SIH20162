"""
Validation module for satellite thermal anomaly observations (NASA FIRMS MODIS/VIIRS).
Ensures coordinate bounds, physical thermal limits, and mandatory fields adhere to scientific constraints.
"""

import logging
from typing import Tuple, List
import pandas as pd
import numpy as np

logger = logging.getLogger("satellite_pipeline.validator")

# Minimum and maximum realistic brightness temperatures in Kelvin for satellite thermal bands
MIN_BRIGHTNESS_KELVIN = 200.0
MAX_BRIGHTNESS_KELVIN = 600.0

# Mandatory core fields expected in satellite fire observations
CORE_REQUIRED_FIELDS = [
    "latitude",
    "longitude",
    "brightness",
    "confidence",
    "acq_date",
    "acq_time"
]


class DataValidationError(Exception):
    """Custom exception raised when satellite data fails critical schema validation."""
    pass


def validate_schema(df: pd.DataFrame) -> List[str]:
    """
    Validates that the DataFrame has the mandatory core fields.
    Returns list of missing columns, if any.
    """
    if df.empty:
        raise DataValidationError("Input DataFrame is completely empty.")

    # Check for core columns (case-insensitive check)
    col_map = {c.lower(): c for c in df.columns}
    missing = [req for req in CORE_REQUIRED_FIELDS if req not in col_map]
    return missing


def validate_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Validates latitude and longitude ranges:
    - Latitude: [-90.0, 90.0]
    - Longitude: [-180.0, 180.0]
    Drops and logs rows with invalid coordinates.
    """
    initial_count = len(df)
    valid_lat = (df["latitude"] >= -90.0) & (df["latitude"] <= 90.0)
    valid_lon = (df["longitude"] >= -180.0) & (df["longitude"] <= 180.0)
    
    valid_mask = valid_lat & valid_lon
    invalid_count = initial_count - valid_mask.sum()
    
    if invalid_count > 0:
        logger.warning(
            "Dropped %d records with out-of-bounds geographic coordinates.",
            invalid_count
        )
    return df[valid_mask].copy()


def validate_physical_ranges(df: pd.DataFrame) -> pd.DataFrame:
    """
    Validates physical sensory measurements:
    - Brightness temperature within [200.0 K, 600.0 K]
    - FRP (Fire Radiative Power) non-negative if present
    """
    initial_count = len(df)
    valid_mask = (df["brightness"] >= MIN_BRIGHTNESS_KELVIN) & (
        df["brightness"] <= MAX_BRIGHTNESS_KELVIN
    )

    if "frp" in df.columns:
        valid_frp = df["frp"].isna() | (df["frp"] >= 0.0)
        valid_mask = valid_mask & valid_frp

    dropped_count = initial_count - valid_mask.sum()
    if dropped_count > 0:
        logger.warning(
            "Dropped %d records failing physical sanity checks (e.g., extreme brightness temp or negative FRP).",
            dropped_count
        )

    return df[valid_mask].copy()


def validate_satellite_data(df: pd.DataFrame) -> Tuple[pd.DataFrame, dict]:
    """
    Runs full validation suite on raw or standardized satellite data.
    Returns (cleaned_valid_df, validation_metrics_dict).
    """
    initial_count = len(df)
    missing_cols = validate_schema(df)
    if missing_cols:
        logger.error("Missing mandatory fields: %s", missing_cols)
        raise DataValidationError(f"Missing mandatory fields: {missing_cols}")

    df_coords = validate_coordinates(df)
    df_valid = validate_physical_ranges(df_coords)
    final_count = len(df_valid)

    metrics = {
        "initial_records": initial_count,
        "valid_records": final_count,
        "dropped_records": initial_count - final_count,
        "pass_rate_pct": round((final_count / initial_count) * 100.0, 2) if initial_count > 0 else 0.0
    }

    logger.info("Validation complete. Metrics: %s", metrics)
    return df_valid, metrics
