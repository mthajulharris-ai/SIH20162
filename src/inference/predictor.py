"""
Inference wrapper for backend consumption.
Allows backend developers to import:
    from src.inference.predictor import ThermalSourcePredictor
"""

from src.ml.predict import ThermalSourcePredictor, predict_single

__all__ = ["ThermalSourcePredictor", "predict_single"]
