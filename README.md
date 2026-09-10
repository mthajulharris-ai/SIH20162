# SIH 2026 — Problem Statement PS 26162
## AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Tests](https://img.shields.io/badge/tests-113%20passed-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

This repository contains the complete end-to-end platform for Smart India Hackathon (SIH) 2026 Problem Statement **PS 26162**:
**"AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data."**

The platform integrates:
1. **NASA FIRMS Real Satellite Data Ingestion & Preprocessing Pipeline** (VIIRS & MODIS)
2. **Strict Data Provenance Tracking** (`REAL_FIRMS`, `SAMPLE`, `PROTOTYPE_LABELLED`)
3. **AI/ML Multi-Temporal Persistence & Classification Model** (Random Forest / Gradient Boosting)
4. **High-Performance FastAPI REST Backend** with SQLite Database Storage
5. **Autonomous Operational Alert Evaluation Engine**
6. **Interactive Mission-Control React GIS Dashboard** with Leaflet Maps, Live Telemetry, Filtering, and Analytics

---

## 1. System Architecture & Complete Flow

```text
[ Real NASA FIRMS Satellites ] ──── (VIIRS 375m: SNPP, NOAA-20/21 | MODIS 1km: Terra, Aqua)
           │
           ▼
[ Phase 2A: NASA FIRMS Collector ] (FirmsDataCollector: country, bounding box, presets)
           │
           ├──▶ Raw Untouched Storage: data/raw/raw_firms_[source]_[id]_[date]_[ts].csv
           ▼
[ Phase 2B & 2C: Validation, Cleaning & Provenance ] (REAL_FIRMS / SAMPLE / PROTOTYPE_LABELLED)
  (Enforces coordinate bounds [-90,90], [-180,180], 200K-600K physical Kelvin, multi-pass dedup)
           │
           ▼
[ Multi-Temporal Feature Engineering ]
  (0.01° grid clustering, active day counts, persistence ratios, FRP z-scores, diurnal cycle)
           │
           ▼
[ Trained AI/ML Classifier ]
  (Predicts: Industrial Fire [CRITICAL] / Persistent Thermal Source [MEDIUM] / Other [LOW])
           │
           ▼
[ Classified Hotspot Catalog ] ──── data/processed/classified_satellite_hotspots.csv
           │
           ▼
[ FastAPI Backend Ingestion Router ] (POST /api/v1/inference/predict-and-store)
           │
           ▼
[ SQLite Persistence & Operational Alerts ] (REQUIRES_VERIFICATION triage)
           │
           ▼
[ React GIS Mission-Control Dashboard ] (Live Leaflet map, telemetry, alerts, analytics)
```

---

## 2. Directory Structure

