"""
Model Evaluation and Metrics Reporting Module for SIH PS 26162.

Calculates:
- Accuracy
- Precision, Recall, F1-Score (Macro, Weighted, and Per-Class)
- Confusion Matrix
- Domain-specific evaluation emphasis on Industrial Fire detection sensitivity (recall)
"""

import logging
from dataclasses import dataclass, asdict
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)

from src.data_pipeline.dataset_builder import CLASS_MAP

logger = logging.getLogger("satellite_ml.evaluate")


@dataclass
class ModelEvaluationMetrics:
    """Encapsulates all standard and per-class evaluation metrics."""
    model_name: str
    dataset_split: str  # 'validation' or 'test'
    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    weighted_f1: float
    per_class_metrics: Dict[str, Dict[str, float]]
    confusion_matrix: List[List[int]]
    target_names: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_text_report(self) -> str:
        lines = [
            "=" * 65,
            f"       EVALUATION REPORT: {self.model_name.upper()} ({self.dataset_split.upper()} SET)",
            "=" * 65,
            f"Overall Accuracy:       {self.accuracy:.4f} ({self.accuracy * 100:.2f}%)",
            f"Macro Precision:        {self.macro_precision:.4f}",
            f"Macro Recall:           {self.macro_recall:.4f}",
            f"Macro F1-Score:         {self.macro_f1:.4f}  <-- PRIMARY SELECTION METRIC",
            f"Weighted F1-Score:      {self.weighted_f1:.4f}",
            "-" * 65,
            "Per-Class Performance Breakdown:",
            f"  {'Class Name':<28} {'Precision':<10} {'Recall':<10} {'F1-Score':<10}"
        ]
        for cls_name, metrics in self.per_class_metrics.items():
            p = metrics["precision"]
            r = metrics["recall"]
            f = metrics["f1"]
            flag = " [CRITICAL]" if cls_name == "Industrial Fire" else ""
            lines.append(f"  {cls_name:<28} {p:<10.4f} {r:<10.4f} {f:<10.4f}{flag}")

        lines.extend([
            "-" * 65,
            "Confusion Matrix (Rows: Ground Truth, Columns: Predicted):"
        ])

        # Header for confusion matrix
        header_cols = [f"Pred {CLASS_MAP[i][:7]}" for i in range(len(self.target_names))]
        lines.append(f"  {'True Class':<28} " + " ".join([f"{col:>12}" for col in header_cols]))

        for i, row in enumerate(self.confusion_matrix):
            true_label = self.target_names[i]
            row_vals = " ".join([f"{val:>12d}" for val in row])
            lines.append(f"  {true_label:<28} {row_vals}")

        lines.append("=" * 65)
        return "\n".join(lines)


def evaluate_classifier(
    model: Any,
    X: pd.DataFrame,
    y: pd.Series,
    model_name: str = "Classifier",
    dataset_split: str = "validation"
) -> ModelEvaluationMetrics:
    """
    Evaluates a scikit-learn model on a given feature matrix X and target y.
    """
    y_pred = model.predict(X)
    
    unique_labels = sorted(list(CLASS_MAP.keys()))
    target_names = [CLASS_MAP[k] for k in unique_labels]

    acc = float(accuracy_score(y, y_pred))
    p_macro = float(precision_score(y, y_pred, average="macro", zero_division=0))
    r_macro = float(recall_score(y, y_pred, average="macro", zero_division=0))
    f1_macro = float(f1_score(y, y_pred, average="macro", zero_division=0))
    f1_weighted = float(f1_score(y, y_pred, average="weighted", zero_division=0))

    cm = confusion_matrix(y, y_pred, labels=unique_labels).tolist()

    # Per-class metrics
    p_per_class = precision_score(y, y_pred, average=None, labels=unique_labels, zero_division=0)
    r_per_class = recall_score(y, y_pred, average=None, labels=unique_labels, zero_division=0)
    f1_per_class = f1_score(y, y_pred, average=None, labels=unique_labels, zero_division=0)

    per_class_dict = {}
    for i, cls_name in enumerate(target_names):
        per_class_dict[cls_name] = {
            "precision": float(p_per_class[i]),
            "recall": float(r_per_class[i]),
            "f1": float(f1_per_class[i])
        }

    metrics = ModelEvaluationMetrics(
        model_name=model_name,
        dataset_split=dataset_split,
        accuracy=acc,
        macro_precision=p_macro,
        macro_recall=r_macro,
        macro_f1=f1_macro,
        weighted_f1=f1_weighted,
        per_class_metrics=per_class_dict,
        confusion_matrix=cm,
        target_names=target_names
    )

    return metrics
