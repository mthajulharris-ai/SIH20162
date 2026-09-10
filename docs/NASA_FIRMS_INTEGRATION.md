# NASA FIRMS Real Satellite Data Integration Specification

**SIH 2026 PS 26162**: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data

---

## 1. NASA FIRMS API Architecture

The platform directly interfaces with the **NASA Fire Information for Resource Management System (FIRMS)** REST API to stream near-real-time satellite thermal anomaly detections.

```
[ NASA Earthdata Cloud / FIRMS API ]
   │
   │  HTTPS GET /api/{mode}/csv/{MAP_KEY}/{SOURCE}/{TARGET}/{DAY_RANGE}/{DATE}
   ▼
[ src.data_pipeline.collector.FirmsDataCollector ]
   │
   ├──▶ 1. Status Code & Payload Validation (403, 429, 500/503, HTML detection)
   ├──▶ 2. Empty Response Interception (0 fire detections handled cleanly)
   ├──▶ 3. Unaltered Raw Disk Persistence: data/raw/raw_firms_{source}_{id}_{date}_{ts}.csv
   └──▶ 4. Provenance Tagging: data_provenance = "REAL_FIRMS"
   │
   ▼
[ Existing Data + AI Pipeline ]
   │
   ├──▶ Schema & Physical Validation (validator.py)
   ├──▶ Sanitization & Multi-Pass Dedup (cleaner.py / preprocessor.py)
   ├──▶ Multi-Temporal Persistence Feature Engineering (feature_engineering.py)
   ├──▶ Scikit-Learn Model Prediction & Alert Assignment (inference.py)
   └──▶ Classified Hotspot Catalog Export (data/processed/classified_satellite_hotspots.csv)
```

---

## 2. API Credentials & Configuration