```text
SIH20162/
├── app/                          # FastAPI Backend Architecture
│   ├── api/v1/
│   │   ├── endpoints/
│   │   │   ├── health.py         # System health check (/api/health, /api/v1/health)
│   │   │   ├── detections.py     # Hotspot query, pagination, spatial bounds filtering
│   │   │   ├── inference.py      # Predict-and-store end-to-end ML ingestion API
│   │   │   ├── alerts.py         # Alert queue & human-in-the-loop status management
│   │   │   └── analytics.py      # Live aggregated metrics & regional distribution
│   │   └── router.py             # Consolidated API router
│   ├── core/
│   │   └── config.py             # Pydantic Settings & environment variables
│   ├── db/
│   │   ├── base.py               # Declarative SQLAlchemy Base
│   │   ├── session.py            # SQLite engine & database session generator
│   │   └── init_db.py            # Automated table creation
│   ├── models/
│   │   ├── detection.py          # Detection ORM model
│   │   └── alert.py              # Operational Alert ORM model
│   ├── schemas/
│   │   ├── detection.py          # Detection Pydantic request/response schemas
│   │   ├── observation.py        # Raw satellite observation input schema
│   │   └── alert.py              # Alert response and status update schemas
│   ├── services/
│   │   ├── ml_service.py         # Decoupled ML inference adapter with fallback handling
│   │   └── alert_service.py      # Automated alert generation and triage logic
│   └── main.py                   # FastAPI application initialization and CORS
├── frontend/                     # Modern React + Vite GIS Web Application
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx        # Telemetry header with UTC clock and test hotspot ingest
│   │   │   ├── Sidebar.jsx       # Navigation panel with live alert count badge
│   │   │   ├── KpiCard.jsx       # High-contrast metric telemetry card
│   │   │   └── StatusBadge.jsx   # Standardized status and class indicators
│   │   ├── views/
│   │   │   ├── OverviewView.jsx  # System health, top KPIs, quick triage stream
│   │   │   ├── GisMapView.jsx    # Leaflet map with multi-basemap, FRP markers, popups
│   │   │   ├── DetectionsView.jsx# Paginated table with text search & multi-filter
│   │   │   ├── AlertsView.jsx    # Alert management queue with status lifecycle modal
│   │   │   ├── AnalyticsView.jsx # Live database statistics, class breakdown, time trends
│   │   │   └── HistoryView.jsx   # Archive view with CSV export
│   │   ├── services/
│   │   │   └── api.js            # Frontend REST client with error handling
│   │   ├── App.jsx               # Main state container, polling & view routing
│   │   └── index.css             # Dark-themed Mission Control styling
│   ├── package.json              # Frontend npm dependencies (React 19, Leaflet, Lucide)
│   └── vite.config.js            # Vite configuration with backend proxy
├── data/
│   ├── raw/                      # Raw, unmutated NASA satellite CSV downloads
│   ├── processed/                # Sanitized datasets, ML training splits, classified catalogs
│   └── samples/                  # Curated development sample datasets
├── docs/
│   ├── API_DOCUMENTATION.md      # Detailed REST API specification with sample payloads
│   ├── BACKEND_INTEGRATION_GUIDE.md # ML inference integration guide
│   └── NASA_FIRMS_INTEGRATION.md # Complete NASA FIRMS collector and provenance guide
├── models/saved_models/          # Serialized scikit-learn model and metadata
├── src/                          # Data pipeline & ML training engine
│   ├── config.py                 # Central configurations, sensor products, provenance tags
│   ├── data_pipeline/            # Collector, validator, cleaner, preprocessor, features
│   ├── ml/                       # Model training, spatial group split, evaluation
│   └── inference/                # Core ML inference service
├── scripts/                      # CLI automation scripts
│   ├── collect_firms_data.py     # Live NASA FIRMS collection & ML update command
│   ├── fetch_satellite_data.py   # Dedicated satellite data collector CLI
│   ├── run_pipeline.py           # Complete end-to-end pipeline runner
│   ├── train_baseline.py         # Baseline model training script
│   └── verify_env.py             # Environment sanity check
├── tests/                        # Automated unit, API, ML, and integration tests (103 tests)
├── .env.example                  # Environment configuration template
├── requirements.txt              # Backend & ML Python dependencies
└── README.md                     # Platform documentation
```

---

## 3. NASA FIRMS Real Satellite Data Integration (Phase 2)

### 3.1 Obtaining and Configuring NASA FIRMS API Credentials
NASA provides free Near Real-Time (NRT) satellite thermal data via the **Fire Information for Resource Management System (FIRMS) API**:

