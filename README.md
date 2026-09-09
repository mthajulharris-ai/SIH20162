# SIH 2026 — Problem Statement PS 26162
## AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Tests](https://img.shields.io/badge/tests-41%20passed-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

This repository contains the **Satellite Data Pipeline & AI/ML Classification Module** for Smart India Hackathon (SIH) 2026 Problem Statement **PS 26162**.

The system ingests satellite thermal anomaly observations from NASA FIRMS (MODIS and VIIRS), filters sensor artifacts, computes spatial clustering and multi-temporal persistence metrics, and classifies thermal hotspots into:
1. **Industrial Fire** (Acute, catastrophic fire or flare-up at an industrial site — **CRITICAL ALERT**)
2. **Persistent Thermal Source** (Regular 24/7 industrial operations: steel plants, refineries, flare stacks, cement kilns — **MEDIUM ALERT**)
3. **Other** (Wildfires, agricultural crop stubble burning, transient hotspots — **LOW ALERT**)

---

## 1. System Architecture & Pipeline Flow

```text
                                  +---------------------------------------+
                                  |  NASA FIRMS (MODIS / VIIRS Satellites)|
                                  +---------------------------------------+
                                                      |
                                                      v
                                        [ Step 1: Data Ingestion ]
                                  (CSV File / Folder / NASA FIRMS REST API)
                                                      |
                                                      v
                                    [ Step 2: Scientific Validation ]
                                 (Geographic Bounds & Thermal Sanity 200-600K)
                                                      |
                                                      v
                                      [ Step 3: Cleaning & Imputation ]
                               (Alias Harmonization, Deduplication, UTC Clocks)
                                                      |
                                                      v
                                   [ Step 4: Multi-Temporal Features ]
                               (Spatial Clustering, Persistence, FRP Anomaly Z-Score)
                                                      |
                                                      v
                                  [ Step 5: Scikit-Learn Classification ]
                                   (Class-Balanced ML Classifier Pipeline)
                                                      |
                                                      +------------------------+
                                                      |                        |
                                                      v                        v
                                            [ Output Hotspots Catalog ]  [ FastAPI Prediction API ]
                                             (data/processed/*.csv)      (src.inference.service)
```

---

## 2. Directory Structure

```text
SIH20162/
├── data/
│   ├── raw/                      # Real NASA FIRMS downloaded CSV files
│   ├── processed/                # Cleaned, feature-engineered & classified catalogs
│   └── samples/                  # Labeled prototype & test datasets (clearly marked)
├── docs/
│   └── BACKEND_INTEGRATION_GUIDE.md # Technical handover manual for FastAPI developers
├── models/
│   └── saved_models/             # Serialized .joblib ML models and metadata JSON
├── scripts/
│   ├── verify_env.py             # Verifies all required packages are operational
│   ├── run_cleaning_pipeline.py  # Executes data cleaning and outputs quality audit
│   ├── build_ml_dataset.py       # Prepares features and leakage-free train/val/test splits
│   ├── train_baseline.py         # Trains, compares, evaluates, and serializes models
│   └── run_pipeline.py           # ONE-COMMAND full end-to-end pipeline runner
├── src/
│   ├── config.py                 # Central directory and sensor configurations
│   ├── pipeline_runner.py        # Master pipeline orchestrator class
│   ├── data_pipeline/
│   │   ├── loader.py             # Ingests local CSVs or queries NASA FIRMS API
│   │   ├── validator.py          # Enforces coordinate & physical thermal limits
│   │   ├── cleaner.py            # Standardizes aliases, timestamps, and confidence
│   │   ├── preprocessor.py       # Full reproducible cleaning & audit report generator
│   │   ├── feature_engineering.py# Spatial clustering, persistence, and FRP z-scores
│   │   └── dataset_builder.py    # Spatial group splitting (zero data leakage)
│   ├── ml/
│   │   ├── train.py              # Candidate model comparison and joblib serialization
│   │   ├── evaluate.py           # Multi-metric evaluation (Macro F1, Precision, Recall)
│   │   └── predict.py            # Core ML prediction logic
│   └── inference/
│       ├── __init__.py           # Re-exports inference service
│       ├── predictor.py          # Wrapper for model inference
│       └── service.py            # Decoupled prediction service for backend consumption
├── tests/                        # 41 automated pytest unit & integration tests
├── requirements.txt              # Production Python dependencies
└── README.md                     # This documentation
```

---

## 3. Quickstart Guide (Running in a Clean Environment)

### Step 3.1: Clone the Repository & Set Up Environment
```powershell
git clone https://github.com/mthajulharris-ai/SIH20162.git
cd SIH20162

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

### Step 3.2: Install Dependencies
```powershell
pip install -r requirements.txt
```

### Step 3.3: Verify Your Environment
Run the self-diagnostic verification script:
```powershell
python scripts/verify_env.py
```
*Expected Output:*
```text
=================================================================
  SIH 20162: SATELLITE DATA & ML ENVIRONMENT VERIFICATION
