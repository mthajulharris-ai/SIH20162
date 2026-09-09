"""
End-to-end ingestion pipeline orchestrator.
Connects loader -> validator -> cleaner -> processed data persistence.
"""

import logging
from pathlib import Path
from typing import Optional, Union, Tuple
import pandas as pd

from src.config import PROCESSED_DATA_DIR, RAW_DATA_DIR
from src.data_pipeline.loader import load_csv, load_raw_directory, fetch_firms_api
from src.data_pipeline.validator import validate_satellite_data
from src.data_pipeline.cleaner import clean_satellite_data

# Set up logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("satellite_pipeline.orchestrator")


def run_ingestion_pipeline(
    input_df: pd.DataFrame,
    output_filename: Optional[str] = None
) -> Tuple[pd.DataFrame, dict]:
    """
    Executes the standard pipeline on an input DataFrame:
    1. Standardize and clean fields
    2. Validate ranges and coordinates
    3. Persist processed data if output filename is provided
    
    Returns:
        Tuple of (processed_df, run_metrics)
    """
    if input_df.empty:
        logger.warning("Empty DataFrame passed to ingestion pipeline.")
        return input_df, {"status": "empty_input", "record_count": 0}

    # Step 1: Cleaning & schema harmonization
    df_cleaned = clean_satellite_data(input_df)

    # Step 2: Scientific validation
    df_validated, metrics = validate_satellite_data(df_cleaned)

    # Step 3: Save processed data
    if output_filename:
        PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
        out_path = PROCESSED_DATA_DIR / output_filename
        df_validated.to_csv(out_path, index=False)
        logger.info("Saved processed dataset to: %s (%d records)", out_path, len(df_validated))

    metrics["processed_records"] = len(df_validated)
    return df_validated, metrics


def ingest_file(
    file_path: Union[str, Path],
    save_processed: bool = True
) -> Tuple[pd.DataFrame, dict]:
    """
    Ingests, cleans, and validates a single CSV file.
    """
    path = Path(file_path)
    logger.info("Starting ingestion for file: %s", path)
    df_raw = load_csv(path)
    
    out_name = f"processed_{path.stem}.csv" if save_processed else None
    return run_ingestion_pipeline(df_raw, output_filename=out_name)


def ingest_raw_folder(
    save_filename: str = "processed_satellite_data.csv"
) -> Tuple[pd.DataFrame, dict]:
    """
    Ingests all raw CSV files in data/raw, aggregates and processes them.
    """
    logger.info("Starting batch folder ingestion from: %s", RAW_DATA_DIR)
    df_raw = load_raw_directory()
    if df_raw.empty:
        logger.warning("No data found in raw directory to process.")
        return df_raw, {"status": "no_raw_files"}
        
    return run_ingestion_pipeline(df_raw, output_filename=save_filename)
