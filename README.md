# SIH 2026 — Problem Statement PS 26162
## AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Tests](https://img.shields.io/badge/tests-41%20passed-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

This repository contains the complete end-to-end platform for Smart India Hackathon (SIH) 2026 Problem Statement **PS 26162**:
**"AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data."**

The platform integrates:
1. **NASA FIRMS Satellite Data Ingestion & Preprocessing Pipeline** (MODIS & VIIRS)
2. **AI/ML Multi-Temporal Persistence & Classification Model** (Random Forest / Gradient Boosting)
3. **High-Performance FastAPI REST Backend** with SQLite Database Storage
4. **Autonomous Operational Alert Evaluation Engine**
5. **Interactive Mission-Control React GIS Dashboard** with Leaflet Maps, Live Telemetry, Filtering, and Analytics

---

## 1. System Architecture & Complete Flow

```text
[ NASA FIRMS Satellites ]
  (MODIS / VIIRS Sensor Anomaly Stream)
           │
           ▼
[ Step 1: Data Ingestion & Physical Validation ]
  (Validates Coordinate Bounds [-90,90], [-180,180] & Thermal Sanity 200K-600K)
           │
           ▼
[ Step 2: Multi-Temporal Feature Engineering ]
  (Spatial Clustering 0.05° grid, Persistence Ratios, Recurrence, FRP Z-Scores)
           │
           ▼
[ Step 3: AI / ML Classification ]
  (Classifies into: Industrial Fire / Persistent Thermal Source / Other)
           │
           ▼
[ Step 4: FastAPI Ingestion Router ] (POST /api/v1/inference/predict-and-store)
  (Enforces strict Pydantic schemas, handles decoupled inference gracefully)
           │
           ▼
[ Step 5: SQLite Database Persistence ]
  (Stores detections with composite indices on (acq_date, source, predicted_class))
           │
           ▼
[ Step 6: Operational Alert Evaluation Engine ]
  (Classifies risk levels: CRITICAL / HIGH / MEDIUM; flags as "REQUIRES_VERIFICATION")
           │
           ▼
[ Step 7: REST API Endpoints ]
  (GET /detections, GET /alerts, GET /analytics, PATCH /alerts/{id}/status)
           │
           ▼
[ Step 8: React GIS Mission-Control Dashboard ]
  (Interactive Leaflet Map with CartoDB/Esri basemaps, FRP-scaled circle markers,
   Live telemetry filtering, Alert review modal, Real-time analytics charts)
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
│   ├── raw/                      # Raw satellite CSV observations
│   ├── processed/                # Classified CSV catalogs and SQLite database
│   └── samples/                  # Curated sample satellite data
├── docs/
│   ├── API_DOCUMENTATION.md      # Detailed REST API specification with sample payloads
│   └── BACKEND_INTEGRATION_GUIDE.md # ML inference integration guide
├── models/saved_models/          # Serialized scikit-learn model and metadata
├── src/                          # Data pipeline & ML training engine
│   ├── data_pipeline/            # Ingestion, validation, cleaning, feature engineering
│   ├── ml/                       # Model training, spatial group split, evaluation
│   └── inference/                # Core ML inference service
├── tests/                        # Automated unit, API, and end-to-end integration tests
├── .env.example                  # Environment configuration template
├── requirements.txt              # Backend & ML Python dependencies
└── README.md                     # Platform documentation
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

> For complete Pydantic models, JSON schemas, and example FastAPI endpoints, see [`docs/BACKEND_INTEGRATION_GUIDE.md`](docs/BACKEND_INTEGRATION_GUIDE.md) and [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md).

---

## 6. Running the FastAPI Backend Locally

The FastAPI application serves REST endpoints for live thermal detections, ML inference, alert queues, and aggregated telemetry.

### Step 6.1: Environment Configuration
Copy `.env.example` to create your local `.env`:
```powershell
cp .env.example .env
```
Default configuration points to a local SQLite database: `sqlite:///./data/processed/thermal_detections.db`.

### Step 6.2: Start the FastAPI Server
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

## 7. Running the React + Leaflet GIS Dashboard

The dashboard provides an interactive mission-control interface featuring dynamic Leaflet GIS visualization, active filters, alert triage modals, and live analytics.

### Step 7.1: Install Dependencies
```powershell
cd frontend
npm install
```

### Step 7.2: Start the Development Server
```powershell
npm run dev
```
The Vite development server will start at `http://localhost:5173/` (with automatic API proxy forwarding `/api` and `/api/v1` to `http://127.0.0.1:8000`).

