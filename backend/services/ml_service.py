"""
Machine Learning Inference Service Adapter for FastAPI Backend.
Isolates the ML subsystem and model lifecycle from the API layer.
Integrates the production soft-voting ensemble (RF + LightGBM + XGBoost).
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""

import logging
import numpy as np
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from backend.services.fallback_service import FallbackRuleBasedClassifier

logger = logging.getLogger("backend.ml_service")


class MLServiceException(Exception):
    """Base exception for ML service errors."""
    pass


class MLModelNotLoadedException(MLServiceException):
    """Raised when the ML model weights cannot be loaded or found."""
    def __init__(self, message: str = "Trained ML model artifact is not loaded or missing."):
        super().__init__(message)
        self.message = message


class MLInferenceService:
    """
    Adapter encapsulating the inference interface provided by the ML subsystem.
    Prioritizes the production soft-voting ensemble (RF + LightGBM + XGBoost),
    maintains backward compatibility with baseline models,
    and supports deterministic satellite fallback.
    """

    def __init__(self, use_lazy_loading: bool = True):
        self._ml_service = None
        self._is_ensemble: bool = False
        self._load_error: Optional[str] = None
        if not use_lazy_loading:
            self._ensure_loaded()

    def _ensure_loaded(self):
        """Attempts to import and initialize the ML prediction service."""
        if self._ml_service is not None:
            return self._ml_service

        # 1. Try loading production soft-voting ensemble
        try:
            from backend.ml.model_loader import load_model
            self._ml_service = load_model()
            self._is_ensemble = True
            self._load_error = None
            logger.info("Successfully loaded production SATRA soft-voting ensemble classifier.")
            return self._ml_service
        except Exception as ensemble_err:
            logger.info("Production ensemble not loaded (%s). Checking baseline fallback...", str(ensemble_err))

        # 2. Try loading baseline model as fallback during setup
        try:
            from src.inference.service import get_prediction_service
            self._ml_service = get_prediction_service()
            self._is_ensemble = False
            self._load_error = None
            logger.info("Successfully loaded baseline satellite fire prediction service.")
            return self._ml_service
        except FileNotFoundError as fnf:
            self._load_error = f"Model artifact not found: {str(fnf)}"
            logger.error("[SATRA ERROR] ML Model file missing: %s", str(fnf))
            raise MLModelNotLoadedException(
                f"ML Model artifact not found: {str(fnf)}. "
                "Ensure model is trained using 'python -m backend.ml.train' or weights exist in 'models/'."
            )
        except Exception as e:
            self._load_error = f"Failed to initialize ML service: {str(e)}"
            logger.error("[SATRA ERROR] ML Service initialization error: %s", str(e), exc_info=True)
            raise MLModelNotLoadedException(
                f"ML Prediction engine unavailable: {str(e)}."
            )

    def is_available(self) -> bool:
        """Check if the ML model is successfully loaded and ready for inference."""
        try:
            self._ensure_loaded()
            return True
        except (MLModelNotLoadedException, Exception):
            return False

    def check_configuration(self) -> Dict[str, Any]:
        """
        Validates the configuration of the AI inference service:
        - Verifies whether model artifacts exist
        - Checks whether prediction pipeline is loaded
        - Returns status report without exposing credentials
        """
        available = self.is_available()
        model_ver = getattr(self._ml_service, "model_version", "4.0.0-operational-ensemble") if self._is_ensemble else (
            getattr(self._ml_service, "model_version", "unknown") if self._ml_service else None
        )
        model_type = "RF_LightGBM_XGBoost_SoftVoting" if self._is_ensemble else "Baseline_Classifier"

        return {
            "configured": available,
            "model_loaded": self._ml_service is not None,
            "model_version": model_ver,
            "model_type": model_type,
            "is_ensemble": self._is_ensemble,
            "error": self._load_error,
        }

    def predict(self, observation: Dict[str, Any], db: Optional[Any] = None) -> Dict[str, Any]:
        """
        Executes ML prediction on a validated thermal observation dictionary.
        Returns standardized response containing:
            - classification: class name
            - predicted_class: class name
            - predicted_class_id: integer class ID
            - confidence: float score
            - status: "CLASSIFIED" or "LOW_CONFIDENCE_REVIEW"
            - model_type: "RF_LightGBM_XGBoost_SoftVoting"
            - fusion_source: "TABULAR_ONLY" or "TABULAR_PLUS_VISUAL"
            - alert_level: severity level
            - class_probabilities: distribution dict
            - model_version: version string
            - prediction_timestamp: ISO 8601 UTC string
        """
        service = self._ensure_loaded()
        try:
            if self._is_ensemble:
                from backend.ml.feature_extractor import extract_features_from_observation
                db_conn = db or observation.get("db")
                features = extract_features_from_observation(observation, db=db_conn)
                image_input = (
                    observation.get("image")
                    or observation.get("image_bytes")
                    or observation.get("image_path")
                )
                res = service.predict_single(features, image_input=image_input)
                res["model_version"] = getattr(service, "model_version", "4.0.0-operational-ensemble")
                res["prediction_timestamp"] = datetime.now(timezone.utc).isoformat()
                return res
            else:
                result = service.predict_single(observation)
                conf = float(result.get("confidence", 0.0))
                result["classification"] = result.get("predicted_class", "Other")
                result["status"] = "LOW_CONFIDENCE_REVIEW" if conf < 0.60 else "CLASSIFIED"
                result["model_type"] = "Baseline_Classifier"
                result["fusion_source"] = "TABULAR_ONLY"
                return result
        except Exception as e:
            logger.error("[SATRA ERROR] Error during ML inference: %s", str(e), exc_info=True)
            raise MLServiceException(f"ML inference execution failed: {str(e)}")

    def predict_batch(self, observations: List[Dict[str, Any]], db: Optional[Any] = None) -> List[Dict[str, Any]]:
        """
        Executes ML batch prediction on a list of thermal observation dictionaries.
        """
        service = self._ensure_loaded()
        try:
            if self._is_ensemble:
                from backend.ml.feature_extractor import extract_features_from_observation
                features_list = [
                    extract_features_from_observation(obs, db=db or obs.get("db"))
                    for obs in observations
                ]
                results = service.predict_batch(features_list)
                now_iso = datetime.now(timezone.utc).isoformat()
                model_ver = getattr(service, "model_version", "4.0.0-operational-ensemble")
                for r in results:
                    r["model_version"] = model_ver
                    r["prediction_timestamp"] = now_iso
                return results
            else:
                results = service.predict_batch(observations)
                for r in results:
                    conf = float(r.get("confidence", 0.0))
                    r["classification"] = r.get("predicted_class", "Other")
                    r["status"] = "LOW_CONFIDENCE_REVIEW" if conf < 0.60 else "CLASSIFIED"
                    r["model_type"] = "Baseline_Classifier"
                    r["fusion_source"] = "TABULAR_ONLY"
                return results
        except Exception as e:
            logger.error("[SATRA ERROR] Error during ML batch inference: %s", str(e), exc_info=True)
            raise MLServiceException(f"ML batch inference execution failed: {str(e)}")

    def predict_batch_fast(
        self,
        observations: Union[List[Dict[str, Any]], Any, np.ndarray],
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Ultra-fast vectorized batch feature extraction and ensemble prediction.
        Returns:
            - X: np.ndarray of shape (N, 6) feature matrix
            - pred_class_ids: np.ndarray of shape (N,) int64 class indices (0..3)
            - confs: np.ndarray of shape (N,) float64 confidence scores
            - proba_matrix: np.ndarray of shape (N, 4) probability distribution
        """
        service = self._ensure_loaded()
        try:
            import numpy as np
            if isinstance(observations, np.ndarray):
                X = observations
            else:
                from backend.ml.feature_extractor import extract_features_vectorized
                X = extract_features_vectorized(observations)

            if hasattr(service, "predict_batch_fast"):
                pred_class_ids, confs, proba_matrix = service.predict_batch_fast(X)
            else:
                proba_matrix = service.predict_probabilities(X)
                pred_class_ids = np.argmax(proba_matrix, axis=1)
                confs = np.max(proba_matrix, axis=1)

            return X, pred_class_ids, confs, proba_matrix
        except Exception as e:
            logger.error("[SATRA ERROR] Error during fast ML batch inference: %s", str(e), exc_info=True)
            raise MLServiceException(f"Fast ML batch inference failed: {str(e)}")

    def predict_with_fallback(self, observation: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        """
        Executes ML prediction. If ML inference fails or is not configured,
        automatically falls back to deterministic rule-based satellite analysis.
        """
        try:
            if not self.is_available():
                logger.warning("[SATRA API] AI service unavailable — activating deterministic rule-based satellite analysis.")
                return FallbackRuleBasedClassifier.evaluate_observation(observation), True

            pred = self.predict(observation)
            return pred, False
        except Exception as err:
            logger.warning("[SATRA API] Primary AI inference failed (%s) — activating rule-based fallback.", str(err))
            fallback_res = FallbackRuleBasedClassifier.evaluate_observation(observation)
            return fallback_res, True


# Singleton service instance
_ml_service_instance: Optional[MLInferenceService] = None


def get_ml_service() -> MLInferenceService:
    """FastAPI dependency for accessing the ML inference service."""
    global _ml_service_instance
    if _ml_service_instance is None:
        _ml_service_instance = MLInferenceService(use_lazy_loading=True)
    return _ml_service_instance
