"""
Feature Engineering Module for Satellite Thermal Anomaly Observations.

Derives physical, diurnal, spatial clustering, and temporal persistence features
essential for classifying:
1. Industrial Fire (acute high-intensity flare-up / accident at industrial site)
2. Persistent Thermal Source (recurring 24/7 industrial thermal emission)
3. Other (wildfire, agricultural residue burning, transient hotspot)
"""

import logging
from typing import Optional
import numpy as np
import pandas as pd

logger = logging.getLogger("satellite_pipeline.feature_engineering")


def compute_spectral_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes spectral temperature differentials and radiative intensity features:
    - temp_diff = brightness (MIR ~4um) - bright_t31 (TIR ~11um)
      (High positive temp_diff is a classic signature of sub-pixel intense combustion)
    - frp_per_area = FRP / (scan * track)
    """
    df = df.copy()

    if "brightness" in df.columns and "bright_t31" in df.columns:
        df["temp_diff"] = df["brightness"] - df["bright_t31"]
    else:
        df["temp_diff"] = 0.0

    if "frp" in df.columns:
        if "scan" in df.columns and "track" in df.columns:
            # Approximate pixel area in km^2
            pixel_area = (df["scan"] * df["track"]).replace(0.0, np.nan).fillna(0.14)
            df["frp_density"] = df["frp"] / pixel_area
        else:
            df["frp_density"] = df["frp"]
    else:
        df["frp_density"] = 0.0

    return df


def compute_diurnal_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes diurnal cycle and cyclical hour features:
    - is_night: 1 if Night, 0 if Day (industrial plants emit 24/7; crop burning is daytime)
    - hour_sin, hour_cos: cyclical encoding of UTC acquisition hour
    """
    df = df.copy()

    if "daynight" in df.columns:
        df["is_night"] = df["daynight"].astype(str).str.upper().apply(lambda x: 1 if x == "N" else 0)
    elif "hour_utc" in df.columns:
        df["is_night"] = df["hour_utc"].apply(lambda h: 1 if (h < 6 or h >= 18) else 0)
    else:
        df["is_night"] = 0

    if "hour_utc" in df.columns:
        # Cyclical 24-hour trigonometric transformation
        hours = df["hour_utc"].astype(float)
        df["hour_sin"] = np.sin(2 * np.pi * hours / 24.0)
        df["hour_cos"] = np.cos(2 * np.pi * hours / 24.0)
    else:
        df["hour_sin"] = 0.0
        df["hour_cos"] = 0.0

    return df


def compute_spatial_grid_clusters(
    df: pd.DataFrame,
    grid_size_deg: float = 0.01  # ~1.1 km spatial cell (typical industrial complex scale)
) -> pd.DataFrame:
    """
    Assigns each thermal detection to a discrete spatial grid cell based on coordinates.
    This enables location-based persistence tracking and spatial grouping without data leakage.
    """
    df = df.copy()
    lat_grid = (df["latitude"] / grid_size_deg).round().astype(int)
    lon_grid = (df["longitude"] / grid_size_deg).round().astype(int)
    df["spatial_cluster_id"] = lat_grid.astype(str) + "_" + lon_grid.astype(str)
    return df


def compute_persistence_and_recurrence_features(
    df: pd.DataFrame,
    grid_size_deg: float = 0.01
) -> pd.DataFrame:
    """
    Calculates multi-temporal persistence metrics per spatial location:
    - recurrence_count: Total detections at this spatial location across the time window
    - active_days_count: Number of distinct calendar dates with active heat signatures
    - persistence_ratio: active_days_count / total_days_in_dataset (high = persistent industrial)
    - night_detection_ratio: proportion of detections occurring at night for this cluster
    - frp_local_mean: historical mean FRP at this specific facility
    - frp_local_std: standard deviation of FRP at this specific facility
    - frp_zscore: how anomalous/elevated the current FRP is compared to baseline (>2.5 = flare-up)
    """
    df = df.copy()
    if "spatial_cluster_id" not in df.columns:
        df = compute_spatial_grid_clusters(df, grid_size_deg=grid_size_deg)

    # Calculate total time window spanned
    if "acq_date" in df.columns:
        total_unique_dates = max(1, df["acq_date"].nunique())
    else:
        total_unique_dates = 1

    # Aggregations per spatial cluster
    cluster_stats = df.groupby("spatial_cluster_id").agg(
        recurrence_count=("latitude", "count"),
        active_days_count=("acq_date", "nunique") if "acq_date" in df.columns else ("latitude", "count"),
        night_detection_ratio=("is_night", "mean") if "is_night" in df.columns else ("latitude", lambda x: 0.0),
        frp_local_mean=("frp", "mean") if "frp" in df.columns else ("latitude", lambda x: 10.0),
        frp_local_std=("frp", "std") if "frp" in df.columns else ("latitude", lambda x: 0.0),
        frp_local_max=("frp", "max") if "frp" in df.columns else ("latitude", lambda x: 10.0)
    ).reset_index()

    cluster_stats["persistence_ratio"] = cluster_stats["active_days_count"] / float(total_unique_dates)
    cluster_stats["frp_local_std"] = cluster_stats["frp_local_std"].fillna(0.0)

    # Merge aggregated statistics back to each observation row
    df = df.merge(cluster_stats, on="spatial_cluster_id", how="left")

    # Compute FRP z-score: (FRP - local_mean) / (local_std + epsilon)
    if "frp" in df.columns:
        epsilon = 1e-3
        std_safe = df["frp_local_std"].replace(0.0, 1.0)
        df["frp_zscore"] = (df["frp"] - df["frp_local_mean"]) / (std_safe + epsilon)
        df["frp_to_mean_ratio"] = df["frp"] / (df["frp_local_mean"] + epsilon)
    else:
        df["frp_zscore"] = 0.0
        df["frp_to_mean_ratio"] = 1.0

    return df


def engineer_all_features(
    df: pd.DataFrame,
    grid_size_deg: float = 0.01
) -> pd.DataFrame:
    """
    Master feature engineering pipeline:
    1. Spectral features (temp_diff, frp_density)
    2. Diurnal temporal features (is_night, hour_sin, hour_cos)
    3. Spatial cluster identification
    4. Multi-temporal persistence and recurrence metrics
    """
    logger.info("Engineering features for %d observations...", len(df))
    df_feat = compute_spectral_features(df)
    df_feat = compute_diurnal_temporal_features(df_feat)
    df_feat = compute_spatial_grid_clusters(df_feat, grid_size_deg=grid_size_deg)
    df_feat = compute_persistence_and_recurrence_features(df_feat, grid_size_deg=grid_size_deg)
    logger.info("Feature engineering complete. Dataset shape: %s", df_feat.shape)
    return df_feat
