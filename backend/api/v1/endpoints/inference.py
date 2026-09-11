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
from typing import Optional, List, Dict, Any
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
)
from backend.schemas.detection import DetectionResponse
from backend.services.ml_service import (
    MLInferenceService,
    get_ml_service,
    MLModelNotLoadedException,
    MLServiceException,
)
from backend.services.alert_service import create_alert_if_eligible
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
    summary="Upload Satellite Observation File & Execute SATRA AI Pipeline",
    description=(
        "Core SATRA Pipeline: Accepts uploaded satellite data (CSV, JSON, GeoJSON), "
        "validates geographic coordinates and physical thermal fields, extracts exact latitude/longitude, "
        "executes AI thermal classification, evaluates alert level, persists detection, "
        "and returns structured intelligence for Earth/GIS visualization."
    ),
)
async def upload_and_analyze(
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    ml_service: MLInferenceService = Depends(get_ml_service),
) -> UploadAndAnalyzeResponse:
    """
    End-to-End Pipeline for Uploaded Satellite Data:
    1. Uploaded File Reception
    2. Parsing & Comments Stripping
    3. Strict Geographic Validation (Lat [-90, 90], Lon [-180, 180], Brightness > 0)
    4. Exact Coordinate Extraction
    5. SATRA AI Classification Model Inference
    6. Risk & Alert Assessment
    7. Database Persistence
    8. Structured Result Return
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No satellite observation file provided. Please upload a valid CSV or JSON file.",
        )

    # 1. Read and decode content
    try:
        raw_bytes = await file.read()
        if not raw_bytes or len(raw_bytes.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The uploaded satellite file is empty.",
            )
        try:
            content_str = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            content_str = raw_bytes.decode("latin-1")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to read uploaded file: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file content: {str(e)}",
        )

    # 2. Parse observations from CSV or JSON
    filename_lower = (file.filename or "").lower()
    raw_rows: List[Dict[str, Any]] = []

    if filename_lower.endswith(".json") or filename_lower.endswith(".geojson") or content_str.strip().startswith(("{", "[")):
        try:
            parsed_json = json.loads(content_str)
            if isinstance(parsed_json, list):
                raw_rows = parsed_json
            elif isinstance(parsed_json, dict):
                # Check for GeoJSON FeatureCollection
                if "features" in parsed_json and isinstance(parsed_json["features"], list):
                    for feat in parsed_json["features"]:
                        row = dict(feat.get("properties", {}))
                        if "geometry" in feat and feat["geometry"].get("type") == "Point":
                            coords = feat["geometry"].get("coordinates", [])
                            if len(coords) >= 2:
                                row["longitude"] = coords[0]
                                row["latitude"] = coords[1]
                        raw_rows.append(row)
                else:
                    raw_rows = [parsed_json]
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Malformed JSON in uploaded file: {str(err)}",
            )
    else:
        # Parse CSV format (handle NASA FIRMS metadata/comment lines starting with #)
        csv_lines = [line for line in content_str.splitlines() if line.strip() and not line.strip().startswith("#")]
        if not csv_lines:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No observation data rows found in uploaded CSV file.",
            )

        reader = csv.DictReader(csv_lines)
        if not reader.fieldnames:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Uploaded CSV file is missing header row.",
            )
        for row in reader:
            raw_rows.append(row)

    if not raw_rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Zero observation records found in uploaded file.",
        )

    # 3. Standardize and Validate Observations
    validated_inputs: List[ThermalObservationInput] = []
    validation_errors: List[str] = []

    aliases = {
        "bright_ti4": "brightness",
        "bright_ti5": "bright_t31",
        "lat": "latitude",
        "lon": "longitude",
        "long": "longitude",
        "source": "satellite",
        "temp": "brightness",
    }

    for idx, row in enumerate(raw_rows):
        normalized_row: Dict[str, Any] = {}
        for k, v in row.items():
            if k is None:
                continue
            key_clean = str(k).strip().lower()
            standard_key = aliases.get(key_clean, key_clean)
            normalized_row[standard_key] = v

        # Check for Latitude
        if "latitude" not in normalized_row or normalized_row["latitude"] in (None, "", "null"):
            validation_errors.append(f"Record {idx+1}: Missing required 'latitude' coordinate.")
            continue
        try:
            lat = float(normalized_row["latitude"])
            if lat < -90.0 or lat > 90.0:
                validation_errors.append(f"Record {idx+1}: Latitude {lat}° is out of valid range [-90.0, +90.0].")
                continue
        except (ValueError, TypeError):
            validation_errors.append(f"Record {idx+1}: Non-numeric latitude value '{normalized_row.get('latitude')}'.")
            continue

        # Check for Longitude
        if "longitude" not in normalized_row or normalized_row["longitude"] in (None, "", "null"):
            validation_errors.append(f"Record {idx+1}: Missing required 'longitude' coordinate.")
            continue
        try:
            lon = float(normalized_row["longitude"])
            if lon < -180.0 or lon > 180.0:
                validation_errors.append(f"Record {idx+1}: Longitude {lon}° is out of valid range [-180.0, +180.0].")
                continue
        except (ValueError, TypeError):
            validation_errors.append(f"Record {idx+1}: Non-numeric longitude value '{normalized_row.get('longitude')}'.")
            continue

        # Check for Brightness Temperature
        raw_bright = normalized_row.get("brightness")
        if raw_bright in (None, "", "null"):
            validation_errors.append(f"Record {idx+1}: Missing thermal brightness temperature.")
            continue
        try:
            brightness = float(raw_bright)
            if brightness <= 0.0:
                validation_errors.append(f"Record {idx+1}: Unphysical brightness temperature {brightness} K.")
                continue
        except (ValueError, TypeError):
            validation_errors.append(f"Record {idx+1}: Non-numeric brightness value '{raw_bright}'.")
            continue

        # Extract optional fields
        bright_t31 = None
        if normalized_row.get("bright_t31") not in (None, "", "null"):
            try:
                bright_t31 = float(normalized_row["bright_t31"])
            except (ValueError, TypeError):
                pass

        frp = None
        if normalized_row.get("frp") not in (None, "", "null"):
            try:
                frp = float(normalized_row["frp"])
            except (ValueError, TypeError):
                pass

        # Temporal fields (use file values or populate UTC now)
        acq_date = str(normalized_row.get("acq_date") or "").strip() or None
        acq_time = str(normalized_row.get("acq_time") or "").strip() or None
        satellite_name = str(normalized_row.get("satellite") or "VIIRS_SNPP_NRT").strip()
        instrument_name = str(normalized_row.get("instrument") or "VIIRS").strip()
        daynight_val = str(normalized_row.get("daynight") or "D").strip().upper()
        if daynight_val not in ("D", "N"):
            daynight_val = "D"

        # Determine provenance
        if any(k in filename_lower for k in ["firms", "viirs", "modis", "real"]):
            provenance = "REAL_FIRMS"
        elif "sample" in filename_lower:
            provenance = "SAMPLE"
        else:
            provenance = "PROTOTYPE_LABELLED"

        obs_input = ThermalObservationInput(
            latitude=lat,
            longitude=lon,
            brightness=brightness,
            bright_t31=bright_t31,
            frp=frp,
            confidence=str(normalized_row.get("confidence") or "nominal"),
            acq_date=acq_date,
            acq_time=acq_time,
            source=satellite_name,
            instrument=instrument_name,
            daynight=daynight_val,
            data_provenance=provenance,
        )
        obs_input.populate_defaults_if_missing()
        validated_inputs.append(obs_input)

    # Check if any valid observation survived
    if not validated_inputs:
        error_detail = "Data Validation Failed. " + " ".join(validation_errors[:4])
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error_detail,
        )

    # 4. Execute AI Inference and Persist in Database
    created_detections: List[Detection] = []
    primary_prediction_details: Optional[MLPredictionDetails] = None

    for obs in validated_inputs:
        try:
            raw_input_dict = obs.model_dump()
            prediction_result = ml_service.predict(raw_input_dict)
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
            acq_date=obs.acq_date,
            acq_time=obs.acq_time,
            source=obs.source or "VIIRS_SNPP_NRT",
            instrument=obs.instrument or "VIIRS",
            frp=obs.frp,
            daynight=obs.daynight,
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

    # 5. Format and return standardized SATRA Analysis Result
    primary_det = created_detections[0]
    primary_input = validated_inputs[0]

    return UploadAndAnalyzeResponse(
        status="SUCCESS",
        message=f"Successfully validated, processed, and classified {len(created_detections)} satellite observation(s).",
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
            bright_t31=primary_input.bright_t31,
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
    )