1. **Obtain your free NASA Map Key**:
   Visit [https://firms.modaps.eosdis.nasa.gov/api/map_key/](https://firms.modaps.eosdis.nasa.gov/api/map_key/) and submit your email. You will receive an immediate free MAP_KEY.
2. **Configure credentials via environment variable**:
   ```powershell
   # Windows PowerShell:
   $env:NASA_FIRMS_MAP_KEY="your_nasa_firms_map_key_here"

   # Linux / macOS:
   export NASA_FIRMS_MAP_KEY="your_nasa_firms_map_key_here"
   ```
   Alternatively, add it directly to your `.env` file:
   ```env
   NASA_FIRMS_MAP_KEY=your_nasa_firms_map_key_here
   ```
   > [!IMPORTANT]
   > API keys are **NEVER hardcoded** in source code. If no key is set, the system safely operates in dry-run/fallback mode using sample archives.

### 3.2 Supported Satellite Sensors
The collector prioritizes high-resolution VIIRS sensors and extends to MODIS:
- `VIIRS_SNPP_NRT`: Suomi NPP VIIRS (375m spatial resolution, Near Real-Time) - **Default**
- `VIIRS_NOAA20_NRT`: NOAA-20 VIIRS (375m spatial resolution, Near Real-Time)
- `VIIRS_NOAA21_NRT`: NOAA-21 VIIRS (375m spatial resolution, Near Real-Time)
- `MODIS_NRT`: Terra/Aqua MODIS (1km spatial resolution, Near Real-Time)

### 3.3 Running Real Data Collection & Automatic Updates
Two scheduler-ready CLI tools are available:

```powershell
# 1. Check status and existing archives:
python scripts/collect_firms_data.py --status

# 2. Collect live VIIRS observations for India and execute AI classification:
python scripts/collect_firms_data.py --country IND --days 1 --source VIIRS_SNPP_NRT

# 3. Collect for a major Indian industrial cluster preset:
python scripts/collect_firms_data.py --preset JHARKHAND_STEEL_BELT --days 1

# 4. Dry-run fallback mode (ideal when no API key is available):
python scripts/collect_firms_data.py --fallback-sample
```

**Supported Industrial Cluster Presets**:
- `JHARKHAND_STEEL_BELT`: Jamshedpur, Bokaro, Dhanbad (`[84.5, 22.0, 87.0, 24.5]`)
- `CHHATTISGARH_METALLURGY`: Bhilai, Durg, Korba (`[80.5, 20.5, 83.5, 23.0]`)
- `SINGRAULI_ENERGY_BELT`: Thermal Power & Coal Cluster (`[82.0, 23.5, 83.5, 24.5]`)
- `GUJARAT_PETROCHEMICAL`: Jamnagar, Dahej, Ankleshwar (`[69.0, 21.0, 73.5, 23.5]`)
- `ODISHA_MINERAL_BELT`: Rourkela, Angul, Kalinganagar (`[84.0, 20.0, 86.5, 22.5]`)
- `ALL_INDIA`: Indian Subcontinent (`[68.0, 6.5, 97.5, 37.0]`)

### 3.4 Data Provenance Rules & Label Hierarchy
To prevent data contamination and maintain scientific integrity, every observation record carries an explicit `data_provenance` attribute:

| Provenance Label | Source & Description | Ground Truth Status |
| :--- | :--- | :--- |
| `REAL_FIRMS` | Live or archived observations downloaded directly from NASA FIRMS API. | **Unlabeled Radiometry**. Contains physical satellite radiometry (brightness, FRP, coordinates). Does NOT contain ground-truth class labels. |
| `SAMPLE` | Curated development dataset stored in `data/samples/`. | **Synthetic / Demo Data**. Used for offline development and self-healing environment bootstraps. |
| `PROTOTYPE_LABELLED` | Dataset generated by `dataset_builder.py` using physical heuristics. | **Prototype Heuristic Labels**. Used exclusively for training the baseline classifier. Never presented as real-world field truth. |

> [!CAUTION]
> **Fundamental Scientific Limitation**:
> NASA FIRMS provides satellite thermal anomaly radiometry (FRP, brightness temperature, coordinates, acquisition timestamp). **NASA FIRMS DOES NOT provide class labels** for `Industrial Fire`, `Persistent Thermal Source`, or `Other`.
> Any classification into these target categories is produced by our trained AI/ML persistence pipeline, **never by NASA FIRMS itself**. Real FIRMS observations are strictly labeled `data_provenance = "REAL_FIRMS"`.

### 3.5 Safe Multi-Temporal Duplicate Handling
Satellite instruments observe the same geographic location during separate orbital passes:
- **Same Satellite Pass Duplicates**: Identical coordinates (rounded to 4 decimals ~11m) with the **exact same timestamp and satellite** are dropped as sensor duplicates.
- **Multi-Temporal Recurring Passes**: Hotspots occurring at the same industrial complex on **different timestamps or dates are strictly preserved**. These recurrent thermal signatures provide the vital multi-temporal evidence required to classify persistent 24/7 industrial thermal emitters.

---

## 4. Scientific AI/ML Validation & Model Improvement (Phase 3)

### 4.1 Objective & Scientific Architecture
Phase 3 establishes scientific rigor, leakage prevention, and principled model selection across spaceborne thermal observations:
- **Model Version**: `2.0.0-scientific-prototype` (with seamless automatic fallback to `1.0.0-baseline`).
- **Target Classes**: `Industrial Fire` (acute hazard), `Persistent Thermal Source` (industrial flaring/smelting), and `Other` (agricultural/transient).
- **Rule-Traceable Heuristic Engine**: Dataset generator records explicit rule rationales (`label_rationale`) for full auditing.
- **Detailed Scientific Report**: Complete 16-section methodology, physical radiation laws, error breakdown, and validation roadmap in [`docs/AI_MODEL_VALIDATION.md`](docs/AI_MODEL_VALIDATION.md).

### 4.2 Spatial Leakage Prevention (`StratifiedGroupKFold`)
Random train/test splitting on satellite data causes severe spatial autocorrelation leakage (the same physical plant appears in both sets).
We enforce **Spatial Group Partitioning** grouped by DBSCAN `spatial_cluster_id` (~500m radius):
- **Spatial Clusters**: 34 unique geographic clusters across 60 samples.
- **Leakage Verification**:
  $$\text{Overlap}(\text{Train}, \text{Val}) = 0 \text{ clusters} \quad \text{Overlap}(\text{Train}, \text{Test}) = 0 \text{ clusters}$$
- **Result**: Zero data leakage between training, validation, and holdout test sets.

### 4.3 Candidate Model Evaluation & Selection
Candidates evaluated using 4-fold Stratified Group Cross-Validation on out-of-cluster generalization:

| Model Candidate | 4-Fold CV Macro F1 | 4-Fold CV IF Recall | Test Macro F1 | Test IF Recall | Test Accuracy | Status |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Logistic Regression (L2, Balanced)** | **0.8175** | **0.8125** | **0.8000** | **1.0000** | **0.7500** | **Selected (v2.0.0)** |
| **Random Forest (Balanced, max_depth=6)** | 0.7762 | 0.7500 | 0.6389 | 1.0000 | 0.6667 | Baseline Preserved |
| **HistGradientBoosting (Balanced)** | 0.7383 | 0.7500 | 0.5278 | 1.0000 | 0.5833 | Evaluated Candidate |

*Regularized Logistic Regression achieved superior generalization across unseen clusters, 100% Industrial Fire recall, and well-calibrated probabilities.*

### 4.4 Uncertainty Quantification & Low Confidence Review
When model prediction confidence is $< 0.60$, the inference service attaches an `"uncertainty_flag": "LOW_CONFIDENCE_REVIEW"` to alert human analysts in the GIS dashboard without disrupting downstream API schemas.

### 4.5 Reproducible Retraining Script
```powershell
python scripts/train_scientific_model.py
```

---

## 5. Quickstart Guide (Running in a Clean Environment)

### Step 5.1: Clone the Repository & Set Up Environment
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

### Step 5.2: Install Dependencies
```powershell
pip install -r requirements.txt
```

### Step 5.3: Verify Your Environment
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

## 6. How to Run the Complete Pipeline

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

## 7. Backend Developer Integration (FastAPI)

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
  "uncertainty_flag": null,
  "model_version": "2.0.0-scientific-prototype",
  "prediction_timestamp": "2026-09-10T08:45:00.123456+00:00"
}
```

> For complete Pydantic models, JSON schemas, and example FastAPI endpoints, see [`docs/BACKEND_INTEGRATION_GUIDE.md`](docs/BACKEND_INTEGRATION_GUIDE.md) and [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md).

---

## 8. Running the FastAPI Backend Locally

The FastAPI application serves REST endpoints for live thermal detections, ML inference, alert queues, and aggregated telemetry.

### Step 8.1: Environment Configuration
Copy `.env.example` to create your local `.env`:
```powershell
cp .env.example .env
```
Default configuration points to a local SQLite database: `sqlite:///./data/processed/thermal_detections.db`.

