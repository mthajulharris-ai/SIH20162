"""
Reproducible Preprocessing & Cleaning Pipeline for Satellite Thermal Data (NASA FIRMS MODIS/VIIRS).

Handles:
- Missing values and imputations
- Invalid latitude/longitude bounds
- Duplicate observation detection and removal
- Invalid or corrupted dates/times
- Inconsistent confidence encodings (VIIRS categorical vs MODIS percentage)
- Unphysical numeric values (temperatures, scan angles, FRP)
- Data quality reporting
"""

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, Union, List

import numpy as np
import pandas as pd

from src.config import PROCESSED_DATA_DIR, RAW_DATA_DIR

logger = logging.getLogger("satellite_pipeline.preprocessor")

# Physics & Geographic boundaries for satellite thermal observations
LATITUDE_MIN, LATITUDE_MAX = -90.0, 90.0
LONGITUDE_MIN, LONGITUDE_MAX = -180.0, 180.0
BRIGHTNESS_KELVIN_MIN = 200.0
BRIGHTNESS_KELVIN_MAX = 600.0

COLUMN_ALIASES = {
    "bright_ti4": "brightness",
    "bright_ti5": "bright_t31",
    "lat": "latitude",
    "lon": "longitude",
    "long": "longitude"
}


@dataclass
class DataQualityReport:
    """Structured data quality audit report."""
    input_rows: int
    output_rows: int
    dropped_rows: int
    retention_rate_pct: float
    duplicate_count: int
    valid_coordinate_count: int
    dropped_invalid_coords: int
    dropped_invalid_temperatures: int
    dropped_invalid_timestamps: int
    missing_values_before: Dict[str, int]
    missing_values_after: Dict[str, int]
    available_columns: List[str]
    date_range_start: Optional[str]
    date_range_end: Optional[str]
    total_days_spanned: Optional[int]
    generated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_text_summary(self) -> str:
        lines = [
            "=" * 60,
            "         SATELLITE DATA QUALITY AUDIT REPORT",
            "=" * 60,
            f"Generated At: {self.generated_at}",
            f"Input Observations:        {self.input_rows}",
            f"Cleaned Valid Records:     {self.output_rows}",
            f"Total Dropped Records:     {self.dropped_rows} ({100.0 - self.retention_rate_pct:.2f}%)",
            f"Data Retention Rate:       {self.retention_rate_pct:.2f}%",
            "-" * 60,
            "Quality Filter Breakdown:",
            f"  - Duplicate Hotspots Dropped:        {self.duplicate_count}",
            f"  - Invalid Coordinates Dropped:       {self.dropped_invalid_coords}",
            f"  - Unphysical Temperatures Dropped:   {self.dropped_invalid_temperatures}",
            f"  - Invalid/Unparseable Times Dropped: {self.dropped_invalid_timestamps}",
            "-" * 60,
            f"Valid Geographic Coordinates Retained: {self.valid_coordinate_count}",
            f"Observation Date Range:               {self.date_range_start} to {self.date_range_end} ({self.total_days_spanned} days)",
            f"Final Available Columns ({len(self.available_columns)}):",
            f"  {', '.join(self.available_columns)}",
            "-" * 60,
            "Missing Values (Before vs. After Cleaning):"
        ]
        all_keys = set(self.missing_values_before.keys()).union(set(self.missing_values_after.keys()))
        for k in sorted(all_keys):
            before = self.missing_values_before.get(k, 0)
            after = self.missing_values_after.get(k, 0)
            lines.append(f"  - {k:<18}: {before:>5} missing -> {after:>5} missing")
        lines.append("=" * 60)
        return "\n".join(lines)


