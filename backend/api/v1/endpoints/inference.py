"""
Inference & Prediction Pipeline Endpoints.
Integrates the AI/ML classification model into the backend pipeline:
Observation -> Validation -> ML Prediction -> Database -> API Response.
PS 26162: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import asyncio
import csv
import io
import json
import logging
import math
import time
import uuid
from typing import Optional, List, Dict, Any, Set
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.session import get_db, SessionLocal
from backend.models.detection import Detection
from backend.models.alert import Alert
from backend.schemas.observation import (
    ThermalObservationInput,
    ClassifyAndStoreResponse,
    MLPredictionDetails,
    UploadAndAnalyzeResponse,
    DatasetValidationResponse,
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
from backend.services.alert_service import (
    create_alert_if_eligible,
    evaluate_detection_for_alert,
    STATUS_REQUIRES_VERIFICATION,
)
from backend.services.fallback_service import FallbackRuleBasedClassifier
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
    is_avail = None
    if hasattr(ml_service, "is_available"):
        try:
            val = ml_service.is_available
            is_avail = val() if callable(val) else val
        except Exception:
            pass

    config_report = ml_service.check_configuration() if hasattr(ml_service, "check_configuration") else {"configured": False, "model_loaded": False, "model_version": "2.0.0"}
    available = is_avail if is_avail is not None else config_report.get("configured", False)

    return {
        "status": "ready" if available else "model_not_loaded",
        "is_available": bool(available),
        "model_loaded": config_report.get("model_loaded", bool(available)),
        "model_version": config_report.get("model_version", "2.0.0-scientific-prototype"),
        "fallback_available": True,
        "message": (
            "ML inference service is active and ready."
            if available
            else "ML model weights file is not loaded."
        ),
    }


@router.post(
    "/predict-and-store",
    response_model=ClassifyAndStoreResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Classify and Persist Single Observation",
)
def predict_and_store(
    observation: ThermalObservationInput,
    db: Session = Depends(get_db),
    ml_service: MLInferenceService = Depends(get_ml_service),
) -> ClassifyAndStoreResponse:
    """
    Classify a single satellite thermal observation and persist to database.
    """
    try:
        prediction_result = ml_service.predict(observation.model_dump())
    except MLModelNotLoadedException as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service Unavailable: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    predicted_class_name = prediction_result.get("predicted_class", "Other")
    predicted_conf = float(prediction_result.get("confidence", 0.0))
    is_persistent = (
        predicted_class_name.lower() == "persistent thermal source"
        or prediction_result.get("predicted_class_id") == 1
    )
    alert_lvl = "LOW_CONFIDENCE_REVIEW" if predicted_conf < 0.60 else prediction_result.get("alert_level", "LOW")
    model_ver = prediction_result.get("model_version", "2.0.0-scientific-prototype")
    obs_provenance = observation.data_provenance or "USER_UPLOADED"

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
        source_file=observation.source_file,
        predicted_class=predicted_class_name,
        prediction_confidence=predicted_conf,
        is_persistent=is_persistent,
        model_version=model_ver,
        data_provenance=obs_provenance,
        alert_level=alert_lvl,
    )
    db.add(db_detection)
    db.commit()
    db.refresh(db_detection)
    create_alert_if_eligible(db, db_detection)

    return ClassifyAndStoreResponse(
        status="SUCCESS",
        message="Thermal observation classified and saved successfully.",
        detection=DetectionResponse.model_validate(db_detection),
        prediction=MLPredictionDetails(
            predicted_class=predicted_class_name,
            predicted_class_id=int(prediction_result.get("predicted_class_id", 0)),
            confidence=predicted_conf,
            alert_level=alert_lvl,
            class_probabilities=prediction_result.get("class_probabilities", {}),
            model_version=model_ver,
            prediction_timestamp=prediction_result.get("prediction_timestamp", datetime.now(timezone.utc).isoformat()),
        ),
    )


@router.post(
    "/validate-dataset",
    response_model=DatasetValidationResponse,
    summary="Validate Satellite Dataset Archive or File",
    description="Validates satellite observation file or ZIP archive structure, columns, and compatibility before executing AI inference.",
)
async def validate_dataset(
    file: Optional[UploadFile] = File(None),
) -> DatasetValidationResponse:
    """
    Operator pre-analysis dataset validation endpoint:
    - Scans CSV, JSON, GeoJSON, or ZIP archives
    - For ZIP archives: safely unzips in sandbox, inspects headers, prioritizes NRT observation files
    - Verifies required latitude, longitude, and thermal indicators
    - Returns instant format feedback, identified observation filename, record count, and sample coordinates
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No satellite observation file provided for validation. Please select a CSV, JSON, or ZIP archive.",
        )

    try:
        content_bytes = await file.read()
        if not content_bytes or len(content_bytes.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"The uploaded satellite file '{file.filename}' is empty.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file '{file.filename}': {str(e)}",
        )

    try:
        obs_list, avail_f, unavail_f, detected_flavor, identified_filename = normalize_and_validate_file(
            content_bytes, file.filename
        )
    except ValueError as val_err:
        logger.warning("[SATRA API] Validation failed on '%s': %s", file.filename, str(val_err))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )

    first_obs = obs_list[0]
    sample_preview = {
        "latitude": first_obs.latitude,
        "longitude": first_obs.longitude,
        "brightness": first_obs.brightness,
        "bright_t31": first_obs.bright_t31,
        "frp": first_obs.frp,
        "confidence": first_obs.confidence,
        "acq_date": first_obs.acq_date,
        "acq_time": first_obs.acq_time,
        "satellite": first_obs.satellite,
        "instrument": first_obs.instrument,
    }

    return DatasetValidationResponse(
        status="VALID",
        filename=file.filename,
        identified_file=identified_filename,
        format_detected=detected_flavor,
        record_count=len(obs_list),
        detected_fields=sorted(list(avail_f)),
        missing_fields=sorted(list(unavail_f)),
        sample_preview=sample_preview,
        message="Satellite observation data found — ready for AI analysis.",
    )


