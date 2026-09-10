"""
Pydantic Schemas for Raw Thermal Observation Inputs and ML Inference Responses.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from pydantic import BaseModel, Field
from backend.schemas.detection import DetectionResponse


class ThermalObservationInput(BaseModel):
    """
    Raw satellite observation received for ML classification and backend persistence.
    """
    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees (-90.0 to 90.0)",
        examples=[21.1702],
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees (-180.0 to 180.0)",
        examples=[72.8311],
    )
    brightness: float = Field(
        ...,
        gt=0.0,
        description="Brightness temperature in Kelvin (channel 21/22 for MODIS, I4 for VIIRS)",
        examples=[365.4],
    )
    bright_t31: Optional[float] = Field(
        None,
        gt=0.0,
        description="Thermal infrared window channel temperature in Kelvin (T31 / I5)",
        examples=[298.2],
    )
    frp: Optional[float] = Field(
        None,
        ge=0.0,
        description="Fire Radiative Power (MW)",
        examples=[68.5],
    )
    confidence: Optional[str] = Field(
        default="nominal",
        description="Raw satellite confidence string ('low', 'nominal', 'high')",
        examples=["nominal"],
    )
    acq_date: Optional[str] = Field(
        default=None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Observation date (YYYY-MM-DD). Defaults to current UTC date if omitted.",
        examples=["2026-09-09"],
    )
    acq_time: Optional[str] = Field(
        default=None,
        description="Observation time in UTC (HHMM). Defaults to current UTC time if omitted.",
        examples=["1430"],
    )
    source: Optional[str] = Field(
        default="VIIRS_SNPP_NRT",
        description="Satellite source ('VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT')",
        examples=["VIIRS_SNPP_NRT"],
    )
    instrument: Optional[str] = Field(
        default="VIIRS",
        description="Sensor instrument ('VIIRS', 'MODIS')",
        examples=["VIIRS"],
    )
    data_provenance: Optional[str] = Field(
        default=None,
        description="Data provenance ('REAL_FIRMS', 'SAMPLE', 'PROTOTYPE_LABELLED')",
        examples=["REAL_FIRMS"],
    )

    scan: Optional[float] = Field(
        default=0.375,
        gt=0.0,
        description="Scan pixel size (km)",
        examples=[0.375],
    )
    track: Optional[float] = Field(
        default=0.375,
        gt=0.0,
        description="Track pixel size (km)",
        examples=[0.375],
    )
    daynight: Optional[str] = Field(
        default="D",
        pattern=r"^[DNdn]$",
        description="Day ('D') or Night ('N') flag",
        examples=["D"],
    )
    hour_utc: Optional[int] = Field(
        default=None,
        ge=0,
        le=23,
        description="Observation hour in UTC (0-23)",
        examples=[14],
    )

    # Secondary optional feature overrides if already computed upstream
    temp_diff: Optional[float] = None
    frp_density: Optional[float] = None
    recurrence_count: Optional[int] = None
    persistence_ratio: Optional[float] = None
    night_detection_ratio: Optional[float] = None
    frp_local_mean: Optional[float] = None
    frp_zscore: Optional[float] = None
    frp_to_mean_ratio: Optional[float] = None
    confidence_score: Optional[float] = None

    def populate_defaults_if_missing(self) -> "ThermalObservationInput":
        """Ensures temporal defaults are set to current UTC if omitted."""
        now = datetime.now(timezone.utc)
        if not self.acq_date:
            self.acq_date = now.strftime("%Y-%m-%d")
        if not self.acq_time:
            self.acq_time = now.strftime("%H%M")
        if self.hour_utc is None:
            self.hour_utc = now.hour
        return self


class MLPredictionDetails(BaseModel):
    """
    Standardized ML prediction output returned by the ML module.
    """
    predicted_class: str = Field(..., description="Class name ('Industrial Fire', 'Persistent Thermal Source', 'Other')")
    predicted_class_id: int = Field(..., description="Numeric class ID (0: Other, 1: Persistent, 2: Industrial)")
    confidence: float = Field(..., description="Prediction probability score [0.0, 1.0]")
    alert_level: str = Field(..., description="Alert severity level ('LOW', 'MEDIUM', 'CRITICAL')")
    class_probabilities: Dict[str, float] = Field(..., description="Probability distribution across all classes")
    model_version: str = Field(..., description="Model artifact version")
    prediction_timestamp: str = Field(..., description="Timestamp of inference execution")


class ClassifyAndStoreResponse(BaseModel):
    """
    Complete end-to-end response after observation validation,
    ML inference, and database persistence.
    """
    status: str = Field(default="SUCCESS", description="Operation status")
    message: str = Field(default="Thermal observation classified and saved successfully.", description="Status message")
    detection: DetectionResponse = Field(..., description="Persisted database record")
    prediction: MLPredictionDetails = Field(..., description="ML classification details")
