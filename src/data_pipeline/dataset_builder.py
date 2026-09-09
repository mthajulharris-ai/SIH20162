"""
ML Dataset Design & Preparation Module for SIH PS 26162.

Provides:
- Transparent Prototype Labelling Strategy (since raw NASA FIRMS does NOT contain target labels)
- Feature matrix (X) and target vector (y) separation
- Leakage-proof Train / Validation / Test splitting (Spatial Grouping & Stratified options)
- Reproducible dataset export to data/processed/
"""

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit, train_test_split

from src.config import PROCESSED_DATA_DIR
from src.data_pipeline.feature_engineering import engineer_all_features

logger = logging.getLogger("satellite_pipeline.dataset_builder")

# Class Names mapping
CLASS_MAP = {
    0: "Other",
    1: "Persistent Thermal Source",
    2: "Industrial Fire"
}

CLASS_REVERSE_MAP = {v: k for k, v in CLASS_MAP.items()}

# Core Machine Learning Feature Set
ML_FEATURE_NAMES = [
    "brightness",             # Mid-Infrared Brightness Temp (Kelvin)
    "bright_t31",              # Thermal Infrared Window Temp (Kelvin)
    "temp_diff",               # MIR - TIR delta (combustion intensity signature)
    "frp",                     # Fire Radiative Power (MW)
    "frp_density",             # FRP normalized by pixel footprint area
    "confidence_score",        # Normalized detection confidence [0.0, 1.0]
    "is_night",                # Diurnal indicator: 1 = Night, 0 = Day
    "hour_sin",                # Cyclical hour sine component
    "hour_cos",                # Cyclical hour cosine component
    "recurrence_count",        # Total detections at this spatial cluster
    "persistence_ratio",       # Active detection days / total observation days
    "night_detection_ratio",   # Fraction of cluster detections during night
    "frp_local_mean",          # Baseline average FRP at this facility
    "frp_zscore",              # Local FRP elevation z-score (spikes)
    "frp_to_mean_ratio"        # Current FRP / Local Baseline FRP
]


@dataclass
class DatasetSplitSummary:
    """Metadata summary of the generated ML dataset."""
    total_samples: int
    num_features: int
    feature_names: List[str]
    target_classes: Dict[int, str]
    train_count: int
    val_count: int
    test_count: int
    train_class_distribution: Dict[str, int]
    val_class_distribution: Dict[str, int]
    test_class_distribution: Dict[str, int]
    split_strategy: str
    leakage_prevention: str
    is_prototype_labeling: bool
    generated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def assign_prototype_labels(
    df: pd.DataFrame,
    persistence_threshold: float = 0.35,
    recurrence_min: int = 3,
    frp_spike_ratio_threshold: float = 2.2,
    frp_spike_zscore_threshold: float = 2.0
) -> pd.DataFrame:
    """
    Applies the transparent prototype labeling strategy for model development.
    
    IMPORTANT NOTICE:
    Real NASA FIRMS data records only raw thermal detections and does NOT provide
    these three labels. This heuristic rule-engine provides a reproducible development
    benchmark while ground truth or external industrial GIS layers are collected.
    
    Rules:
    1. 'Persistent Thermal Source' (Class 1):
       - High recurrence across time (recurrence_count >= 3 OR persistence_ratio >= 0.35)
       - Detected regularly during both day and night
       - Moderate/steady FRP profile
       
    2. 'Industrial Fire' (Class 2):
       - Occurs at an industrial/persistent location (recurrence_count >= 2 OR persistence_ratio >= 0.25)
       - Exhibits an acute anomalous heat/power surge:
         (frp_to_mean_ratio >= 2.2 OR frp_zscore >= 2.0 OR (frp > 80 MW and brightness > 350K))
         
    3. 'Other' (Class 0):
       - All remaining observations: transient single-day hotspots, moving fire fronts,
         vegetation/wildfires, agricultural stubble burning with low persistence.
    """
    df = df.copy()

    # Default class: 0 (Other)
    target = np.zeros(len(df), dtype=int)

    # Condition for Persistent Thermal Source
    is_persistent = (
        (df["recurrence_count"] >= recurrence_min) |
        (df["persistence_ratio"] >= persistence_threshold)
    )
    target[is_persistent] = 1

    # Condition for Industrial Fire: acute flare-up at persistent/industrial location
    is_industrial_fire = is_persistent & (
        (df["frp_to_mean_ratio"] >= frp_spike_ratio_threshold) |
        (df["frp_zscore"] >= frp_spike_zscore_threshold) |
        ((df["frp"] >= 80.0) & (df["brightness"] >= 350.0))
    )
    target[is_industrial_fire] = 2

    df["target_class"] = target
    df["target_label"] = df["target_class"].map(CLASS_MAP)
    df["is_prototype_label"] = True

    logger.info(
        "Assigned prototype labels: Other=%d, Persistent=%d, Industrial Fire=%d",
        (target == 0).sum(), (target == 1).sum(), (target == 2).sum()
    )
    return df


