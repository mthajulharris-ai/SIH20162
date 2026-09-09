"""
Machine Learning Training Pipeline for SIH PS 26162.

Trains and compares baseline classifiers:
1. Logistic Regression (Interpretable linear baseline)
2. Random Forest (Robust non-linear ensemble)
3. HistGradientBoosting (Lightweight boosting baseline)

Features:
- Standard scaling pipeline
- Balanced class weighting for minority classes (Industrial Fire)
- Multi-metric evaluation (Macro F1, Precision, Recall, Accuracy)
- Model serialization via joblib into models/saved_models/ and src/ml/models/
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.config import MODELS_DIR, BASE_DIR, PROCESSED_DATA_DIR
from src.data_pipeline.dataset_builder import CLASS_MAP, ML_FEATURE_NAMES
from src.ml.evaluate import evaluate_classifier, ModelEvaluationMetrics

logger = logging.getLogger("satellite_ml.train")

# Alternative models directory inside src/ml/models for explicit modular access
SRC_MODELS_DIR = BASE_DIR / "src" / "ml" / "models"


def get_candidate_models(random_state: int = 42) -> Dict[str, Pipeline]:
    """
    Returns candidate baseline models wrapped in standard preprocessing pipelines.
    """
    models = {
        "Logistic Regression": Pipeline([
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(
                max_iter=1000,
                class_weight="balanced",
                random_state=random_state
            ))
        ]),
        "Random Forest": Pipeline([
            ("scaler", StandardScaler()),
            ("classifier", RandomForestClassifier(
                n_estimators=100,
                max_depth=6,
                class_weight="balanced",
                random_state=random_state
            ))
        ]),
        "Gradient Boosting": Pipeline([
            ("scaler", StandardScaler()),
            ("classifier", HistGradientBoostingClassifier(
                max_iter=100,
                max_depth=4,
                min_samples_leaf=3,
                class_weight="balanced",
                random_state=random_state
            ))
        ])
    }
    return models


def train_and_compare_baselines(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    random_state: int = 42
) -> Tuple[str, Pipeline, Dict[str, ModelEvaluationMetrics]]:
    """
    Trains each candidate model on X_train, evaluates on X_val,
    and selects the best model using Macro F1-Score (prioritizing balanced performance over raw accuracy).
    """
    candidates = get_candidate_models(random_state=random_state)
    val_results: Dict[str, ModelEvaluationMetrics] = {}

    best_model_name = ""
    best_score = -1.0
    best_pipeline = None

    logger.info("Comparing %d candidate baseline models on validation set...", len(candidates))

    for name, pipeline in candidates.items():
        logger.info("Training %s...", name)
        pipeline.fit(X_train, y_train)

        # Evaluate on validation set
        metrics = evaluate_classifier(pipeline, X_val, y_val, model_name=name, dataset_split="validation")
        val_results[name] = metrics

        # Selection criterion: Macro F1-score (not raw accuracy)
        score = metrics.macro_f1
        logger.info("%s -> Validation Macro F1: %.4f, Accuracy: %.4f", name, score, metrics.accuracy)

        if score > best_score:
            best_score = score
            best_model_name = name
            best_pipeline = pipeline

    logger.info("Selected Best Model: %s (Validation Macro F1: %.4f)", best_model_name, best_score)
    return best_model_name, best_pipeline, val_results


def save_trained_model(
    model_pipeline: Pipeline,
    model_name: str,
    test_metrics: ModelEvaluationMetrics,
    feature_names: list = ML_FEATURE_NAMES,
    filename: str = "satellite_fire_classifier.joblib"
) -> Tuple[Path, Path]:
    """
    Serializes model pipeline via joblib and saves metadata.
    Saves in both models/saved_models/ and src/ml/models/.
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    SRC_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    target_path = MODELS_DIR / filename
    src_path = SRC_MODELS_DIR / filename
    meta_path = MODELS_DIR / f"{Path(filename).stem}_metadata.json"

    # Save serialized joblib artifact
    joblib.dump(model_pipeline, target_path)
    joblib.dump(model_pipeline, src_path)

    metadata = {
        "model_name": model_name,
        "filename": filename,
        "features": feature_names,
        "target_classes": CLASS_MAP,
        "test_performance": {
            "accuracy": test_metrics.accuracy,
            "macro_precision": test_metrics.macro_precision,
            "macro_recall": test_metrics.macro_recall,
            "macro_f1": test_metrics.macro_f1,
            "weighted_f1": test_metrics.weighted_f1
        },
        "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    }

    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    logger.info("Model saved successfully to %s and %s", target_path, src_path)
    return target_path, meta_path


def run_full_training_pipeline(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series
) -> Tuple[str, Pipeline, Dict[str, ModelEvaluationMetrics], ModelEvaluationMetrics, Path]:
    """
    Orchestrates full training flow:
    1. Compare baselines on Validation set
    2. Retrain winning architecture on Train + Val
    3. Final unbiased evaluation on unseen Test set
    4. Serialize final model
    """
    # 1. Compare baselines
    best_name, _, val_metrics_dict = train_and_compare_baselines(X_train, y_train, X_val, y_val)

    # 2. Retrain selected architecture on combined Train + Val
    X_train_full = pd.concat([X_train, X_val], ignore_index=True)
    y_train_full = pd.concat([y_train, y_val], ignore_index=True)

    final_candidates = get_candidate_models()
    final_pipeline = final_candidates[best_name]
    logger.info("Retraining selected %s on combined Train+Val (%d samples)...", best_name, len(X_train_full))
    final_pipeline.fit(X_train_full, y_train_full)

    # 3. Final evaluation on held-out Test set
    test_metrics = evaluate_classifier(final_pipeline, X_test, y_test, model_name=best_name, dataset_split="test")

    # 4. Serialize
    model_path, meta_path = save_trained_model(
        model_pipeline=final_pipeline,
        model_name=best_name,
        test_metrics=test_metrics
    )

    return best_name, final_pipeline, val_metrics_dict, test_metrics, model_path