### Step 8.2: Start the FastAPI Server
```powershell
# Using the canonical backend package:
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# Or via backward-compatible forwarder:
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Backend API Base**: `http://127.0.0.1:8000`
- **Interactive Swagger UI**: `http://127.0.0.1:8000/docs`
- **ReDoc Interactive Spec**: `http://127.0.0.1:8000/redoc`
- **System Health Check**: `http://127.0.0.1:8000/api/health`

On startup, FastAPI automatically executes database table provisioning via SQLAlchemy lifecycle hooks.

---

## 9. Running the React + Leaflet GIS Dashboard

The dashboard provides an interactive mission-control interface featuring dynamic Leaflet GIS visualization, active filters, alert triage modals, and live analytics.

### Step 9.1: Install Dependencies
```powershell
cd frontend
npm install
```

### Step 9.2: Start the Development Server
```powershell
npm run dev
```
The Vite development server will start at `http://localhost:5173/` (with automatic API proxy forwarding `/api` and `/api/v1` to `http://127.0.0.1:8000`).

### Step 9.3: Build for Production
To generate an optimized client bundle:
```powershell
npm run build
```
Assets will be generated in `frontend/dist/`.

---

## 10. End-to-End Operational Pipeline Flow

To test the entire integrated pipeline with a single test satellite observation:

