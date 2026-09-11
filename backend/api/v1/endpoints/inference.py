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
    Returns health and configuration status of the integrated ML subsystem.
    """
    config_report = ml_service.check_configuration()
    available = config_report["configured"]
    return {
        "status": "ready" if available else "fallback_active",
        "is_available": available,
        "model_loaded": config_report["model_loaded"],
        "model_version": config_report["model_version"],
        "fallback_available": True,
        "message": (
            "ML inference service is active and ready."
            if available
            else "Primary ML model unavailable — deterministic rule-based satellite fallback is active."
        ),
    }


@router.post(
    "/upload-and-analyze",
    response_model=UploadAndAnalyzeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Satellite Observation File(s) & Execute SATRA AI Pipeline",
    description=(
        "Core SATRA Pipeline: Accepts uploaded satellite data (single or multiple CSV, JSON, GeoJSON files), "
        "validates geographic coordinates and physical thermal fields, automatically detects and normalizes "
        "column variations across NASA FIRMS MODIS, VIIRS, and custom formats, executes AI thermal classification "
        "with automatic deterministic fallback, evaluates alert levels, persists detections, and returns structured intelligence."
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
    2. File Format Detection & Column Normalization (MODIS, VIIRS, User CSV/JSON)
    3. Coordinate & Physical Range Validation
    4. SATRA AI Classification Model Inference (with deterministic rule-based fallback)
    5. Risk & Alert Assessment
    6. Database Persistence with Source File Traceability
    7. Dynamic Dataset Analytics Computation
    8. Standardized Result Return
    """
    logger.info("[SATRA API] Inference request received")

    # 1. Collect all uploaded files from either single 'file' or multiple 'files' fields
    target_files: List[UploadFile] = []
    if file is not None and file.filename:
        target_files.append(file)
    if files:
        for f in files:
            if f is not None and f.filename and f not in target_files:
                target_files.append(f)

    if not target_files:
        logger.error("[SATRA ERROR] No satellite observation file provided")
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
                logger.error("[SATRA ERROR] Uploaded file '%s' is empty", up_file.filename)
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"The uploaded satellite file '{up_file.filename}' is empty.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error("[SATRA ERROR] Failed to read file %s: %s", up_file.filename, str(e))
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
            logger.warning("[SATRA ERROR] Validation error on '%s': %s", up_file.filename, str(val_err))
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(val_err),
            )

    if not all_observations:
        logger.error("[SATRA ERROR] Zero valid observation records found in uploaded files")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Zero valid observation records found in uploaded file(s).",
        )

    logger.info("[SATRA API] Observations: %d", len(all_observations))

    # 3. Execute AI Inference (with deterministic rule-based fallback) & Persist
    created_detections: List[Detection] = []
    primary_prediction_details: Optional[MLPredictionDetails] = None
    all_predictions: List[Dict[str, Any]] = []
    any_fallback: bool = False

    logger.info("[SATRA API] AI service request started")

    for obs in all_observations:
        raw_input_dict = obs.to_input_dict()
        prediction_result, is_fallback_obs = ml_service.predict_with_fallback(raw_input_dict)
        if is_fallback_obs:
            any_fallback = True
        all_predictions.append(prediction_result)

        predicted_class_name = prediction_result.get("predicted_class", "Unknown")
        predicted_conf = float(prediction_result.get("confidence", 0.0))
        is_persistent = (
            predicted_class_name.lower() == "persistent thermal source"
            or prediction_result.get("predicted_class_id") == 1
        )

        base_alert_level = prediction_result.get("alert_level", "LOW")
        alert_level = "LOW_CONFIDENCE_REVIEW" if (predicted_conf < 0.60 and not is_fallback_obs) else base_alert_level
        model_ver = prediction_result.get("model_version", "2.0.0-scientific-prototype")
        obs_provenance = "RULE_BASED_FALLBACK" if is_fallback_obs else (obs.data_provenance or "REAL_FIRMS")

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
            data_provenance=obs_provenance,
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

    logger.info("[SATRA API] AI service response received (fallback=%s)", any_fallback)

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

    # Requirement 9: Predictable Standard Response Payload
    statistics_payload = {
        "frp": (
            dataset_analysis.frp_analysis.model_dump()
            if dataset_analysis.frp_analysis
            else "Insufficient data for this analysis."
        ),
        "brightness": (
            dataset_analysis.brightness_analysis.model_dump()
            if dataset_analysis.brightness_analysis
            else "Insufficient data for this analysis."
        ),
        "confidence": (
            dataset_analysis.confidence_analysis.model_dump()
            if dataset_analysis.confidence_analysis
            else "Insufficient data for this analysis."
        ),
    }

    spatial_payload = (
        dataset_analysis.spatial_analysis.model_dump()
        if dataset_analysis.spatial_analysis
        else "Insufficient data for this analysis."
    )

    temporal_payload = (
        dataset_analysis.temporal_analysis.model_dump()
        if dataset_analysis.temporal_analysis
        else "Insufficient data for this analysis."
    )

    standard_analysis = {
        "total_observations": len(created_detections),
        "hotspots": [
            {
                "latitude": d.latitude,
                "longitude": d.longitude,
                "confidence": d.prediction_confidence,
                "predicted_class": d.predicted_class,
                "alert_level": d.alert_level,
                "frp": d.frp,
                "brightness": d.brightness,
            }
            for d in created_detections
        ],
        "risk_level": primary_det.alert_level,
        "summary": (
            f"Analyzed {len(created_detections)} satellite observation(s) with risk level {primary_det.alert_level}."
            if not any_fallback
            else f"Rule-based satellite analysis on {len(created_detections)} observation(s) with risk level {primary_det.alert_level}."
        ),
        "statistics": statistics_payload,
        "spatial_analysis": spatial_payload,
        "temporal_analysis": temporal_payload,
    }

    standard_metadata = {
        "source_file": (
            primary_obs.source_file
            or (files_info[0]["filename"] if files_info else "satellite_data.csv")
        ),
        "format": files_info[0]["format_detected"] if files_info else "VIIRS",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "is_fallback": any_fallback,
        "fallback_notice": (
            "AI service unavailable — displaying rule-based satellite analysis."
            if any_fallback
            else None
        ),
    }

    fallback_notice_text = (
        "AI service unavailable — displaying rule-based satellite analysis."
        if any_fallback
        else None
    )

    logger.info("[SATRA API] Analysis completed")

    return UploadAndAnalyzeResponse(
        success=True,
        status="SUCCESS",
        message=(
            f"Successfully validated, normalized, and classified {len(created_detections)} satellite observation(s){source_summary_text}."
            if not any_fallback
            else f"AI service unavailable — displaying rule-based satellite analysis for {len(created_detections)} observation(s){source_summary_text}."
        ),
        is_fallback=any_fallback,
        fallback_notice=fallback_notice_text,
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
        analysis=standard_analysis,
        metadata=standard_metadata,
    )