# ---------------------------------------------------------------------------
# Batch Processing Job Architecture for Large Satellite Datasets
# ---------------------------------------------------------------------------

class StartJobResponse(BaseModel):
    job_id: str = Field(..., description="Unique background analysis job identifier")
    status: str = Field(default="PROCESSING")
    total_records: int = Field(..., description="Total validated satellite observations recognized")
    total_batches: int = Field(..., description="Total processing batches")
    batch_size: int = Field(default=1000, description="Records processed per batch")
    message: str = Field(default="Satellite AI analysis job initiated successfully.")


class JobStatusResponse(BaseModel):
    job_id: str = Field(..., description="Unique job identifier")
    status: str = Field(..., description="Job status: 'PROCESSING', 'COMPLETED', or 'FAILED'")
    current_batch: int = Field(default=0, description="Current active batch index")
    total_batches: int = Field(default=0, description="Total batches")
    processed_records: int = Field(default=0, description="Total observations processed so far")
    total_records: int = Field(default=0, description="Total observations in job")
    progress_percent: float = Field(default=0.0, description="Progress percentage 0-100%")
    status_message: str = Field(default="", description="Operator readable progress message")
    error: Optional[str] = Field(default=None, description="Error detail if job failed")
    result: Optional[UploadAndAnalyzeResponse] = Field(default=None, description="Final analysis intelligence response")
    elapsed_seconds: Optional[float] = Field(default=None, description="Elapsed processing time in seconds")
    model_version: str = Field(default="2.0.0-scientific-prototype", description="AI model version used")


active_jobs: Dict[str, Dict[str, Any]] = {}