=================================================================
  [OK] Pandas
  [OK] NumPy
  [OK] Scikit-Learn
  [OK] Joblib
  [OK] Matplotlib
  [OK] Seaborn
  [OK] Requests
  [OK] SciPy
  [OK] GeoPy
  STATUS: ALL REQUIRED ML & DATA PACKAGES ARE OPERATIONAL!
=================================================================
```

---

## 4. How to Run the Complete Pipeline

You can run the entire pipeline with a **single command**:

```powershell
python scripts/run_pipeline.py
```

### What This Command Does:
1. **Self-Healing Check**: If no trained model exists yet, it automatically bootstraps and trains the classifier first.
2. **Ingests Satellite Data**: Scans `data/raw/` for NASA FIRMS CSV files (or automatically falls back to `data/samples/sample_firms_data.csv`).
3. **Validates & Cleans**: Removes out-of-bound coordinates, drops unphysical temperatures ($<200\text{ K}$ or $>600\text{ K}$), deduplicates observations, and normalizes confidence.
4. **Engineers Features**: Computes spatial grid clustering, multi-temporal recurrence counts, persistence ratios, and FRP anomaly $z$-scores.
5. **Classifies Every Hotspot**: Evaluates the machine learning model and assigns risk levels:
   - `Industrial Fire` $\rightarrow$ `CRITICAL`
   - `Persistent Thermal Source` $\rightarrow$ `MEDIUM`
   - `Other` $\rightarrow$ `LOW`
6. **Exports the Catalog**: Writes the processed catalog and execution summary to `data/processed/classified_satellite_hotspots.csv`.

### Running with Custom Input Files:
```powershell
# Ingest and classify a specific satellite CSV file
python scripts/run_pipeline.py --input path/to/my_satellite_data.csv --output custom_classified.csv

# Ingest and classify all CSV files in a specific folder
python scripts/run_pipeline.py --input path/to/raw_folder/
```

---

## 5. Backend Developer Integration (FastAPI)

The inference service is packaged in `src.inference`. Backend developers can import and use it directly with **zero ML boilerplate**:

```python
from src.inference import predict_thermal_observation

# Classify a satellite thermal observation
result = predict_thermal_observation({
    "brightness": 385.0,
    "bright_t31": 315.0,
    "frp": 165.0,
    "confidence_score": 0.95,
    "is_night": 0,
    "recurrence_count": 12,
    "persistence_ratio": 0.80,
    "frp_zscore": 5.10
})

print(result)
```

**Standardized Response:**
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
  "prediction_timestamp": "2026-09-09T08:45:00.123456+00:00"
}
```

> For complete Pydantic models, JSON schemas, and example FastAPI endpoints, see [`docs/BACKEND_INTEGRATION_GUIDE.md`](docs/BACKEND_INTEGRATION_GUIDE.md).

---

## 6. Running the Automated Test Suite

Run the full automated test suite containing **41 unit and integration tests**:

```powershell
python -m pytest -v
```

**Test Coverage Summary:**
- `tests/test_config.py` — Verifies directory layout and path constants.
- `tests/test_environment.py` — Validates package imports, Scikit-learn estimators, and math engines.
- `tests/test_ingestion.py` — Tests NASA FIRMS CSV parsing, validation bounds, and sensor harmonization.
- `tests/test_cleaning_pipeline.py` — Tests missing values imputation, deduplication, and quality reports.
- `tests/test_dataset_builder.py` — Tests feature engineering, prototype labeling, and **spatial leakage prevention**.
- `tests/test_ml_pipeline.py` — Tests model training, validation comparison, metric calculation, and joblib serialization.
- `tests/test_inference_service.py` — Tests backend prediction service, batch inference, and automated feature derivation.
- `tests/test_complete_pipeline.py` — Tests end-to-end execution from raw CSV to final classified catalog.

---

## 7. Key Methodology & Domain Details

1. **Why NASA FIRMS has No Native Target Labels**:
   NASA FIRMS satellites (MODIS and VIIRS) only record thermal radiance anomalies. They do not know the root cause of heat. In PS 26162, classification is achieved by calculating **multi-temporal spatial persistence** (fixed facilities emit heat continuously over months) and **radiative power surges** (anomalous FRP spikes $\ge 2.5\sigma$ indicate industrial accidents).
2. **Data Leakage Prevention**:
   Standard random train/test splitting causes catastrophic spatial leakage in satellite data (the same physical steel plant appears in both train and test). We enforce **Spatial Group Splitting** (`GroupShuffleSplit` on `spatial_cluster_id`) so geographic clusters are strictly disjoint across splits.
3. **Non-Accuracy Metric Optimization**:
   Because industrial fires are rare events, optimizing purely for accuracy is misleading. Our models are evaluated and selected based on **Macro F1-Score** and **Industrial Fire Recall** to minimize hazardous false negatives.