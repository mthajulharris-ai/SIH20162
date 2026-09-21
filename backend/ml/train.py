"""
CLI Training Entry Point for SATRA Soft-Voting Ensemble Classifier.

Usage:
    python -m backend.ml.train --data data/samples/satra_labeled_dataset.csv
"""

import argparse
import sys
from pathlib import Path

from backend.ml.ensemble_classifier import train_ensemble_pipeline, MissingLabelsError
from backend.ml.feature_extractor import FeatureValidationError


def main():
    parser = argparse.ArgumentParser(description="Train SATRA Soft-Voting Ensemble Classifier (RF + LightGBM + XGBoost)")
    parser.add_argument(
        "--data",
        type=str,
        default="data/processed/operational_labeled_dataset.csv",
        help="Path to real labelled dataset CSV",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="models/satra_ensemble_candidate_v4.pkl",
        help="Path to save trained ensemble (.pkl)",
    )
    args = parser.parse_args()

    print("=" * 65)
    print("  SATRA: SOFT-VOTING ENSEMBLE CLASSIFIER TRAINING")
    print("=" * 65)
    print(f"Dataset path:    {args.data}")
    print(f"Output model:    {args.output}")
    print("-" * 65)

    try:
        wrapper, metrics = train_ensemble_pipeline(
            dataset_path=args.data,
            output_model_path=args.output,
        )
        print("[SUCCESS] Ensemble model trained and saved successfully.")
        sys.exit(0)
    except MissingLabelsError as mle:
        print(f"\n[DATASET ERROR] {mle}")
        sys.exit(1)
    except FeatureValidationError as fve:
        print(f"\n[FEATURE ERROR] {fve}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Training failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
