"""
Machine Learning Inference Service Adapter for FastAPI Backend.
Isolates the ML subsystem and model lifecycle from the API layer.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""

import logging
from typing import Any, Dict, Optional
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
    Provides decoupled inference, robust error handling, test mockability,
    and automatic rule-based fallback when the ML service is offline or unconfigured.
    """

    def __init__(self, use_lazy_loading: bool = True):
        self._ml_service = None
        self._load_error: Optional[str] = None
        if not use_lazy_loading:
            self._ensure_loaded()

    def _ensure_loaded(self):
        """Attempts to import and initialize the ML prediction service."""
        if self._ml_service is not None:
            return self._ml_service

        try:
            from src.inference.service import get_prediction_service
            self._ml_service = get_prediction_service()
            self._load_error = None
            logger.info("Successfully loaded ML prediction service.")
            return self._ml_service
        except FileNotFoundError as fnf:
            self._load_error = f"Model artifact not found: {str(fnf)}"
            logger.error("[SATRA ERROR] ML Model file missing: %s", str(fnf))
            raise MLModelNotLoadedException(
                f"ML Model artifact not found: {str(fnf)}. "
                "Ensure model is trained using 'python scripts/train_baseline.py' or weights exist in 'models/saved_models/'."
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
        return {
            "configured": available,
            "model_loaded": self._ml_service is not None,
            "model_version": getattr(self._ml_service, "model_version", "unknown") if self._ml_service else None,
            "error": self._load_error,
        }

    def predict(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes ML prediction on a validated thermal observation dictionary.
        
        Interface Contract with src.inference.service:
            Input: observation dictionary with physical/spatial features
            Output: {
                "status": "SUCCESS",
                "predicted_class": "Industrial Fire" | "Persistent Thermal Source" | "Other",
                "predicted_class_id": 0 | 1 | 2,
                "confidence": float (0.0 - 1.0),
                "alert_level": "LOW" | "MEDIUM" | "CRITICAL",
                "class_probabilities": {...},
                "model_version": str,
                "prediction_timestamp": str (ISO 8601 UTC)
            }
        """
        service = self._ensure_loaded()
        try:
            result = service.predict_single(observation)
            return result
        except Exception as e:
            logger.error("[SATRA ERROR] Error during ML inference: %s", str(e), exc_info=True)
            raise MLServiceException(f"ML inference execution failed: {str(e)}")

    def predict_batch(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Executes ML batch prediction on a list of thermal observation dictionaries.
        Leverages vectorized array operations in src.inference.service for maximum performance.
        """
        service = self._ensure_loaded()
        try:
            return service.predict_batch(observations)
        except Exception as e:
            logger.error("[SATRA ERROR] Error during ML batch inference: %s", str(e), exc_info=True)
            raise MLServiceException(f"ML batch inference execution failed: {str(e)}")

    def predict_with_fallback(self, observation: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        """
        Executes ML prediction. If ML inference fails or is not configured,
        automatically falls back to deterministic rule-based satellite analysis.

        Returns:
            Tuple[Dict[str, Any], bool]: (prediction_result, is_fallback_boolean)
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
