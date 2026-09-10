"""
Modular Satellite Thermal Data Ingestion Pipeline for SIH PS 26162.

Supports:
- NASA FIRMS (MODIS & VIIRS) satellite thermal anomaly data
- CSV file ingestion and batch directory scanning
- In-memory API-compatible dictionary payloads
- Live NASA FIRMS REST API fetching
- Strict schema validation & physical boundary enforcement
- Safe handling of malformed, corrupted, or incomplete records
- Full isolation: raw data under data/raw/ (untouched), processed under data/processed/,
  and synthetic sample data under data/samples/.
"""

import io
import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Union, Tuple
import pandas as pd
import numpy as np

from src.config import RAW_DATA_DIR, PROCESSED_DATA_DIR, SAMPLES_DATA_DIR
from src.data_pipeline.loader import load_csv, load_raw_directory, fetch_firms_api

logger = logging.getLogger("satellite_pipeline.ingestion")

# Required core fields for thermal anomaly analysis
REQUIRED_FIELDS = [
    "latitude",
    "longitude",
    "brightness",
    "confidence",
    "acq_date",
    "acq_time",
    "satellite"
]

# Field aliases for cross-satellite compatibility (MODIS vs VIIRS)
FIELD_ALIASES = {
    "bright_ti4": "brightness",
    "bright_ti5": "bright_t31",
    "lat": "latitude",
    "lon": "longitude",
    "long": "longitude",
    "source": "satellite"
}

# Scientific physical bounds for thermal infrared satellite sensors
LAT_MIN, LAT_MAX = -90.0, 90.0
LON_MIN, LON_MAX = -180.0, 180.0
TEMP_MIN_KELVIN = 200.0
TEMP_MAX_KELVIN = 600.0


class IngestionValidationError(Exception):
    """Raised when an unrecoverable validation error occurs during ingestion."""
    pass


@dataclass
class IngestionAuditSummary:
    """Detailed audit metrics of the data ingestion run."""
    source_type: str
    source_path: str
    total_raw_records: int
    valid_records_retained: int
    malformed_records_dropped: int
    dropped_missing_required_fields: int
    dropped_invalid_coordinates: int
    dropped_unphysical_temperatures: int
    dropped_invalid_timestamps: int
    duplicate_records_dropped: int
    data_retention_rate_pct: float
    output_processed_path: Optional[str]
    ingested_at_utc: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_text_report(self) -> str:
        lines = [
            "=" * 65,
            "     SATELLITE THERMAL DATA INGESTION AUDIT REPORT",
            "=" * 65,
            f"Ingested At (UTC):          {self.ingested_at_utc}",
            f"Source Type:                {self.source_type}",
            f"Source Identifier:          {self.source_path}",
            f"Total Raw Observations:     {self.total_raw_records}",
            f"Valid Records Retained:     {self.valid_records_retained}",
            f"Total Dropped Records:      {self.malformed_records_dropped} ({100.0 - self.data_retention_rate_pct:.2f}%)",
            f"Data Retention Rate:        {self.data_retention_rate_pct:.2f}%",
            "-" * 65,
            "Quality Filter Breakdown:",
            f"  - Missing Required Fields:   {self.dropped_missing_required_fields}",
            f"  - Out-of-Bounds Coordinates: {self.dropped_invalid_coordinates}",
            f"  - Unphysical Temperatures:   {self.dropped_unphysical_temperatures}",
            f"  - Malformed Dates/Times:     {self.dropped_invalid_timestamps}",
            f"  - Duplicate Observations:    {self.duplicate_records_dropped}",
            "-" * 65,
            f"Processed Data Destination: {self.output_processed_path or 'In-Memory Only'}",
            "=" * 65
        ]
        return "\n".join(lines)


