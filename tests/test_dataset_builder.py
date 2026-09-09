"""
Unit tests for ML Dataset Design, Feature Engineering, Prototype Labelling, and Data Leakage Prevention.
"""

import pytest
import pandas as pd
import numpy as np
from pathlib import Path

from src.data_pipeline.feature_engineering import (
    compute_spectral_features,
    compute_diurnal_temporal_features,
    compute_spatial_grid_clusters,
    compute_persistence_and_recurrence_features,
    engineer_all_features
)
from src.data_pipeline.dataset_builder import (
    assign_prototype_labels,
    split_ml_dataset,
    build_and_save_ml_dataset,
    ML_FEATURE_NAMES,
    CLASS_MAP
)
from src.config import SAMPLES_DATA_DIR


@pytest.fixture
def mock_cleaned_data():
    """Returns a realistic multi-location cleaned thermal dataset."""
    return pd.DataFrame({
        "latitude": [22.8, 22.8, 22.8, 22.8, 21.1, 21.1, 30.5, 31.0],
        "longitude": [86.2, 86.2, 86.2, 86.2, 81.3, 81.3, 76.5, 75.2],
        "brightness": [335.0, 338.0, 340.0, 385.0, 345.0, 346.0, 312.0, 315.0],
        "bright_t31": [298.0, 299.0, 300.0, 315.0, 302.0, 303.0, 290.0, 292.0],
        "frp": [18.0, 20.0, 22.0, 160.0, 30.0, 32.0, 5.0, 6.0],
        "acq_date": ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-01", "2024-03-02", "2024-03-01", "2024-03-01"],
        "acq_time": ["0730", "0730", "1930", "0730", "0730", "0730", "1200", "1200"],
        "daynight": ["D", "D", "N", "D", "D", "D", "D", "D"],
        "confidence_score": [0.6, 0.9, 0.9, 0.98, 0.9, 0.9, 0.3, 0.3],
        "hour_utc": [7, 7, 19, 7, 7, 7, 12, 12]
    })


def test_spectral_features_computation(mock_cleaned_data):
    """Verify temp_diff and frp_density calculations."""
    df_feat = compute_spectral_features(mock_cleaned_data)
    assert "temp_diff" in df_feat.columns
    assert df_feat["temp_diff"].iloc[0] == pytest.approx(37.0)
    assert "frp_density" in df_feat.columns


def test_diurnal_features_computation(mock_cleaned_data):
    """Verify is_night and cyclical hour sine/cosine features."""
    df_feat = compute_diurnal_temporal_features(mock_cleaned_data)
    assert "is_night" in df_feat.columns
    assert "hour_sin" in df_feat.columns
    assert "hour_cos" in df_feat.columns
    # Row 2 was Night ("N")
    assert df_feat["is_night"].iloc[2] == 1


def test_spatial_clustering_and_persistence(mock_cleaned_data):
    """Verify recurrence_count and persistence_ratio per spatial cluster."""
    df_feat = compute_spatial_grid_clusters(mock_cleaned_data)
    assert "spatial_cluster_id" in df_feat.columns

    df_pers = compute_persistence_and_recurrence_features(df_feat)
    assert "recurrence_count" in df_pers.columns
    assert "persistence_ratio" in df_pers.columns
    assert "frp_zscore" in df_pers.columns

    # Location (22.8, 86.2) appears 4 times
    loc_mask = (df_pers["latitude"] == 22.8)
    assert df_pers.loc[loc_mask, "recurrence_count"].iloc[0] == 4


def test_prototype_labelling_rules(mock_cleaned_data):
    """Verify prototype labeling categorizes persistent sources, spikes (industrial fires), and transient."""
    df_feat = engineer_all_features(mock_cleaned_data)
    df_labeled = assign_prototype_labels(df_feat)

    assert "target_class" in df_labeled.columns
    assert "target_label" in df_labeled.columns
    assert df_labeled["is_prototype_label"].all()

    # The 160 MW spike at persistent location (22.8, 86.2) should be Class 2 (Industrial Fire)
    spike_row = df_labeled[df_labeled["frp"] == 160.0].iloc[0]
    assert spike_row["target_class"] == 2
    assert spike_row["target_label"] == "Industrial Fire"

    # Transient hotspots (30.5, 76.5) should be Class 0 (Other)
    transient_row = df_labeled[df_labeled["latitude"] == 30.5].iloc[0]
    assert transient_row["target_class"] == 0
    assert transient_row["target_label"] == "Other"


def test_spatial_group_split_prevents_leakage(mock_cleaned_data):
    """
    CRITICAL TEST: Ensure spatial group split keeps all records from a given
    spatial cluster strictly isolated (zero spatial cluster leakage between train, val, and test).
    """
    df_feat = engineer_all_features(mock_cleaned_data)
    df_labeled = assign_prototype_labels(df_feat)

    X_train, X_val, X_test, y_train, y_val, y_test, summary = split_ml_dataset(
        df_labeled, split_strategy="spatial_group", test_size=0.25, val_size=0.25
    )

    # Check indices are disjoint
    train_indices = set(X_train.index)
    val_indices = set(X_val.index)
    test_indices = set(X_test.index)

    assert train_indices.isdisjoint(val_indices)
    assert train_indices.isdisjoint(test_indices)
    assert val_indices.isdisjoint(test_indices)

    # Check that spatial clusters do NOT overlap between train, val, and test
    train_clusters = set(df_labeled.loc[list(train_indices), "spatial_cluster_id"])
    val_clusters = set(df_labeled.loc[list(val_indices), "spatial_cluster_id"])
    test_clusters = set(df_labeled.loc[list(test_indices), "spatial_cluster_id"])

    assert train_clusters.isdisjoint(val_clusters), "Spatial cluster leakage detected between train and val!"
    assert train_clusters.isdisjoint(test_clusters), "Spatial cluster leakage detected between train and test!"
    assert val_clusters.isdisjoint(test_clusters), "Spatial cluster leakage detected between val and test!"


def test_build_and_save_dataset_artifacts(mock_cleaned_data, tmp_path):
    """Verify that build_and_save_ml_dataset creates all 8 expected artifacts cleanly."""
    summary, paths = build_and_save_ml_dataset(
        cleaned_df=mock_cleaned_data,
        output_dir=tmp_path
    )

    assert paths["train_features"].exists()
    assert paths["train_target"].exists()
    assert paths["val_features"].exists()
    assert paths["val_target"].exists()
    assert paths["test_features"].exists()
    assert paths["test_target"].exists()
    assert paths["full_engineered"].exists()
    assert paths["metadata"].exists()
