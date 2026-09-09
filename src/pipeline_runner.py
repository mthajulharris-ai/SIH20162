"""
Complete End-to-End Satellite Data & AI/ML Pipeline Runner for SIH PS 26162.

Orchestrates:
Raw Satellite Data (NASA FIRMS MODIS/VIIRS)
  -> Schema & Physical Validation
  -> Data Cleaning & Deduplication
  -> Preprocessing & Imputation
  -> Multi-Temporal Feature Engineering (Persistence & FRP Spikes)
  -> Scikit-Learn Model Prediction & Alert Assignment
  -> Export of Classified Hotspot Catalog and Audit Summary
"""

import json
import logging
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Union, Tuple
import pandas as pd

from src.config import RAW_DATA_DIR, PROCESSED_DATA_DIR, SAMPLES_DATA_DIR
from src.data_pipeline.loader import load_csv, load_raw_directory
from src.data_pipeline.preprocessor import SatelliteDataCleaner, DataQualityReport
from src.data_pipeline.feature_engineering import engineer_all_features
from src.inference.service import ThermalPredictionService, get_prediction_service

# Configure pipeline logger
logger = logging.getLogger("satellite_pipeline.runner")


class PipelineExecutionError(Exception):
    """Raised when an unrecoverable failure occurs during pipeline execution."""
    pass


@dataclass
class PipelineRunSummary:
    """Summary metrics of a complete end-to-end pipeline execution."""
    execution_status: str
    input_source: str
    total_raw_records: int
    cleaned_valid_records: int
    data_retention_rate_pct: float
    total_features_engineered: int
    classified_records: int
    industrial_fires_count: int
    persistent_sources_count: int
    other_sources_count: int
    critical_alerts_count: int
    output_csv_path: str
    model_version: str
    execution_duration_sec: float
    timestamp_utc: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_text_summary(self) -> str:
        lines = [
            "=" * 68,
            "       SIH PS 26162: END-TO-END PIPELINE EXECUTION REPORT",
            "=" * 68,
            f"Execution Status:            {self.execution_status}",
            f"Execution Duration:          {self.execution_duration_sec:.2f} seconds",
            f"Timestamp (UTC):             {self.timestamp_utc}",
            f"Input Source:                {self.input_source}",
            f"Model Version Used:          {self.model_version}",
            "-" * 68,
            "Data Pipeline Funnel:",
            f"  Raw Observations Ingested:    {self.total_raw_records}",
            f"  Sanitized Valid Hotspots:     {self.cleaned_valid_records} ({self.data_retention_rate_pct:.2f}% retention)",
            f"  Total Features Engineered:    {self.total_features_engineered}",
            "-" * 68,
            "AI/ML Classification Breakdown:",
            f"  - [CRITICAL] Industrial Fires:         {self.industrial_fires_count:>5} (Immediate Hazard Alert)",
            f"  - [MEDIUM]   Persistent Heat Sources:  {self.persistent_sources_count:>5} (24/7 Industrial Operations)",
            f"  - [LOW]      Other Hotspots:           {self.other_sources_count:>5} (Wildfires / Stubble / Transient)",
            "-" * 68,
            f"Classified Catalog Exported: {self.output_csv_path}",
            "=" * 68
        ]
        return "\n".join(lines)


