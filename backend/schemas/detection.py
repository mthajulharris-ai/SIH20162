"""
Pydantic Schemas for Thermal Detection Requests and Responses.
PS 26162: AI-Based Detection and Classification of Industrial Fires & Persistent Thermal Sources.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class DetectionBase(BaseModel):
    # Geographic coordinates
    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees (-90.0 to 90.0)",
        examples=[22.5726],
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees (-180.0 to 180.0)",
        examples=[88.3639],
    )

    # Satellite sensor measurements
    brightness: Optional[float] = Field(
        None,
        gt=0.0,
        description="Brightness temperature in Kelvin",
        examples=[345.5],
    )
    confidence: Optional[str] = Field(
        None,
        description="Raw satellite confidence (e.g., 'nominal', 'high', 'low', '85%')",
        examples=["nominal"],
    )
    acq_date: str = Field(
        ...,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Acquisition date in YYYY-MM-DD format",
        examples=["2026-09-09"],
    )
    acq_time: str = Field(
        ...,
        description="Acquisition time in UTC (e.g., '1230')",
        examples=["1230"],
    )
    source: str = Field(
        ...,
        description="Satellite / sensor data source (e.g., 'VIIRS_SNPP_NRT', 'MODIS_NRT')",
        examples=["VIIRS_SNPP_NRT"],
    )
    instrument: Optional[str] = Field(
        None,
        description="Sensor instrument (e.g., 'VIIRS', 'MODIS')",
        examples=["VIIRS"],
    )
    frp: Optional[float] = Field(
        None,
        ge=0.0,
        description="Fire Radiative Power (MW)",
        examples=[45.2],
    )
    daynight: Optional[str] = Field(
        None,
        pattern=r"^[DNdn]$",
        description="Observation daylight indicator ('D' for Day, 'N' for Night)",
        examples=["D"],
    )
    source_file: Optional[str] = Field(
        None,
        description="Source uploaded observation file name",
        examples=["modis_2021_India.csv"],
    )

    # ML Prediction outputs
    predicted_class: str = Field(
        ...,
        description=(
            "AI classification label (e.g., 'industrial_fire', "
            "'persistent_thermal_source', 'wildfire', 'agricultural', 'false_alarm')"
        ),
        examples=["industrial_fire"],
    )
    prediction_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model confidence score between 0.0 and 1.0",
        examples=[0.94],
    )
    is_persistent: bool = Field(
        default=False,
        description="Flag indicating whether this location is a persistent thermal cluster",
        examples=[False],
    )
    model_version: Optional[str] = Field(
        default="2.0.0-scientific-prototype",
        description="AI model version used for classification",
        examples=["2.0.0-scientific-prototype"],
    )
    data_provenance: str = Field(
        default="SAMPLE",
        description="Data origin provenance ('REAL_FIRMS', 'SAMPLE', 'PROTOTYPE_LABELLED')",
        examples=["REAL_FIRMS"],
    )
    alert_level: Optional[str] = Field(
        default="LOW",
        description="Operational alert severity ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOW_CONFIDENCE_REVIEW')",
        examples=["CRITICAL"],
    )




class DetectionCreate(DetectionBase):
    """Schema for creating a new detection record."""
    pass


class DetectionResponse(DetectionBase):
    """Schema for returning a detection record with database IDs and metadata."""
    id: int = Field(..., description="Unique database ID of the detection record")
    created_at: datetime = Field(..., description="UTC timestamp when record was ingested")

    model_config = ConfigDict(from_attributes=True)


class DetectionListResponse(BaseModel):
    """Paginated list response wrapper."""
    total: int = Field(..., description="Total number of matching detection records")
    page: int = Field(..., description="Current page number (1-indexed)")
    limit: int = Field(..., description="Number of items per page")
    items: List[DetectionResponse] = Field(..., description="List of detection items")
