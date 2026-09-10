"""
Inference & Prediction Pipeline Endpoints.
Integrates the AI/ML classification model into the backend pipeline:
Observation -> Validation -> ML Prediction -> Database -> API Response.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.models.detection import Detection
from backend.schemas.observation import (
    ThermalObservationInput,
    ClassifyAndStoreResponse,
    MLPredictionDetails,
)
from backend.schemas.detection import DetectionResponse
from backend.services.ml_service import (
    MLInferenceService,
    get_ml_service,
    MLModelNotLoadedException,
    MLServiceException,
)

logger = logging.getLogger("backend.inference")

router = APIRouter()


@router.get(
    "/model-status",
    summary="Check ML Model Availability",
    description="Check whether the trained satellite fire classification model is loaded and ready.",
)
def get_model_status(
    ml_service: MLInferenceService = Depends(get_ml_service),
):
    """
    Returns health status of the integrated ML subsystem.
    """
    available = ml_service.is_available()
    return {
        "status": "ready" if available else "model_not_loaded",
        "is_available": available,
        "message": (
            "ML inference service is active and ready."
            if available
            else "ML Model artifact is not loaded. Train baseline via 'python scripts/train_baseline.py'."
        ),
    }


@router.post(
    "/predict-and-store",
    response_model=ClassifyAndStoreResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Classify Observation & Store in Database",
    description=(
        "Full End-to-End Pipeline: Accepts a raw thermal satellite observation, "
        "validates input, executes ML classification, persists detection to SQLite database, "
        "and returns the saved record along with full classification probabilities."
    ),
)
def predict_and_store(
    observation: ThermalObservationInput,
    db: Session = Depends(get_db),
    ml_service: MLInferenceService = Depends(get_ml_service),
) -> ClassifyAndStoreResponse:
    """
    Executes:
    1. Validation: Ensures coordinates, temperature, and temporal inputs are valid.
    2. ML Prediction: Calls the AI/ML module interface to classify thermal source.
    3. Persistence: Maps prediction to Detection database entity and commits to SQLite.
    4. Response: Returns standardized API response with persistence IDs and confidence.
    """
    # 1. Fill missing temporal defaults
    observation.populate_defaults_if_missing()

    # 2. Execute ML Inference via isolated service adapter
    try:
        raw_input_dict = observation.model_dump()
        prediction_result = ml_service.predict(raw_input_dict)
    except MLModelNotLoadedException as mle:
        logger.error("ML model not loaded: %s", mle.message)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ML Classification Service Unavailable: {mle.message}",
        )
    except MLServiceException as mse:
        logger.error("ML inference error: %s", str(mse))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ML Inference Failed: {str(mse)}",
        )

    # 3. Extract classification metadata
    predicted_class_name = prediction_result.get("predicted_class", "Unknown")
    predicted_conf = float(prediction_result.get("confidence", 0.0))
    is_persistent = (
        predicted_class_name.lower() == "persistent thermal source"
        or prediction_result.get("predicted_class_id") == 1
    )

    # 4. Save into SQLite database
    db_detection = Detection(
        latitude=observation.latitude,
        longitude=observation.longitude,
        brightness=observation.brightness,
        confidence=observation.confidence,
        acq_date=observation.acq_date,
        acq_time=observation.acq_time,
        source=observation.source or "VIIRS_SNPP_NRT",
        instrument=observation.instrument or "VIIRS",
        frp=observation.frp,
        daynight=observation.daynight,
        predicted_class=predicted_class_name,
        prediction_confidence=predicted_conf,
        is_persistent=is_persistent,
    )

    db.add(db_detection)
    db.commit()
    db.refresh(db_detection)

    # 4b. Evaluate if observation qualifies for an operational alert
    from backend.services.alert_service import create_alert_if_eligible
    create_alert_if_eligible(db, db_detection)

    # 5. Format and return API response
    prediction_details = MLPredictionDetails(
        predicted_class=predicted_class_name,
        predicted_class_id=int(prediction_result.get("predicted_class_id", 0)),
        confidence=predicted_conf,
        alert_level=prediction_result.get("alert_level", "LOW"),
        class_probabilities=prediction_result.get("class_probabilities", {}),
        model_version=prediction_result.get("model_version", "1.0.0"),
        prediction_timestamp=prediction_result.get("prediction_timestamp", ""),
    )

    return ClassifyAndStoreResponse(
        status="SUCCESS",
        message="Thermal observation classified and stored successfully.",
        detection=DetectionResponse.model_validate(db_detection),
        prediction=prediction_details,
    )
