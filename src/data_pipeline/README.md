# Satellite Thermal Data Ingestion Pipeline (Task 1)

**SIH 2026 Problem Statement PS 26162**: AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources using Satellite Data.

---

## 1. Overview

The `src.data_pipeline.ingestion` module provides a modular, reliable data ingestion engine for satellite thermal anomaly observations from NASA FIRMS (Fire Information for Resource Management System).

### Key Guarantees:
- **Zero Raw Data Modification**: Raw satellite files are strictly treated as read-only.
- **Physical Boundary Validation**: Latitudes/longitudes outside $[-90, 90]$ and $[-180, 180]$, "Null Island" $(0, 0)$ sensor coordinates, and unphysical temperatures outside $[200\text{ K}, 600\text{ K}]$ are dropped and audited.
- **Sensor Harmonization**: Automatically standardizes field aliases between MODIS (1km) and VIIRS (375m) products (e.g. `bright_ti4` $\rightarrow$ `brightness`, `bright_ti5` $\rightarrow$ `bright_t31`).
- **Data Segregation**:
  - `data/raw/`: Dedicated for real downloaded NASA FIRMS CSV archives.
  - `data/processed/`: Dedicated destination for sanitized, validated output datasets.
  - `data/samples/`: Dedicated storage for explicitly labeled development/test sample files.

---

## 2. Required & Expected Fields

| Field Name | Type | Constraint | Description |
| :--- | :--- | :--- | :--- |
| `latitude` | `float` | $[-90.0, 90.0]$ | Geographic latitude of satellite hotspot center |
| `longitude` | `float` | $[-180.0, 180.0]$ | Geographic longitude of satellite hotspot center |
| `brightness` | `float` | $200.0\text{--}600.0\text{ K}$ | Mid-Infrared channel brightness temperature (VIIRS I-4 or MODIS Ch 21/22) |
| `confidence` | `str`/`float` | Non-null | Detection confidence (VIIRS `'l'`, `'n'`, `'h'` or MODIS percentage $0\text{--}100$) |
| `acq_date` | `str` | `YYYY-MM-DD` | UTC acquisition calendar date |
| `acq_time` | `str`/`int` | `HHMM` clock format | UTC acquisition time |
| `satellite` | `str` | Non-null | Satellite platform (`'N'` for S-NPP, `'1'` for NOAA-20, `'2'` for NOAA-21, `'Terra'`, `'Aqua'`) |
| `bright_t31` | `float` | Optional | Thermal Infrared window channel temperature |
| `frp` | `float` | $\ge 0.0$ (Optional) | Fire Radiative Power in Megawatts |

---

## 3. How to Run Ingestion

### Option A: Via Command Line (CLI)

```powershell
# 1. Run ingestion using automatic discovery (checks data/raw/ or falls back to sample):
python scripts/run_ingestion.py

# 2. Ingest a specific raw CSV file:
python scripts/run_ingestion.py --input data/samples/sample_firms_data.csv --output my_sanitized_output.csv
```

### Option B: Via Python Programmatic API

```python
from src.data_pipeline.ingestion import ThermalDataIngestionPipeline

pipeline = ThermalDataIngestionPipeline()

# 1. Ingest a CSV file
df_clean, audit_summary = pipeline.ingest_from_csv(
    filepath="data/samples/sample_firms_data.csv",
    output_filename="processed_satellite_hotspots.csv"
)

# 2. Ingest live JSON/API observations stream
stream_payload = [
    {
        "latitude": 22.8046,
        "longitude": 86.2029,
        "brightness": 340.5,
        "confidence": "high",
        "acq_date": "2024-03-01",
        "acq_time": "0730",
        "satellite": "N",
        "frp": 25.0
    }
]

df_clean, audit_summary = pipeline.ingest_from_api_payload(
    payload=stream_payload,
    source_label="NASA_FIRMS_LIVE_FEED"
)
```

---

## 4. Ingestion Quality Audit Output

Every ingestion run generates a structured audit report detailing:
- Total raw observations ingested
- Cleaned records retained and overall retention rate
- Breakdown of dropped records (missing fields, coordinate anomalies, temperature limits, corrupted clocks)
- Exact destination path of the processed dataset
