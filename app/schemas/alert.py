"""
Pydantic Schemas for Alert Evaluation and Status Management.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.services.alert_service import VALID_VERIFICATION_STATUSES


class AlertBase(BaseModel):
    detection_id: int = Field(..., description="Foreign key reference to Detection record")
    alert_level: str = Field(..., description="Severity level ('CRITICAL', 'HIGH', 'MEDIUM', 'ADVISORY')")
    title: str = Field(..., description="Human-readable alert title")
    message: str = Field(..., description="Descriptive alert notification text")
    predicted_class: str = Field(..., description="AI predicted classification label")
    confidence: float = Field(..., description="AI model prediction confidence score")
    verification_status: str = Field(
        default="REQUIRES_VERIFICATION",
        description="Verification state ('REQUIRES_VERIFICATION', 'UNDER_REVIEW', 'VERIFIED', 'DISMISSED')",
    )
    verification_notes: Optional[str] = Field(None, description="Operational notes from reviewer")
    latitude: float = Field(..., description="Latitude of detected thermal source")
    longitude: float = Field(..., description="Longitude of detected thermal source")
    frp: Optional[float] = Field(None, description="Fire Radiative Power (MW)")
    brightness: float = Field(..., description="Brightness temperature (Kelvin)")
    acq_date: str = Field(..., description="Acquisition date (YYYY-MM-DD)")
    acq_time: str = Field(..., description="Acquisition time (HHMM)")
    disclaimer: str = Field(
        default="AI detected thermal signature. Requires ground/field verification.",
        description="Operational safety disclaimer",
    )


class AlertResponse(AlertBase):
    id: int = Field(..., description="Unique database alert ID")
    created_at: datetime = Field(..., description="UTC creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class AlertStatusUpdate(BaseModel):
    """Schema for updating an alert's verification lifecycle status."""
    verification_status: str = Field(
        ...,
        description="Updated status ('REQUIRES_VERIFICATION', 'UNDER_REVIEW', 'VERIFIED', 'DISMISSED')",
        examples=["UNDER_REVIEW"],
    )
    verification_notes: Optional[str] = Field(
        None,
        description="Reviewer / analyst notes regarding on-site or ground confirmation",
        examples=["Dispatched ground unit for inspection at industrial park."],
    )

    @field_validator("verification_status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        upper = v.strip().upper()
        if upper not in VALID_VERIFICATION_STATUSES:
            raise ValueError(
                f"Invalid verification status '{v}'. Must be one of: {sorted(list(VALID_VERIFICATION_STATUSES))}"
            )
        return upper


class AlertListResponse(BaseModel):
    total: int = Field(..., description="Total matching alert records")
    unverified_count: int = Field(..., description="Count of alerts with status REQUIRES_VERIFICATION")
    critical_count: int = Field(..., description="Count of CRITICAL severity alerts")
    items: List[AlertResponse] = Field(..., description="List of alert records")
