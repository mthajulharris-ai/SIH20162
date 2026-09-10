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
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.config import MODELS_DIR, BASE_DIR, PROCESSED_DATA_DIR, PROVENANCE_PROTOTYPE_LABELLED
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


def cross_validate_and_select_best(
    X: pd.DataFrame,
    y: pd.Series,
    groups: np.ndarray,
    n_splits: int = 4,
    random_state: int = 42
) -> Tuple[str, Dict[str, Dict[str, float]]]:
    """
    Performs leakage-free Stratified Group K-Fold cross-validation across candidate models.
    Evaluates Macro F1, Industrial Fire Recall, and Accuracy.
    Returns (winning_model_name, full_cv_metrics_dict).
    """
    candidates = get_candidate_models(random_state=random_state)
    sgkf = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=random_state)

    cv_results: Dict[str, Dict[str, float]] = {}
    best_name = ""
    best_combined_score = -1.0

    logger.info("Executing %d-Fold Stratified Group Cross-Validation across %d candidates...", n_splits, len(candidates))

    for name, pipeline in candidates.items():
        macro_f1s = []
        fire_recalls = []
        accuracies = []

        for train_idx, val_idx in sgkf.split(X, y, groups=groups):
            X_tr, y_tr = X.iloc[train_idx], y.iloc[train_idx]
            X_va, y_va = X.iloc[val_idx], y.iloc[val_idx]

            pipeline.fit(X_tr, y_tr)
            metrics = evaluate_classifier(pipeline, X_va, y_va, model_name=name, dataset_split="cv_fold")
            macro_f1s.append(metrics.macro_f1)
            fire_recalls.append(metrics.industrial_fire_recall)
            accuracies.append(metrics.accuracy)

        mean_f1 = float(np.mean(macro_f1s))
        std_f1 = float(np.std(macro_f1s))
        mean_recall = float(np.mean(fire_recalls))
        mean_acc = float(np.mean(accuracies))

        cv_results[name] = {
            "mean_macro_f1": round(mean_f1, 4),
            "std_macro_f1": round(std_f1, 4),
            "mean_industrial_fire_recall": round(mean_recall, 4),
            "mean_accuracy": round(mean_acc, 4)
        }

        # Combined score: 60% Macro F1 + 40% Industrial Fire Recall (safety-critical bias)
        combined_score = 0.60 * mean_f1 + 0.40 * mean_recall
        logger.info(
            "%s CV -> Macro F1: %.4f (+/-%.4f), Fire Recall: %.4f, Accuracy: %.4f (Combined: %.4f)",
            name, mean_f1, std_f1, mean_recall, mean_acc, combined_score
        )

        if combined_score > best_combined_score:
            best_combined_score = combined_score
            best_name = name

    logger.info("Cross-Validation Winner: %s (Combined Score: %.4f)", best_name, best_combined_score)
    return best_name, cv_results


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

        # Selection criterion: Macro F1-score
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
    filename: str = "satellite_fire_classifier.joblib",
    model_version: str = "1.0.0-baseline",
    data_provenance: str = PROVENANCE_PROTOTYPE_LABELLED,
    split_methodology: str = "Stratified Group Split (StratifiedGroupKFold on spatial_cluster_id)",
    training_sample_count: Optional[int] = None,
    validation_metrics: Optional[Dict[str, Any]] = None,
    scientific_limitations: Optional[list] = None
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
        "model_version": model_version,
        "model_name": model_name,
        "filename": filename,
        "algorithm": str(model_pipeline.named_steps.get("classifier", model_name)),
        "data_provenance": data_provenance,
        "split_methodology": split_methodology,
        "features": feature_names,
        "target_classes": CLASS_MAP,
        "training_sample_count": training_sample_count,
        "test_performance": {
            "accuracy": test_metrics.accuracy,
            "macro_precision": test_metrics.macro_precision,
            "macro_recall": test_metrics.macro_recall,
            "macro_f1": test_metrics.macro_f1,
            "industrial_fire_recall": test_metrics.industrial_fire_recall,
            "industrial_fire_f1": test_metrics.industrial_fire_f1,
            "weighted_f1": test_metrics.weighted_f1,
            "per_class_metrics": test_metrics.per_class_metrics,
            "confusion_matrix": test_metrics.confusion_matrix
        },
        "validation_comparison": validation_metrics or {},
        "scientific_limitations": scientific_limitations or [
            "Trained on prototype-labeled benchmark data; not certified field ground truth.",
            "NASA FIRMS provides radiometry, not direct incident cause labels.",
            "Real-world operational deployment requires human-in-the-loop analyst verification (REQUIRES_VERIFICATION)."
        ],
        "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    }

    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    logger.info("Model saved successfully to %s and %s (version: %s)", target_path, src_path, model_version)
    return target_path, meta_path


def run_full_training_pipeline(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    model_version: str = "1.0.0-baseline",
    filename: str = "satellite_fire_classifier.joblib"
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
        test_metrics=test_metrics,
        model_version=model_version,
        filename=filename,
        training_sample_count=len(X_train_full)
    )

    return best_name, final_pipeline, val_metrics_dict, test_metrics, model_path

