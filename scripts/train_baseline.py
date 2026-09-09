"""
CLI script to train, evaluate, compare, and serialize baseline ML classifiers for SIH PS 26162.
"""

import sys
from pathlib import Path
import pandas as pd

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.config import PROCESSED_DATA_DIR, SAMPLES_DATA_DIR
from src.data_pipeline.dataset_builder import split_ml_dataset, ML_FEATURE_NAMES
from src.ml.train import run_full_training_pipeline
from src.ml.predict import ThermalSourcePredictor


def main():
    print("=" * 65)
    print("  SIH PS 26162: BASELINE MACHINE LEARNING CLASSIFIER TRAINING")
    print("=" * 65)

    # 1. Load data
    prototype_path = SAMPLES_DATA_DIR / "prototype_labeled_dataset.csv"
    print(f"Loading benchmark dataset: {prototype_path.name}")
    df_raw = pd.read_csv(prototype_path, comment="#")
    print(f"Total Observations Loaded: {len(df_raw)}")
    print(f"Class Counts:\n{df_raw['target_label'].value_counts().to_string()}\n")

    # 2. Split dataset with spatial group / stratified handling
    # Use stratified split for balanced prototype benchmark representation
    X_train, X_val, X_test, y_train, y_val, y_test, summary = split_ml_dataset(
        df_raw,
        features=ML_FEATURE_NAMES,
        target_col="target_class",
        split_strategy="stratified",
        test_size=0.20,
        val_size=0.20,
        random_state=42
    )

    print(f"Train Set: {len(X_train)} samples | Val Set: {len(X_val)} samples | Test Set: {len(X_test)} samples")
    print("-" * 65)

    # 3. Run training, comparison, and evaluation
    best_name, final_pipeline, val_metrics, test_metrics, model_path = run_full_training_pipeline(
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        X_test=X_test,
        y_test=y_test
    )

    print("\n" + "=" * 65)
    print("           VALIDATION SET MODEL COMPARISON")
    print("=" * 65)
    print(f"{'Model Name':<24} {'Accuracy':<10} {'Macro F1':<10} {'Macro Recall':<12}")
    print("-" * 65)
    for name, m in val_metrics.items():
        winner_mark = " <-- SELECTED WINNER" if name == best_name else ""
        print(f"{name:<24} {m.accuracy:<10.4f} {m.macro_f1:<10.4f} {m.macro_recall:<12.4f}{winner_mark}")
    print("=" * 65)

    print("\n" + test_metrics.to_text_report())

    print(f"\n[SUCCESS] Final model serialized and saved to:\n  -> {model_path}")

    # 4. Demonstrate prediction interface for backend developer
    print("\n" + "=" * 65)
    print("    TESTING BACKEND PREDICTION INTERFACE (ThermalSourcePredictor)")
    print("=" * 65)
    predictor = ThermalSourcePredictor(model_path=model_path)

    # Sample query 1: Suspected Industrial Fire flare-up
    sample_industrial_fire = {
        "brightness": 385.0,
        "bright_t31": 315.0,
        "temp_diff": 70.0,
        "frp": 160.0,
        "frp_density": 1100.0,
        "confidence_score": 0.95,
        "is_night": 0,
        "recurrence_count": 12,
        "persistence_ratio": 0.80,
        "night_detection_ratio": 0.50,
        "frp_local_mean": 20.0,
        "frp_zscore": 5.2,
        "frp_to_mean_ratio": 8.0
    }
    pred_result = predictor.predict(sample_industrial_fire)[0]
    print("Prediction Test (Simulated Industrial Flare-Up):")
    print(f"  Class: {pred_result['class_name']} (ID: {pred_result['class_id']})")
    print(f"  Confidence: {pred_result['confidence_score'] * 100:.2f}%")
    print(f"  Alert Level: {pred_result['alert_level']}")
    print(f"  Probabilities: {pred_result['class_probabilities']}")
    print("=" * 65)


if __name__ == "__main__":
    main()