class SatelliteDataCleaner:
    """
    Reproducible cleaning and preprocessing pipeline for NASA FIRMS thermal anomaly data.
    Never alters raw input files. Produces sanitized datasets with full quality audits.
    """

    def __init__(
        self,
        min_brightness: float = BRIGHTNESS_KELVIN_MIN,
        max_brightness: float = BRIGHTNESS_KELVIN_MAX,
        coordinate_precision_decimals: int = 4
    ):
        self.min_brightness = min_brightness
        self.max_brightness = max_brightness
        self.coordinate_precision = coordinate_precision_decimals

    def _standardize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Lowercases and maps sensor-specific column aliases."""
        df = df.copy()
        df.columns = [str(col).strip().lower() for col in df.columns]

        rename_map = {}
        for alias, std in COLUMN_ALIASES.items():
            if alias in df.columns and std not in df.columns:
                rename_map[alias] = std
        if rename_map:
            df.rename(columns=rename_map, inplace=True)
        return df

    def _handle_invalid_numerics(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
        """
        Coerces numeric fields and removes rows with unphysical thermal readings.
        """
        df = df.copy()
        initial_len = len(df)

        numeric_cols = ["latitude", "longitude", "brightness", "bright_t31", "frp", "scan", "track"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # Must have valid numeric latitude, longitude, and brightness
        df = df.dropna(subset=["latitude", "longitude", "brightness"]).copy()

        # Physical brightness limits
        temp_mask = (df["brightness"] >= self.min_brightness) & (df["brightness"] <= self.max_brightness)
        
        # FRP must be non-negative if present
        if "frp" in df.columns:
            frp_valid = df["frp"].isna() | (df["frp"] >= 0.0)
            temp_mask = temp_mask & frp_valid

        df_valid_temp = df[temp_mask].copy()
        dropped = initial_len - len(df_valid_temp)
        return df_valid_temp, dropped

    def _handle_coordinates(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, int, int]:
        """
        Filters latitude/longitude within scientific bounds [-90, 90] and [-180, 180].
        Excludes (0.0, 0.0) coordinates which indicate GPS/sensor coordinate failure.
        """
        df = df.copy()
        initial_len = len(df)

        valid_lat = (df["latitude"] >= LATITUDE_MIN) & (df["latitude"] <= LATITUDE_MAX)
        valid_lon = (df["longitude"] >= LONGITUDE_MIN) & (df["longitude"] <= LONGITUDE_MAX)
        not_null_island = ~((df["latitude"].abs() < 1e-5) & (df["longitude"].abs() < 1e-5))

        valid_mask = valid_lat & valid_lon & not_null_island
        df_valid = df[valid_mask].copy()
        dropped = initial_len - len(df_valid)
        return df_valid, dropped, len(df_valid)

    def _handle_dates_and_times(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
        """
        Parses acquisition dates and times into unified UTC timestamps.
        Drops unparseable dates or impossible clock times (e.g. hour >= 24, minute >= 60).
        """
        df = df.copy()
        initial_len = len(df)

        if "acq_date" not in df.columns or "acq_time" not in df.columns:
            logger.warning("No acq_date / acq_time columns found. Timestamp parsing skipped.")
            return df, 0

        # Validate date string: YYYY-MM-DD
        parsed_dates = pd.to_datetime(df["acq_date"], format="%Y-%m-%d", errors="coerce")

        # Validate time: clean to 4 digits HHMM
        def clean_time(val):
            if pd.isna(val):
                return None
            val_str = str(val).split(".")[0].strip().zfill(4)
            if len(val_str) != 4 or not val_str.isdigit():
                return None
            hh, mm = int(val_str[:2]), int(val_str[2:])
            if hh > 23 or mm > 59:
                return None
            return f"{hh:02d}:{mm:02d}:00"

        cleaned_times = df["acq_time"].apply(clean_time)

        # Drop rows where either date or time is invalid
        valid_dt_mask = parsed_dates.notna() & cleaned_times.notna()
        df_valid = df[valid_dt_mask].copy()
        dropped = initial_len - len(df_valid)

        if len(df_valid) > 0:
            date_strings = parsed_dates[valid_dt_mask].dt.strftime("%Y-%m-%d")
            time_strings = cleaned_times[valid_dt_mask]
            iso_strings = date_strings + "T" + time_strings + "Z"
            
            df_valid["timestamp"] = pd.to_datetime(iso_strings, format="%Y-%m-%dT%H:%M:%SZ", utc=True)
            df_valid["acq_date"] = date_strings
            df_valid["hour_utc"] = df_valid["timestamp"].dt.hour
            df_valid["month"] = df_valid["timestamp"].dt.month
            df_valid["day_of_week"] = df_valid["timestamp"].dt.dayofweek

        return df_valid, dropped

    def _normalize_confidence_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Standardizes confidence values across MODIS (numeric 0-100) and VIIRS (low/nominal/high).
        Outputs:
        - confidence_category: 'low' | 'nominal' | 'high'
        - confidence_score: float in [0.0, 1.0]
        """
        df = df.copy()
        if "confidence" not in df.columns:
            df["confidence_category"] = "nominal"
            df["confidence_score"] = 0.50
            return df

        def parse_conf(val):
            if pd.isna(val):
                return "nominal", 0.50
            val_str = str(val).strip().lower()

            # VIIRS categorical values
            if val_str in ["l", "low"]:
                return "low", 0.25
            elif val_str in ["n", "nominal", "norm"]:
                return "nominal", 0.60
            elif val_str in ["h", "high"]:
                return "high", 0.90

            # MODIS numeric percentage values
            try:
                numeric_val = float(val_str)
                # If given in 0.0 - 1.0 format
                if 0.0 <= numeric_val <= 1.0:
                    score = numeric_val
                else:
                    score = max(0.0, min(100.0, numeric_val)) / 100.0

                if score < 0.30:
                    return "low", score
                elif score < 0.80:
                    return "nominal", score
                else:
                    return "high", score
            except ValueError:
                return "nominal", 0.50

        results = df["confidence"].apply(parse_conf)
        df["confidence_category"] = [r[0] for r in results]
        df["confidence_score"] = [round(r[1], 3) for r in results]
        return df

    def _impute_missing_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Handles missing values in auxiliary fields with domain-sensible defaults:
        - frp: 0.0 (non-detected or zero fire radiative power)
        - bright_t31: median of available bright_t31, or fallback to brightness - 15.0K
        - satellite / instrument: 'UNKNOWN'
        - daynight: infer from hour_utc (06:00 to 18:00 UTC ~ Day, else Night)
        """
        df = df.copy()

        if "frp" in df.columns:
            df["frp"] = df["frp"].fillna(0.0)

        if "bright_t31" in df.columns:
            median_t31 = df["bright_t31"].median()
            fallback = median_t31 if not pd.isna(median_t31) else df["brightness"] - 15.0
            df["bright_t31"] = df["bright_t31"].fillna(fallback)

        if "satellite" in df.columns:
            df["satellite"] = df["satellite"].fillna("UNKNOWN")
        if "instrument" in df.columns:
            df["instrument"] = df["instrument"].fillna("UNKNOWN")

        if "daynight" in df.columns:
            if "hour_utc" in df.columns:
                inferred_dn = df["hour_utc"].apply(lambda h: "D" if (6 <= h < 18) else "N")
                df["daynight"] = df["daynight"].fillna(inferred_dn)
            else:
                df["daynight"] = df["daynight"].fillna("UNKNOWN")
        elif "hour_utc" in df.columns:
            df["daynight"] = df["hour_utc"].apply(lambda h: "D" if (6 <= h < 18) else "N")

        return df

    def _remove_duplicate_observations(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
        """
        Deduplicates satellite hotspots.
        Observations at the same rounded spatial coordinate and acquisition timestamp
        from the same satellite are identified as duplicates.
        """
        df = df.copy()
        initial_len = len(df)

        df["_lat_rnd"] = df["latitude"].round(self.coordinate_precision)
        df["_lon_rnd"] = df["longitude"].round(self.coordinate_precision)

        subset = ["_lat_rnd", "_lon_rnd"]
        if "timestamp" in df.columns:
            subset.append("timestamp")
        elif "acq_date" in df.columns and "acq_time" in df.columns:
            subset.extend(["acq_date", "acq_time"])

        if "satellite" in df.columns:
            subset.append("satellite")

        df_dedup = df.drop_duplicates(subset=subset, keep="first").copy()
        df_dedup.drop(columns=["_lat_rnd", "_lon_rnd"], inplace=True)
        dropped = initial_len - len(df_dedup)
        return df_dedup, dropped

    def clean(self, raw_df: pd.DataFrame) -> Tuple[pd.DataFrame, DataQualityReport]:
        """
        Runs the full reproducible cleaning and preprocessing pipeline on raw data.
        Returns cleaned DataFrame and a detailed DataQualityReport.
        """
        if raw_df.empty:
            empty_report = DataQualityReport(
                input_rows=0, output_rows=0, dropped_rows=0, retention_rate_pct=0.0,
                duplicate_count=0, valid_coordinate_count=0, dropped_invalid_coords=0,
                dropped_invalid_temperatures=0, dropped_invalid_timestamps=0,
                missing_values_before={}, missing_values_after={}, available_columns=[],
                date_range_start=None, date_range_end=None, total_days_spanned=0,
                generated_at=datetime.now(timezone.utc).isoformat()
            )
            return raw_df, empty_report

        initial_rows = len(raw_df)
        missing_before = raw_df.isna().sum().to_dict()

        # 1. Standardize column aliases
        df = self._standardize_column_names(raw_df)

        # 2. Handle invalid numeric values & thermal limits
        df, dropped_temps = self._handle_invalid_numerics(df)

        # 3. Handle geographic coordinates
        df, dropped_coords, valid_coords = self._handle_coordinates(df)

        # 4. Handle invalid dates and times
        df, dropped_times = self._handle_dates_and_times(df)

        # 5. Inconsistent confidence values normalization
        df = self._normalize_confidence_values(df)

        # 6. Impute missing values for auxiliary fields
        df = self._impute_missing_values(df)

        # 7. Deduplicate observations
        df, duplicate_count = self._remove_duplicate_observations(df)

        # Reset index
        df.reset_index(drop=True, inplace=True)

        final_rows = len(df)
        dropped_total = initial_rows - final_rows
        retention_pct = round((final_rows / initial_rows) * 100.0, 2) if initial_rows > 0 else 0.0
        missing_after = df.isna().sum().to_dict()

        # Date range calculations
        date_start, date_end, total_days = None, None, 0
        if "acq_date" in df.columns and len(df) > 0:
            dates = pd.to_datetime(df["acq_date"], errors="coerce").dropna()
            if not dates.empty:
                date_start = dates.min().strftime("%Y-%m-%d")
                date_end = dates.max().strftime("%Y-%m-%d")
                total_days = (dates.max() - dates.min()).days + 1

        report = DataQualityReport(
            input_rows=initial_rows,
            output_rows=final_rows,
            dropped_rows=dropped_total,
            retention_rate_pct=retention_pct,
            duplicate_count=duplicate_count,
            valid_coordinate_count=valid_coords,
            dropped_invalid_coords=dropped_coords,
            dropped_invalid_temperatures=dropped_temps,
            dropped_invalid_timestamps=dropped_times,
            missing_values_before=missing_before,
            missing_values_after=missing_after,
            available_columns=list(df.columns),
            date_range_start=date_start,
            date_range_end=date_end,
            total_days_spanned=total_days,
            generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        )

        logger.info("Preprocessing complete. Retained %d of %d records (%.2f%%).", final_rows, initial_rows, retention_pct)
        return df, report

    def process_and_save(
        self,
        raw_df: pd.DataFrame,
        output_basename: str = "cleaned_satellite_data"
    ) -> Tuple[pd.DataFrame, DataQualityReport, Path, Path]:
        """
        Cleans data and saves:
        1. data/processed/<output_basename>.csv
        2. data/processed/<output_basename>_quality_report.json
        3. data/processed/<output_basename>_quality_report.txt
        Never overwrites raw data.
        """
        PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
        cleaned_df, report = self.clean(raw_df)

        csv_path = PROCESSED_DATA_DIR / f"{output_basename}.csv"
        json_report_path = PROCESSED_DATA_DIR / f"{output_basename}_quality_report.json"
        txt_report_path = PROCESSED_DATA_DIR / f"{output_basename}_quality_report.txt"

        cleaned_df.to_csv(csv_path, index=False)
        
        with open(json_report_path, "w") as f:
            json.dump(report.to_dict(), f, indent=2)

        with open(txt_report_path, "w") as f:
            f.write(report.to_text_summary())

        logger.info("Saved processed dataset to: %s", csv_path)
        logger.info("Saved data quality report to: %s", txt_report_path)

        return cleaned_df, report, csv_path, txt_report_path
