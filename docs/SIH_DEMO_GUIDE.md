# SIH 2026 — PS 26162: Final Demonstration & Judging Guide

**Problem Statement PS 26162**:
*AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data*

---

## Table of Contents
- [A. Prerequisites](#a-prerequisites)
- [B. Environment Setup](#b-environment-setup)
- [C. NASA FIRMS Key Setup](#c-nasa-firms-key-setup)
- [D. Backend Startup](#d-backend-startup)
- [E. Frontend Startup](#e-frontend-startup)
- [F. Database Initialization](#f-database-initialization)
- [G. Real FIRMS Workflow](#g-real-firms-workflow)
- [H. Demo / Sample Workflow](#h-demo--sample-workflow)
- [I. AI Prediction Workflow](#i-ai-prediction-workflow)
- [J. GIS Dashboard Workflow](#j-gis-dashboard-workflow)
- [K. Alert Verification Workflow](#k-alert-verification-workflow)
- [L. Analytics Workflow](#l-analytics-workflow)
- [M. CSV Export](#m-csv-export)
- [N. Troubleshooting](#n-troubleshooting)
- [O. What to Show Judges (Live Script)](#o-what-to-show-judges-live-script)
- [P. Important Scientific Disclaimer](#p-important-scientific-disclaimer)

---

## A. Prerequisites

Before starting the demonstration, verify that the following system tools are available:
- **Operating System**: Windows, Linux, or macOS.
- **Python**: Version 3.10+ (tested on Python 3.10 through 3.14).
- **Node.js**: Version 18+ and `npm`.
- **Git**: Installed and configured.
- **Web Browser**: Modern Chromium-based browser (Chrome, Edge, Brave) or Firefox.

---

## B. Environment Setup

1. **Open your terminal** in the repository root directory:
   ```powershell
   cd E:\SIH20162
   ```

2. **Activate your Python Virtual Environment**:
   ```powershell
   # Windows PowerShell:
   .\venv\Scripts\Activate.ps1
   # Or Command Prompt:
   venv\Scripts\activate.bat
   # Linux / macOS:
   source venv/bin/activate
   ```

3. **Install Python Dependencies** (if not already done):
   ```powershell
   pip install -r requirements.txt
   ```

4. **Install Frontend Dependencies**:
   ```powershell
   cd frontend
   npm install
   cd ..
   ```

5. **Verify Python Environment**:
   ```powershell
   python scripts/verify_env.py
   ```

---

## C. NASA FIRMS Key Setup

The system integrates real satellite observations directly from NASA FIRMS (VIIRS 375m & MODIS 1km).
NASA provides free Near Real-Time (NRT) API access.

1. **Obtain Key**: Visit [https://firms.modaps.eosdis.nasa.gov/api/map_key/](https://firms.modaps.eosdis.nasa.gov/api/map_key/) and register your email.
2. **Set the Key in Environment**:
   ```powershell
   # Windows PowerShell:
   $env:NASA_FIRMS_MAP_KEY = "your_actual_key_here"

   # Linux / macOS:
   export NASA_FIRMS_MAP_KEY="your_actual_key_here"
   ```
   Or place it in `.env` in the repository root:
   ```env
   NASA_FIRMS_MAP_KEY=your_actual_key_here
   ```

> [!NOTE]
> If an API key is not configured, or if offline during judging, the system gracefully falls back to the deterministic sample pipeline (`--fallback-sample` or `data/samples/`) with explicit `SAMPLE` provenance tagging.

---

## D. Backend Startup

The canonical backend is located in `backend/` (with `app/` providing backward-compatible forwarders).

Start the FastAPI application:
```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Verify backend health:
- **Health check**: `http://127.0.0.1:8000/api/v1/health`
- **Interactive Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **ReDoc Documentation**: `http://127.0.0.1:8000/redoc`

---

## E. Frontend Startup

In a separate terminal window:
```powershell
cd E:\SIH20162\frontend
npm run dev
```

Open your browser to:
**`http://127.0.0.1:5173`** (or `http://localhost:5173`)

The Vite dev server automatically proxies API requests (`/api/*` and `/api/v1/*`) to the backend running at `http://127.0.0.1:8000`.

---

## F. Database Initialization

The database is an SQLite database stored by default at:
`data/processed/thermal_detections.db`

The tables (`detections`, `alerts`) are automatically created on startup via SQLAlchemy lifecycle hooks.

To manually re-initialize or verify the database tables:
```powershell
python -c "from backend.db.init_db import init_db; init_db()"
```

---

## G. Real FIRMS Workflow

When an active internet connection and a NASA Map Key are present:

1. **Collect Real Observations**:
   ```powershell
   # Fetch recent 1-day VIIRS SNPP hotspots for Indian industrial zones:
   python scripts/collect_firms_data.py --country IND --days 1 --source VIIRS_SNPP_NRT
   ```

2. **Collect for a Specific Industrial Cluster Preset**:
   ```powershell
   python scripts/collect_firms_data.py --preset JHARKHAND_STEEL_BELT --days 1
   ```

3. **Data Provenance Check**:
   Any records collected from NASA FIRMS are tagged:
   `data_provenance = "REAL_FIRMS"`
   These records contain physical radiometry (brightness, FRP, scan/track) and are passed into Model v2 for classification.

---

## H. Demo / Sample Workflow

For offline demonstrations, judging stages without network access, or deterministic reproducibility:

1. **Ingest Curated Sample Hotspots**:
   ```powershell
   python scripts/collect_firms_data.py --fallback-sample
   ```

2. **One-Click Ingestion via UI**:
   - In the React GIS Mission Control Dashboard header, click the button:
     **"Ingest Test Hotspot"**
   - This sends a simulated industrial fire hotspot directly through `/api/v1/inference/predict-and-store`.
   - The UI immediately updates the Leaflet map with a pulsing red marker, adds a critical alert to the alert badge, and updates total telemetry.

3. **Provenance Integrity**:
   All demo records are tagged:
   `data_provenance = "SAMPLE"`
   The GIS popup clearly displays the purple `[SAMPLE]` badge.

---

## I. AI Prediction Workflow

Model v2 (`2.0.0-scientific-prototype`) runs inside `src.inference.service` with multi-temporal persistence engineering:

```python
from src.inference import predict_thermal_observation

result = predict_thermal_observation({
    "brightness": 385.0,
    "bright_t31": 305.0,
    "frp": 145.0,
    "confidence_score": 0.95,
    "is_night": 0,
    "recurrence_count": 12,
    "persistence_ratio": 0.85,
    "frp_zscore": 4.2
})
```

- **Output**:
  - `predicted_class`: `Industrial Fire` (or `Persistent Thermal Source` / `Other`)
  - `confidence`: Calibrated class probability (e.g. `0.985`)
  - `alert_level`: `CRITICAL` / `HIGH` / `MEDIUM` / `LOW`
  - `model_version`: `2.0.0-scientific-prototype`
  - `uncertainty_flag`: Attached as `"LOW_CONFIDENCE_REVIEW"` if confidence `< 0.60`.

---

## J. GIS Dashboard Workflow

Navigate to the **GIS Map** view in the dashboard:

1. **Basemap Switcher** (top right of map):
   - **Dark Canvas** (Esri Dark Neutral Canvas): Default high-contrast dark theme for night operations.
   - **Satellite Imagery** (Esri World Imagery): Photorealistic satellite basemap to visually inspect industrial plants, stacks, and vegetation.
   - **OpenStreetMap Standard**: Road network, municipal boundaries, and place names.

2. **Hotspot Markers**:
   - Red marker: `Industrial Fire` (high FRP, acute hazard).
   - Amber marker: `Persistent Thermal Source` (recurrent blast furnace, refinery flare, smelter).
   - Blue marker: `Other` (transient agricultural clearing or minor thermal anomaly).
   - Circle size scales dynamically with **Fire Radiative Power (FRP)**.

3. **Interactive Popups**:
   Click any marker to reveal complete operational telemetry:
   - Predicted Class & Confidence Score
   - Fire Radiative Power (MW) & Brightness (K)
   - Satellite Sensor & Instrument (e.g. Suomi-NPP VIIRS)
   - Acquisition Date & UTC Time
   - Data Provenance Badge (`REAL_FIRMS` vs `SAMPLE`)
   - Model Version (`2.0.0-scientific-prototype`)
   - Verification Status (`REQUIRES_VERIFICATION`, `UNDER_REVIEW`, `VERIFIED`)

4. **Map Filters**:
   - Filter by Target Class (`All`, `Industrial Fire`, `Persistent Thermal Source`, `Other`)
   - Filter by Provenance (`All`, `REAL_FIRMS`, `SAMPLE`, `PROTOTYPE_LABELLED`)
   - Filter by Severity Level (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`)

---

## K. Alert Verification Workflow

The system enforces a **Human-in-the-Loop** verification lifecycle. AI predictions are never automatically marked as ground-truth verified incidents.

1. **Alert Queue** (`/alerts` view):
   - Every anomalous detection triggers an alert with initial state:
     **`REQUIRES_VERIFICATION`**
   - Click **"Review / Verify"** on any alert row to open the operational verification modal.

2. **Status Transitions**:
   - `REQUIRES_VERIFICATION` $\rightarrow$ `UNDER_REVIEW`: Analyst acknowledges the alert, begins inspecting high-resolution satellite imagery or drone feed.
   - `UNDER_REVIEW` $\rightarrow$ `VERIFIED`: Confirmed industrial incident or verified flare emission; triggers emergency notifications.
   - `UNDER_REVIEW` $\rightarrow$ `DISMISSED`: Benign event, controlled burn, or agricultural activity.

3. **Audit Trail**:
   Reviewer notes and timestamps are saved directly to the database.

---

## L. Analytics Workflow

Navigate to the **Analytics** view:

- **Total Telemetry**: Total detections, active critical alerts, average confidence score.
- **Class Distribution**: Real breakdown of Industrial Fires vs Persistent Thermal Sources vs Others.
- **Severity Breakdown**: Count of Critical, High, Medium, and Low detections.
- **Provenance Distribution**: Clear distinction between `REAL_FIRMS` and `SAMPLE` data.
- **Empty State**: If the database is clean, the UI displays a clean "No Data" state instead of fabricated charts.

---

## M. CSV Export

Navigate to the **Historical Archive** view:

1. Filter records by date range, provenance, or predicted class.
2. Click **"Export CSV"**:
   - The frontend generates a clean RFC-4180 CSV export containing all active table records.
   - Preserves `latitude`, `longitude`, `brightness`, `frp`, `predicted_class`, `confidence`, `data_provenance`, `model_version`, and `verification_status`.

---

## N. Troubleshooting

1. **Port 8000 Already in Use**:
   ```powershell
   # Find process listening on 8000 and terminate it:
   Get-NetTCPConnection -LocalPort 8000 | Select-Object OwningProcess
   Stop-Process -Id <PID>
   ```

2. **Frontend Can't Connect to Backend**:
   - Ensure backend is running on `127.0.0.1:8000`.
   - Check `http://127.0.0.1:8000/api/v1/health` in your browser.

3. **Vite Cache or Dependencies Out of Date**:
   ```powershell
   cd frontend
   npm run build
   ```

4. **Run Backend Verification Diagnostic**:
   ```powershell
   python tests/verify_backend.py
   ```

---

## O. What to Show Judges (Live Script)

**1. Pitch & Problem (30 seconds)**:
> *"Satellites like VIIRS and MODIS detect heat across India every 3 hours, but raw NASA FIRMS data only reports radiance and coordinates—not what caused the fire. Our system solves PS 26162 by ingesting real satellite radiometry, clustering persistent industrial emitters, and classifying acute industrial fires with AI Model v2."*

**2. Architecture & NASA Integration (30 seconds)**:
> *"Show `scripts/collect_firms_data.py`. Explain how NASA's API is polled, data is cleaned, multi-temporal persistence is calculated, and strict provenance tags (`REAL_FIRMS` vs `SAMPLE`) are preserved."*

**3. Scientific Rigor & Model v2 (45 seconds)**:
> *"Show `docs/AI_MODEL_VALIDATION.md` and `scripts/train_scientific_model.py`. Explain that standard random splitting leaks spatial facilities between train and test. We used StratifiedGroupKFold on facility clusters (0 leakage) and optimized for Industrial Fire Recall and Macro F1."*

**4. Mission Control Dashboard & GIS (45 seconds)**:
> *"Show the React GIS Map. Switch basemaps (Dark Canvas to Esri Satellite). Click an Industrial Fire marker. Point out the popup details: FRP, brightness, Model v2 tag, confidence, and provenance."*

**5. Human-in-the-Loop Verification (30 seconds)**:
> *"Click 'Ingest Test Hotspot'. Point out the instant UI update. Navigate to the Alerts view. Show the `REQUIRES_VERIFICATION` status. Open the modal, update status to `UNDER_REVIEW` with analyst notes, and then to `VERIFIED`."*

**6. Analytics & Export (30 seconds)**:
> *"Show the Analytics KPIs and class distribution breakdown. Navigate to History and trigger the CSV export."*

---

## P. Important Scientific Disclaimer

> [!IMPORTANT]
> **Scientific Integrity & AI Governance Disclaimers**:
> 1. **NASA FIRMS Ground Truth**: NASA FIRMS provides satellite thermal anomaly radiometry (FRP, brightness temperature, coordinates, acquisition timestamp). **NASA FIRMS DOES NOT provide native class labels** for `Industrial Fire`, `Persistent Thermal Source`, or `Other`.
> 2. **Prototype Labeling**: In the prototype phase, training datasets are derived from physical domain heuristics (recurrence, persistence ratios, temperature differentials) and historical plant locations.
> 3. **Validation Metrics**: Reported metrics (e.g. Macro F1, Recall) represent cross-validation against the prototype benchmark. They must **not be presented as certified real-world operational accuracy**.
> 4. **Human Verification Requirement**: All satellite thermal detections and AI classifications are probabilistic advisory signals. Field verification or high-resolution imagery inspection is strictly required before taking operational or emergency actions.
