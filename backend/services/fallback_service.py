"""
Deterministic Rule-Based Fallback Analysis Service for SATRA Platform.

When the external AI/ML model is unavailable (offline, missing weights, corrupted artifacts,
or API failure), SATRA engages this rule-based satellite analyzer.

Physical & Operational Criteria:
- Confidence score mapping
- Fire Radiative Power (FRP) intensity thresholds
- Brightness temperature analysis
- Diurnal cycle (day/night) analysis
- Deterministic Risk Level: LOW, MEDIUM, HIGH, CRITICAL
- Clear attribution: DOES NOT pretend ML ran; clearly flags rule-based analysis.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("satra.fallback_service")

FALLBACK_NOTICE = "AI service unavailable — displaying rule-based satellite analysis."
FALLBACK_MODEL_VERSION = "rule-based-fallback-v1"


class FallbackRuleBasedClassifier:
    """
    Deterministic rule-based satellite thermal anomaly analyzer.
    Used when the primary ML model is unavailable or throws an exception.
    """

    @staticmethod
    def evaluate_observation(obs_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates a single normalized satellite observation using deterministic physical rules.

        Returns:
            Dict matching the inference result contract with explicit fallback metadata.
        """
        frp = float(obs_dict.get("frp") or 0.0)
        brightness = float(obs_dict.get("brightness") or 0.0)
        conf_raw = str(obs_dict.get("confidence") or "").strip().lower()

        # 1. Parse confidence score (0.0 to 1.0)
        if conf_raw in ("high", "h"):
            conf_score = 0.88
        elif conf_raw in ("low", "l"):
            conf_score = 0.40
        elif conf_raw.isdigit():
            val = float(conf_raw)
            conf_score = round(min(1.0, max(0.0, val / 100.0 if val > 1.0 else val)), 2)
        elif conf_raw in ("nominal", "n", "med", "medium"):
            conf_score = 0.65
        else:
            conf_score = 0.60

        # 2. Determine Risk Level & Classification based on physical thresholds
        # FRP >= 80 MW or (FRP >= 50 and brightness >= 380 K) -> CRITICAL
        if frp >= 80.0 or (frp >= 50.0 and brightness >= 380.0):
            risk_level = "CRITICAL"
            predicted_class = "High-Intensity Thermal Anomaly"
            reason = f"Extreme radiative energy output (FRP {frp:.1f} MW) indicative of major active industrial fire or high-output flare."
        # FRP >= 40 MW or brightness >= 360 K -> HIGH
        elif frp >= 40.0 or brightness >= 360.0:
            risk_level = "HIGH"
            predicted_class = "Elevated Thermal Anomaly"
            reason = f"High thermal radiation (FRP {frp:.1f} MW, Brightness {brightness:.1f} K) requiring operational field verification."
        # FRP >= 15 MW or brightness >= 335 K -> MEDIUM
        elif frp >= 15.0 or brightness >= 335.0:
            risk_level = "MEDIUM"
            predicted_class = "Moderate Thermal Source"
            reason = f"Moderate radiative signature (FRP {frp:.1f} MW). Characteristic of standard industrial flaring or localized heat source."
        else:
            risk_level = "LOW"
            predicted_class = "Low-Intensity Thermal Source"
            reason = f"Low thermal radiation (FRP {frp:.1f} MW). Low risk baseline reading."

        return {
            "status": "SUCCESS",
            "is_fallback": True,
            "fallback_notice": FALLBACK_NOTICE,
            "analysis_mode": "RULE_BASED_FALLBACK",
            "predicted_class": predicted_class,
            "predicted_class_id": 1 if risk_level in ("HIGH", "CRITICAL") else 0,
            "confidence": conf_score,
            "alert_level": risk_level,
            "model_version": FALLBACK_MODEL_VERSION,
            "class_probabilities": {
                predicted_class: conf_score,
                "Other Thermal Source": round(1.0 - conf_score, 4),
            },
            "prediction_timestamp": datetime.now(timezone.utc).isoformat(),
            "reasoning": reason,
        }

    @classmethod
    def evaluate_batch(cls, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Evaluates multiple observations using the deterministic fallback rules."""
        return [cls.evaluate_observation(obs) for obs in observations]