1. **Ingest via API**:
```powershell
curl -X POST "http://127.0.0.1:8000/api/v1/inference/predict-and-store" ^
     -H "Content-Type: application/json" ^
     -d "{\"latitude\": 21.1702, \"longitude\": 72.8311, \"brightness\": 385.0, \"bright_t31\": 310.0, \"frp\": 85.0, \"confidence\": \"high\", \"source\": \"VIIRS_SNPP_NRT\"}"
```
*Or simply click **"Ingest Test Hotspot"** directly on the React Dashboard Header!*

2. **Automatic Lifecycle Triggered**:
   - **Validation**: Coordinates and physical radiance values verified.
   - **ML Inference**: `predict_thermal_observation()` classifies event (`Industrial Fire`).
   - **Persistence**: Saved to SQLite `detections` table with timestamp and spatial indices.
   - **Alert Evaluation**: Rule engine creates a `CRITICAL` alert flagged as `REQUIRES_VERIFICATION`.
   - **Frontend GIS**: Leaflet map dynamically places an FRP-scaled marker; Alerts tab increments badge count; Analytics dashboard updates aggregate totals in real time.

---

## 11. Running the Automated Test Suite

The repository contains comprehensive unit, API, ML, and end-to-end integration tests (113 passing tests):

```powershell
# Run complete test suite (113 tests)
python -m pytest -v

# Run Phase 3 scientific validation suite specifically
python -m pytest tests/test_scientific_validation.py -v

# Run NASA FIRMS live collector and integration tests
python -m pytest tests/test_firms_integration.py -v

# Run backend API and end-to-end integration tests
python -m pytest tests/test_api_health.py tests/test_api_detections.py tests/test_api_inference.py tests/test_api_alerts.py tests/test_api_analytics.py tests/test_database.py tests/test_end_to_end_pipeline.py -v

# Run comprehensive backend verification script
python tests/verify_backend.py
```