async def run_batch_inference_job(
    job_id: str,
    all_observations: List[NormalizedObservation],
    files_info: List[Dict[str, Any]],
    global_available_fields: Set[str],
    global_unavailable_fields: Set[str],
):
    """
    Executes real batch inference over all observations using model v2.0.0-scientific-prototype.
    Batches of 1,000 records are analyzed, persisted to database, alerts evaluated,
    and live status updated with zero mock data.
    """
    job = active_jobs.get(job_id)
    if not job:
        return

    ml_service = get_ml_service()
    total_records = len(all_observations)
    batch_size = job["batch_size"]
    total_batches = job["total_batches"]

    created_detections: List[Detection] = []
    all_predictions: List[Dict[str, Any]] = []
    any_fallback: bool = False

    logger.info(
        "[SATRA JOB %s] Starting batch execution: %d records across %d batches (batch_size=%d)",
        job_id,
        total_records,
        total_batches,
        batch_size,
    )

    db: Session = SessionLocal()
    try:
        for batch_idx in range(total_batches):
            start_i = batch_idx * batch_size
            end_i = min(start_i + batch_size, total_records)
            batch_obs = all_observations[start_i:end_i]
            batch_num = batch_idx + 1

            batch_obs_dicts = [obs.to_input_dict() for obs in batch_obs]

            # 1. AI inference for this batch
            try:
                if not ml_service.is_available():
                    raise MLServiceException("ML service not loaded or available.")
                batch_preds = ml_service.predict_batch(batch_obs_dicts)
            except Exception as batch_err:
                logger.warning(
                    "[SATRA JOB %s] Primary AI inference unavailable for batch %d (%s) — activating rule-based fallback.",
                    job_id,
                    batch_num,
                    str(batch_err),
                )
                any_fallback = True
                batch_preds = [FallbackRuleBasedClassifier.evaluate_observation(d) for d in batch_obs_dicts]

            all_predictions.extend(batch_preds)

            # 2. Build and persist Detection records for this batch
            batch_created_detections: List[Detection] = []
            for obs, prediction_result in zip(batch_obs, batch_preds):
                predicted_class_name = prediction_result.get("predicted_class", "Unknown")
                predicted_conf = float(prediction_result.get("confidence", 0.0))
                is_persistent = (
                    predicted_class_name.lower() == "persistent thermal source"
                    or prediction_result.get("predicted_class_id") == 1
                )
                base_alert_level = prediction_result.get("alert_level", "LOW")
                alert_level = "LOW_CONFIDENCE_REVIEW" if (predicted_conf < 0.60 and not any_fallback) else base_alert_level
                model_ver = prediction_result.get("model_version", "2.0.0-scientific-prototype")
                obs_provenance = obs.data_provenance or "USER_UPLOADED"

                db_det = Detection(
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
                batch_created_detections.append(db_det)

            db.add_all(batch_created_detections)
            db.commit()

            # 3. Evaluate and persist alerts for this batch
            batch_alerts: List[Alert] = []
            for db_det in batch_created_detections:
                alert_info = evaluate_detection_for_alert(db_det)
                if alert_info:
                    batch_alerts.append(
                        Alert(
                            detection_id=db_det.id,
                            alert_level=alert_info["alert_level"],
                            title=alert_info["title"],
                            message=alert_info["message"],
                            predicted_class=db_det.predicted_class,
                            confidence=db_det.prediction_confidence,
                            verification_status=STATUS_REQUIRES_VERIFICATION,
                            latitude=db_det.latitude,
                            longitude=db_det.longitude,
                            frp=db_det.frp,
                            brightness=db_det.brightness,
                            acq_date=db_det.acq_date,
                            acq_time=db_det.acq_time,
                            data_provenance=db_det.data_provenance or "USER_UPLOADED",
                            model_version=db_det.model_version or "2.0.0-scientific-prototype",
                            disclaimer="AI detected thermal signature. Requires ground/field verification.",
                        )
                    )
            if batch_alerts:
                db.add_all(batch_alerts)
                db.commit()

            created_detections.extend(batch_created_detections)

            # 4. Live progress update
            processed_count = len(created_detections)
            progress_pct = round((processed_count / total_records) * 100.0, 1)
            job["current_batch"] = batch_num
            job["processed_records"] = processed_count
            job["progress_percent"] = progress_pct
            job["status_message"] = (
                f"Batch {batch_num} / {total_batches} — "
                f"{processed_count:,} / {total_records:,} observations processed"
            )
            job["elapsed_seconds"] = round(time.time() - job["start_time"], 2)

            # Yield control to event loop for immediate HTTP status responsiveness
            await asyncio.sleep(0.005)

        # 5. Compute full dataset analysis summary
        dataset_analysis = compute_dataset_analysis(
            validated_records=all_observations,
            detections=created_detections,
            predictions=all_predictions,
            files_info=files_info,
            global_available_fields=global_available_fields,
            global_unavailable_fields=global_unavailable_fields,
        )

        primary_det = created_detections[0]
        primary_obs = all_observations[0]
        primary_pred = all_predictions[0]

        files_count = len(files_info)
        source_summary_text = f" across {files_count} file(s)" if files_count > 1 else ""

        response_payload = UploadAndAnalyzeResponse(
            status="SUCCESS",
            message=(
                f"Batch processing complete: {len(created_detections):,} observations successfully analyzed "
                f"by SATRA AI model v2.0.0-scientific-prototype{source_summary_text}."
            ),
            is_fallback=any_fallback,
            fallback_notice="Deterministic rule-based fallback was engaged." if any_fallback else None,
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
                alert_level=primary_det.alert_level,
                class_probabilities=primary_pred.get("class_probabilities", {}),
            ),
            risk=RiskInfo(
                alert_level=primary_det.alert_level,
                verification_status=STATUS_REQUIRES_VERIFICATION,
                disclaimer="Requires ground/field verification.",
            ),
            provenance=primary_det.data_provenance,
            detection=DetectionResponse.model_validate(primary_det),
            all_detections=[DetectionResponse.model_validate(d) for d in created_detections[:500]],
            total_records=len(created_detections),
            analysis_summary=dataset_analysis,
        )

        job["result"] = response_payload
        job["status"] = "COMPLETED"
        job["completed_time"] = time.time()
        job["elapsed_seconds"] = round(job["completed_time"] - job["start_time"], 2)
        job["status_message"] = (
            f"AI analysis completed: {total_records:,} observations analyzed in {job['elapsed_seconds']}s."
        )
        logger.info("[SATRA JOB %s] Batch processing successfully completed in %.2fs", job_id, job["elapsed_seconds"])

    except Exception as exc:
        logger.error("[SATRA JOB %s] Failed: %s", job_id, str(exc), exc_info=True)
        job["status"] = "FAILED"
        job["error"] = str(exc)
        job["status_message"] = f"AI analysis failed: {str(exc)}"
    finally:
        db.close()


