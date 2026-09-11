"""
Inference & Prediction Pipeline Endpoints.
Integrates the AI/ML classification model into the backend pipeline:
Observation -> Validation -> ML Prediction -> Database -> API Response.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import csv
import io
import json
import logging
from typing import Optional, List, Dict, Any, Set
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.models.detection import Detection
from backend.schemas.observation import (
    ThermalObservationInput,
    ClassifyAndStoreResponse,
    MLPredictionDetails,
    UploadAndAnalyzeResponse,
    ExactLocation,
    ObservationMetadata,
    ThermalDataInfo,
    PredictionSummary,
    RiskInfo,
    DatasetAnalysisSummary,
)
from backend.schemas.detection import DetectionResponse
from backend.services.ml_service import (
    MLInferenceService,
    get_ml_service,
    MLModelNotLoadedException,
    MLServiceException,
)
from backend.services.alert_service import create_alert_if_eligible
from backend.utils.observation_normalizer import normalize_and_validate_file, NormalizedObservation
from backend.utils.analysis_engine import compute_dataset_analysis
from src.data_pipeline.ingestion import FIELD_ALIASES

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

    # 3. Extract classification metadata and provenance
    predicted_class_name = prediction_result.get("predicted_class", "Unknown")
    predicted_conf = float(prediction_result.get("confidence", 0.0))
    is_persistent = (
        predicted_class_name.lower() == "persistent thermal source"
        or prediction_result.get("predicted_class_id") == 1
    )

    # Determine data provenance (REAL_FIRMS, SAMPLE, PROTOTYPE_LABELLED)
    if observation.data_provenance:
        data_provenance = observation.data_provenance.upper()
    elif (observation.source or "").upper().startswith(("SAMPLE", "DEMO")):
        data_provenance = "SAMPLE"
    elif any(k in (observation.source or "").upper() for k in ["REAL", "FIRMS_LIVE", "NASA_FIRMS"]):
        data_provenance = "REAL_FIRMS"
    else:
        data_provenance = "PROTOTYPE_LABELLED"

    # Step 7: Low confidence handling (< 0.60 -> LOW_CONFIDENCE_REVIEW)
    base_alert_level = prediction_result.get("alert_level", "LOW")
    if predicted_conf < 0.60:
        alert_level = "LOW_CONFIDENCE_REVIEW"
    else:
        alert_level = base_alert_level

    model_ver = prediction_result.get("model_version", "2.0.0-scientific-prototype")

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
        model_version=model_ver,
        data_provenance=data_provenance,
        alert_level=alert_level,
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
        alert_level=alert_level,
        class_probabilities=prediction_result.get("class_probabilities", {}),
        model_version=model_ver,
        prediction_timestamp=prediction_result.get("prediction_timestamp", ""),
    )


    return ClassifyAndStoreResponse(
        status="SUCCESS",
        message="Thermal observation classified and stored successfully.",
        detection=DetectionResponse.model_validate(db_detection),
        prediction=prediction_details,
    )


@router.post(
    "/upload-and-analyze",
    response_model=UploadAndAnalyzeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Satellite Observation File(s) & Execute SATRA AI Pipeline",
    description=(
        "Core SATRA Pipeline: Accepts uploaded satellite data (single or multiple CSV, JSON, GeoJSON files), "
        "validates geographic coordinates and physical thermal fields, automatically detects and normalizes "
        "column variations across NASA FIRMS MODIS, VIIRS, and custom formats, executes AI thermal classification, "
        "evaluates alert levels, persists detections, and returns structured intelligence and dynamic analytics."
    ),
)
async def upload_and_analyze(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
    ml_service: MLInferenceService = Depends(get_ml_service),
) -> UploadAndAnalyzeResponse:
    """
    End-to-End Pipeline for Uploaded Satellite Data:
    1. Uploaded File(s) Reception (Single or Multi-file)
    2. File Format Detection & Security Verification
    3. Automatic Column Mapping & Normalization Layer (MODIS, VIIRS, User CSV/JSON)
    4. Coordinate & Physical Range Validation
    5. SATRA AI Classification Model Inference
    6. Risk & Alert Assessment
    7. Database Persistence with Source File Traceability
    8. Dynamic Dataset Analytics Computation
    9. Structured Result Return
    """
    # 1. Collect all uploaded files from either single 'file' or multiple 'files' fields
    target_files: List[UploadFile] = []
    if file is not None and file.filename:
        target_files.append(file)
    if files:
        for f in files:
            if f is not None and f.filename and f not in target_files:
                target_files.append(f)

    if not target_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No satellite observation file provided. Please upload a valid CSV or JSON file.",
        )

    # 2. Parse, Normalize, and Validate each file
    all_observations: List[NormalizedObservation] = []
    files_info: List[Dict[str, Any]] = []
    global_available_fields: Set[str] = set()
    global_unavailable_fields: Set[str] = set()

    for up_file in target_files:
        try:
            raw_bytes = await up_file.read()
            if not raw_bytes or len(raw_bytes.strip()) == 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"The uploaded satellite file '{up_file.filename}' is empty.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Failed to read uploaded file %s: %s", up_file.filename, str(e))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read uploaded file content for '{up_file.filename}': {str(e)}",
            )

        try:
            obs_list, avail_f, unavail_f, detected_flavor = normalize_and_validate_file(
                raw_bytes, up_file.filename
            )
            all_observations.extend(obs_list)
            global_available_fields.update(avail_f)
            global_unavailable_fields.update(unavail_f)
            files_info.append({
                "filename": up_file.filename,
                "record_count": len(obs_list),
                "format_detected": detected_flavor,
            })
        except ValueError as val_err:
            logger.warning("Validation error on '%s': %s", up_file.filename, str(val_err))
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(val_err),
            )

    if not all_observations:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Zero valid observation records found in uploaded file(s).",
        )

    # 3. Execute AI Inference and Persist in Database
    created_detections: List[Detection] = []
    primary_prediction_details: Optional[MLPredictionDetails] = None
    all_predictions: List[Dict[str, Any]] = []

    for obs in all_observations:
        raw_input_dict = obs.to_input_dict()
        try:
            prediction_result = ml_service.predict(raw_input_dict)
            all_predictions.append(prediction_result)
        except Exception as e:
            logger.error("AI inference error on uploaded record: %s", str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"SATRA AI Inference failed: {str(e)}",
            )

        predicted_class_name = prediction_result.get("predicted_class", "Unknown")
        predicted_conf = float(prediction_result.get("confidence", 0.0))
        is_persistent = (
            predicted_class_name.lower() == "persistent thermal source"
            or prediction_result.get("predicted_class_id") == 1
        )

        base_alert_level = prediction_result.get("alert_level", "LOW")
        alert_level = "LOW_CONFIDENCE_REVIEW" if predicted_conf < 0.60 else base_alert_level
        model_ver = prediction_result.get("model_version", "2.0.0-scientific-prototype")

        db_detection = Detection(
            latitude=obs.latitude,
            longitude=obs.longitude,
            brightness=obs.brightness,
            confidence=obs.confidence,
            acq_date=obs.acq_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            acq_time=obs.acq_time or datetime.now(timezone.utc).strftime("%H%M"),
            source=obs.satellite or "VIIRS_SNPP_NRT",
            instrument=obs.instrument or "VIIRS",
            frp=obs.frp,
            daynight=obs.daynight,
            source_file=obs.source_file,
            predicted_class=predicted_class_name,
            prediction_confidence=predicted_conf,
            is_persistent=is_persistent,
            model_version=model_ver,
            data_provenance=obs.data_provenance or "REAL_FIRMS",
            alert_level=alert_level,
        )

        db.add(db_detection)
        db.commit()
        db.refresh(db_detection)

        # Trigger alert evaluation
        create_alert_if_eligible(db, db_detection)
        created_detections.append(db_detection)

        if primary_prediction_details is None:
            primary_prediction_details = MLPredictionDetails(
                predicted_class=predicted_class_name,
                predicted_class_id=int(prediction_result.get("predicted_class_id", 0)),
                confidence=predicted_conf,
                alert_level=alert_level,
                class_probabilities=prediction_result.get("class_probabilities", {}),
                model_version=model_ver,
                prediction_timestamp=prediction_result.get("prediction_timestamp", datetime.now(timezone.utc).isoformat()),
            )

    # 4. Compute Dynamic Dataset Analysis
    dataset_analysis = compute_dataset_analysis(
        validated_records=all_observations,
        detections=created_detections,
        predictions=all_predictions,
        files_info=files_info,
        global_available_fields=global_available_fields,
        global_unavailable_fields=global_unavailable_fields,
    )

    # 5. Format and return standardized SATRA Analysis Result
    primary_det = created_detections[0]
    primary_obs = all_observations[0]

    files_count = len(files_info)
    source_summary_text = f" across {files_count} file(s)" if files_count > 1 else ""

    return UploadAndAnalyzeResponse(
        status="SUCCESS",
        message=f"Successfully validated, normalized, and classified {len(created_detections)} satellite observation(s){source_summary_text}.",
        exact_location=ExactLocation(
            latitude=primary_det.latitude,
            longitude=primary_det.longitude,
        ),
        observation=ObservationMetadata(
            acq_date=primary_det.acq_date,
            acq_time=primary_det.acq_time,
            satellite=primary_det.source,
            instrument=primary_det.instrument,
            daynight=primary_det.daynight,
        ),
        thermal_data=ThermalDataInfo(
            frp=primary_det.frp,
            brightness=primary_det.brightness,
            bright_t31=primary_obs.bright_t31,
        ),
        prediction=PredictionSummary(
            predicted_class=primary_det.predicted_class,
            confidence=primary_det.prediction_confidence,
            model_version=primary_det.model_version,
            class_probabilities=primary_prediction_details.class_probabilities if primary_prediction_details else {},
        ),
        risk=RiskInfo(
            alert_level=primary_det.alert_level,
            verification_status="REQUIRES_VERIFICATION",
        ),
        provenance=primary_det.data_provenance,
        detection=DetectionResponse.model_validate(primary_det),
        total_records=len(created_detections),
        all_detections=[DetectionResponse.model_validate(d) for d in created_detections],
        analysis_summary=dataset_analysis,
    )