class SatelliteMLPipeline:
    """
    Unified pipeline orchestrator: from raw NASA FIRMS satellite data to classified hotspot catalog.
    """

    def __init__(
        self,
        prediction_service: Optional[ThermalPredictionService] = None,
        cleaner: Optional[SatelliteDataCleaner] = None
    ):
        self.cleaner = cleaner or SatelliteDataCleaner()
        self.prediction_service = prediction_service or get_prediction_service()

    def run(
        self,
        input_path: Optional[Union[str, Path]] = None,
        output_filename: str = "classified_satellite_hotspots.csv",
        save_results: bool = True
    ) -> Tuple[pd.DataFrame, PipelineRunSummary]:
        """
        Executes the entire data pipeline and ML prediction workflow.
        
        Args:
            input_path: Optional path to a raw CSV file or directory.
                        If None, checks data/raw/ and falls back to data/samples/.
            output_filename: Filename for the processed and classified output CSV.
            save_results: Whether to persist outputs to data/processed/.
            
        Returns:
            Tuple of (classified_dataframe, run_summary)
        """
        start_time = time.time()
        logger.info("Initiating complete Satellite Data & AI/ML Pipeline...")

        # -------------------------------------------------------------
        # STEP 1: Ingestion / Data Loading
        # -------------------------------------------------------------
        input_source_desc = ""
        try:
            if input_path:
                p = Path(input_path)
                if not p.exists():
                    raise FileNotFoundError(f"Specified input path does not exist: {p}")
                if p.is_dir():
                    logger.info("Loading satellite observations from directory: %s", p)
                    df_raw = load_raw_directory(p)
                    input_source_desc = f"Directory ({p})"
                else:
                    logger.info("Loading satellite observations from file: %s", p)
                    df_raw = load_csv(p)
                    input_source_desc = f"File ({p.name})"
            else:
                # Automatic resolution: data/raw/ -> fallback to data/samples/
                raw_csvs = list(RAW_DATA_DIR.glob("*.csv"))
                if raw_csvs:
                    logger.info("Found %d raw files in %s. Ingesting...", len(raw_csvs), RAW_DATA_DIR)
                    df_raw = load_raw_directory(RAW_DATA_DIR)
                    input_source_desc = f"Raw Directory ({len(raw_csvs)} files in data/raw)"
                else:
                    sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
                    logger.info("No files in data/raw/. Falling back to sample dataset: %s", sample_file.name)
                    df_raw = load_csv(sample_file)
                    input_source_desc = f"Sample File ({sample_file.name})"

            if df_raw.empty:
                raise PipelineExecutionError("Input satellite data contains zero observation records.")

            total_raw = len(df_raw)
            logger.info("Step 1 Complete: Ingested %d raw observations.", total_raw)

        except Exception as e:
            logger.error("Pipeline failed during Step 1 (Ingestion): %s", e)
            raise PipelineExecutionError(f"Step 1 Ingestion failed: {e}") from e

        # -------------------------------------------------------------
        # STEP 2 & 3: Validation, Cleaning, Deduplication & Imputation
        # -------------------------------------------------------------
        try:
            logger.info("Step 2 & 3: Sanitizing, validating, and cleaning satellite data...")
            df_cleaned, quality_report = self.cleaner.clean(df_raw)
            
            if df_cleaned.empty:
                raise PipelineExecutionError("All records were rejected during quality and sanity checks.")

            cleaned_count = len(df_cleaned)
            logger.info(
                "Step 2 & 3 Complete: Retained %d of %d records (%.2f%%).",
                cleaned_count, total_raw, quality_report.retention_rate_pct
            )

        except Exception as e:
            logger.error("Pipeline failed during Data Cleaning: %s", e)
            raise PipelineExecutionError(f"Cleaning step failed: {e}") from e

        # -------------------------------------------------------------
        # STEP 4: Feature Engineering
        # -------------------------------------------------------------
        try:
            logger.info("Step 4: Computing multi-temporal persistence & radiative surge features...")
            df_features = engineer_all_features(df_cleaned)
            logger.info("Step 4 Complete: Engineered %d total columns.", df_features.shape[1])

        except Exception as e:
            logger.error("Pipeline failed during Feature Engineering: %s", e)
            raise PipelineExecutionError(f"Feature engineering failed: {e}") from e

        # -------------------------------------------------------------
        # STEP 5: AI/ML Inference & Risk Level Classification
        # -------------------------------------------------------------
        try:
            logger.info("Step 5: Running AI/ML classification inference...")
            records_to_predict = df_features.to_dict(orient="records")
            predictions = self.prediction_service.predict_batch(records_to_predict)

            # Attach predictions to output DataFrame
            df_classified = df_features.copy()
            df_classified["predicted_class"] = [p["predicted_class"] for p in predictions]
            df_classified["predicted_class_id"] = [p["predicted_class_id"] for p in predictions]
            df_classified["prediction_confidence"] = [p["confidence"] for p in predictions]
            df_classified["alert_level"] = [p["alert_level"] for p in predictions]
            df_classified["prob_industrial_fire"] = [
                p["class_probabilities"].get("Industrial Fire", 0.0) for p in predictions
            ]
            df_classified["prob_persistent_source"] = [
                p["class_probabilities"].get("Persistent Thermal Source", 0.0) for p in predictions
            ]
            df_classified["prob_other"] = [
                p["class_probabilities"].get("Other", 0.0) for p in predictions
            ]
            df_classified["model_version"] = [p["model_version"] for p in predictions]
            df_classified["prediction_timestamp"] = [p["prediction_timestamp"] for p in predictions]

            # Summary counts
            count_fire = int((df_classified["predicted_class_id"] == 2).sum())
            count_persist = int((df_classified["predicted_class_id"] == 1).sum())
            count_other = int((df_classified["predicted_class_id"] == 0).sum())
            critical_alerts = int((df_classified["alert_level"] == "CRITICAL").sum())

            logger.info(
                "Step 5 Complete: Classified %d hotspots (Fires: %d, Persistent: %d, Other: %d).",
                len(df_classified), count_fire, count_persist, count_other
            )

        except Exception as e:
            logger.error("Pipeline failed during ML Prediction: %s", e)
            raise PipelineExecutionError(f"Prediction step failed: {e}") from e

        # -------------------------------------------------------------
        # STEP 6: Export & Persistence
        # -------------------------------------------------------------
        duration = time.time() - start_time
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        out_csv_path_str = "Memory (not saved)"

        summary = PipelineRunSummary(
            execution_status="SUCCESS",
            input_source=input_source_desc,
            total_raw_records=total_raw,
            cleaned_valid_records=cleaned_count,
            data_retention_rate_pct=quality_report.retention_rate_pct,
            total_features_engineered=df_features.shape[1],
            classified_records=len(df_classified),
            industrial_fires_count=count_fire,
            persistent_sources_count=count_persist,
            other_sources_count=count_other,
            critical_alerts_count=critical_alerts,
            output_csv_path=out_csv_path_str,
            model_version=self.prediction_service.model_version,
            execution_duration_sec=round(duration, 2),
            timestamp_utc=now_str
        )

        if save_results:
            PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
            out_csv = PROCESSED_DATA_DIR / output_filename
            summary_json_path = PROCESSED_DATA_DIR / f"{Path(output_filename).stem}_run_summary.json"
            summary_txt_path = PROCESSED_DATA_DIR / f"{Path(output_filename).stem}_run_summary.txt"

            df_classified.to_csv(out_csv, index=False)
            out_csv_path_str = str(out_csv)
            summary.output_csv_path = out_csv_path_str

            with open(summary_json_path, "w") as f:
                json.dump(summary.to_dict(), f, indent=2)

            with open(summary_txt_path, "w") as f:
                f.write(summary.to_text_summary())

            logger.info("Saved final classified catalog to: %s", out_csv)
            logger.info("Saved run summary report to: %s", summary_txt_path)

        return df_classified, summary