@router.post(
    "/start-job",
    response_model=StartJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start Asynchronous Satellite Dataset AI Batch Analysis Job",
    description="Accepts satellite observation files or ZIP archives, validates records, and launches background batch inference (1,000 records/batch).",
)
async def start_satellite_job(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
) -> StartJobResponse:
    """
    Asynchronous Entrypoint for Large Satellite Dataset Analysis:
    - Normalizes single or multi-file satellite datasets (CSV, JSON, ZIP)
    - Validates columns, geographic bounds, and thermal indicators
    - Splits observation records into manageable 1,000-record batches
    - Dispatches non-blocking async batch execution worker
    - Returns unique job_id and metadata for live frontend progress tracking
    """
    target_files: List[UploadFile] = []
    if file is not None and file.filename:
        target_files.append(file)
    if files:
        for f in files:
            if f is not None and f.filename and not any(existing.filename == f.filename for existing in target_files):
                target_files.append(f)

    if not target_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No satellite observation file provided. Please upload a valid CSV, JSON, or ZIP dataset.",
        )

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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read uploaded file content for '{up_file.filename}': {str(e)}",
            )

        try:
            obs_list, avail_f, unavail_f, detected_flavor, identified_filename = normalize_and_validate_file(
                raw_bytes, up_file.filename
            )
            all_observations.extend(obs_list)
            global_available_fields.update(avail_f)
            global_unavailable_fields.update(unavail_f)
            files_info.append({
                "filename": up_file.filename,
                "identified_file": identified_filename,
                "record_count": len(obs_list),
                "format_detected": detected_flavor,
            })
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(val_err),
            )

    if not all_observations:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Zero valid observation records found in uploaded file(s).",
        )

    total_records = len(all_observations)
    batch_size = 1000
    total_batches = math.ceil(total_records / batch_size)
    job_id = f"job_{uuid.uuid4().hex[:12]}"

    active_jobs[job_id] = {
        "job_id": job_id,
        "status": "PROCESSING",
        "current_batch": 0,
        "total_batches": total_batches,
        "batch_size": batch_size,
        "processed_records": 0,
        "total_records": total_records,
        "progress_percent": 0.0,
        "status_message": f"Starting batch analysis of {total_records:,} observations...",
        "error": None,
        "result": None,
        "start_time": time.time(),
        "completed_time": None,
        "elapsed_seconds": 0.0,
        "model_version": "2.0.0-scientific-prototype",
    }

    # Launch background batch worker
    asyncio.create_task(
        run_batch_inference_job(
            job_id=job_id,
            all_observations=all_observations,
            files_info=files_info,
            global_available_fields=global_available_fields,
            global_unavailable_fields=global_unavailable_fields,
        )
    )

    logger.info(
        "[SATRA API] Started batch analysis job '%s' for %d records (%d batches)",
        job_id,
        total_records,
        total_batches,
    )

    return StartJobResponse(
        job_id=job_id,
        status="PROCESSING",
        total_records=total_records,
        total_batches=total_batches,
        batch_size=batch_size,
        message=f"Satellite observation analysis job started for {total_records:,} records in {total_batches} batches.",
    )


