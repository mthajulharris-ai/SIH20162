"""
SQLAlchemy ORM Model for Thermal Detection and Classification Records.
PS 26162: AI-Based Detection and Classification of Industrial Fires & Persistent Thermal Sources.
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, Index
from sqlalchemy.orm import synonym, validates
from backend.db.base import Base


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
    brightness: Optional[float] = Column(Float, nullable=True)  # Temperature in Kelvin
    confidence: Optional[str] = Column(String(32), nullable=True)  # Raw satellite detection confidence
    acq_date: str = Column(String(10), nullable=False, index=True)  # Format: YYYY-MM-DD
    acq_time: str = Column(String(8), nullable=False)  # Format: HHMM (e.g., "1430")
    source: str = Column(String(64), nullable=False, index=True)  # e.g., "VIIRS_SNPP_NRT", "MODIS_NRT"
    instrument: Optional[str] = Column(String(32), nullable=True)  # e.g., "VIIRS", "MODIS"
    frp: Optional[float] = Column(Float, nullable=True)  # Fire Radiative Power (MW)
    daynight: Optional[str] = Column(String(2), nullable=True)  # "D" (Day) or "N" (Night)
    source_file: Optional[str] = Column(String(255), nullable=True, index=True)  # Source uploaded filename

    # AI/ML Prediction Outputs
    # Examples: "industrial_fire", "persistent_thermal_source", "wildfire", "agricultural", "false_alarm"
    predicted_class: str = Column(String(64), nullable=False, index=True)
    prediction_confidence: float = Column(Float, nullable=False)  # Model probability: 0.0 - 1.0
    is_persistent: bool = Column(Boolean, default=False, nullable=False, index=True)
    model_version: Optional[str] = Column(String(32), default="2.0.0-scientific-prototype", nullable=True)
    data_provenance: str = Column(String(32), default="REAL_FIRMS", nullable=False, index=True)  # REAL_FIRMS, USER_UPLOADED, PROTOTYPE_LABELLED
    alert_level: Optional[str] = Column(String(32), default="LOW", nullable=True, index=True)  # CRITICAL, HIGH, MEDIUM, LOW, LOW_CONFIDENCE_REVIEW
    
    # Ingestion Metadata
    created_at: datetime = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )



    # Synonyms / Aliases for seamless developer ergonomics
    acquisition_date = synonym("acq_date")
    acquisition_time = synonym("acq_time")
    satellite = synonym("source")

    # Composite indices for common query patterns (date + classification, spatial bounding)
    __table_args__ = (
        Index("idx_detections_date_class", "acq_date", "predicted_class"),
        Index("idx_detections_spatial", "latitude", "longitude"),
    )

    # Model-level data integrity validators
    @validates("latitude")
    def validate_latitude(self, key: str, value: Any) -> float:
        if value is None:
            raise ValueError("Latitude cannot be None.")
        lat = float(value)
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude must be between -90.0 and 90.0, got {lat}.")
        return lat

    @validates("longitude")
    def validate_longitude(self, key: str, value: Any) -> float:
        if value is None:
            raise ValueError("Longitude cannot be None.")
        lon = float(value)
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude must be between -180.0 and 180.0, got {lon}.")
        return lon

    @validates("brightness")
    def validate_brightness(self, key: str, value: Any) -> Optional[float]:
        if value is None:
            return None
        b = float(value)
        if b <= 0.0:
            raise ValueError(f"Brightness must be positive (> 0 Kelvin), got {b}.")
        return b

    @validates("prediction_confidence")
    def validate_prediction_confidence(self, key: str, value: Any) -> float:
        if value is not None:
            conf = float(value)
            if not (0.0 <= conf <= 1.0):
                raise ValueError(f"Prediction confidence must be between 0.0 and 1.0, got {conf}.")
            return conf
        return value

    def to_dict(self) -> Dict[str, Any]:
        """Convert ORM model instance into a Python dictionary with standard, normalized, and alias keys."""
        # Format observed_at from acq_date and acq_time
        observed_at_str = None
        if self.acq_date:
            raw_time = str(self.acq_time or "0000").zfill(4)[:4]
            hour = raw_time[:2]
            minute = raw_time[2:4]
            observed_at_str = f"{self.acq_date}T{hour}:{minute}:00Z"

        created_iso = self.created_at.isoformat() if self.created_at else None
        risk_score = round(float(self.prediction_confidence or 0.0) * 100.0, 1)
        risk_level = self.alert_level or "LOW"
        scan_val = 0.375 if "VIIRS" in (self.instrument or "").upper() or "VIIRS" in (self.source or "").upper() else 1.0
        track_val = 0.375 if "VIIRS" in (self.instrument or "").upper() or "VIIRS" in (self.source or "").upper() else 1.0

        return {
            "id": self.id,
            # Top-level unified fields
            "source": self.source,
            "satellite": self.source,
            "instrument": self.instrument or ("VIIRS" if "VIIRS" in self.source else "MODIS"),
            "latitude": self.latitude,
            "longitude": self.longitude,
            "acq_date": self.acq_date,
            "acquisition_date": self.acq_date,
            "acq_time": self.acq_time,
            "acquisition_time": self.acq_time,
            "confidence": self.confidence,
            "brightness": self.brightness,
            "brightness_temperature": self.brightness,
            "frp": self.frp,
            "daynight": self.daynight,
            "scan": scan_val,
            "track": track_val,
            "source_file": self.source_file,
            "created_at": created_iso,
            "observed_at": observed_at_str or created_iso,
            "received_at": created_iso,
            "processed_at": created_iso,

            # SATRA Analytical Fields
            "risk_score": risk_score,
            "risk_level": risk_level,
            "classification": self.predicted_class,
            "predicted_class": self.predicted_class,
            "prediction_confidence": self.prediction_confidence,
            "is_persistent": self.is_persistent,
            "model_version": self.model_version or "2.0.0-scientific-prototype",
            "data_provenance": self.data_provenance or "REAL_FIRMS",
            "alert_level": risk_level,

            # Clearly separated Provenance Structures (Requirement 5)
            "nasa_data": {
                "source": self.source,
                "satellite": self.source,
                "instrument": self.instrument or ("VIIRS" if "VIIRS" in self.source else "MODIS"),
                "latitude": self.latitude,
                "longitude": self.longitude,
                "acquisition_date": self.acq_date,
                "acquisition_time": self.acq_time,
                "observed_at": observed_at_str or created_iso,
                "confidence": self.confidence,
                "brightness_temperature": self.brightness,
                "frp": self.frp,
                "daynight": self.daynight,
                "scan": scan_val,
                "track": track_val,
            },
            "satra_analytics": {
                "classification": self.predicted_class,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "prediction_confidence": self.prediction_confidence,
                "is_persistent": self.is_persistent,
                "model_version": self.model_version or "2.0.0-scientific-prototype",
                "received_at": created_iso,
                "processed_at": created_iso,
                "data_provenance": self.data_provenance or "REAL_FIRMS",
            },
        }



    def __repr__(self) -> str:
        return (
            f"<Detection(id={self.id}, lat={self.latitude}, lon={self.longitude}, "
            f"class='{self.predicted_class}', conf={self.prediction_confidence:.2f})>"
        )