### Step 7.3: Build for Production
To generate an optimized client bundle:
```powershell
npm run build
```
Assets will be generated in `frontend/dist/`.

---

## 8. End-to-End Operational Pipeline Flow

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

## 9. Running the Automated Test Suite

The repository contains comprehensive unit, API, and end-to-end integration tests:

```powershell
# Run complete test suite
python -m pytest -v

# Run backend API and end-to-end integration tests
python -m pytest tests/test_api_health.py tests/test_api_detections.py tests/test_api_inference.py tests/test_api_alerts.py tests/test_api_analytics.py tests/test_database.py tests/test_end_to_end_pipeline.py -v
```

### Test Coverage Highlights:
- **ML & Data Pipeline Tests** (`tests/test_*.py`): Coordinate bounds, temporal feature engineering, spatial group split validation, and model serialization.
- **Backend API Tests** (`tests/test_api_*.py`): Validation schemas, spatial bounding box queries, decoupled ML fallback handling, alert lifecycle state transitions, and real-time analytics aggregation.
- **End-to-End Integration Test** (`tests/test_end_to_end_pipeline.py`): Ingests raw satellite observation $\rightarrow$ executes ML inference $\rightarrow$ stores in database $\rightarrow$ queries spatial GIS API $\rightarrow$ evaluates operational alert $\rightarrow$ mutates human verification status $\rightarrow$ verifies live analytics.

---

## 10. Operational Verification & AI Governance
 
> [!IMPORTANT]
> **Safety & AI Governance Policy**:
> 1. All thermal detections and classification outputs are **AI-Generated Probabilistic Predictions**, not ground-truth verified incidents.
> 2. **Data Provenance Categories**:
>    - **`REAL_FIRMS`**: Live satellite observations acquired from NASA FIRMS (VIIRS 375m & MODIS 1km) containing physical sensor radiance anomalies (brightness temperature, FRP) without native ground-truth labels.
>    - **`PROTOTYPE_LABELLED`**: Benchmark calibration dataset curated from spatially clustered thermal hotspots and historical plant coordinates.
>    - **`SAMPLE`**: Synthetic demonstration observations (prefixed `SAMPLE_TEST_*` or `DEMO_*`) used for pipeline verification and UI testing. They must never be represented as real-world industrial accidents.
> 3. **AI Classification Model v2 (`2.0.0-scientific-prototype`)**:
>    - Incorporates multi-temporal persistence ratios, diurnal variation, and FRP density z-scores.
>    - Fallback compatibility with baseline model (`1.0.0-baseline`) preserved.
> 4. **Model Uncertainty Handling**:
>    - Model probability is not interpreted as ground truth.
>    - Detections with prediction confidence `< 0.60` automatically trigger a **`LOW_CONFIDENCE_REVIEW`** operational alert level, indicating model uncertainty requiring manual review.
> 5. **Human-in-the-Loop Verification Lifecycle**:
>    - AI predictions are never automatically marked as `VERIFIED`.
>    - Initial state: `REQUIRES_VERIFICATION`.
>    - Operational review: `UNDER_REVIEW` (inspection dispatched).
>    - Final resolution: `VERIFIED` (confirmed on field) or `DISMISSED` (benign / controlled flaring).
> 6. The React GIS dashboard and REST APIs explicitly display `"Requires Verification"` notices and provenance badges to maintain complete situational awareness and operational safety.


---

## 11. Key Methodology & Domain Details

1. **Why NASA FIRMS has No Native Target Labels**:
   NASA FIRMS satellites (MODIS and VIIRS) only record thermal radiance anomalies. They do not know the root cause of heat. In PS 26162, classification is achieved by calculating **multi-temporal spatial persistence** (fixed facilities emit heat continuously over months) and **radiative power surges** (anomalous FRP spikes $\ge 2.5\sigma$ indicate industrial accidents).
2. **Data Leakage Prevention**:
   Standard random train/test splitting causes catastrophic spatial leakage in satellite data (the same physical steel plant appears in both train and test). We enforce **Spatial Group Splitting** (`GroupShuffleSplit` on `spatial_cluster_id`) so geographic clusters are strictly disjoint across splits.
3. **Non-Accuracy Metric Optimization**:
   Because industrial fires are rare events, optimizing purely for accuracy is misleading. Our models are evaluated and selected based on **Macro F1-Score** and **Industrial Fire Recall** to minimize hazardous false negatives.