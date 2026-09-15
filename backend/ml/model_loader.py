"""
Model Loader for SATRA Soft-Voting Ensemble Classifier.

Loads satra_ensemble.pkl into memory once when the backend starts.
If the model file does not exist:
Returns a clear setup/training error.
Does NOT generate a fake or mock model.
"""

import logging
import threading
from pathlib import Path
from typing import Optional, Union

import joblib

logger = logging.getLogger("backend.ml.model_loader")

DEFAULT_MODEL_PATH = Path("models/satra_ensemble.pkl")

_LOADED_MODEL = None
_MODEL_LOAD_LOCK = threading.Lock()
_LOAD_ERROR: Optional[str] = None


class ModelNotLoadedError(FileNotFoundError):
    """Raised when satra_ensemble.pkl is missing or not yet trained."""
    pass


def load_model(
    model_path: Optional[Union[str, Path]] = None,
    force_reload: bool = False
):
    """
    Loads satra_ensemble.pkl into memory.
    
    If the model file does not exist:
    Raises ModelNotLoadedError with clear training/setup instructions.
    Does NOT generate a fake model.
    """
    global _LOADED_MODEL, _LOAD_ERROR

    with _MODEL_LOAD_LOCK:
        if _LOADED_MODEL is not None and not force_reload:
            return _LOADED_MODEL

        resolved_path = Path(model_path) if model_path else DEFAULT_MODEL_PATH

        if not resolved_path.exists() and model_path is None:
            # Check alternative locations for default model
            alt_path = Path(__file__).resolve().parent.parent.parent / "models" / "satra_ensemble.pkl"
            if alt_path.exists():
                resolved_path = alt_path

        if not resolved_path.exists():
            _LOAD_ERROR = (
                f"Trained ensemble model file not found at '{resolved_path}'. "
                "The application does not use mock/fake models. "
                "Please train the ensemble using the real labelled SATRA dataset: "
                "run 'python -m backend.ml.train' or call train_ensemble_pipeline()."
            )
            logger.error("[SATRA ERROR] %s", _LOAD_ERROR)
            raise ModelNotLoadedError(_LOAD_ERROR)

        try:
            logger.info("Loading production SATRA soft-voting ensemble from: %s", str(resolved_path))
            loaded = joblib.load(resolved_path)
            _LOADED_MODEL = loaded
            _LOAD_ERROR = None
            logger.info("Successfully loaded SATRA ensemble classifier into memory.")
            return _LOADED_MODEL
        except Exception as err:
            _LOAD_ERROR = f"Failed to deserialize model at '{resolved_path}': {str(err)}"
            logger.error("[SATRA ERROR] %s", _LOAD_ERROR, exc_info=True)
            raise RuntimeError(_LOAD_ERROR) from err


def get_loaded_model():
    """
    Returns the cached ensemble model instance.
    Attempts to load it if not yet loaded.
    """
    global _LOADED_MODEL
    if _LOADED_MODEL is None:
        return load_model()
    return _LOADED_MODEL


def is_model_loaded() -> bool:
    """Checks whether the ensemble is currently loaded and ready in memory."""
    return _LOADED_MODEL is not None


def get_model_load_error() -> Optional[str]:
    """Returns the most recent model loading error message, if any."""
    return _LOAD_ERROR
