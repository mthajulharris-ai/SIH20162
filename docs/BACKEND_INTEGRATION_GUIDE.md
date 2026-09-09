# Backend Integration Guide: Satellite Thermal Source Classifier

**Problem Statement PS 26162**: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data.

This document serves as the technical integration specification for the backend engineer developing the **FastAPI** web service.

---

## 1. Quick Integration (Python)

The ML service is fully packaged inside `src.inference`. You can import and call it directly without needing to manage model paths, scikit-learn pipelines, or preprocessing transformations:

```python
from src.inference import predict_thermal_observation

# 1. Single observation prediction
result = predict_thermal_observation({
    "brightness": 385.0,
    "bright_t31": 315.0,
    "frp": 165.0,
    "confidence_score": 0.95,
    "recurrence_count": 12,
    "persistence_ratio": 0.80,
    "frp_zscore": 5.1
})

# 2. Batch observations prediction
batch_results = predict_thermal_observation([
    {"brightness": 385.0, "bright_t31": 315.0, "frp": 165.0},
    {"brightness": 315.0, "bright_t31": 292.0, "frp": 6.5}
])
```

---

## 2. Input Specification

### 2.1 Required Fields
| Field Name | Type | Unit / Range | Description |
| :--- | :--- | :--- | :--- |
| `brightness` | `float` | $200.0\text{--}600.0\text{ K}$ | Mid-Infrared channel brightness temperature (Kelvin) |
| `bright_t31` | `float` | $200.0\text{--}500.0\text{ K}$ | Thermal Infrared window channel temperature (Kelvin) |
| `frp` | `float` | $\ge 0.0\text{ MW}$ | Fire Radiative Power (Megawatts) |

### 2.2 Optional / Derived Fields (Sensible Defaults Applied if Omitted)
| Field Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `confidence_score` | `float` | `0.60` | Normalized detection confidence ($0.0\text{--}1.0$) |
| `is_night` | `int` | Inferred from `hour_utc` | `1` if night acquisition, `0` if daytime |
| `hour_utc` | `int` | `12` | UTC hour of satellite observation ($0\text{--}23$) |
| `recurrence_count` | `int` | `1` | Historical count of thermal detections at this location |
| `persistence_ratio` | `float` | `0.05` | Ratio of active detection days to total monitoring window |
| `night_detection_ratio` | `float` | `0.0` | Proportion of detections occurring during night at this site |
| `frp_local_mean` | `float` | Equal to `frp` | Baseline historical mean FRP at this specific facility |
| `frp_zscore` | `float` | `0.0` | Standard deviation elevation of current FRP above baseline |
| `frp_to_mean_ratio` | `float` | `1.0` | Ratio of current FRP to historical site baseline |
| `scan`, `track` | `float` | `0.375` | Satellite sensor spatial footprint resolution |

---

## 3. Output Specification

Every prediction returns a standardized dictionary with the following schema:

| Field Name | Type | Description | Possible Values |
| :--- | :--- | :--- | :--- |
| `status` | `string` | Status of the inference operation | `"SUCCESS"` |
| `predicted_class` | `string` | Target classification label | `"Industrial Fire"`, `"Persistent Thermal Source"`, `"Other"` |
| `predicted_class_id` | `integer` | Numerical class identifier | `2` (Industrial Fire), `1` (Persistent Thermal Source), `0` (Other) |
| `confidence` | `float` | Probability of the top predicted class | $0.0\text{--}1.0$ (e.g. `0.9981`) |
| `alert_level` | `string` | Operational risk level | `"CRITICAL"` (Class 2), `"MEDIUM"` (Class 1), `"LOW"` (Class 0) |
| `class_probabilities` | `object` | Full probability distribution across all 3 classes | Key-value mapping of each class name to probability |
| `model_version` | `string` | Semantic model version identifier | `"1.0.0-baseline"` |
| `prediction_timestamp` | `string` | ISO 8601 UTC timestamp of execution | `"YYYY-MM-DDTHH:MM:SS.ffffff+00:00"` |

---

## 4. Example Request & Response Payloads

### Example 1: Catastrophic Industrial Flare-Up / Fire (Class 2)

#### Request JSON:
```json
{
  "brightness": 385.0,
  "bright_t31": 315.0,
  "temp_diff": 70.0,
  "frp": 165.0,
  "confidence_score": 0.95,
  "is_night": 0,
  "hour_utc": 7,
  "recurrence_count": 12,
  "persistence_ratio": 0.80,
  "night_detection_ratio": 0.50,
  "frp_local_mean": 20.0,
  "frp_zscore": 5.10,
  "frp_to_mean_ratio": 8.25
}
```

