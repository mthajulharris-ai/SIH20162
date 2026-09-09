"""
Cleaning and standardization module for NASA FIRMS thermal anomaly data.
Normalizes differences between MODIS (1km) and VIIRS (375m) products.
"""

import logging
from typing import Optional
import pandas as pd
import numpy as np

logger = logging.getLogger("satellite_pipeline.cleaner")

# Mapping known sensor-specific column aliases to a unified standard schema
COLUMN_ALIASES = {
    "bright_ti4": "brightness",
    "bright_ti5": "bright_t31",
    "lat": "latitude",
    "lon": "longitude",
    "long": "longitude"
}


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardizes column names:
    - Converts to lowercase and removes leading/trailing spaces
    - Maps VIIRS/MODIS specific aliases (e.g., bright_ti4 -> brightness)
    """
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    
    # Rename known aliases if target standard name does not already exist
    rename_dict = {}
    for alias, standard in COLUMN_ALIASES.items():
        if alias in df.columns and standard not in df.columns:
            rename_dict[alias] = standard
            
    if rename_dict:
        logger.info("Standardized column aliases: %s", rename_dict)
        df.rename(columns=rename_dict, inplace=True)
        
    return df


def parse_satellite_timestamp(df: pd.DataFrame) -> pd.DataFrame:
    """
    Combines acquisition date (YYYY-MM-DD) and acquisition time (HHMM integer/string)
    into a standardized pandas UTC datetime column 'timestamp'.
    """
    df = df.copy()
    if "acq_date" not in df.columns or "acq_time" not in df.columns:
        logger.warning("acq_date or acq_time not found. Skipping timestamp parsing.")
        return df

    try:
        # acq_time can be string like '0430' or integer like 430. Format to 4 digits: '0430'
        formatted_time = (
            df["acq_time"]
            .astype(str)
            .str.replace(r"\.0$", "", regex=True)
            .str.zfill(4)
        )
        
        # Combine date string and time string
        datetime_str = df["acq_date"].astype(str).str.strip() + " " + formatted_time
        
        # Parse into standard ISO datetime
        df["timestamp"] = pd.to_datetime(
            datetime_str, format="%Y-%m-%d %H%M", utc=True, errors="coerce"
        )
        
        # Extract convenient temporal features
        df["hour_utc"] = df["timestamp"].dt.hour
        df["month"] = df["timestamp"].dt.month
        df["day_of_week"] = df["timestamp"].dt.dayofweek
        
        invalid_timestamps = df["timestamp"].isna().sum()
        if invalid_timestamps > 0:
            logger.warning("Found %d unparseable timestamps. Dropping them.", invalid_timestamps)
            df = df.dropna(subset=["timestamp"]).copy()

    except Exception as e:
        logger.error("Error parsing acquisition datetime: %s", e)
        raise e

    return df


def normalize_confidence(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalizes confidence representation across sensors:
    - VIIRS typically reports: 'l' (low), 'n' (nominal), 'h' (high)
    - MODIS reports integer percentages: 0 to 100
    
    Creates:
    - 'confidence_category': 'low', 'nominal', 'high'
    - 'confidence_score': Float between 0.0 and 1.0 for ML feature consumption
    """
    df = df.copy()
    if "confidence" not in df.columns:
        return df

    def convert_val(val):
        if pd.isna(val):
            return "nominal", 0.5
        val_str = str(val).strip().lower()
        
        # Handle VIIRS categorical
        if val_str in ["l", "low"]:
            return "low", 0.25
        elif val_str in ["n", "nominal"]:
            return "nominal", 0.60
        elif val_str in ["h", "high"]:
            return "high", 0.90
        
        # Handle MODIS numeric percentage
        try:
            num = float(val_str)
            score = max(0.0, min(100.0, num)) / 100.0
            if score < 0.30:
                cat = "low"
            elif score < 0.80:
                cat = "nominal"
            else:
                cat = "high"
            return cat, score
        except ValueError:
            return "nominal", 0.5

    results = df["confidence"].apply(convert_val)
    df["confidence_category"] = results.apply(lambda x: x[0])
    df["confidence_score"] = results.apply(lambda x: x[1])
    return df


def remove_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Removes duplicate observations. Satellite observations within exact same
    spatial coordinate (to 4 decimal places ~11m) and timestamp are considered duplicates.
    """
    df = df.copy()
    initial_count = len(df)
    
    # Create coordinate signatures
    df["_lat_round"] = df["latitude"].round(4)
    df["_lon_round"] = df["longitude"].round(4)
    
    subset = ["_lat_round", "_lon_round"]
    if "timestamp" in df.columns:
        subset.append("timestamp")
    if "satellite" in df.columns:
        subset.append("satellite")
        
    df.drop_duplicates(subset=subset, keep="first", inplace=True)
    df.drop(columns=["_lat_round", "_lon_round"], inplace=True)
    
    dropped = initial_count - len(df)
    if dropped > 0:
        logger.info("Removed %d duplicate observation records.", dropped)
        
    return df


def clean_satellite_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Executes the full cleaning pipeline on satellite thermal data.
    """
    logger.info("Starting satellite data cleaning for %d records...", len(df))
    
    # 1. Standardize columns
    df_clean = standardize_columns(df)
    
    # 2. Coerce numeric types
    for col in ["latitude", "longitude", "brightness"]:
        if col in df_clean.columns:
            df_clean[col] = pd.to_numeric(df_clean[col], errors="coerce")
            
    if "frp" in df_clean.columns:
        df_clean["frp"] = pd.to_numeric(df_clean["frp"], errors="coerce").fillna(0.0)
    if "bright_t31" in df_clean.columns:
        df_clean["bright_t31"] = pd.to_numeric(df_clean["bright_t31"], errors="coerce")
        
    # Drop rows with NaN in essential columns
    df_clean.dropna(subset=["latitude", "longitude", "brightness"], inplace=True)

    # 3. Parse timestamp
    df_clean = parse_satellite_timestamp(df_clean)

    # 4. Normalize confidence
    df_clean = normalize_confidence(df_clean)

    # 5. Remove duplicates
    df_clean = remove_duplicates(df_clean)

    logger.info("Cleaning complete. Cleaned dataset contains %d records.", len(df_clean))
    return df_clean