@router.get(
    "/job-status/{job_id}",
    response_model=JobStatusResponse,
    summary="Get Satellite Dataset Batch Processing Job Status",
    description="Returns real-time batch processing progress, status counters, and completed results.",
)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """
    Live Status Endpoint for Polling Batch Processing:
    Returns current batch, total batches, processed count, percentage, and final result when done.
    """
    job = active_jobs.get(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis job '{job_id}' not found.",
        )

    return JobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        current_batch=job["current_batch"],
        total_batches=job["total_batches"],
        processed_records=job["processed_records"],
        total_records=job["total_records"],
        progress_percent=job["progress_percent"],
        status_message=job["status_message"],
        error=job.get("error"),
        result=job.get("result"),
        elapsed_seconds=job.get("elapsed_seconds"),
        model_version=job.get("model_version", "2.0.0-scientific-prototype"),
    )


@router.post(
    "/upload-and-analyze",
    response_model=UploadAndAnalyzeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Satellite Observation File(s) & Execute SATRA AI Pipeline",
    description=(
        "Core SATRA Pipeline: Accepts uploaded satellite data (single or multiple CSV, JSON, GeoJSON files, or ZIP archives), "
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
    1. Uploaded File(s) Reception (Single or Multi-file, CSV, JSON, or ZIP archives)
    2. File Format Detection & Column Normalization (MODIS, VIIRS, User CSV/JSON, ZIP)
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
            if f is not None and f.filename and not any(existing.filename == f.filename for existing in target_files):
                target_files.append(f)

    if not target_files:
        logger.error("[SATRA ERROR] No satellite observation file provided")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No satellite observation file provided. Please upload a valid CSV, JSON, or ZIP dataset.",
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
            obs_list, avail_f, unavail_f, detected_flavor, identified_filename = normalize_and_validate_file(
                raw_bytes, up_file.filename
            )
            all_observations.extend(obs_list)
            global_available_fields.update(avail_f)
            global_unavailable_fields.update(unavail_f)
            files_info.append({
                "filename": up_file.filename,
                "identified_file": identified_filename,
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

    # 3. Execute AI Inference (Vectorized batch with fallback support) & Persist
    created_detections: List[Detection] = []
    primary_prediction_details: Optional[MLPredictionDetails] = None
    all_predictions: List[Dict[str, Any]] = []
    any_fallback: bool = False

    logger.info("[SATRA API] AI service request started (%d observations)", len(all_observations))

    obs_dicts = [obs.to_input_dict() for obs in all_observations]
    try:
        if not ml_service.is_available():
            raise MLServiceException("ML service not loaded or available.")
        _first_pred = ml_service.predict(obs_dicts[0])
        if len(obs_dicts) == 1:
            all_predictions = [_first_pred]
        else:
            all_predictions = ml_service.predict_batch(obs_dicts)
    except Exception as batch_err:
        logger.warning("[SATRA API] Primary AI inference unavailable (%s) — activating rule-based fallback.", str(batch_err))
        any_fallback = True
        all_predictions = [FallbackRuleBasedClassifier.evaluate_observation(d) for d in obs_dicts]

    for obs, prediction_result in zip(all_observations, all_predictions):
        predicted_class_name = prediction_result.get("predicted_class", "Unknown")
        predicted_conf = float(prediction_result.get("confidence", 0.0))
        is_persistent = (
            predicted_class_name.lower() == "persistent thermal source"
            or prediction_result.get("predicted_class_id") == 1
        )

        base_alert_level = prediction_result.get("alert_level", "LOW")
        alert_level = "LOW_CONFIDENCE_REVIEW" if (predicted_conf < 0.60 and not any_fallback) else base_alert_level
        model_ver = prediction_result.get("model_version", "2.0.0-scientific-prototype")
        obs_provenance = obs.data_provenance or "USER_UPLOADED"

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
        created_detections.append(db_detection)

    # Fast batch commit for detections
    db.add_all(created_detections)
    db.commit()

    # Fast batch alert evaluation and persistence
    new_alerts = []
    for db_det in created_detections:
        alert_info = evaluate_detection_for_alert(db_det)
        if alert_info:
            new_alerts.append(
                Alert(
                    detection_id=db_det.id,
                    alert_level=alert_info["alert_level"],
                    title=alert_info["title"],
                    message=alert_info["message"],
                    predicted_class=db_det.predicted_class,
                    confidence=db_det.prediction_confidence,
                    verification_status=STATUS_REQUIRES_VERIFICATION,
                    latitude=db_det.latitude,
                    longitude=db_det.longitude,
                    frp=db_det.frp,
                    brightness=db_det.brightness,
                    acq_date=db_det.acq_date,
                    acq_time=db_det.acq_time,
                    data_provenance=db_det.data_provenance or "USER_UPLOADED",
                    model_version=db_det.model_version or "2.0.0-scientific-prototype",
                    disclaimer="AI detected thermal signature. Requires ground/field verification.",
                )
            )

    if new_alerts:
        db.add_all(new_alerts)
        db.commit()

    primary_prediction_details = MLPredictionDetails(
        predicted_class=all_predictions[0].get("predicted_class", "Unknown"),
        predicted_class_id=int(all_predictions[0].get("predicted_class_id", 0)),
        confidence=float(all_predictions[0].get("confidence", 0.0)),
        alert_level=all_predictions[0].get("alert_level", "LOW"),
        class_probabilities=all_predictions[0].get("class_probabilities", {}),
        model_version=all_predictions[0].get("model_version", "2.0.0-scientific-prototype"),
        prediction_timestamp=all_predictions[0].get("prediction_timestamp", datetime.now(timezone.utc).isoformat()),
    )

    logger.info("[SATRA API] AI service response processed successfully (fallback=%s)", any_fallback)

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

