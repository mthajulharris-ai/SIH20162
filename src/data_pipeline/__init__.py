"""
Satellite Data Pipeline for SIH PS 26162.
Integrates Data Collection, Ingestion, Preprocessing, Cleaning, and Feature Engineering.
"""

from src.data_pipeline.collector import FirmsDataCollector, FirmsAPIError, INDUSTRIAL_REGION_BOUNDS
from src.data_pipeline.ingestion import ThermalDataIngestionPipeline, IngestionAuditSummary, IngestionValidationError
from src.data_pipeline.preprocessor import SatelliteDataCleaner, DataQualityReport
from src.data_pipeline.feature_engineering import engineer_all_features
from src.data_pipeline.dataset_builder import assign_prototype_labels, split_ml_dataset, build_and_save_ml_dataset

__all__ = [
    "FirmsDataCollector",
    "FirmsAPIError",
    "INDUSTRIAL_REGION_BOUNDS",
    "ThermalDataIngestionPipeline",
    "IngestionAuditSummary",
    "IngestionValidationError",
    "SatelliteDataCleaner",
    "DataQualityReport",
    "engineer_all_features",
    "assign_prototype_labels",
    "split_ml_dataset",
    "build_and_save_ml_dataset"
]