### Test Coverage Highlights:
- **Phase 3 Scientific Validation** (`tests/test_scientific_validation.py`): Provenance strict separation, spatial leakage prevention (0 cluster overlap), rule traceability, feature matrix completeness, candidate model cross-validation, Model v2 serialization & metadata, inference contract stability, uncertainty quantification flags, and backward compatibility with v1.
- **NASA FIRMS Collector & Integration** (`tests/test_firms_integration.py`, `tests/test_data_collection.py`): Configuration detection, missing key handling, HTTP 403/429/503 errors, empty/malformed responses, raw file isolation, provenance tagging, multi-temporal duplicate safety, and end-to-end pipeline compatibility.
- **ML & Data Pipeline Tests** (`tests/test_*.py`): Coordinate bounds, temporal feature engineering, spatial group split validation, and model serialization.
- **Backend API Tests** (`tests/test_api_*.py`): Validation schemas, spatial bounding box queries, decoupled ML fallback handling, alert lifecycle state transitions, and real-time analytics aggregation.
- **End-to-End Integration Test** (`tests/test_end_to_end_pipeline.py`): Ingests raw satellite observation $\rightarrow$ executes ML inference $\rightarrow$ stores in database $\rightarrow$ queries spatial GIS API $\rightarrow$ evaluates operational alert $\rightarrow$ mutates human verification status $\rightarrow$ verifies live analytics.

---

## 12. Operational Verification & AI Governance

> [!IMPORTANT]
> **Safety & AI Governance Policy**:
> 1. All thermal detections and classification outputs are **AI-Generated Probabilistic Predictions**, not ground-truth verified incidents.
> 2. **Data Provenance Categories**:
>    - **`REAL_FIRMS`**: Live or archived satellite observations acquired from NASA FIRMS (VIIRS 375m & MODIS 1km) containing physical sensor radiance anomalies (brightness temperature, FRP) without native ground-truth labels.
>    - **`PROTOTYPE_LABELLED`**: Benchmark calibration dataset curated from spatially clustered thermal hotspots and historical plant coordinates.
>    - **`SAMPLE`**: Synthetic demonstration observations (prefixed `SAMPLE_TEST_*` or `DEMO_*`) used for pipeline verification and UI testing. They must never be represented as real-world industrial accidents.
> 3. **AI Classification Model v2 (`2.0.0-scientific-prototype`)**:
>    - Incorporates multi-temporal persistence ratios, diurnal variation, and FRP density z-scores.
>    - Fallback compatibility with baseline model (`1.0.0-baseline`) preserved.
>    - **Prototype Accuracy Disclaimer**: Model evaluation metrics reflect cross-validation over prototype datasets and must not be claimed as certified real-world operational accuracy.
> 4. **Model Uncertainty Handling**:
>    - Model probability is not interpreted as ground truth.
>    - Detections with prediction confidence `< 0.60` automatically trigger a **`LOW_CONFIDENCE_REVIEW`** operational alert level, indicating model uncertainty requiring manual review.
> 5. **Human-in-the-Loop Verification Lifecycle**:
>    - AI predictions are never automatically marked as `VERIFIED`.
>    - Initial state: `REQUIRES_VERIFICATION`.
>    - Operational review: `UNDER_REVIEW` (human analyst assigned or field drone dispatched).
>    - Final resolution: `VERIFIED` (ground truth confirmed by field inspection) or `DISMISSED` (benign / controlled flaring).
> 6. The React GIS dashboard and REST APIs explicitly display `"Requires Verification"` notices and provenance badges to maintain complete situational awareness and prevent operational overreaction.

---

## 13. Key Methodology & Domain Details

1. **Why NASA FIRMS has No Native Target Labels**:
   NASA FIRMS satellites (MODIS and VIIRS) only record thermal radiance anomalies. They do not know the root cause of heat. In PS 26162, classification is achieved by calculating **multi-temporal spatial persistence** (fixed facilities emit heat continuously over months) and **radiative power surges** (anomalous FRP spikes $\ge 2.5\sigma$ indicate industrial accidents).
2. **Data Leakage Prevention**:
   Standard random train/test splitting causes catastrophic spatial leakage in satellite data (the same physical steel plant appears in both train and test). We enforce **Spatial Group Splitting** (`GroupShuffleSplit` on `spatial_cluster_id`) so geographic clusters are strictly disjoint across splits.
3. **Non-Accuracy Metric Optimization**:
   Because industrial fires are rare events, optimizing purely for accuracy is misleading. Our models are evaluated and selected based on **Macro F1-Score** and **Industrial Fire Recall** to minimize hazardous false negatives.
