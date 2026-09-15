"""
SATRA Machine Learning Subsystem.

Production Soft-Voting Ensemble Classifier (Random Forest + LightGBM + XGBoost)
across 4 Thermal Anomaly Classes:
0 = Industrial Fire
1 = Forest Fire
2 = Persistent Thermal Source
3 = Other
"""

from backend.ml.ensemble_classifier import (
    CLASS_ID_TO_NAME,
    CLASS_NAME_TO_ID,
    LOW_CONFIDENCE_THRESHOLD,
    MODEL_TYPE_NAME,
    MissingLabelsError,
    SoftVotingEnsembleWrapper,
    build_ensemble_classifier,
    train_ensemble_pipeline,
)
from backend.ml.feature_extractor import (
    REQUIRED_FEATURES,
    FeatureValidationError,
    extract_features_from_observation,
    validate_feature_vector,
)
from backend.ml.model_loader import (
    DEFAULT_MODEL_PATH,
    ModelNotLoadedError,
    get_loaded_model,
    get_model_load_error,
    is_model_loaded,
    load_model,
)
from backend.ml.yolo_fusion import fuse_confidences, run_yolo_inference

__all__ = [
    "CLASS_ID_TO_NAME",
    "CLASS_NAME_TO_ID",
    "DEFAULT_MODEL_PATH",
    "FeatureValidationError",
    "LOW_CONFIDENCE_THRESHOLD",
    "MODEL_TYPE_NAME",
    "MissingLabelsError",
    "ModelNotLoadedError",
    "REQUIRED_FEATURES",
    "SoftVotingEnsembleWrapper",
    "build_ensemble_classifier",
    "extract_features_from_observation",
    "fuse_confidences",
    "get_loaded_model",
    "get_model_load_error",
    "is_model_loaded",
    "load_model",
    "run_yolo_inference",
    "train_ensemble_pipeline",
    "validate_feature_vector",
]
