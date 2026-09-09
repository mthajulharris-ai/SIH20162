"""
CLI script to build and split the ML Dataset for SIH PS 26162.
"""

import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.config import SAMPLES_DATA_DIR, PROCESSED_DATA_DIR
from src.data_pipeline.loader import load_csv
from src.data_pipeline.dataset_builder import build_and_save_ml_dataset, CLASS_MAP


def main():
    print("=" * 65)
    print("   SIH PS 26162: MACHINE LEARNING DATASET DESIGN & BUILDER")
    print("=" * 65)

    # Use processed satellite data if available, otherwise sample
    cleaned_candidate = PROCESSED_DATA_DIR / "cleaned_sample_firms_data.csv"
    if not cleaned_candidate.exists():
        sample_path = SAMPLES_DATA_DIR / "sample_firms_data.csv"
        print(f"Loading base satellite data: {sample_path.name}")
        from src.data_pipeline.preprocessor import SatelliteDataCleaner
        cleaner = SatelliteDataCleaner()
        df_raw = load_csv(sample_path)
        df_clean, _ = cleaner.clean(df_raw)
    else:
        print(f"Loading cleaned satellite observations: {cleaned_candidate.name}")
        df_clean = load_csv(cleaned_candidate)

    print(f"Loaded {len(df_clean)} cleaned observations.")

    summary, paths = build_and_save_ml_dataset(
        cleaned_df=df_clean,
        split_strategy="spatial_group"
    )

    print("\n" + "=" * 65)
    print("               DATASET SPLIT & DESIGN SUMMARY")
    print("=" * 65)
    print(f"Total Samples:             {summary.total_samples}")
    print(f"Total Features (X):        {summary.num_features}")
    print(f"Target Classes (y):        {summary.target_classes}")
    print(f"Split Strategy:            {summary.split_strategy}")
    print(f"Data Leakage Prevention:   {summary.leakage_prevention}")
    print("-" * 65)
    print(f"Training Set (X_train):    {summary.train_count} samples  | Class Dist: {summary.train_class_distribution}")
    print(f"Validation Set (X_val):    {summary.val_count} samples   | Class Dist: {summary.val_class_distribution}")
    print(f"Test Set (X_test):         {summary.test_count} samples   | Class Dist: {summary.test_class_distribution}")
    print("-" * 65)
    print("Exported Datasets in data/processed/:")
    for name, p in paths.items():
        print(f"  - {name:<18}: {p.name}")
    print("=" * 65)


if __name__ == "__main__":
    main()