### Obtaining a NASA MAP_KEY
NASA provides free API keys to all registered academic, governmental, and private developers:
1. Visit [https://firms.modaps.eosdis.nasa.gov/api/map_key/](https://firms.modaps.eosdis.nasa.gov/api/map_key/).
2. Submit your email address.
3. NASA will immediately email your personalized 32-character hexadecimal `MAP_KEY`.

### Security Best Practices
- **Never hardcode credentials** in Python source files or commit them to Git.
- Export as an environment variable:
  ```powershell
  # Windows PowerShell
  $env:NASA_FIRMS_MAP_KEY="your_api_key"

  # Linux / macOS
  export NASA_FIRMS_MAP_KEY="your_api_key"
  ```
- Or maintain a local `.env` file (which is git-ignored):
  ```env
  NASA_FIRMS_MAP_KEY=your_api_key
  ```

---

## 3. Supported Satellite Sensor Sources

| Product Code | Instrument & Platform | Spatial Resolution | Orbit / Coverage | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| `VIIRS_SNPP_NRT` | VIIRS on Suomi NPP | **375 meters** | Sun-synchronous Polar | **Default**: Exceptional sensitivity to small/sub-pixel industrial combustion. |
| `VIIRS_NOAA20_NRT` | VIIRS on NOAA-20 (JPSS-1) | **375 meters** | Sun-synchronous Polar | High-frequency secondary coverage ~50 minutes offset from S-NPP. |
| `VIIRS_NOAA21_NRT` | VIIRS on NOAA-21 (JPSS-2) | **375 meters** | Sun-synchronous Polar | Next-generation constellation coverage. |
| `MODIS_NRT` | MODIS on Terra & Aqua | **1000 meters (1 km)** | Sun-synchronous Polar | Long-term historical consistency and baseline cross-validation. |

---

## 4. Query Types & Industrial Presets

### Country-Level Queries
Retrieves all satellite thermal detections for an ISO 3166-1 alpha-3 country:
```powershell
python scripts/collect_firms_data.py --country IND --days 1 --source VIIRS_SNPP_NRT
```

### Industrial Belt Bounding Box Presets
Presets allow focused monitoring of India's major heavy-industry and petrochemical corridors:

| Preset Name | Geographic Area | Bounding Box `[min_lon, min_lat, max_lon, max_lat]` |
| :--- | :--- | :--- |
| `JHARKHAND_STEEL_BELT` | Jamshedpur, Bokaro, Dhanbad, Ramgarh | `84.5, 22.0, 87.0, 24.5` |
| `CHHATTISGARH_METALLURGY` | Bhilai, Durg, Raipur, Korba | `80.5, 20.5, 83.5, 23.0` |
| `SINGRAULI_ENERGY_BELT` | Singrauli Thermal Power & Coal Basin | `82.0, 23.5, 83.5, 24.5` |
| `GUJARAT_PETROCHEMICAL` | Jamnagar Refineries, Dahej, Ankleshwar | `69.0, 21.0, 73.5, 23.5` |
| `ODISHA_MINERAL_BELT` | Rourkela, Angul, Kalinganagar Steel Belt | `84.0, 20.0, 86.5, 22.5` |
| `ALL_INDIA` | Complete Indian Subcontinent | `68.0, 6.5, 97.5, 37.0` |

Usage:
```powershell
python scripts/collect_firms_data.py --preset JHARKHAND_STEEL_BELT --days 1
```

---

## 5. Data Provenance Rules

Every observation row flowing through the system carries a mandatory `data_provenance` metadata field:

1. **`REAL_FIRMS`**:
   - Applies to all observations acquired from live NASA FIRMS endpoints or loaded from `data/raw/raw_firms_*.csv`.
   - Represents physical, instrument-detected thermal anomalies.
   - **Crucial Scientific Rule**: Real FIRMS observations are **unlabeled**. They must never be represented as human ground truth.
2. **`SAMPLE`**:
   - Applies to the curated offline sample files under `data/samples/`.
   - Used for zero-dependency development, unit testing, and self-healing bootstrap demonstrations.
3. **`PROTOTYPE_LABELLED`**:
   - Applies to datasets produced by `dataset_builder.py` where physical heuristic labels (`assign_prototype_labels`) are synthesized.
   - Used exclusively for training and evaluating machine learning baseline models.

---

## 6. Multi-Temporal Duplicate & Recurrence Handling

Satellite observations have distinct temporal behaviors:
- **Same Satellite Pass Sensor Duplicates**: Detections at the identical rounded coordinate ($\sim 11\text{ m}$) from the same satellite on the **exact same timestamp** are dropped during cleaning.
- **Multi-Temporal Recurring Passes**: Detections at the same facility occurring on **different orbital passes or different calendar dates are strictly preserved**.
  - Recurring passes allow the feature engineering pipeline (`feature_engineering.py`) to calculate:
    - `recurrence_count`: Number of times this exact facility emitted heat.
    - `active_days_count`: Distinct days with active thermal radiation.
    - `persistence_ratio`: Ratio of active days to total monitoring days.
    - `frp_zscore`: Standard deviation departure from baseline emission (detecting acute industrial flare-ups).

---

## 7. Error Handling & Edge Cases

| Scenario | Behavior / Handling |
| :--- | :--- |
| **Missing API Key** | Raises `FirmsAPIError` explaining how to register for a free key. Does not silently fabricate data. Supports `--fallback-sample` for demo mode. |
| **HTTP 403 Forbidden** | Intercepted explicitly; raises `FirmsAPIError: HTTP 403 Forbidden. The supplied MAP_KEY is invalid or unauthorized.` |
| **HTTP 429 Rate Limit** | Intercepted explicitly; raises `FirmsAPIError: NASA FIRMS API rate limit exceeded (HTTP 429). Please wait before submitting additional satellite queries.` |
| **HTTP 500/502/503/504** | Intercepted explicitly; raises `FirmsAPIError: NASA FIRMS API server error (HTTP {code}). NASA Earthdata services may be undergoing maintenance.` |
| **Zero Detections (Empty / Header-only)** | Returns an empty DataFrame with the standard schema and `data_provenance` column without crashing. Logs `0 observations detected`. |
| **HTML Gateway Error Page** | Intercepts HTML `<html` / `<!doctype` tags and raises informative `FirmsAPIError`. |
| **Zero Fabrication Guarantee** | Raw data in `data/raw/` is written byte-for-byte as received from NASA. Artificial columns (`predicted_class`, `data_provenance`) are never written into raw files. |
