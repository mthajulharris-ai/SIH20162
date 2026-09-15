"""
YOLOv11 Optional Visual Analysis and Multi-Modal Confidence Fusion.

Fuses tabular thermal anomaly confidence with YOLO visual confidence:
- If satellite/drone/ground image is provided and YOLOv11 is available:
    final_confidence = 0.7 * tabular_confidence + 0.3 * yolo_visual_confidence
    source = "TABULAR_PLUS_VISUAL"
- If image or YOLO is unavailable/fails:
    final_confidence = tabular_confidence
    source = "TABULAR_ONLY"
"""

import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

logger = logging.getLogger("backend.ml.yolo_fusion")

TABULAR_WEIGHT: float = 0.7
VISUAL_WEIGHT: float = 0.3

_YOLO_MODEL_CACHE: Optional[Any] = None
_YOLO_LOAD_ATTEMPTED: bool = False


def get_yolo_detector(weights_path: Optional[Union[str, Path]] = None) -> Optional[Any]:
    """
    Safely retrieves or initializes the YOLOv11 detector if ultralytics is installed
    and weights are located. Returns None if unavailable without throwing.
    """
    global _YOLO_MODEL_CACHE, _YOLO_LOAD_ATTEMPTED

    if _YOLO_MODEL_CACHE is not None:
        return _YOLO_MODEL_CACHE

    if _YOLO_LOAD_ATTEMPTED and weights_path is None:
        return None

    _YOLO_LOAD_ATTEMPTED = True

    try:
        from ultralytics import YOLO  # type: ignore

        # Resolve weights candidate paths
        candidate_paths = [
            Path(weights_path) if weights_path else None,
            Path("models/saved_models/yolo11_fire_best.pt"),
            Path("models/yolo11_fire_best.pt"),
            Path("models/yolo11n.pt"),
        ]

        found_path = None
        for p in candidate_paths:
            if p is not None and p.exists():
                found_path = str(p)
                break

        if found_path:
            logger.info("Initializing YOLO visual model from: %s", found_path)
            _YOLO_MODEL_CACHE = YOLO(found_path)
            return _YOLO_MODEL_CACHE
        else:
            logger.debug("YOLO weights not found. Visual analysis running in pass-through mode.")
            return None

    except ImportError:
        logger.debug("ultralytics package not installed. Visual analysis running in pass-through mode.")
        return None
    except Exception as exc:
        logger.warning("Failed to initialize YOLO model: %s", str(exc))
        return None


def run_yolo_inference(
    image_input: Any,
    weights_path: Optional[Union[str, Path]] = None
) -> Optional[float]:
    """
    Executes YOLO visual detection on an image input (file path, bytes, or numpy array).
    Returns the maximum detected fire/thermal confidence float [0.0, 1.0], or None if no detection / failure.
    """
    detector = get_yolo_detector(weights_path=weights_path)
    if detector is None or image_input is None:
        return None

    try:
        results = detector(image_input, verbose=False)
        if not results or len(results) == 0:
            return None

        first_res = results[0]
        boxes = getattr(first_res, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return None

        # Extract maximum confidence of detected bounding boxes
        conf_scores = boxes.conf.cpu().numpy()
        if len(conf_scores) == 0:
            return None

        max_conf = float(conf_scores.max())
        return max_conf

    except Exception as err:
        logger.warning("YOLO visual detection failed gracefully: %s", str(err))
        return None


def fuse_confidences(
    tabular_confidence: float,
    yolo_visual_confidence: Optional[float] = None
) -> Tuple[float, str]:
    """
    Fuses tabular confidence with visual confidence according to formula:
    - If YOLO confidence is available:
        final_confidence = 0.7 * tabular_confidence + 0.3 * yolo_visual_confidence
        source = "TABULAR_PLUS_VISUAL"
    - If YOLO confidence is None:
        final_confidence = tabular_confidence
        source = "TABULAR_ONLY"

    Returns:
        Tuple[float, str]: (final_confidence, source)
    """
    tab_conf = float(tabular_confidence)

    if yolo_visual_confidence is not None:
        vis_conf = float(yolo_visual_confidence)
        fused = round(TABULAR_WEIGHT * tab_conf + VISUAL_WEIGHT * vis_conf, 4)
        return fused, "TABULAR_PLUS_VISUAL"

    return round(tab_conf, 4), "TABULAR_ONLY"
