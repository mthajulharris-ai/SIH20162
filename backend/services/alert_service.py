"""
Alert Evaluation & Lifecycle Management Service.
Evaluates AI-detected thermal anomalies against operational risk rules.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from backend.models.detection import Detection
from backend.models.alert import Alert

logger = logging.getLogger("backend.alert_service")

# Verification status constants
STATUS_REQUIRES_VERIFICATION = "REQUIRES_VERIFICATION"
STATUS_UNDER_REVIEW = "UNDER_REVIEW"
STATUS_VERIFIED = "VERIFIED"
STATUS_DISMISSED = "DISMISSED"

VALID_VERIFICATION_STATUSES = {
    STATUS_REQUIRES_VERIFICATION,
    STATUS_UNDER_REVIEW,
    STATUS_VERIFIED,
    STATUS_DISMISSED,
}


def evaluate_detection_for_alert(detection: Detection) -> Optional[Dict[str, Any]]:
    """
    Evaluates a classified thermal detection record against operational thresholds.
    
    Terminology Notice:
    All generated alert messages strictly emphasize:
    - 'AI detected'
    - 'predicted class'
    - 'confidence'
    - 'requires verification'
    """
    p_class = (detection.predicted_class or "").strip().lower()
    conf = float(detection.prediction_confidence or 0.0)
    frp_val = float(detection.frp or 0.0)
    brightness_val = float(detection.brightness or 0.0)

    # 1. Industrial Fire Evaluation
    if p_class in ["industrial fire", "industrial_fire"]:
        if conf >= 0.85 or frp_val >= 50.0 or brightness_val >= 380.0:
            return {
                "alert_level": "CRITICAL",
                "title": "AI-Detected Critical Industrial Fire (Requires Verification)",
                "message": (
                    f"AI detected high-intensity thermal anomaly predicted as 'Industrial Fire' "
                    f"with {conf * 100:.1f}% confidence and FRP {frp_val:.1f} MW. "
                    "This observation requires on-site / ground verification."
                ),
            }
        elif conf >= 0.65 or frp_val >= 20.0:
            return {
                "alert_level": "HIGH",
                "title": "AI-Detected Industrial Fire Anomaly (Requires Verification)",
                "message": (
                    f"AI detected thermal signature predicted as 'Industrial Fire' "
                    f"with {conf * 100:.1f}% confidence. Requires field verification."
                ),
            }

    # 2. Persistent Thermal Source Evaluation (Refinery Flaring / Smelting)
    if p_class in ["persistent thermal source", "persistent_thermal_source"]:
        if frp_val >= 50.0:
            return {
                "alert_level": "HIGH",
                "title": "AI-Detected Elevated Flare Spike (Requires Verification)",
                "message": (
                    f"AI detected abnormal radiative emission spike (FRP {frp_val:.1f} MW) "
                    "at persistent thermal facility. Requires verification."
                ),
            }
        elif conf >= 0.75:
            return {
                "alert_level": "MEDIUM",
                "title": "AI-Detected Persistent Thermal Source (Requires Verification)",
                "message": (
                    f"AI detected persistent thermal source observation with {conf * 100:.1f}% "
                    "confidence. Logged for industrial facility monitoring."
                ),
            }

    # 3. Severe General Thermal Anomaly (FRP >= 80 MW)
    if frp_val >= 80.0:
        return {
            "alert_level": "HIGH",
            "title": "AI-Detected High Radiative Energy (Requires Verification)",
            "message": (
                f"AI detected unusually intense thermal radiation (FRP {frp_val:.1f} MW) "
                f"predicted as '{detection.predicted_class}' with {conf * 100:.1f}% confidence. "
                "Requires field verification."
            ),
        }

    # Does not meet alert criteria (e.g. false alarm or normal background reading)
    return None


def create_alert_if_eligible(db: Session, detection: Detection) -> Optional[Alert]:
    """
    Evaluates detection and persists an Alert record in the database if eligible.
    """
    alert_info = evaluate_detection_for_alert(detection)
    if not alert_info:
        return None

    alert = Alert(
        detection_id=detection.id,
        alert_level=alert_info["alert_level"],
        title=alert_info["title"],
        message=alert_info["message"],
        predicted_class=detection.predicted_class,
        confidence=detection.prediction_confidence,
        verification_status=STATUS_REQUIRES_VERIFICATION,
        latitude=detection.latitude,
        longitude=detection.longitude,
        frp=detection.frp,
        brightness=detection.brightness,
        acq_date=detection.acq_date,
        acq_time=detection.acq_time,
        disclaimer="AI detected thermal signature. Requires ground/field verification.",
    )

    db.add(alert)
    db.commit()
    db.refresh(alert)

    logger.info(
        "Alert created [ID=%d, Level=%s] for Detection %d",
        alert.id,
        alert.alert_level,
        detection.id,
    )
    return alert
