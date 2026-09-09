"""
CLI execution script for the Satellite Thermal Data Cleaning Pipeline.
Loads sample/raw data, applies reproducible cleaning, saves to data/processed/,
and prints the Data Quality Audit Report.
"""

import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.config import SAMPLES_DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR
from src.data_pipeline.loader import load_csv, load_raw_directory
from src.data_pipeline.preprocessor import SatelliteDataCleaner


def main():
    print("=" * 60)
    print("    STARTING SATELLITE THERMAL DATA CLEANING PIPELINE")
    print("=" * 60)

    # Check for raw files first; if none, use the sample dataset
    raw_files = list(RAW_DATA_DIR.glob("*.csv"))
    if raw_files:
        print(f"Found {len(raw_files)} raw satellite file(s) in data/raw/. Ingesting...")
        raw_df = load_raw_directory()
        output_name = "cleaned_satellite_data"
    else:
        sample_path = SAMPLES_DATA_DIR / "sample_firms_data.csv"
        print(f"No files in data/raw/. Using development sample: {sample_path.name}")
        raw_df = load_csv(sample_path)
        output_name = "cleaned_sample_firms_data"

    print(f"Raw Observations Loaded: {len(raw_df)}")
    cleaner = SatelliteDataCleaner()
    cleaned_df, report, csv_path, txt_path = cleaner.process_and_save(
        raw_df=raw_df,
        output_basename=output_name
    )

    print("\n" + report.to_text_summary())
    print(f"\n[SUCCESS] Cleaned dataset saved to: {csv_path}")
    print(f"[SUCCESS] Quality audit report saved to: {txt_path}\n")


if __name__ == "__main__":
    main()
