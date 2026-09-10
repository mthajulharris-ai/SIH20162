"""
SQLAlchemy ORM Model for AI-Detected Thermal Anomaly Alerts.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import relationship

from backend.db.base import Base


class Alert(Base):
    """
    Alert record triggered when an AI detection meets critical severity or
    confidence thresholds.
    
    Terminology Notice:
    Alerts represent automated AI predictions that 'require verification'
    and are not confirmed real-world ground fires without field inspection.
    """
    __tablename__ = "alerts"

    id: int = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Associated Detection Record
    detection_id: int = Column(Integer, ForeignKey("detections.id"), nullable=False, index=True)

    # Alert Categorization
    alert_level: str = Column(String(32), nullable=False, index=True)  # CRITICAL, HIGH, MEDIUM, ADVISORY
    title: str = Column(String(255), nullable=False)
    message: str = Column(Text, nullable=False)
    
    # AI Classification Context
    predicted_class: str = Column(String(64), nullable=False, index=True)
    confidence: float = Column(Float, nullable=False)
    
    # Verification Lifecycle Status
    # Options: "REQUIRES_VERIFICATION", "UNDER_REVIEW", "VERIFIED", "DISMISSED"
    verification_status: str = Column(
        String(32),
        default="REQUIRES_VERIFICATION",
        nullable=False,
        index=True,
    )
    verification_notes: Optional[str] = Column(Text, nullable=True)

    # Geographic & Sensor Snapshot for Fast Alert Retrieval
    latitude: float = Column(Float, nullable=False)
    longitude: float = Column(Float, nullable=False)
    frp: Optional[float] = Column(Float, nullable=True)
    brightness: float = Column(Float, nullable=False)
    acq_date: str = Column(String(10), nullable=False, index=True)
    acq_time: str = Column(String(8), nullable=False)

    # Standard Disclaimer
    disclaimer: str = Column(
        String(255),
        default="AI detected thermal signature. Requires ground/field verification.",
        nullable=False,
    )

    created_at: datetime = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship to parent Detection
    detection = relationship("Detection", backref="alerts")

    # Indices
    __table_args__ = (
        Index("idx_alerts_status_level", "verification_status", "alert_level"),
        Index("idx_alerts_date", "acq_date"),
    )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize alert model to Python dictionary."""
        return {
            "id": self.id,
            "detection_id": self.detection_id,
            "alert_level": self.alert_level,
            "title": self.title,
            "message": self.message,
            "predicted_class": self.predicted_class,
            "confidence": self.confidence,
            "verification_status": self.verification_status,
            "verification_notes": self.verification_notes,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "frp": self.frp,
            "brightness": self.brightness,
            "acq_date": self.acq_date,
            "acq_time": self.acq_time,
            "disclaimer": self.disclaimer,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
