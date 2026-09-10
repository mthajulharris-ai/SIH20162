"""
Configuration and constants for SIH 20162 Satellite Data & ML Pipeline.
"""
from pathlib import Path
import os

# Root project directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Data directories
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
SAMPLES_DATA_DIR = DATA_DIR / "samples"

# Model directory
MODELS_DIR = BASE_DIR / "models" / "saved_models"

# NASA FIRMS API Configurations
# Obtain a free map key from https://firms.modaps.eosdis.nasa.gov/api/map_key/
NASA_FIRMS_MAP_KEY = os.getenv("NASA_FIRMS_MAP_KEY", "")

# Supported Satellite Sensor Sources
SUPPORTED_SOURCES = {
    "VIIRS_SNPP_NRT": "VIIRS S-NPP (375m, Near Real-Time)",
    "VIIRS_NOAA20_NRT": "VIIRS NOAA-20 (375m, Near Real-Time)",
    "VIIRS_NOAA21_NRT": "VIIRS NOAA-21 (375m, Near Real-Time)",
    "MODIS_NRT": "MODIS Terra/Aqua (1km, Near Real-Time)"
}

# Standardized Column Schema across MODIS and VIIRS
STANDARD_COLUMNS = [
    "latitude",
    "longitude",
    "brightness",
    "scan",
    "track",
    "acq_date",
    "acq_time",
    "satellite",
    "instrument",
    "confidence",
    "version",
    "bright_t31",
    "frp",
    "daynight"
]

# Explicit Data Provenance Labels (Phase 2C)
PROVENANCE_REAL_FIRMS = "REAL_FIRMS"
PROVENANCE_SAMPLE = "SAMPLE"
PROVENANCE_PROTOTYPE_LABELLED = "PROTOTYPE_LABELLED"

