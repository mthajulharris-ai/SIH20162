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
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import gc
import os
import shutil
import tempfile
from pathlib import Path

import numpy as np

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
from backend.utils.analysis_engine import compute_dataset_analysis, IncrementalDatasetAggregator
from backend.utils.firms_stream_parser import FIRMSDataStreamer
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
        "model_version": config_report.get("model_version", "3.0.0-ensemble"),
        "model_type": config_report.get("model_type", "RF_LightGBM_XGBoost_SoftVoting"),
        "is_ensemble": config_report.get("is_ensemble", False),
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
    observation = observation.populate_defaults_if_missing()
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
            classification=prediction_result.get("classification", predicted_class_name),
            status=prediction_result.get("status", "LOW_CONFIDENCE_REVIEW" if predicted_conf < 0.60 else "CLASSIFIED"),
            model_type=prediction_result.get("model_type", "RF_LightGBM_XGBoost_SoftVoting"),
            fusion_source=prediction_result.get("fusion_source", "TABULAR_ONLY"),
        ),
    )


@router.post(
    "/validate-dataset",
    response_model=DatasetValidationResponse,
    summary="Validate Satellite Dataset Archive or File",
    description="Validates satellite observation file, Shapefiles, or ZIP archive structure, columns, and compatibility before executing AI inference.",
)
async def validate_dataset(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
) -> DatasetValidationResponse:
    """
    Operator pre-analysis dataset validation endpoint:
    - Scans CSV, JSON, GeoJSON, Shapefiles, or ZIP archives
    - For ZIP archives: safely unzips in sandbox, inspects headers, prioritizes NRT observation files
    - For Shapefiles: accepts .shp or multi-file uploads (.shp + .shx + .dbf + .prj)
    - Verifies required latitude, longitude, and thermal indicators
    - Returns instant format feedback, identified observation filename, record count, and sample coordinates
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
            detail="No satellite observation file provided for validation. Please select a CSV, JSON, or ZIP archive.",
        )

    temp_val_dir = tempfile.mkdtemp(prefix="satra_val_")
    streamer = None
    try:
        for up_file in target_files:
            dest = Path(temp_val_dir) / os.path.basename(up_file.filename)
            with open(dest, "wb") as f:
                shutil.copyfileobj(up_file.file, f)
            if dest.stat().st_size == 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"The uploaded satellite file '{up_file.filename}' is empty.",
                )

        candidates = list(Path(temp_val_dir).glob("*"))
        if not candidates:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No files received.")

        shp_files = [p for p in candidates if p.suffix.lower() == ".shp"]
        zip_files = [p for p in candidates if p.suffix.lower() == ".zip"]
        json_files = [p for p in candidates if p.suffix.lower() in (".json", ".geojson")]
        csv_files = [p for p in candidates if p.suffix.lower() in (".csv", ".tsv", ".txt")]

        if shp_files:
            primary = shp_files[0]
        elif zip_files:
            primary = zip_files[0]
        elif json_files:
            primary = json_files[0]
        elif csv_files:
            primary = csv_files[0]
        else:
            primary = candidates[0]

        streamer = FIRMSDataStreamer(primary, filename=primary.name, temp_dir=Path(temp_val_dir))
        preview = streamer.get_preview(max_records=10)

        standard_expected = {
            "latitude", "longitude", "brightness", "bright_t31", "frp",
            "confidence", "acq_date", "acq_time", "satellite", "instrument", "daynight",
        }
        detected = set(preview["detected_fields"])
        missing = sorted(list(standard_expected - detected))

        return DatasetValidationResponse(
            status="VALID",
            filename=primary.name,
            identified_file=preview["identified_file"],
            format_detected=preview["format_detected"],
            record_count=preview["record_count"],
            detected_fields=sorted(list(detected)),
            missing_fields=missing,
            sample_preview=preview["sample_preview"],
            message="Satellite observation data found — ready for AI analysis.",
        )
    except HTTPException:
        raise
    except ValueError as val_err:
        logger.warning("[SATRA API] Validation failed: %s", str(val_err))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        logger.error("[SATRA API] Validation error: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation failed: {str(exc)}",
        )
    finally:
        if streamer:
            streamer.cleanup()
        shutil.rmtree(temp_val_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Streaming Batch Processing Job Architecture for Large Satellite Datasets
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
    model_version: str = Field(default="3.0.0-ensemble", description="AI model version used")


active_jobs: Dict[str, Dict[str, Any]] = {}


async def run_streaming_batch_inference_job(
    job_id: str,
    streamer: FIRMSDataStreamer,
    job_dir: str,
    preview_info: Dict[str, Any],
    primary_filename: str,
):
    """
    Memory-safe streaming batch execution engine:
    - Streams chunks of observations via FIRMSDataStreamer (O(1) memory)
    - Applies soft voting ensemble (RF + LightGBM + XGBoost) without mock data
    - Tracks multi-stage progress:
      Uploading... 25% -> Parsing... 45% -> Feature extraction... 65% -> AI classification... 82% -> Generating analytics... 95% -> Complete 100%
    - Dynamically accumulates dataset metrics into IncrementalDatasetAggregator
    - Automatically cleans up disk spools on completion
    """
    job = active_jobs.get(job_id)
    if not job:
        return

    ml_service = get_ml_service()
    aggregator = IncrementalDatasetAggregator(max_map_hotspots=1000)
    db: Session = SessionLocal()

    total_records = job["total_records"]
    batch_size = job["batch_size"]
    total_batches = job["total_batches"]

    persisted_detections: List[Detection] = []
    any_fallback: bool = False
    processed_count = 0
    batch_num = 0

    logger.info(
        "[SATRA JOB %s] Starting streaming batch execution: %d records across %d batches (batch_size=%d)",
        job_id,
        total_records,
        total_batches,
        batch_size,
    )

    try:
        # Stage 1: Parsing... 45%
        job["status_message"] = f"Parsing... 45% ({total_records:,} observations recognized)"
        job["progress_percent"] = 45.0
        await asyncio.sleep(0.01)

        primary_det_obj = None
        first_obs_dict = None
        first_pred_dict = None

        CLASS_NAMES = ["Industrial Fire", "Forest Fire", "Persistent Thermal Source", "Other"]
        ALERT_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

        for chunk in streamer.iter_record_chunks(chunk_size=batch_size):
            if not chunk:
                continue

            batch_num += 1
            chunk_len = len(chunk)

            # Feature extraction and classification
            processed_count += chunk_len
            if processed_count > total_records:
                total_records = max(total_records, processed_count + (chunk_len * 2))
                job["total_records"] = total_records
                total_batches = max(batch_num + 1, math.ceil(total_records / batch_size))
                job["total_batches"] = total_batches

            fraction = min(1.0, processed_count / max(1, total_records))
            calc_pct = 40.0 + (fraction * 50.0)

            stage_label = "Feature extraction..." if fraction < 0.45 else "AI classification..."
            job["status_message"] = (
                f"{stage_label} {round(calc_pct, 1)}% — batch {batch_num}/{total_batches} "
                f"({processed_count:,} / {total_records:,} records)"
            )
            job["progress_percent"] = round(calc_pct, 1)

            # Fast Vectorized ML Inference (RF + LightGBM + XGBoost Soft Voting)
            try:
                if not ml_service.is_available():
                    raise MLServiceException("ML ensemble classifier not loaded.")
                X, pred_class_ids, confs, proba_matrix = ml_service.predict_batch_fast(chunk)
            except Exception as batch_err:
                logger.warning(
                    "[SATRA JOB %s] Primary ML ensemble unavailable for batch %d (%s) — activating rule-based fallback.",
                    job_id,
                    batch_num,
                    str(batch_err),
                )
                any_fallback = True
                fallback_preds = [FallbackRuleBasedClassifier.evaluate_observation(d) for d in chunk]
                from backend.ml.feature_extractor import extract_features_vectorized
                X = extract_features_vectorized(chunk)
                name_to_id = {"Industrial Fire": 0, "Forest Fire": 1, "Persistent Thermal Source": 2, "Other": 3}
                pred_class_ids = np.array([name_to_id.get(p.get("predicted_class", "Other"), 3) for p in fallback_preds], dtype=np.int64)
                confs = np.array([float(p.get("confidence", 0.5)) for p in fallback_preds], dtype=np.float64)
                proba_matrix = None

            if first_obs_dict is None and chunk:
                first_obs_dict = chunk[0]
                first_cls_id = int(pred_class_ids[0])
                first_conf = float(confs[0])
                first_al = "LOW_CONFIDENCE_REVIEW" if first_conf < 0.60 else ALERT_LEVELS[first_cls_id]
                first_pred_dict = {
                    "classification": CLASS_NAMES[first_cls_id],
                    "predicted_class": CLASS_NAMES[first_cls_id],
                    "predicted_class_id": first_cls_id,
                    "confidence": round(first_conf, 4),
                    "status": "LOW_CONFIDENCE_REVIEW" if first_conf < 0.60 else "CLASSIFIED",
                    "model_type": "RF_LightGBM_XGBoost_SoftVoting" if not any_fallback else "Deterministic_Rule_Based",
                    "fusion_source": "TABULAR_ONLY",
                    "alert_level": first_al,
                    "class_probabilities": {
                        CLASS_NAMES[k]: round(float(proba_matrix[0, k]), 4)
                        for k in range(4)
                    } if proba_matrix is not None else {},
                }

            # Fast vector chunk aggregation (O(1) memory, ~0.03s per 50k)
            aggregator.add_chunk_vectorized(chunk, X, pred_class_ids, confs, proba_matrix)

            # Persist a safe, bounded representative sample to DB (first 1,000 records)
            if len(persisted_detections) < 1000:
                needed_persist = 1000 - len(persisted_detections)
                persist_n = min(needed_persist, chunk_len)
                batch_detections_to_persist: List[Detection] = []
                for i in range(persist_n):
                    obs = chunk[i]
                    cls_idx = int(pred_class_ids[i])
                    pred_cls = CLASS_NAMES[cls_idx]
                    pred_conf = float(confs[i])
                    alert_lvl = "LOW_CONFIDENCE_REVIEW" if pred_conf < 0.60 else ALERT_LEVELS[cls_idx]
                    is_persistent = (cls_idx == 2 or pred_cls.lower() == "persistent thermal source")

                    det = Detection(
                        latitude=float(obs["latitude"]),
                        longitude=float(obs["longitude"]),
                        brightness=float(obs.get("brightness") or obs.get("bright_ti4") or 300.0),
                        confidence=str(obs.get("confidence") or "nominal"),
                        acq_date=str(obs.get("acq_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")),
                        acq_time=str(obs.get("acq_time") or "1200"),
                        source=str(obs.get("satellite") or "VIIRS_SNPP_NRT"),
                        instrument=str(obs.get("instrument") or "VIIRS"),
                        frp=float(obs.get("frp")) if obs.get("frp") is not None else None,
                        daynight=str(obs.get("daynight") or "D"),
                        source_file=obs.get("source_file") or primary_filename,
                        predicted_class=pred_cls,
                        prediction_confidence=pred_conf,
                        is_persistent=is_persistent,
                        model_version="3.0.0-ensemble",
                        data_provenance=obs.get("data_provenance") or "USER_UPLOADED",
                        alert_level=alert_lvl,
                    )
                    batch_detections_to_persist.append(det)
                    persisted_detections.append(det)
                    if primary_det_obj is None:
                        primary_det_obj = det

                if batch_detections_to_persist:
                    db.add_all(batch_detections_to_persist)
                    db.commit()

            # Clean up intermediate arrays & run garbage collection periodically
            del X, pred_class_ids, confs, proba_matrix
            if batch_num % 10 == 0:
                gc.collect()

            job["current_batch"] = batch_num
            job["processed_records"] = processed_count
            job["elapsed_seconds"] = round(time.time() - job["start_time"], 2)
            await asyncio.sleep(0.001)

        # Stage 4: Aggregation... 95%
        job["status_message"] = (
            f"Aggregation... 95% — generating dataset analytics & spatial clusters ({aggregator.total_records:,} observations)..."
        )
        job["progress_percent"] = 95.0
        await asyncio.sleep(0.01)
        job["progress_percent"] = 95.0
        await asyncio.sleep(0.01)

        files_info = [{
            "filename": primary_filename,
            "identified_file": preview_info.get("identified_file", primary_filename),
            "record_count": aggregator.total_records,
            "format_detected": preview_info.get("format_detected", "NASA FIRMS"),
        }]
        dataset_analysis = aggregator.build_summary(
            files_info=files_info,
            global_available_fields=set(preview_info.get("detected_fields", [])),
            global_unavailable_fields=set(preview_info.get("missing_fields", [])),
        )
        standard_analysis = aggregator.build_standard_analysis(dataset_analysis, any_fallback=any_fallback)

        if not primary_det_obj:
            primary_det_obj = Detection(
                latitude=first_obs_dict.get("latitude", 0.0) if first_obs_dict else 0.0,
                longitude=first_obs_dict.get("longitude", 0.0) if first_obs_dict else 0.0,
                brightness=first_obs_dict.get("brightness", 300.0) if first_obs_dict else 300.0,
                confidence=first_obs_dict.get("confidence", "nominal") if first_obs_dict else "nominal",
                acq_date=first_obs_dict.get("acq_date", "2026-09-14") if first_obs_dict else "2026-09-14",
                acq_time=first_obs_dict.get("acq_time", "1200") if first_obs_dict else "1200",
                source=first_obs_dict.get("satellite", "VIIRS") if first_obs_dict else "VIIRS",
                instrument=first_obs_dict.get("instrument", "VIIRS") if first_obs_dict else "VIIRS",
                frp=first_obs_dict.get("frp") if first_obs_dict else None,
                daynight=first_obs_dict.get("daynight", "D") if first_obs_dict else "D",
                source_file=primary_filename,
                predicted_class=first_pred_dict.get("predicted_class", "Other") if first_pred_dict else "Other",
                prediction_confidence=float(first_pred_dict.get("confidence", 0.0)) if first_pred_dict else 0.0,
                is_persistent=False,
                model_version="3.0.0-ensemble",
                data_provenance="USER_UPLOADED",
                alert_level=first_pred_dict.get("alert_level", "LOW") if first_pred_dict else "LOW",
            )
            db.add(primary_det_obj)
            db.commit()
            persisted_detections.insert(0, primary_det_obj)

        capped_detections = [DetectionResponse.model_validate(d) for d in persisted_detections[:1000]]
        primary_pred = first_pred_dict or {}

        response_payload = UploadAndAnalyzeResponse(
            success=True,
            status="SUCCESS",
            message=(
                f"Batch processing complete: {aggregator.total_records:,} observations successfully analyzed "
                f"by SATRA AI ensemble (RF + LightGBM + XGBoost)."
                if not any_fallback
                else f"Rule-based satellite analysis on {aggregator.total_records:,} observation(s)."
            ),
            is_fallback=any_fallback,
            fallback_notice="Deterministic rule-based fallback was engaged." if any_fallback else None,
            exact_location=ExactLocation(
                latitude=primary_det_obj.latitude,
                longitude=primary_det_obj.longitude,
            ),
            observation=ObservationMetadata(
                acq_date=primary_det_obj.acq_date,
                acq_time=primary_det_obj.acq_time,
                satellite=primary_det_obj.source,
                instrument=primary_det_obj.instrument,
                daynight=primary_det_obj.daynight,
            ),
            thermal_data=ThermalDataInfo(
                frp=primary_det_obj.frp,
                brightness=primary_det_obj.brightness,
                bright_t31=first_obs_dict.get("bright_t31") if first_obs_dict else None,
            ),
            prediction=PredictionSummary(
                classification=primary_pred.get("classification", primary_det_obj.predicted_class),
                predicted_class=primary_det_obj.predicted_class,
                confidence=primary_det_obj.prediction_confidence,
                status=primary_pred.get("status", "CLASSIFIED"),
                model_type=primary_pred.get("model_type", "RF_LightGBM_XGBoost_SoftVoting" if not any_fallback else "Deterministic_Rule_Based"),
                fusion_source=primary_pred.get("fusion_source", "TABULAR_ONLY"),
                model_version=primary_det_obj.model_version,
                alert_level=primary_det_obj.alert_level,
                class_probabilities=primary_pred.get("class_probabilities", {}),
            ),
            risk=RiskInfo(
                alert_level=primary_det_obj.alert_level,
                verification_status=STATUS_REQUIRES_VERIFICATION,
            ),
            provenance=primary_det_obj.data_provenance,
            detection=DetectionResponse.model_validate(primary_det_obj),
            all_detections=capped_detections,
            total_records=aggregator.total_records,
            analysis_summary=dataset_analysis,
            analysis=standard_analysis,
            metadata={
                "source_file": primary_filename,
                "format": preview_info.get("format_detected", "NASA FIRMS"),
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "is_fallback": any_fallback,
                "fallback_notice": "AI service unavailable — displaying rule-based satellite analysis." if any_fallback else None,
            },
        )

        job["result"] = response_payload
        job["status"] = "COMPLETED"
        job["completed_time"] = time.time()
        job["elapsed_seconds"] = round(job["completed_time"] - job["start_time"], 2)
        job["progress_percent"] = 100.0
        job["status_message"] = (
            f"Complete 100% — {aggregator.total_records:,} observations analyzed in {job['elapsed_seconds']}s."
        )
        logger.info("[SATRA JOB %s] Streaming batch processing completed in %.2fs", job_id, job["elapsed_seconds"])

    except Exception as exc:
        logger.error("[SATRA JOB %s] Streaming batch processing failed: %s", job_id, str(exc), exc_info=True)
        job["status"] = "FAILED"
        job["error"] = str(exc)
        job["status_message"] = f"AI analysis failed: {str(exc)}"
    finally:
        db.close()
        streamer.cleanup()
        shutil.rmtree(job_dir, ignore_errors=True)


async def run_batch_inference_job(
    job_id: str,
    all_observations: List[NormalizedObservation],
    files_info: List[Dict[str, Any]],
    global_available_fields: Set[str],
    global_unavailable_fields: Set[str],
):
    """
    Legacy wrapper for run_batch_inference_job to preserve backward compatibility.
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

    db: Session = SessionLocal()
    try:
        for batch_idx in range(total_batches):
            start_i = batch_idx * batch_size
            end_i = min(start_i + batch_size, total_records)
            batch_obs = all_observations[start_i:end_i]
            batch_num = batch_idx + 1

            batch_obs_dicts = [obs.to_input_dict() for obs in batch_obs]

            try:
                if not ml_service.is_available():
                    raise MLServiceException("ML service not loaded or available.")
                batch_preds = ml_service.predict_batch(batch_obs_dicts)
            except Exception as batch_err:
                any_fallback = True
                batch_preds = [FallbackRuleBasedClassifier.evaluate_observation(d) for d in batch_obs_dicts]

            all_predictions.extend(batch_preds)

            batch_created_detections: List[Detection] = []
            for obs, prediction_result in zip(batch_obs, batch_preds):
                predicted_class_name = prediction_result.get("predicted_class", "Unknown")
                predicted_conf = float(prediction_result.get("confidence", 0.0))
                is_persistent = (
                    predicted_class_name.lower() == "persistent thermal source"
                    or prediction_result.get("predicted_class_id") == 2
                )
                base_alert_level = prediction_result.get("alert_level", "LOW")
                alert_level = "LOW_CONFIDENCE_REVIEW" if (predicted_conf < 0.60 and not any_fallback) else base_alert_level
                model_ver = prediction_result.get("model_version", "3.0.0-ensemble")
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

            created_detections.extend(batch_created_detections)
            processed_count = len(created_detections)
            job["current_batch"] = batch_num
            job["processed_records"] = processed_count
            job["progress_percent"] = round((processed_count / total_records) * 100.0, 1)
            job["status_message"] = f"Batch {batch_num} / {total_batches} — {processed_count:,} / {total_records:,} observations processed"
            job["elapsed_seconds"] = round(time.time() - job["start_time"], 2)
            await asyncio.sleep(0.005)

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
                f"by SATRA AI ensemble (RF + LightGBM + XGBoost){source_summary_text}."
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
                classification=primary_pred.get("classification", primary_det.predicted_class),
                predicted_class=primary_det.predicted_class,
                confidence=primary_det.prediction_confidence,
                status=primary_pred.get("status", "CLASSIFIED"),
                model_type=primary_pred.get("model_type", "RF_LightGBM_XGBoost_SoftVoting" if not any_fallback else "Deterministic_Rule_Based"),
                fusion_source=primary_pred.get("fusion_source", "TABULAR_ONLY"),
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
    except Exception as exc:
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
    description="Accepts satellite observation files, Shapefiles, or ZIP archives, validates records, and launches streaming batch inference.",
)
async def start_satellite_job(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    chunk_size: Optional[int] = None,
) -> StartJobResponse:
    """
    Asynchronous Entrypoint for Large Satellite Dataset Analysis:
    - Normalizes single or multi-file satellite datasets (CSV, JSON, Shapefiles, ZIP)
    - Validates columns, geographic bounds, and thermal indicators via FIRMSDataStreamer
    - Dispatches streaming async batch execution worker (O(1) memory footprint)
    - Returns unique job_id and metadata for live frontend progress tracking immediately (< 0.5s)
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

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    job_dir = tempfile.mkdtemp(prefix=f"satra_job_{job_id}_")

    try:
        for up_file in target_files:
            dest = Path(job_dir) / os.path.basename(up_file.filename)
            with open(dest, "wb") as f:
                shutil.copyfileobj(up_file.file, f)
            if dest.stat().st_size == 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"The uploaded satellite file '{up_file.filename}' is empty.",
                )

        candidates = list(Path(job_dir).glob("*"))
        if not candidates:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No files found in upload.")

        shp_files = [p for p in candidates if p.suffix.lower() == ".shp"]
        zip_files = [p for p in candidates if p.suffix.lower() == ".zip"]
        json_files = [p for p in candidates if p.suffix.lower() in (".json", ".geojson")]
        csv_files = [p for p in candidates if p.suffix.lower() in (".csv", ".tsv", ".txt")]

        if shp_files:
            primary = shp_files[0]
        elif zip_files:
            primary = zip_files[0]
        elif json_files:
            primary = json_files[0]
        elif csv_files:
            primary = csv_files[0]
        else:
            primary = candidates[0]

        streamer = FIRMSDataStreamer(primary, filename=primary.name, temp_dir=Path(job_dir))
        preview = streamer.get_preview(max_records=10, quick=True)

    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except ValueError as val_err:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(val_err))
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to initialize job: {str(exc)}")

    total_records = preview["record_count"]
    if chunk_size is not None and chunk_size > 0:
        batch_size = min(100000, max(500, chunk_size))
    else:
        batch_size = 50000 if total_records >= 50000 else (10000 if total_records >= 10000 else 1000)

    total_batches = max(1, math.ceil(total_records / batch_size))

    active_jobs[job_id] = {
        "job_id": job_id,
        "status": "PROCESSING",
        "current_batch": 0,
        "total_batches": total_batches,
        "batch_size": batch_size,
        "processed_records": 0,
        "total_records": total_records,
        "progress_percent": 25.0,
        "status_message": f"Uploading... 25% — validated {total_records:,} satellite observations.",
        "error": None,
        "result": None,
        "start_time": time.time(),
        "completed_time": None,
        "elapsed_seconds": 0.0,
        "model_version": "3.0.0-ensemble",
    }

    # Launch background streaming batch worker
    background_tasks.add_task(
        run_streaming_batch_inference_job,
        job_id=job_id,
        streamer=streamer,
        job_dir=job_dir,
        preview_info=preview,
        primary_filename=primary.name,
    )

    logger.info(
        "[SATRA API] Started streaming batch analysis job '%s' for %d records (%d batches, chunk_size=%d)",
        job_id,
        total_records,
        total_batches,
        batch_size,
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
        model_version=job.get("model_version", "3.0.0-ensemble"),
    )


@router.get(
    "/analysis-status/{job_id}",
    response_model=JobStatusResponse,
    summary="Get Status of Asynchronous Analysis Job (Alias)",
    description="Poll progress, intermediate metrics, or final analysis payload of an asynchronous satellite dataset analysis job.",
)
async def get_analysis_status(job_id: str) -> JobStatusResponse:
    """Alias for /job-status/{job_id} to support both endpoint naming conventions."""
    return await get_job_status(job_id)


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

    has_direct_shp = any(up.filename and up.filename.lower().endswith(".shp") for up in target_files)
    if has_direct_shp:
        temp_dir = tempfile.mkdtemp(prefix="satra_shp_")
        streamer = None
        try:
            for up_file in target_files:
                dest = Path(temp_dir) / os.path.basename(up_file.filename)
                with open(dest, "wb") as f:
                    shutil.copyfileobj(up_file.file, f)
            shp_files = list(Path(temp_dir).glob("*.shp"))
            if not shp_files:
                raise ValueError("No valid .shp file found in uploaded Shapefile components.")
            primary = shp_files[0]
            streamer = FIRMSDataStreamer(primary, filename=primary.name, temp_dir=Path(temp_dir))
            for chunk in streamer.iter_record_chunks(chunk_size=5000):
                for r in chunk:
                    obs = NormalizedObservation(
                        latitude=float(r["latitude"]),
                        longitude=float(r["longitude"]),
                        brightness=float(r.get("brightness") or 300.0),
                        bright_t31=float(r.get("bright_t31")) if r.get("bright_t31") else None,
                        frp=float(r.get("frp")) if r.get("frp") is not None else None,
                        confidence=str(r.get("confidence") or "nominal"),
                        acq_date=str(r.get("acq_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")),
                        acq_time=str(r.get("acq_time") or "1200"),
                        satellite=str(r.get("satellite") or "VIIRS"),
                        instrument=str(r.get("instrument") or "VIIRS"),
                        scan=float(r.get("scan") or 0.375),
                        track=float(r.get("track") or 0.375),
                        daynight=str(r.get("daynight") or "D"),
                        source_file=primary.name,
                        data_provenance="USER_UPLOADED",
                        raw_properties=r,
                    )
                    all_observations.append(obs)
            global_available_fields.update(["latitude", "longitude", "brightness", "frp", "confidence", "acq_date", "acq_time", "satellite", "instrument", "daynight"])
            files_info.append({
                "filename": primary.name,
                "identified_file": streamer.identified_file,
                "record_count": len(all_observations),
                "format_detected": streamer.format_detected,
            })
        except ValueError as val_err:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(val_err))
        finally:
            if streamer:
                streamer.cleanup()
            shutil.rmtree(temp_dir, ignore_errors=True)
    else:
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
            or prediction_result.get("predicted_class_id") == 2
        )

        base_alert_level = prediction_result.get("alert_level", "LOW")
        alert_level = "LOW_CONFIDENCE_REVIEW" if (predicted_conf < 0.60 and not any_fallback) else base_alert_level
        model_ver = prediction_result.get("model_version", "3.0.0-ensemble")
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

    primary_pred_dict = all_predictions[0] if all_predictions else {}
    primary_conf = float(primary_pred_dict.get("confidence", 0.0))
    primary_prediction_details = MLPredictionDetails(
        predicted_class=primary_pred_dict.get("predicted_class", "Unknown"),
        predicted_class_id=int(primary_pred_dict.get("predicted_class_id", 0)),
        confidence=primary_conf,
        alert_level=primary_pred_dict.get("alert_level", "LOW"),
        class_probabilities=primary_pred_dict.get("class_probabilities", {}),
        model_version=primary_pred_dict.get("model_version", "3.0.0-ensemble" if not any_fallback else "rule-based-fallback-v1"),
        prediction_timestamp=primary_pred_dict.get("prediction_timestamp", datetime.now(timezone.utc).isoformat()),
        classification=primary_pred_dict.get("classification", primary_pred_dict.get("predicted_class", "Unknown")),
        status=primary_pred_dict.get("status", "LOW_CONFIDENCE_REVIEW" if primary_conf < 0.60 else "CLASSIFIED"),
        model_type=primary_pred_dict.get("model_type", "RF_LightGBM_XGBoost_SoftVoting" if not any_fallback else "Deterministic_Rule_Based"),
        fusion_source=primary_pred_dict.get("fusion_source", "TABULAR_ONLY"),
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
            classification=primary_prediction_details.classification if primary_prediction_details else primary_det.predicted_class,
            predicted_class=primary_det.predicted_class,
            confidence=primary_det.prediction_confidence,
            status=primary_prediction_details.status if primary_prediction_details else "CLASSIFIED",
            model_type=primary_prediction_details.model_type if primary_prediction_details else "RF_LightGBM_XGBoost_SoftVoting",
            fusion_source=primary_prediction_details.fusion_source if primary_prediction_details else "TABULAR_ONLY",
            model_version=primary_det.model_version,
            alert_level=primary_det.alert_level,
            class_probabilities=primary_prediction_details.class_probabilities if primary_prediction_details else {},
        ),
        risk=RiskInfo(
            alert_level=primary_det.alert_level,
            verification_status="REQUIRES_VERIFICATION",
        ),
        provenance=primary_det.data_provenance,
        detection=DetectionResponse.model_validate(primary_det),
        total_records=len(created_detections),
        all_detections=[DetectionResponse.model_validate(d) for d in created_detections[:1000]],
        analysis_summary=dataset_analysis,
        analysis=standard_analysis,
        metadata=standard_metadata,
    )

