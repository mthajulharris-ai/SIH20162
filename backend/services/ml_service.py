"""
Machine Learning Inference Service Adapter for FastAPI Backend.
Isolates the ML subsystem and model lifecycle from the API layer.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import logging
from typing import Dict, Any, Optional

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
    Adapter encapsulating the inference interface provided by the ML developer.
    Provides decoupled inference, robust error handling, and test mockability.
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
            logger.error("ML Model file missing: %s", str(fnf))
            raise MLModelNotLoadedException(
                f"ML Model artifact not found: {str(fnf)}. "
                "Ensure model is trained using 'python scripts/train_baseline.py' or weights exist in 'models/saved_models/'."
            )
        except Exception as e:
            self._load_error = f"Failed to initialize ML service: {str(e)}"
            logger.error("ML Service initialization error: %s", str(e), exc_info=True)
            raise MLModelNotLoadedException(
                f"ML Prediction engine unavailable: {str(e)}."
            )

    def is_available(self) -> bool:
        """Check if the ML model is successfully loaded and ready for inference."""
        try:
            self._ensure_loaded()
            return True
        except MLModelNotLoadedException:
            return False

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
            logger.error("Error during ML inference: %s", str(e), exc_info=True)
            raise MLServiceException(f"ML inference execution failed: {str(e)}")


# Singleton service instance
_ml_service_instance: Optional[MLInferenceService] = None


def get_ml_service() -> MLInferenceService:
    """FastAPI dependency for accessing the ML inference service."""
    global _ml_service_instance
    if _ml_service_instance is None:
        _ml_service_instance = MLInferenceService(use_lazy_loading=True)
    return _ml_service_instance
