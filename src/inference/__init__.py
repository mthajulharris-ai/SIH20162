"""
Model inference and backend interface module for SIH PS 26162.
"""

from src.inference.service import (
    ThermalPredictionService,
    predict_thermal_observation,
    get_prediction_service
)
from src.inference.predictor import ThermalSourcePredictor

__all__ = [
    "ThermalPredictionService",
    "predict_thermal_observation",
    "get_prediction_service",
    "ThermalSourcePredictor"
]
