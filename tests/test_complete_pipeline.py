"""
Unit and Integration Tests for the Complete End-to-End Pipeline.
"""

import pytest
import pandas as pd
from pathlib import Path

from src.pipeline_runner import SatelliteMLPipeline, PipelineExecutionError
from src.config import SAMPLES_DATA_DIR, PROCESSED_DATA_DIR


@pytest.fixture
def pipeline():
    return SatelliteMLPipeline()


def test_complete_pipeline_run_on_sample(pipeline):
    """Verify full pipeline: raw data -> clean -> features -> predictions -> report."""
    sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
    assert sample_file.exists(), "Sample input CSV must exist."

    df_results, summary = pipeline.run(
        input_path=sample_file,
        output_filename="test_complete_pipeline_output.csv",
        save_results=True
    )

    # 1. Verify summary metrics
    assert summary.execution_status == "SUCCESS"
    assert summary.total_raw_records == 10
    assert summary.cleaned_valid_records == 10
    assert summary.classified_records == 10
    assert summary.execution_duration_sec >= 0.0

    # 2. Verify output schema contains predictions and probabilities
    required_cols = [
        "predicted_class",
        "predicted_class_id",
        "prediction_confidence",
        "alert_level",
        "prob_industrial_fire",
        "prob_persistent_source",
        "prob_other",
        "model_version",
        "prediction_timestamp"
    ]
    for col in required_cols:
        assert col in df_results.columns, f"Column '{col}' must be present in classified output."

    # 3. Verify prediction values
    valid_classes = ["Industrial Fire", "Persistent Thermal Source", "Other"]
    for pred in df_results["predicted_class"]:
        assert pred in valid_classes

    for conf in df_results["prediction_confidence"]:
        assert 0.0 <= conf <= 1.0

    # 4. Verify disk persistence
    saved_csv = PROCESSED_DATA_DIR / "test_complete_pipeline_output.csv"
    saved_json = PROCESSED_DATA_DIR / "test_complete_pipeline_output_run_summary.json"
    saved_txt = PROCESSED_DATA_DIR / "test_complete_pipeline_output_run_summary.txt"

    assert saved_csv.exists()
    assert saved_json.exists()
    assert saved_txt.exists()


def test_pipeline_nonexistent_input_raises(pipeline):
    """Verify PipelineExecutionError is raised if invalid file path is supplied."""
    with pytest.raises(PipelineExecutionError):
        pipeline.run(input_path="non_existent_satellite_file.csv")


def test_pipeline_default_fallback_execution(pipeline):
    """Verify pipeline runs smoothly with default arguments (discovers raw or sample)."""
    df_results, summary = pipeline.run(
        output_filename="test_default_fallback.csv",
        save_results=False
    )
    assert not df_results.empty
    assert summary.execution_status == "SUCCESS"