def split_ml_dataset(
    df: pd.DataFrame,
    features: List[str] = ML_FEATURE_NAMES,
    target_col: str = "target_class",
    split_strategy: str = "spatial_group",
    test_size: float = 0.15,
    val_size: float = 0.15,
    random_state: int = 42
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, pd.Series, DatasetSplitSummary]:
    """
    Splits feature matrix X and target y into Train, Validation, and Test sets.
    
    Data Leakage Prevention:
    - If split_strategy == 'spatial_group' (Recommended):
      Uses GroupShuffleSplit grouped by 'spatial_cluster_id'. All observations from the
      same geographic location (e.g. the same industrial plant) remain strictly within
      Train OR Validation OR Test. This prevents models from memorizing specific facility coordinates!
      
    - If split_strategy == 'stratified':
      Uses stratified train/test split to preserve exact class ratios across splits.
    """
    # Verify all feature columns exist, imputing 0.0 if missing
    for col in features:
        if col not in df.columns:
            logger.warning("Feature '%s' not found in dataset. Filling with 0.0.", col)
            df[col] = 0.0

    X = df[features].copy().fillna(0.0)
    y = df[target_col].copy()

    total_samples = len(df)
    train_idx, val_idx, test_idx = [], [], []

    if split_strategy == "spatial_group" and "spatial_cluster_id" in df.columns:
        groups = df["spatial_cluster_id"].values
        # Step 1: Hold out test groups
        gss_test = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
        train_val_idx_arr, test_idx_arr = next(gss_test.split(X, y, groups=groups))

        # Step 2: Split train_val into train and validation
        adj_val_size = val_size / (1.0 - test_size)
        gss_val = GroupShuffleSplit(n_splits=1, test_size=adj_val_size, random_state=random_state)
        
        train_sub_idx, val_sub_idx = next(
            gss_val.split(
                X.iloc[train_val_idx_arr],
                y.iloc[train_val_idx_arr],
                groups=groups[train_val_idx_arr]
            )
        )
        
        train_idx = train_val_idx_arr[train_sub_idx]
        val_idx = train_val_idx_arr[val_sub_idx]
        test_idx = test_idx_arr
        leakage_info = "Strict Spatial Group Split: No spatial cluster overlaps between train, val, and test."

    else:
        # Fallback to stratified random split
        train_val_X, test_X_df, train_val_y, test_y_ser = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=y if y.nunique() > 1 else None
        )
        adj_val_size = val_size / (1.0 - test_size)
        train_X_df, val_X_df, train_y_ser, val_y_ser = train_test_split(
            train_val_X, train_val_y, test_size=adj_val_size, random_state=random_state,
            stratify=train_val_y if train_val_y.nunique() > 1 else None
        )
        train_idx = train_X_df.index
        val_idx = val_X_df.index
        test_idx = test_X_df.index
        leakage_info = "Stratified Row Split (Note: spatial clustering recommended for full spatial isolation)."

    X_train, y_train = X.iloc[train_idx].copy(), y.iloc[train_idx].copy()
    X_val, y_val = X.iloc[val_idx].copy(), y.iloc[val_idx].copy()
    X_test, y_test = X.iloc[test_idx].copy(), y.iloc[test_idx].copy()

    def get_distribution(target_series: pd.Series) -> Dict[str, int]:
        dist = {}
        for cls_id, cls_name in CLASS_MAP.items():
            dist[cls_name] = int((target_series == cls_id).sum())
        return dist

    summary = DatasetSplitSummary(
        total_samples=total_samples,
        num_features=len(features),
        feature_names=features,
        target_classes=CLASS_MAP,
        train_count=len(X_train),
        val_count=len(X_val),
        test_count=len(X_test),
        train_class_distribution=get_distribution(y_train),
        val_class_distribution=get_distribution(y_val),
        test_class_distribution=get_distribution(y_test),
        split_strategy=split_strategy,
        leakage_prevention=leakage_info,
        is_prototype_labeling=True,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    )

    return X_train, X_val, X_test, y_train, y_val, y_test, summary


def build_and_save_ml_dataset(
    cleaned_df: pd.DataFrame,
    features: List[str] = ML_FEATURE_NAMES,
    split_strategy: str = "spatial_group",
    output_dir: Optional[Path] = None
) -> Tuple[DatasetSplitSummary, Dict[str, Path]]:
    """
    Executes feature engineering, applies prototype labeling, splits dataset,
    and exports all sets cleanly to data/processed/.
    """
    save_dir = output_dir or PROCESSED_DATA_DIR
    save_dir.mkdir(parents=True, exist_ok=True)

    # 1. Feature Engineering
    df_features = engineer_all_features(cleaned_df)

    # 2. Prototype Labelling
    df_labeled = assign_prototype_labels(df_features)

    # 3. Train / Val / Test Split
    X_train, X_val, X_test, y_train, y_val, y_test, summary = split_ml_dataset(
        df_labeled, features=features, split_strategy=split_strategy
    )

    # 4. Save files
    paths = {
        "train_features": save_dir / "train_features.csv",
        "train_target": save_dir / "train_target.csv",
        "val_features": save_dir / "val_features.csv",
        "val_target": save_dir / "val_target.csv",
        "test_features": save_dir / "test_features.csv",
        "test_target": save_dir / "test_target.csv",
        "full_engineered": save_dir / "full_feature_engineered_dataset.csv",
        "metadata": save_dir / "ml_dataset_metadata.json"
    }

    X_train.to_csv(paths["train_features"], index=False)
    y_train.to_csv(paths["train_target"], index=False)
    X_val.to_csv(paths["val_features"], index=False)
    y_val.to_csv(paths["val_target"], index=False)
    X_test.to_csv(paths["test_features"], index=False)
    y_test.to_csv(paths["test_target"], index=False)
    df_labeled.to_csv(paths["full_engineered"], index=False)

    with open(paths["metadata"], "w") as f:
        json.dump(summary.to_dict(), f, indent=2)

    logger.info("Successfully exported ML dataset splits to %s", save_dir)
    return summary, paths
