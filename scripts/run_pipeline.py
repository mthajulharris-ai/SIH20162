"""
CLI entrypoint to run the complete end-to-end Satellite Thermal Data & AI/ML Pipeline.

Usage:
    # Run full pipeline with default discovery (data/raw/ or fallback sample)
    python scripts/run_pipeline.py

    # Run full pipeline with custom input file or folder
    python scripts/run_pipeline.py --input data/samples/sample_firms_data.csv --output my_classified_results.csv
"""

import argparse
import logging
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.config import MODELS_DIR, SAMPLES_DATA_DIR
from src.pipeline_runner import SatelliteMLPipeline, PipelineExecutionError


def ensure_model_trained():
    """
    Self-healing environment check:
    If the serialized model does not exist yet (e.g., in a clean environment),
    trains the baseline classifier automatically so the pipeline runs smoothly.
    """
    model_path = MODELS_DIR / "satellite_fire_classifier.joblib"
    if not model_path.exists():
        print("[INFO] No serialized model detected in clean environment. Bootstrapping baseline classifier...")
        import subprocess
        subprocess.run([sys.executable, str(BASE_DIR / "scripts" / "train_baseline.py")], check=True)
        print("[INFO] Model bootstrap complete.\n")


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Run SIH PS 26162 End-to-End Satellite Thermal Ingestion & Classification Pipeline"
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        default=None,
        help="Path to raw satellite CSV file or directory containing raw FIRMS CSVs."
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="classified_satellite_hotspots.csv",
        help="Output CSV filename to save inside data/processed/."
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable detailed debug logging."
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    print("=" * 68)
    print("   SIH PS 26162: SATELLITE THERMAL DATA & AI/ML PIPELINE")
    print("=" * 68)

    # 1. Ensure model exists
    ensure_model_trained()

    # 2. Run pipeline
    pipeline = SatelliteMLPipeline()
    try:
        df_results, summary = pipeline.run(
            input_path=args.input,
            output_filename=args.output,
            save_results=True
        )

        print("\n" + summary.to_text_summary())
        print(f"\n[PIPELINE SUCCESS] Processed {len(df_results)} hotspots.")
        print(f"Results Catalog: {summary.output_csv_path}\n")

    except PipelineExecutionError as err:
        print(f"\n[PIPELINE ERROR] Execution halted: {err}", file=sys.stderr)
        sys.exit(1)
    except Exception as err:
        print(f"\n[UNEXPECTED ERROR] {err}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
