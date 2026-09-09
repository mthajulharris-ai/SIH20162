"""
SQLAlchemy ORM Model for Thermal Detection and Classification Records.
PS 26162: AI-Based Detection and Classification of Industrial Fires & Persistent Thermal Sources.
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, Index
from app.db.base import Base


class Detection(Base):
    """
    Thermal anomaly detection record ingested from satellite pipelines
    and classified by the AI/ML model.
    """
    __tablename__ = "detections"

    id: int = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Geospatial Coordinates
    latitude: float = Column(Float, nullable=False, index=True)
    longitude: float = Column(Float, nullable=False, index=True)
    
    # Satellite Measurement Observations
    brightness: float = Column(Float, nullable=False)  # Temperature in Kelvin
    confidence: Optional[str] = Column(String(32), nullable=True)  # Raw satellite detection confidence
    acq_date: str = Column(String(10), nullable=False, index=True)  # Format: YYYY-MM-DD
    acq_time: str = Column(String(8), nullable=False)  # Format: HHMM (e.g., "1430")
    source: str = Column(String(64), nullable=False, index=True)  # e.g., "VIIRS_SNPP_NRT", "MODIS_NRT"
    instrument: Optional[str] = Column(String(32), nullable=True)  # e.g., "VIIRS", "MODIS"
    frp: Optional[float] = Column(Float, nullable=True)  # Fire Radiative Power (MW)
    daynight: Optional[str] = Column(String(2), nullable=True)  # "D" (Day) or "N" (Night)
    
    # AI/ML Prediction Outputs
    # Examples: "industrial_fire", "persistent_thermal_source", "wildfire", "agricultural", "false_alarm"
    predicted_class: str = Column(String(64), nullable=False, index=True)
    prediction_confidence: float = Column(Float, nullable=False)  # Model probability: 0.0 - 1.0
    is_persistent: bool = Column(Boolean, default=False, nullable=False, index=True)
    
    # Ingestion Metadata
    created_at: datetime = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Composite indices for common query patterns (e.g. date + classification, spatial bounding)
    __table_args__ = (
        Index("idx_detections_date_class", "acq_date", "predicted_class"),
        Index("idx_detections_spatial", "latitude", "longitude"),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert ORM model instance into a Python dictionary."""
        return {
            "id": self.id,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "brightness": self.brightness,
            "confidence": self.confidence,
            "acq_date": self.acq_date,
            "acq_time": self.acq_time,
            "source": self.source,
            "instrument": self.instrument,
            "frp": self.frp,
            "daynight": self.daynight,
            "predicted_class": self.predicted_class,
            "prediction_confidence": self.prediction_confidence,
            "is_persistent": self.is_persistent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return (
            f"<Detection(id={self.id}, lat={self.latitude}, lon={self.longitude}, "
            f"class='{self.predicted_class}', conf={self.prediction_confidence:.2f})>"
        )
