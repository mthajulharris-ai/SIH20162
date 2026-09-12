"""
Pydantic Schemas for Raw Thermal Observation Inputs and ML Inference Responses.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from datetime import datetime, timezone
from typing import Dict, Optional, Any, List
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
    brightness: Optional[float] = Field(
        None,
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
        description="Data provenance ('REAL_FIRMS', 'USER_UPLOADED', 'PROTOTYPE_LABELLED')",
        examples=["REAL_FIRMS"],
    )
    source_file: Optional[str] = Field(
        default=None,
        description="Source uploaded observation file name",
        examples=["modis_2021_India.csv"],
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


class ExactLocation(BaseModel):
    latitude: float = Field(..., description="Exact latitude coordinate in decimal degrees")
    longitude: float = Field(..., description="Exact longitude coordinate in decimal degrees")


class ObservationMetadata(BaseModel):
    acq_date: str
    acq_time: str
    satellite: str
    instrument: str
    daynight: Optional[str] = "D"


class ThermalDataInfo(BaseModel):
    frp: Optional[float] = None
    brightness: Optional[float] = None
    bright_t31: Optional[float] = None


class PredictionSummary(BaseModel):
    predicted_class: str
    confidence: float
    model_version: str
    class_probabilities: Dict[str, float] = Field(default_factory=dict)


class RiskInfo(BaseModel):
    alert_level: str
    verification_status: str = "REQUIRES_VERIFICATION"


class FileContributionSummary(BaseModel):
    filename: str
    record_count: int
    format_detected: str


class SpatialClusterSummary(BaseModel):
    cluster_id: int
    center_latitude: float
    center_longitude: float
    observation_count: int
    peak_frp: Optional[float] = None


class SpatialAnalysisSummary(BaseModel):
    bounding_box: Dict[str, float] = Field(default_factory=dict)  # min_lat, max_lat, min_lon, max_lon
    center: Dict[str, float] = Field(default_factory=dict)  # latitude, longitude
    hotspot_density: float = 0.0  # hotspots per square degree / cluster
    clusters: List[SpatialClusterSummary] = Field(default_factory=list)


class HighRiskHotspotSummary(BaseModel):
    latitude: float
    longitude: float
    predicted_class: str
    confidence: float
    alert_level: str
    frp: Optional[float] = None
    brightness: Optional[float] = None
    source_file: Optional[str] = None


class FRPAnalysisSummary(BaseModel):
    min: float
    max: float
    mean: float
    median: float
    sum: float
    unit: str = "MW"


class BrightnessAnalysisSummary(BaseModel):
    min: float
    max: float
    mean: float
    unit: str = "K"


class ConfidenceAnalysisSummary(BaseModel):
    high_count: int = 0
    nominal_count: int = 0
    low_count: int = 0
    mean_confidence: float = 0.0


class TemporalAnalysisSummary(BaseModel):
    earliest_date: Optional[str] = None
    latest_date: Optional[str] = None
    daily_distribution: Dict[str, int] = Field(default_factory=dict)
    day_count: int = 0
    night_count: int = 0


class DatasetAnalysisSummary(BaseModel):
    """
    Dynamic analytics computed across all uploaded observations.
    Gracefully omits or flags metrics where underlying data is unavailable.
    """
    total_records: int
    files_summary: List[FileContributionSummary] = Field(default_factory=list)
    available_fields: List[str] = Field(default_factory=list)
    unavailable_fields: List[str] = Field(default_factory=list)
    risk_distribution: Dict[str, int] = Field(default_factory=dict)
    class_distribution: Dict[str, int] = Field(default_factory=dict)
    frp_analysis: Optional[FRPAnalysisSummary] = None
    brightness_analysis: Optional[BrightnessAnalysisSummary] = None
    confidence_analysis: Optional[ConfidenceAnalysisSummary] = None
    temporal_analysis: Optional[TemporalAnalysisSummary] = None
    spatial_analysis: Optional[SpatialAnalysisSummary] = None
    high_risk_areas: List[HighRiskHotspotSummary] = Field(default_factory=list)
    satellite_sources: List[str] = Field(default_factory=list)


class UploadAndAnalyzeResponse(BaseModel):
    """
    Standardized response for SATRA Upload & Analyze Core Pipeline:
    Returns exact location, observation metadata, thermal data,
    AI classification, risk/alert assessment, dynamic dataset analysis,
    database detection entities, and standardized analysis/metadata contracts.
    """
    success: bool = Field(default=True, description="Standard success indicator")
    status: str = Field(default="SUCCESS")
    message: str = Field(default="Satellite data analyzed and persisted successfully.")
    is_fallback: bool = Field(default=False, description="True if rule-based fallback analysis was engaged")
    fallback_notice: Optional[str] = Field(default=None, description="Clear notice when rule-based fallback was engaged")
    exact_location: ExactLocation
    observation: ObservationMetadata
    thermal_data: ThermalDataInfo
    prediction: PredictionSummary
    risk: RiskInfo
    provenance: str
    detection: DetectionResponse
    total_records: int = 1
    all_detections: List[DetectionResponse] = Field(default_factory=list)
    analysis_summary: Optional[DatasetAnalysisSummary] = None
    analysis: Optional[Dict[str, Any]] = Field(default=None, description="Standard analysis summary block")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Processing metadata block")


class DatasetValidationResponse(BaseModel):
    """
    Validation response returned when validating satellite datasets (CSV, JSON, ZIP).
    Provides instant pre-analysis feedback to the operator.
    """
    status: str = Field(default="VALID")
    filename: str = Field(..., description="Uploaded file name")
    identified_file: str = Field(..., description="Internal observation file identified inside archive or original file")
    format_detected: str = Field(..., description="Detected format and satellite sensor family")
    record_count: int = Field(..., description="Number of validated satellite observations found")
    detected_fields: List[str] = Field(default_factory=list, description="List of recognized satellite observation fields")
    missing_fields: List[str] = Field(default_factory=list, description="List of optional or unavailable fields")
    sample_preview: Optional[Dict[str, Any]] = Field(None, description="Sample first observation coordinates and attributes")
    message: str = Field(
        default="Satellite observation data found — ready for AI analysis.",
        description="Status message",
    )