class ThermalDataIngestionPipeline:
    """
    Modular satellite data ingestion engine.
    Ensures raw inputs remain pristine and only sanitized records enter data/processed/.
    """

    def __init__(
        self,
        raw_dir: Optional[Path] = None,
        processed_dir: Optional[Path] = None,
        coordinate_precision: int = 4
    ):
        self.raw_dir = raw_dir or RAW_DATA_DIR
        self.processed_dir = processed_dir or PROCESSED_DATA_DIR
        self.coordinate_precision = coordinate_precision
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)

    def _harmonize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Standardizes casing and maps satellite-specific field aliases."""
        df = df.copy()
        df.columns = [str(c).strip().lower() for c in df.columns]

        rename_map = {}
        for alias, standard in FIELD_ALIASES.items():
            if alias in df.columns and standard not in df.columns:
                rename_map[alias] = standard

        if rename_map:
            logger.info("Mapped sensor column aliases: %s", rename_map)
            df.rename(columns=rename_map, inplace=True)

        return df

    def _validate_and_sanitize(
        self,
        df: pd.DataFrame
    ) -> Tuple[pd.DataFrame, Dict[str, int]]:
        """
        Executes granular validation on satellite records.
        Drops and logs malformed or unphysical records safely.
        """
        audit = {
            "missing_required": 0,
            "invalid_coords": 0,
            "invalid_temps": 0,
            "invalid_times": 0,
            "duplicates": 0
        }

        if df.empty:
            return df, audit

        # 1. Standardize columns
        df_clean = self._harmonize_columns(df)

        # 2. Check for presence of required columns
        missing_cols = [col for col in REQUIRED_FIELDS if col not in df_clean.columns]
        if missing_cols:
            logger.warning("Missing required columns: %s. Attempting fallback/imputation where possible.", missing_cols)
            # If coordinates or brightness are missing, cannot proceed
            critical_missing = [c for c in ["latitude", "longitude", "brightness"] if c in missing_cols]
            if critical_missing:
                raise IngestionValidationError(f"Critical required fields missing from dataset: {critical_missing}")
            # If satellite/source missing, assign UNKNOWN
            if "satellite" in missing_cols:
                df_clean["satellite"] = "UNKNOWN"
            if "confidence" in missing_cols:
                df_clean["confidence"] = "nominal"

        # 3. Coerce numeric types safely
        for col in ["latitude", "longitude", "brightness", "bright_t31", "frp", "scan", "track"]:
            if col in df_clean.columns:
                df_clean[col] = pd.to_numeric(df_clean[col], errors="coerce")

        # 4. Drop rows with null essential fields
        before_nulls = len(df_clean)
        df_clean = df_clean.dropna(subset=["latitude", "longitude", "brightness"]).copy()
        audit["missing_required"] = before_nulls - len(df_clean)
        if audit["missing_required"] > 0:
            logger.warning("Dropped %d records with missing essential fields.", audit["missing_required"])

        # 5. Geographic coordinate boundaries
        before_coords = len(df_clean)
        valid_lat = (df_clean["latitude"] >= LAT_MIN) & (df_clean["latitude"] <= LAT_MAX)
        valid_lon = (df_clean["longitude"] >= LON_MIN) & (df_clean["longitude"] <= LON_MAX)
        # Exclude Null Island GPS errors (0.0, 0.0)
        not_null_island = ~((df_clean["latitude"].abs() < 1e-4) & (df_clean["longitude"].abs() < 1e-4))
        df_clean = df_clean[valid_lat & valid_lon & not_null_island].copy()
        audit["invalid_coords"] = before_coords - len(df_clean)
        if audit["invalid_coords"] > 0:
            logger.warning("Dropped %d records with out-of-bounds coordinates.", audit["invalid_coords"])

        # 6. Physical thermal limits (200K to 600K) & non-negative FRP
        before_temp = len(df_clean)
        temp_mask = (df_clean["brightness"] >= TEMP_MIN_KELVIN) & (df_clean["brightness"] <= TEMP_MAX_KELVIN)
        if "frp" in df_clean.columns:
            frp_mask = df_clean["frp"].isna() | (df_clean["frp"] >= 0.0)
            temp_mask = temp_mask & frp_mask
        df_clean = df_clean[temp_mask].copy()
        audit["invalid_temps"] = before_temp - len(df_clean)
        if audit["invalid_temps"] > 0:
            logger.warning("Dropped %d records with unphysical temperatures or negative FRP.", audit["invalid_temps"])

        # 7. Safe timestamp parsing and malformed date/time filtering
        before_times = len(df_clean)
        if "acq_date" in df_clean.columns and "acq_time" in df_clean.columns:
            # Parse dates
            parsed_dates = pd.to_datetime(df_clean["acq_date"], format="%Y-%m-%d", errors="coerce")

            # Parse 4-digit HHMM clock times
            def clean_clock(val):
                if pd.isna(val):
                    return None
                val_str = str(val).split(".")[0].strip().zfill(4)
                if len(val_str) != 4 or not val_str.isdigit():
                    return None
                hh, mm = int(val_str[:2]), int(val_str[2:])
                if hh > 23 or mm > 59:
                    return None
                return f"{hh:02d}:{mm:02d}:00"

            parsed_times = df_clean["acq_time"].apply(clean_clock)
            valid_dt = parsed_dates.notna() & parsed_times.notna()
            df_clean = df_clean[valid_dt].copy()

            if len(df_clean) > 0:
                d_str = parsed_dates[valid_dt].dt.strftime("%Y-%m-%d")
                t_str = parsed_times[valid_dt]
                iso_str = d_str + "T" + t_str + "Z"
                df_clean["timestamp"] = pd.to_datetime(iso_str, format="%Y-%m-%dT%H:%M:%SZ", utc=True)
                df_clean["hour_utc"] = df_clean["timestamp"].dt.hour
                df_clean["daynight"] = df_clean["hour_utc"].apply(lambda h: "D" if (6 <= h < 18) else "N")

            audit["invalid_times"] = before_times - len(df_clean)
            if audit["invalid_times"] > 0:
                logger.warning("Dropped %d records with malformed date/time.", audit["invalid_times"])

        # 8. Deduplicate observation records
        before_dedup = len(df_clean)
        df_clean["_lat_rnd"] = df_clean["latitude"].round(self.coordinate_precision)
        df_clean["_lon_rnd"] = df_clean["longitude"].round(self.coordinate_precision)
        dedup_subset = ["_lat_rnd", "_lon_rnd"]
        if "timestamp" in df_clean.columns:
            dedup_subset.append("timestamp")
        elif "acq_date" in df_clean.columns and "acq_time" in df_clean.columns:
            dedup_subset.extend(["acq_date", "acq_time"])
        if "satellite" in df_clean.columns:
            dedup_subset.append("satellite")

        df_clean = df_clean.drop_duplicates(subset=dedup_subset, keep="first").copy()
        df_clean.drop(columns=["_lat_rnd", "_lon_rnd"], inplace=True)
        audit["duplicates"] = before_dedup - len(df_clean)
        if audit["duplicates"] > 0:
            logger.info("Deduplicated %d identical observation records.", audit["duplicates"])

        # 9. Normalize confidence values (VIIRS categorical vs MODIS numeric)
        if "confidence" in df_clean.columns:
            def norm_conf(v):
                if pd.isna(v):
                    return "nominal", 0.60
                v_str = str(v).strip().lower()
                if v_str in ["l", "low"]:
                    return "low", 0.25
                elif v_str in ["n", "nominal"]:
                    return "nominal", 0.60
                elif v_str in ["h", "high"]:
                    return "high", 0.90
                try:
                    score = float(v_str)
                    s = score if 0.0 <= score <= 1.0 else max(0.0, min(100.0, score)) / 100.0
                    cat = "low" if s < 0.3 else ("nominal" if s < 0.8 else "high")
                    return cat, round(s, 2)
                except ValueError:
                    return "nominal", 0.60

            conf_res = df_clean["confidence"].apply(norm_conf)
            df_clean["confidence_category"] = [c[0] for c in conf_res]
            df_clean["confidence_score"] = [c[1] for c in conf_res]

        df_clean.reset_index(drop=True, inplace=True)
        return df_clean, audit

    def ingest_from_csv(
        self,
        filepath: Union[str, Path],
        output_filename: Optional[str] = None
    ) -> Tuple[pd.DataFrame, IngestionAuditSummary]:
        """
        Ingests a satellite CSV file without modifying the source raw file.
        Saves sanitized processed data to data/processed/.
        """
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Satellite data file not found: {path}")

        logger.info("Reading raw satellite data from: %s (Raw file will remain unmodified)", path)
        df_raw = load_csv(path)
        total_raw = len(df_raw)

        df_valid, audit = self._validate_and_sanitize(df_raw)
        retained = len(df_valid)
        dropped_total = total_raw - retained
        retention_pct = round((retained / total_raw) * 100.0, 2) if total_raw > 0 else 0.0

        out_path_str = None
        if output_filename:
            out_path = self.processed_dir / output_filename
            df_valid.to_csv(out_path, index=False)
            out_path_str = str(out_path)
            logger.info("Saved sanitized satellite dataset to: %s", out_path)

        summary = IngestionAuditSummary(
            source_type="CSV File",
            source_path=str(path),
            total_raw_records=total_raw,
            valid_records_retained=retained,
            malformed_records_dropped=dropped_total,
            dropped_missing_required_fields=audit["missing_required"],
            dropped_invalid_coordinates=audit["invalid_coords"],
            dropped_unphysical_temperatures=audit["invalid_temps"],
            dropped_invalid_timestamps=audit["invalid_times"],
            duplicate_records_dropped=audit["duplicates"],
            data_retention_rate_pct=retention_pct,
            output_processed_path=out_path_str,
            ingested_at_utc=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        )

        return df_valid, summary

    def ingest_from_api_payload(
        self,
        payload: Union[List[Dict[str, Any]], Dict[str, Any]],
        source_label: str = "NASA_FIRMS_API_STREAM",
        save_raw_backup: bool = True,
        output_filename: Optional[str] = None
    ) -> Tuple[pd.DataFrame, IngestionAuditSummary]:
        """
        Ingests satellite observations from an API-compatible JSON/dictionary payload.
        Optionally backs up the raw stream into data/raw/ before sanitization.
        """
        records = [payload] if isinstance(payload, dict) else payload
        df_raw = pd.DataFrame(records)
        total_raw = len(df_raw)

        # Optionally store raw payload in data/raw/ without modification
        backup_str = "Memory (Not Backed Up)"
        if save_raw_backup and total_raw > 0:
            timestamp_tag = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            raw_backup_file = self.raw_dir / f"raw_stream_{source_label}_{timestamp_tag}.csv"
            df_raw.to_csv(raw_backup_file, index=False)
            backup_str = str(raw_backup_file)
            logger.info("Backed up raw API stream to: %s", raw_backup_file)

        df_valid, audit = self._validate_and_sanitize(df_raw)
        retained = len(df_valid)
        dropped_total = total_raw - retained
        retention_pct = round((retained / total_raw) * 100.0, 2) if total_raw > 0 else 0.0

        out_path_str = None
        if output_filename:
            out_path = self.processed_dir / output_filename
            df_valid.to_csv(out_path, index=False)
            out_path_str = str(out_path)
            logger.info("Saved sanitized API data to: %s", out_path)

        summary = IngestionAuditSummary(
            source_type=f"API Payload ({source_label})",
            source_path=backup_str,
            total_raw_records=total_raw,
            valid_records_retained=retained,
            malformed_records_dropped=dropped_total,
            dropped_missing_required_fields=audit["missing_required"],
            dropped_invalid_coordinates=audit["invalid_coords"],
            dropped_unphysical_temperatures=audit["invalid_temps"],
            dropped_invalid_timestamps=audit["invalid_times"],
            duplicate_records_dropped=audit["duplicates"],
            data_retention_rate_pct=retention_pct,
            output_processed_path=out_path_str,
            ingested_at_utc=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        )

        return df_valid, summary