#### Response JSON:
```json
{
  "status": "SUCCESS",
  "predicted_class": "Industrial Fire",
  "predicted_class_id": 2,
  "confidence": 0.9981,
  "alert_level": "CRITICAL",
  "class_probabilities": {
    "Other": 0.0001,
    "Persistent Thermal Source": 0.0018,
    "Industrial Fire": 0.9981
  },
  "model_version": "1.0.0-baseline",
  "prediction_timestamp": "2026-09-09T08:42:15.123456+00:00"
}
```

---

### Example 2: Normal 24/7 Persistent Industrial Heat Source (Class 1)

#### Request JSON:
```json
{
  "brightness": 338.0,
  "bright_t31": 299.5,
  "temp_diff": 38.5,
  "frp": 21.0,
  "confidence_score": 0.90,
  "is_night": 1,
  "hour_utc": 19,
  "recurrence_count": 12,
  "persistence_ratio": 0.80,
  "night_detection_ratio": 0.50,
  "frp_local_mean": 19.2,
  "frp_zscore": 0.40,
  "frp_to_mean_ratio": 1.09
}
```

#### Response JSON:
```json
{
  "status": "SUCCESS",
  "predicted_class": "Persistent Thermal Source",
  "predicted_class_id": 1,
  "confidence": 0.9942,
  "alert_level": "MEDIUM",
  "class_probabilities": {
    "Other": 0.0012,
    "Persistent Thermal Source": 0.9942,
    "Industrial Fire": 0.0046
  },
  "model_version": "1.0.0-baseline",
  "prediction_timestamp": "2026-09-09T08:42:15.123456+00:00"
}
```

---

### Example 3: Agricultural Crop Stubble Burning / Wildfire (Class 0)

#### Request JSON:
```json
{
  "brightness": 315.2,
  "bright_t31": 292.0,
  "temp_diff": 23.2,
  "frp": 6.2,
  "confidence_score": 0.30,
  "is_night": 0,
  "hour_utc": 12,
  "recurrence_count": 1,
  "persistence_ratio": 0.05,
  "night_detection_ratio": 0.00,
  "frp_local_mean": 6.2,
  "frp_zscore": 0.00,
  "frp_to_mean_ratio": 1.00
}
```

#### Response JSON:
```json
{
  "status": "SUCCESS",
  "predicted_class": "Other",
  "predicted_class_id": 0,
  "confidence": 0.9995,
  "alert_level": "LOW",
  "class_probabilities": {
    "Other": 0.9995,
    "Persistent Thermal Source": 0.0004,
    "Industrial Fire": 0.0001
  },
  "model_version": "1.0.0-baseline",
  "prediction_timestamp": "2026-09-09T08:42:15.123456+00:00"
}
```

---

## 5. Sample FastAPI Implementation

When building your FastAPI application, you can implement the endpoint directly:

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Optional, List
from src.inference import predict_thermal_observation

app = FastAPI(title="SIH PS 26162 Satellite Thermal Source Classification API")

class ThermalObservationRequest(BaseModel):
    brightness: float = Field(..., description="Mid-Infrared brightness temperature in Kelvin (e.g. 335.0)")
    bright_t31: float = Field(..., description="Thermal Infrared window temperature in Kelvin (e.g. 300.0)")
    frp: float = Field(..., description="Fire Radiative Power in MW (e.g. 25.0)")
    confidence_score: Optional[float] = Field(0.60, description="Confidence score between 0.0 and 1.0")
    is_night: Optional[int] = Field(0, description="1 if night observation, 0 if day")
    recurrence_count: Optional[int] = Field(1, description="Detections count at location")
    persistence_ratio: Optional[float] = Field(0.05, description="Persistence ratio (0.0 to 1.0)")
    frp_zscore: Optional[float] = Field(0.0, description="Local FRP anomaly z-score")

class PredictionResponse(BaseModel):
    status: str
    predicted_class: str
    predicted_class_id: int
    confidence: float
    alert_level: str
    class_probabilities: Dict[str, float]
    model_version: str
    prediction_timestamp: str

@app.post("/api/v1/predict", response_model=PredictionResponse)
def classify_observation(payload: ThermalObservationRequest):
    try:
        result = predict_thermal_observation(payload.dict())
        return result
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))

@app.post("/api/v1/predict-batch", response_model=List[PredictionResponse])
def classify_batch(payload: List[ThermalObservationRequest]):
    try:
        return predict_thermal_observation([item.dict() for item in payload])
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
```
