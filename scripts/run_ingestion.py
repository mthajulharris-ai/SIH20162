"""
CLI script to execute Task 1: Satellite Thermal Data Ingestion.

Usage:
    # Run ingestion on default data (checks data/raw/ or falls back to sample)
    python scripts/run_ingestion.py

    # Ingest a specific CSV file
    python scripts/run_ingestion.py --input data/samples/sample_firms_data.csv --output sanitized_firms.csv
"""

import argparse
import logging
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.config import RAW_DATA_DIR, SAMPLES_DATA_DIR, PROCESSED_DATA_DIR
from src.data_pipeline.ingestion import ThermalDataIngestionPipeline, IngestionValidationError


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def main():
    parser = argparse.ArgumentParser(
        description="SIH PS 26162: NASA FIRMS Satellite Thermal Data Ingestion Engine"
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        default=None,
        help="Path to raw satellite CSV file to ingest."
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="ingested_satellite_data.csv",
        help="Name of sanitized output CSV to save in data/processed/."
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose debugging logs."
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    print("=" * 65)
    print("   SIH PS 26162: TASK 1 - SATELLITE DATA INGESTION PIPELINE")
    print("=" * 65)

    pipeline = ThermalDataIngestionPipeline()

    # Determine input path
    if args.input:
        target_path = Path(args.input)
    else:
        # Check data/raw/ first
        raw_files = list(RAW_DATA_DIR.glob("*.csv"))
        if raw_files:
            target_path = raw_files[0]
            print(f"[INFO] Ingesting raw satellite file: {target_path.name} from data/raw/")
        else:
            target_path = SAMPLES_DATA_DIR / "sample_firms_data.csv"
            print(f"[INFO] No files in data/raw/. Ingesting development sample: {target_path.name}")

    try:
        df_valid, summary = pipeline.ingest_from_csv(
            filepath=target_path,
            output_filename=args.output
        )

        print("\n" + summary.to_text_report())
        print(f"\n[INGESTION SUCCESS] Sanitized records count: {len(df_valid)}")
        print(f"Destination: {summary.output_processed_path}\n")

    except IngestionValidationError as e:
        print(f"\n[VALIDATION ERROR] Dataset validation failed: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n[INGESTION ERROR] Ingestion failed: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
