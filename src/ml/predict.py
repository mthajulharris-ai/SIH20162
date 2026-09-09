"""
Prediction Interface Module for SIH PS 26162.

Provides an easy-to-use Python prediction interface for backend developers:
- Loads the saved model pipeline
- Accepts feature dictionaries or DataFrames
- Returns predicted class, probability distribution, and alert severity
"""

import logging
from pathlib import Path
from typing import Dict, Any, List, Union, Optional
import joblib
import numpy as np
import pandas as pd

from src.config import MODELS_DIR, BASE_DIR
from src.data_pipeline.dataset_builder import CLASS_MAP, ML_FEATURE_NAMES

logger = logging.getLogger("satellite_ml.predict")

DEFAULT_MODEL_PATH = MODELS_DIR / "satellite_fire_classifier.joblib"
FALLBACK_SRC_MODEL_PATH = BASE_DIR / "src" / "ml" / "models" / "satellite_fire_classifier.joblib"


class ThermalSourcePredictor:
    """
    Inference interface for classifying satellite thermal anomaly detections.
    """

    def __init__(self, model_path: Optional[Union[str, Path]] = None):
        if model_path:
            self.model_path = Path(model_path)
        elif DEFAULT_MODEL_PATH.exists():
            self.model_path = DEFAULT_MODEL_PATH
        elif FALLBACK_SRC_MODEL_PATH.exists():
            self.model_path = FALLBACK_SRC_MODEL_PATH
        else:
            raise FileNotFoundError(
                f"Trained model not found at {DEFAULT_MODEL_PATH} or {FALLBACK_SRC_MODEL_PATH}. "
                "Train the model first using scripts/train_baseline.py"
            )

        logger.info("Loading satellite classifier from: %s", self.model_path)
        self.pipeline = joblib.load(self.model_path)
        self.feature_names = ML_FEATURE_NAMES

    def _prepare_input_df(self, data: Union[Dict[str, Any], pd.DataFrame, List[Dict[str, Any]]]) -> pd.DataFrame:
        """Standardizes input dictionary or list of dicts into a validated DataFrame with all required features."""
        if isinstance(data, dict):
            df = pd.DataFrame([data])
        elif isinstance(data, list):
            df = pd.DataFrame(data)
        elif isinstance(data, pd.DataFrame):
            df = data.copy()
        else:
            raise ValueError(f"Unsupported input type: {type(data)}")

        # Ensure all required features are present, filling missing with 0.0
        for feat in self.feature_names:
            if feat not in df.columns:
                df[feat] = 0.0

        return df[self.feature_names]

    def predict(
        self,
        data: Union[Dict[str, Any], pd.DataFrame, List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        """
        Classifies one or more satellite thermal observations.
        
        Returns:
            List of prediction result dictionaries:
            [
              {
                "class_id": 2,
                "class_name": "Industrial Fire",
                "confidence_score": 0.94,
                "alert_level": "CRITICAL",
                "class_probabilities": {
                   "Other": 0.01,
                   "Persistent Thermal Source": 0.05,
                   "Industrial Fire": 0.94
                }
              }
            ]
        """
        X = self._prepare_input_df(data)
        preds = self.pipeline.predict(X)
        
        # Check if predict_proba is supported
        has_proba = hasattr(self.pipeline, "predict_proba")
        probs = self.pipeline.predict_proba(X) if has_proba else None

        results = []
        for i, pred_class in enumerate(preds):
            pred_id = int(pred_class)
            pred_name = CLASS_MAP.get(pred_id, "Unknown")

            if probs is not None:
                prob_row = probs[i]
                prob_dict = {
                    CLASS_MAP.get(idx, f"Class_{idx}"): round(float(p), 4)
                    for idx, p in enumerate(prob_row)
                }
                conf = round(float(np.max(prob_row)), 4)
            else:
                prob_dict = {pred_name: 1.0}
                conf = 1.0

            # Determine alert severity
            if pred_id == 2:
                alert = "CRITICAL"
            elif pred_id == 1:
                alert = "MEDIUM"
            else:
                alert = "LOW"

            results.append({
                "class_id": pred_id,
                "class_name": pred_name,
                "confidence_score": conf,
                "alert_level": alert,
                "class_probabilities": prob_dict
            })

        return results


def predict_single(observation_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Helper function to classify a single thermal observation dictionary."""
    predictor = ThermalSourcePredictor()
    return predictor.predict(observation_dict)[0]
