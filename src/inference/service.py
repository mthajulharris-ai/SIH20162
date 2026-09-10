"""
Prediction Service Interface for Backend / FastAPI Integration.

Provides a decoupled inference service designed for direct consumption by backend endpoints:
- Validates and standardizes thermal anomaly input records
- Derives secondary physical features if raw sensory inputs are supplied
- Returns standardized responses containing:
    - predicted_class
    - confidence (probability score)
    - model_version
    - prediction_timestamp (ISO 8601 UTC)
    - class_probabilities
    - alert_level (LOW, MEDIUM, CRITICAL)
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Union, Optional

import joblib
import numpy as np
import pandas as pd

from src.config import MODELS_DIR, BASE_DIR
from src.data_pipeline.dataset_builder import CLASS_MAP, ML_FEATURE_NAMES

logger = logging.getLogger("satellite_inference.service")

# Default service and model version
MODEL_VERSION = "1.0.0-baseline"

MODEL_V2_PATH = MODELS_DIR / "satellite_fire_classifier_v2.joblib"
METADATA_V2_PATH = MODELS_DIR / "satellite_fire_classifier_v2_metadata.json"
DEFAULT_MODEL_PATH = MODELS_DIR / "satellite_fire_classifier.joblib"
FALLBACK_MODEL_PATH = BASE_DIR / "src" / "ml" / "models" / "satellite_fire_classifier.joblib"
METADATA_PATH = MODELS_DIR / "satellite_fire_classifier_metadata.json"


class ThermalPredictionService:
    """
    Production-ready prediction service for thermal hotspot classification.
    Thread-safe and designed for backend dependency injection.
    """

    def __init__(self, model_path: Optional[Union[str, Path]] = None):
        self.model_path = self._resolve_model_path(model_path)
        logger.info("Initializing ThermalPredictionService with model: %s", self.model_path)
        
        # Load serialized pipeline (StandardScaler + Classifier)
        self.pipeline = joblib.load(self.model_path)
        self.feature_names = ML_FEATURE_NAMES
        self.model_version = self._load_version_metadata()

    def _resolve_model_path(self, custom_path: Optional[Union[str, Path]]) -> Path:
        """Finds valid model artifact path, prioritizing version 2 when present."""
        if custom_path and Path(custom_path).exists():
            return Path(custom_path)
        if MODEL_V2_PATH.exists():
            return MODEL_V2_PATH
        if DEFAULT_MODEL_PATH.exists():
            return DEFAULT_MODEL_PATH
        if FALLBACK_MODEL_PATH.exists():
            return FALLBACK_MODEL_PATH
        raise FileNotFoundError(
            f"No trained model artifact found at {MODEL_V2_PATH}, {DEFAULT_MODEL_PATH} or {FALLBACK_MODEL_PATH}. "
            "Please run 'python scripts/train_baseline.py' or 'python scripts/train_scientific_model.py' first."
        )

    def _load_version_metadata(self) -> str:
        """Reads model version from metadata if available."""
        meta_candidates = [
            self.model_path.parent / f"{self.model_path.stem}_metadata.json",
            METADATA_V2_PATH,
            METADATA_PATH
        ]
        for meta_file in meta_candidates:
            if meta_file.exists():
                try:
                    with open(meta_file, "r") as f:
                        meta = json.load(f)
                        return meta.get("model_version", MODEL_VERSION)
                except Exception:
                    pass
        return MODEL_VERSION

    def _derive_missing_features(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Derives secondary physical/temporal features if only base satellite readings are provided:
        - temp_diff = brightness - bright_t31
        - frp_density = frp / (scan * track)
        - hour_sin / hour_cos from hour_utc
        - is_night from daynight or hour_utc
        """
        r = dict(row)

        # 1. Temperature difference
        if "temp_diff" not in r or r["temp_diff"] is None:
            if "brightness" in r and "bright_t31" in r and r["bright_t31"] is not None:
                r["temp_diff"] = float(r["brightness"]) - float(r["bright_t31"])
            else:
                r["temp_diff"] = 0.0

        # 2. FRP density
        if "frp_density" not in r or r["frp_density"] is None:
            frp_val = float(r.get("frp", 0.0))
            scan = float(r.get("scan", 0.375))
            track = float(r.get("track", 0.375))
            area = max(0.01, scan * track)
            r["frp_density"] = frp_val / area

        # 3. Diurnal night indicator
        if "is_night" not in r or r["is_night"] is None:
            if "daynight" in r and str(r["daynight"]).upper() == "N":
                r["is_night"] = 1
            elif "hour_utc" in r and (r["hour_utc"] < 6 or r["hour_utc"] >= 18):
                r["is_night"] = 1
            else:
                r["is_night"] = 0

        # 4. Cyclical hour trigonometry
        if ("hour_sin" not in r or r["hour_sin"] is None) and "hour_utc" in r:
            h = float(r["hour_utc"])
            r["hour_sin"] = float(np.sin(2 * np.pi * h / 24.0))
            r["hour_cos"] = float(np.cos(2 * np.pi * h / 24.0))
        elif "hour_sin" not in r:
            r["hour_sin"] = 0.0
            r["hour_cos"] = 0.0

        # 5. Default recurrence & persistence baselines if not provided
        r.setdefault("recurrence_count", 1)
        r.setdefault("persistence_ratio", 0.05)
        r.setdefault("night_detection_ratio", 0.0)
        r.setdefault("frp_local_mean", float(r.get("frp", 10.0)))
        r.setdefault("frp_zscore", 0.0)
        r.setdefault("frp_to_mean_ratio", 1.0)
        r.setdefault("confidence_score", 0.60)

        return r

    def _prepare_feature_dataframe(self, records: List[Dict[str, Any]]) -> pd.DataFrame:
        """Converts raw dictionaries into standard feature matrix X."""
        processed_rows = [self._derive_missing_features(rec) for rec in records]
        df = pd.DataFrame(processed_rows)

        # Ensure all required features exist
        for feat in self.feature_names:
            if feat not in df.columns:
                df[feat] = 0.0

        return df[self.feature_names].fillna(0.0)

    def predict_single(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classifies a single satellite thermal observation dictionary.
        Returns a standardized JSON-serializable dictionary.
        """
        return self.predict_batch([observation])[0]

    def predict_batch(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Classifies multiple satellite thermal observations in a vectorized batch.
        """
        if not observations:
            return []

        X = self._prepare_feature_dataframe(observations)
        preds = self.pipeline.predict(X)
        
        has_proba = hasattr(self.pipeline, "predict_proba")
        probs = self.pipeline.predict_proba(X) if has_proba else None

        results: List[Dict[str, Any]] = []
        now_utc = datetime.now(timezone.utc).isoformat()

        for i, pred_class in enumerate(preds):
            class_id = int(pred_class)
            class_name = CLASS_MAP.get(class_id, "Unknown")

            if probs is not None:
                prob_row = probs[i]
                prob_dict = {
                    CLASS_MAP[idx]: round(float(p), 4)
                    for idx, p in enumerate(prob_row)
                }
                conf = round(float(np.max(prob_row)), 4)
            else:
                prob_dict = {class_name: 1.0}
                conf = 1.0

            # Alert severity mapping
            if class_id == 2:
                alert_level = "CRITICAL"
            elif class_id == 1:
                alert_level = "MEDIUM"
            else:
                alert_level = "LOW"

            obs_result = {
                "status": "SUCCESS",
                "predicted_class": class_name,
                "predicted_class_id": class_id,
                "confidence": conf,
                "alert_level": alert_level,
                "class_probabilities": prob_dict,
                "model_version": self.model_version,
                "prediction_timestamp": now_utc
            }
            if conf < 0.60:
                obs_result["uncertainty_flag"] = "LOW_CONFIDENCE_REVIEW"

            results.append(obs_result)

        return results


# Module-level singleton instance for zero-overhead imports in backend
_service_instance: Optional[ThermalPredictionService] = None


def get_prediction_service() -> ThermalPredictionService:
    """Returns or lazily creates a singleton ThermalPredictionService instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = ThermalPredictionService()
    return _service_instance


def predict_thermal_observation(
    observation: Union[Dict[str, Any], List[Dict[str, Any]]]
) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Clean Python function interface for backend developers.
    
    Usage:
        from src.inference.service import predict_thermal_observation
        
        response = predict_thermal_observation(data)
    """
    service = get_prediction_service()
    if isinstance(observation, dict):
        return service.predict_single(observation)
    elif isinstance(observation, list):
        return service.predict_batch(observation)
    else:
        raise ValueError(f"Invalid input type: {type(observation)}. Expected dict or list of dicts.")
