"""
Universal Satellite Observation Normalizer and Content Validator.
Supports:
- NASA FIRMS MODIS standard CSVs (brightness, bright_t31, scan, track, acq_date, etc.)
- NASA FIRMS VIIRS standard CSVs (bright_ti4, bright_ti5, scan, track, acq_date, etc.)
- User-created CSVs with compatible thermal/fire observation columns
- JSON arrays of observations or GeoJSON FeatureCollections
- Multi-file ingestion with source filename traceability

Validates FILE CONTENT and COLUMN STRUCTURE, NOT the filename.
"""

import csv
import io
import json
import logging
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Dict, List, Optional, Set, Tuple
import zipfile
from datetime import datetime, timezone

logger = logging.getLogger("backend.observation_normalizer")

# Maximum allowed file size in bytes (250 MB for compressed archive / datasets)
MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024
# Maximum total uncompressed size permitted for ZIP archives to prevent zip-bomb denial of service
MAX_UNCOMPRESSED_ZIP_BYTES = 500 * 1024 * 1024

# Standard column mapping dictionary
# Maps raw column names (lowercased, stripped, underscores normalized) to canonical keys
COLUMN_ALIASES: Dict[str, str] = {
    # Latitude
    "latitude": "latitude",
    "lat": "latitude",
    "lat_deg": "latitude",
    "lat_degree": "latitude",
    "latitudes": "latitude",
    "y": "latitude",
    "y_coord": "latitude",
    "geo_lat": "latitude",
    "point_y": "latitude",
    # Longitude
    "longitude": "longitude",
    "lon": "longitude",
    "long": "longitude",
    "lng": "longitude",
    "lon_deg": "longitude",
    "lon_degree": "longitude",
    "longitudes": "longitude",
    "x": "longitude",
    "x_coord": "longitude",
    "geo_lon": "longitude",
    "point_x": "longitude",
    # Acquisition Date
    "acq_date": "acq_date",
    "acquisition_date": "acq_date",
    "date": "acq_date",
    "obs_date": "acq_date",
    "observation_date": "acq_date",
    "detection_date": "acq_date",
    "datetime": "acq_date",
    "timestamp": "acq_date",
    "time_utc": "acq_date",
    # Acquisition Time
    "acq_time": "acq_time",
    "acquisition_time": "acq_time",
    "time": "acq_time",
    "obs_time": "acq_time",
    "observation_time": "acq_time",
    "utc_time": "acq_time",
    # Confidence
    "confidence": "confidence",
    "confidence_level": "confidence",
    "conf": "confidence",
    "confidence_pct": "confidence",
    "quality": "confidence",
    "qual": "confidence",
    # Fire Radiative Power (FRP)
    "frp": "frp",
    "fire_radiative_power": "frp",
    "power": "frp",
    "radiative_power": "frp",
    "frp_mw": "frp",
    # Brightness Temperature
    "brightness": "brightness",
    "bright_ti4": "brightness",
    "brightness_temperature": "brightness",
    "temp": "brightness",
    "temperature": "brightness",
    "bt": "brightness",
    "temp_k": "brightness",
    "temp_c": "brightness",
    "t4": "brightness",
    # Window Channel Brightness Temperature (T31 / I5)
    "bright_t31": "bright_t31",
    "bright_ti5": "bright_t31",
    "t31": "bright_t31",
    "i5": "bright_t31",
    "channel31": "bright_t31",
    "bright_31": "bright_t31",
    "brightness_t31": "bright_t31",
    "t5": "bright_t31",
    # Satellite / Platform
    "satellite": "satellite",
    "source": "satellite",
    "sat": "satellite",
    "platform": "satellite",
    "spacecraft": "satellite",
    "satellite_name": "satellite",
    # Instrument / Sensor
    "instrument": "instrument",
    "sensor": "instrument",
    "inst": "instrument",
    # Pixel footprint
    "scan": "scan",
    "pixel_scan": "scan",
    "scan_size": "scan",
    "track": "track",
    "pixel_track": "track",
    "track_size": "track",
    # Diurnal flag
    "daynight": "daynight",
    "day_night": "daynight",
    "dn": "daynight",
    "d_n": "daynight",
    "day_or_night": "daynight",
    # Thermal event type
    "type": "type",
    "fire_type": "type",
    "version": "version",
}

UNSUPPORTED_FORMAT_ERROR = (
    "Unsupported observation format. "
    "We could not identify sufficient satellite thermal/fire observation fields in this file. "
    "Please upload a NASA FIRMS, MODIS, VIIRS-compatible CSV or JSON file."
)


class NormalizedObservation:
    """Represents a normalized, validated satellite thermal observation."""

    def __init__(
        self,
        latitude: float,
        longitude: float,
        brightness: Optional[float] = None,
        bright_t31: Optional[float] = None,
        frp: Optional[float] = None,
        confidence: Optional[str] = None,
        acq_date: Optional[str] = None,
        acq_time: Optional[str] = None,
        satellite: str = "VIIRS_SNPP_NRT",
        instrument: str = "VIIRS",
        scan: float = 0.375,
        track: float = 0.375,
        daynight: str = "D",
        source_file: Optional[str] = None,
        data_provenance: str = "REAL_FIRMS",
        raw_properties: Optional[Dict[str, Any]] = None,
    ):
        self.latitude = latitude
        self.longitude = longitude
        self.brightness = brightness
        self.bright_t31 = bright_t31
        self.frp = frp
        self.confidence = confidence
        self.acq_date = acq_date
        self.acq_time = acq_time
        self.satellite = satellite
        self.instrument = instrument
        self.scan = scan
        self.track = track
        self.daynight = daynight
        self.source_file = source_file
        self.data_provenance = data_provenance
        self.raw_properties = raw_properties or {}

    def to_input_dict(self) -> Dict[str, Any]:
        """Convert to dict compatible with ThermalObservationInput / ML inference."""
        now = datetime.now(timezone.utc)
        date_str = self.acq_date or now.strftime("%Y-%m-%d")
        time_str = self.acq_time or now.strftime("%H%M")
        try:
            hour_val = int(time_str[:2]) if len(time_str) >= 2 else now.hour
        except (ValueError, TypeError):
            hour_val = now.hour

        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "brightness": float(self.brightness) if self.brightness is not None else 300.0,  # ML baseline if null
            "bright_t31": float(self.bright_t31) if self.bright_t31 is not None else None,
            "frp": float(self.frp) if self.frp is not None else 0.0,
            "confidence": self.confidence or "nominal",
            "acq_date": date_str,
            "acq_time": time_str,
            "source": self.satellite,
            "instrument": self.instrument,
            "scan": float(self.scan) if self.scan is not None else 0.375,
            "track": float(self.track) if self.track is not None else 0.375,
            "daynight": self.daynight,
            "hour_utc": hour_val,
            "source_file": self.source_file,
            "data_provenance": self.data_provenance,
        }


def clean_column_name(raw_name: Any) -> str:
    """Standardizes column string for alias lookup."""
    if raw_name is None:
        return ""
    s = str(raw_name).strip().lower()
    s = re.sub(r"[\s\-\.]+", "_", s)
    s = re.sub(r"[^\w]", "", s)
    return s


def parse_raw_records(content_bytes: bytes, filename: str) -> Tuple[List[Dict[str, Any]], str]:
    """
    Parses content bytes into list of raw row dictionaries and identifies format.
    Handles UTF-8 and latin-1 encodings safely.
    """
    if len(content_bytes) > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File '{filename}' exceeds maximum allowed size of 50 MB.")

    try:
        content_str = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content_str = content_bytes.decode("latin-1")

    content_trimmed = content_str.strip()
    if not content_trimmed:
        raise ValueError(f"File '{filename}' is empty.")

    detected_format = "CSV"
    raw_rows: List[Dict[str, Any]] = []

    # 1. Attempt JSON / GeoJSON parsing if content looks like JSON
    if content_trimmed.startswith(("{", "[")) or filename.lower().endswith((".json", ".geojson")):
        try:
            parsed = json.loads(content_trimmed)
            if isinstance(parsed, list):
                raw_rows = [r for r in parsed if isinstance(r, dict)]
                detected_format = "JSON"
            elif isinstance(parsed, dict):
                if "features" in parsed and isinstance(parsed["features"], list):
                    detected_format = "GeoJSON"
                    for feat in parsed["features"]:
                        if not isinstance(feat, dict):
                            continue
                        props = dict(feat.get("properties") or {})
                        geom = feat.get("geometry") or {}
                        if isinstance(geom, dict) and geom.get("type") == "Point":
                            coords = geom.get("coordinates") or []
                            if len(coords) >= 2:
                                props["longitude"] = coords[0]
                                props["latitude"] = coords[1]
                        raw_rows.append(props)
                elif any(k in parsed for k in ["data", "records", "detections", "observations"]):
                    detected_format = "JSON"
                    for key in ["data", "records", "detections", "observations"]:
                        if key in parsed and isinstance(parsed[key], list):
                            raw_rows = [r for r in parsed[key] if isinstance(r, dict)]
                            break
                else:
                    detected_format = "JSON"
                    raw_rows = [parsed]
        except Exception as e:
            raise ValueError(f"Malformed JSON in uploaded file '{filename}': {str(e)}")
    else:
        # 2. Parse CSV / Delimited text format
        detected_format = "CSV"
        lines = [line for line in content_str.splitlines() if line.strip() and not line.strip().startswith("#")]
        if not lines:
            raise ValueError(f"No observation data found in file '{filename}'.")

        first_line = lines[0]
        delimiter = ","
        for d in [",", "\t", ";", "|"]:
            if d in first_line:
                delimiter = d
                break

        reader = csv.DictReader(lines, delimiter=delimiter)
        if not reader.fieldnames:
            raise ValueError(f"Uploaded file '{filename}' is missing a column header row.")

        for row in reader:
            if any(val is not None and str(val).strip() for val in row.values()):
                raw_rows.append(row)

    return raw_rows, detected_format


def check_record_compatibility(
    raw_rows: List[Dict[str, Any]]
) -> Tuple[bool, Set[str], Optional[str]]:
    """
    Validates whether raw observation records contain the required satellite columns:
    latitude, longitude, and thermal/fire signals (brightness, FRP, etc.).
    Returns (is_compatible, mapped_canonical_keys, detected_flavor).
    """
    if not raw_rows:
        return False, set(), None

    sample_rows = raw_rows[:100]
    all_raw_keys = set()
    for row in sample_rows:
        all_raw_keys.update(row.keys())

    mapped_keys = {COLUMN_ALIASES.get(clean_column_name(k), clean_column_name(k)) for k in all_raw_keys}

    has_lat = "latitude" in mapped_keys
    has_lon = "longitude" in mapped_keys

    thermal_indicators = {
        "brightness",
        "bright_t31",
        "frp",
        "confidence",
        "satellite",
        "instrument",
        "acq_date",
        "daynight",
        "scan",
    }
    has_thermal = bool(mapped_keys.intersection(thermal_indicators))

    if not (has_lat and has_lon and has_thermal):
        return False, mapped_keys, None

    is_viirs = "bright_ti4" in [clean_column_name(k) for k in all_raw_keys]
    is_modis = "bright_t31" in [clean_column_name(k) for k in all_raw_keys] and not is_viirs
    if is_viirs:
        flavor = "NASA FIRMS VIIRS"
    elif is_modis:
        flavor = "NASA FIRMS MODIS"
    else:
        flavor = "Thermal Observation Data"

    return True, mapped_keys, flavor


def parse_zip_archive(
    content_bytes: bytes,
    filename: str,
) -> Tuple[List[Dict[str, Any]], str, str]:
    """
    Safely extracts a ZIP archive in an isolated temporary sandbox,
    recursively scans directory contents for satellite observation files,
    ignores documentation/metadata/media files, validates required headers,
    prioritizes active NRT datasets, and cleans up temporary files.

    Returns:
        Tuple of (raw_rows, detected_format_flavor, identified_filename)
    """
    if len(content_bytes) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"ZIP archive '{filename}' exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
        )

    try:
        zip_buffer = io.BytesIO(content_bytes)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            # 1. Path traversal and zip-bomb denial of service protection
            total_uncompressed_bytes = 0
            for member in zf.infolist():
                member_path = member.filename
                if (
                    os.path.isabs(member_path)
                    or member_path.startswith(("/", "\\"))
                    or ".." in Path(member_path).parts
                    or ".." in member_path
                ):
                    raise ValueError(f"Security error: ZIP archive contains unsafe path traversal '{member_path}'.")

                total_uncompressed_bytes += member.file_size
                if total_uncompressed_bytes > MAX_UNCOMPRESSED_ZIP_BYTES:
                    raise ValueError(
                        f"Security error: Total uncompressed archive size ({total_uncompressed_bytes // (1024 * 1024)} MB) "
                        f"exceeds safe limit of {MAX_UNCOMPRESSED_ZIP_BYTES // (1024 * 1024)} MB."
                    )

            # 2. Extract into safe temporary sandbox directory
            with tempfile.TemporaryDirectory() as temp_dir:
                zf.extractall(temp_dir)
                temp_path = Path(temp_dir)

                # 3. Recursively scan directory contents for candidate observation files
                ignore_patterns = [
                    "readme",
                    "metadata",
                    "license",
                    "licence",
                    "notice",
                    "changelog",
                    "manifest",
                    ".ds_store",
                    "__macosx",
                ]
                candidate_files: List[Path] = []

                for p in temp_path.rglob("*"):
                    if not p.is_file():
                        continue
                    p_name_lower = p.name.lower()
                    rel_p_lower = str(p.relative_to(temp_path)).lower()

                    # Ignore non-data / documentation / media files
                    if any(ign in rel_p_lower for ign in ignore_patterns):
                        continue
                    if p_name_lower.endswith(
                        (".png", ".jpg", ".jpeg", ".gif", ".pdf", ".exe", ".sh", ".bat", ".md", ".doc", ".html")
                    ):
                        continue

                    # Supported data formats
                    if p_name_lower.endswith((".json", ".geojson", ".csv", ".tsv", ".txt")):
                        candidate_files.append(p)

                if not candidate_files:
                    raise ValueError("No compatible NASA FIRMS / VIIRS / MODIS observation file found inside ZIP.")

                # 4. Inspect headers and fields of candidate files
                compatible_candidates = []
                for cand in candidate_files:
                    try:
                        cand_bytes = cand.read_bytes()
                        if not cand_bytes or len(cand_bytes.strip()) == 0:
                            continue
                        rows, file_type = parse_raw_records(cand_bytes, cand.name)
                        is_compat, mapped_keys, flavor = check_record_compatibility(rows)
                        if is_compat:
                            rel_name = str(cand.relative_to(temp_path)).replace("\\", "/")
                            is_nrt = "nrt" in cand.name.lower()
                            compatible_candidates.append({
                                "file_path": cand,
                                "rel_name": rel_name,
                                "rows": rows,
                                "format": f"{file_type} ({flavor})",
                                "record_count": len(rows),
                                "is_nrt": is_nrt,
                            })
                    except Exception as e:
                        logger.debug("Skipping non-observation candidate '%s': %s", cand.name, str(e))
                        continue

                if not compatible_candidates:
                    raise ValueError("No compatible NASA FIRMS / VIIRS / MODIS observation file found inside ZIP.")

                # Prioritize NRT (near real-time) active observation datasets, then record count
                compatible_candidates.sort(
                    key=lambda c: (1 if c["is_nrt"] else 0, c["record_count"]),
                    reverse=True,
                )
                selected = compatible_candidates[0]

                logger.info(
                    "[SATRA ZIP] Identified satellite observation file '%s' (%d records, %s) inside archive '%s'",
                    selected["rel_name"],
                    selected["record_count"],
                    selected["format"],
                    filename,
                )

                return selected["rows"], selected["format"], selected["rel_name"]

    except zipfile.BadZipFile:
        raise ValueError(f"File '{filename}' is not a valid or readable ZIP archive.")


def normalize_and_validate_file(
    content_bytes: bytes,
    filename: str,
) -> Tuple[List[NormalizedObservation], Set[str], Set[str], str, str]:
    """
    Parses, normalizes, and validates observations from an uploaded file or ZIP archive.
    Returns:
    - List of validated NormalizedObservation objects
    - Set of detected available canonical fields
    - Set of unavailable fields
    - Detected format description (e.g. "NASA FIRMS MODIS", "NASA FIRMS VIIRS CSV")
    - Identified observation filename (either direct filename or extracted file from ZIP)
    """
    is_zip = filename.lower().endswith(".zip") or content_bytes[:4] == b"PK\x03\x04"
    if is_zip:
        raw_rows, detected_flavor, identified_filename = parse_zip_archive(content_bytes, filename)
        file_type = "ZIP Archive"
    else:
        raw_rows, file_type = parse_raw_records(content_bytes, filename)
        identified_filename = filename
        detected_flavor = None

    if not raw_rows:
        raise ValueError(f"Zero observation records found in '{identified_filename}'.")

    all_raw_keys = set()
    for row in raw_rows:
        all_raw_keys.update(row.keys())

    column_mapping: Dict[str, str] = {}
    for rk in all_raw_keys:
        clean_k = clean_column_name(rk)
        canonical = COLUMN_ALIASES.get(clean_k, clean_k)
        column_mapping[rk] = canonical

    mapped_canonical_keys = set(column_mapping.values())

    has_lat = "latitude" in mapped_canonical_keys
    has_lon = "longitude" in mapped_canonical_keys

    thermal_indicators = {
        "brightness",
        "bright_t31",
        "frp",
        "confidence",
        "satellite",
        "instrument",
        "acq_date",
        "daynight",
        "scan",
    }
    has_thermal_signal = bool(mapped_canonical_keys.intersection(thermal_indicators))

    if not (has_lat and has_lon and has_thermal_signal):
        missing_parts = []
        if not has_lat:
            missing_parts.append("latitude")
        if not has_lon:
            missing_parts.append("longitude")
        if not has_thermal_signal:
            missing_parts.append("thermal/fire observation indicators")

        missing_desc = ", ".join(missing_parts)
        raise ValueError(
            f"{UNSUPPORTED_FORMAT_ERROR} (Missing required fields: {missing_desc})"
        )

    if detected_flavor is None:
        is_viirs = "bright_ti4" in [clean_column_name(k) for k in all_raw_keys]
        is_modis = "bright_t31" in [clean_column_name(k) for k in all_raw_keys] and not is_viirs
        if is_viirs:
            detected_flavor = f"{file_type} (NASA FIRMS VIIRS)"
        elif is_modis:
            detected_flavor = f"{file_type} (NASA FIRMS MODIS)"
        else:
            detected_flavor = f"{file_type} (Thermal Observation Data)"

    # Requirement 12: Uploaded dataset remains USER_UPLOADED. Do not label uploaded data as REAL_FIRMS.
    provenance = "USER_UPLOADED"

    available_fields: Set[str] = set()
    validated_observations: List[NormalizedObservation] = []
    validation_errors: List[str] = []

    for idx, row in enumerate(raw_rows):
        normalized_row: Dict[str, Any] = {}
        for k, v in row.items():
            canonical = column_mapping.get(k, clean_column_name(k))
            normalized_row[canonical] = v

        # 1. Validate Latitude
        raw_lat = normalized_row.get("latitude")
        if raw_lat in (None, "", "null"):
            validation_errors.append(f"Record {idx+1}: Missing latitude coordinate.")
            continue
        try:
            lat = float(raw_lat)
            if lat < -90.0 or lat > 90.0:
                validation_errors.append(f"Record {idx+1}: Latitude {lat}° out of bounds [-90, +90].")
                continue
        except (ValueError, TypeError):
            validation_errors.append(f"Record {idx+1}: Non-numeric latitude '{raw_lat}'.")
            continue
        available_fields.add("latitude")

        # 2. Validate Longitude
        raw_lon = normalized_row.get("longitude")
        if raw_lon in (None, "", "null"):
            validation_errors.append(f"Record {idx+1}: Missing longitude coordinate.")
            continue
        try:
            lon = float(raw_lon)
            if lon < -180.0 or lon > 180.0:
                validation_errors.append(f"Record {idx+1}: Longitude {lon}° out of bounds [-180, +180].")
                continue
        except (ValueError, TypeError):
            validation_errors.append(f"Record {idx+1}: Non-numeric longitude '{raw_lon}'.")
            continue
        available_fields.add("longitude")

        # 3. Brightness Temperature (Optional - do not invent values if missing)
        brightness: Optional[float] = None
        raw_bright = normalized_row.get("brightness")
        if raw_bright not in (None, "", "null"):
            try:
                b_val = float(raw_bright)
                if b_val > 0:
                    brightness = b_val
                    available_fields.add("brightness")
            except (ValueError, TypeError):
                pass

        # 4. Brightness Window Channel T31 / I5 (Optional)
        bright_t31: Optional[float] = None
        raw_t31 = normalized_row.get("bright_t31")
        if raw_t31 not in (None, "", "null"):
            try:
                t_val = float(raw_t31)
                if t_val > 0:
                    bright_t31 = t_val
                    available_fields.add("bright_t31")
            except (ValueError, TypeError):
                pass

        # 5. FRP (Fire Radiative Power) (Optional)
        frp: Optional[float] = None
        raw_frp = normalized_row.get("frp")
        if raw_frp not in (None, "", "null"):
            try:
                f_val = float(raw_frp)
                if f_val >= 0:
                    frp = f_val
                    available_fields.add("frp")
            except (ValueError, TypeError):
                pass

        # 6. Confidence
        confidence_val: Optional[str] = None
        raw_conf = normalized_row.get("confidence")
        if raw_conf not in (None, "", "null"):
            confidence_val = str(raw_conf).strip().lower()
            available_fields.add("confidence")

        # 7. Acquisition Date
        acq_date: Optional[str] = None
        raw_date = normalized_row.get("acq_date")
        if raw_date not in (None, "", "null"):
            clean_date = str(raw_date).strip()
            if "T" in clean_date:
                clean_date = clean_date.split("T")[0]
            elif " " in clean_date:
                clean_date = clean_date.split(" ")[0]
            if re.match(r"^\d{4}-\d{2}-\d{2}$", clean_date):
                acq_date = clean_date
                available_fields.add("acq_date")
            elif re.match(r"^\d{4}/\d{2}/\d{2}$", clean_date):
                acq_date = clean_date.replace("/", "-")
                available_fields.add("acq_date")

        # 8. Acquisition Time
        acq_time: Optional[str] = None
        raw_time = normalized_row.get("acq_time")
        if raw_time not in (None, "", "null"):
            clean_time = str(raw_time).strip().replace(":", "")
            if clean_time.isdigit():
                acq_time = clean_time.zfill(4)[:4]
                available_fields.add("acq_time")

        # 9. Satellite & Instrument
        raw_sat = normalized_row.get("satellite")
        raw_inst = normalized_row.get("instrument")

        if raw_sat not in (None, "", "null"):
            satellite = str(raw_sat).strip()
            available_fields.add("satellite")
        else:
            satellite = "VIIRS (S-NPP)" if is_viirs else ("MODIS (Terra/Aqua)" if is_modis else "Satellite Sensor")

        if raw_inst not in (None, "", "null"):
            instrument = str(raw_inst).strip()
            available_fields.add("instrument")
        else:
            instrument = "VIIRS" if is_viirs else ("MODIS" if is_modis else "Optical/Thermal Sensor")

        # 10. Scan & Track pixel size
        scan = 0.375
        if normalized_row.get("scan") not in (None, "", "null"):
            try:
                scan = float(normalized_row["scan"])
                available_fields.add("scan")
            except (ValueError, TypeError):
                pass

        track = 0.375
        if normalized_row.get("track") not in (None, "", "null"):
            try:
                track = float(normalized_row["track"])
                available_fields.add("track")
            except (ValueError, TypeError):
                pass

        # 11. Day / Night flag
        daynight = "D"
        raw_dn = normalized_row.get("daynight")
        if raw_dn not in (None, "", "null"):
            dn_val = str(raw_dn).strip().upper()
            if dn_val in ("D", "N"):
                daynight = dn_val
                available_fields.add("daynight")

        obs = NormalizedObservation(
            latitude=lat,
            longitude=lon,
            brightness=brightness,
            bright_t31=bright_t31,
            frp=frp,
            confidence=confidence_val,
            acq_date=acq_date,
            acq_time=acq_time,
            satellite=satellite,
            instrument=instrument,
            scan=scan,
            track=track,
            daynight=daynight,
            source_file=identified_filename,
            data_provenance=provenance,
            raw_properties=row,
        )
        validated_observations.append(obs)

    if not validated_observations:
        err_msg = " ".join(validation_errors[:4]) if validation_errors else "All records failed coordinate validation."
        raise ValueError(f"Data Validation Failed in '{identified_filename}': {err_msg}")

    standard_expected = {
        "latitude",
        "longitude",
        "brightness",
        "bright_t31",
        "frp",
        "confidence",
        "acq_date",
        "acq_time",
        "satellite",
        "instrument",
        "daynight",
    }
    unavailable_fields = standard_expected - available_fields

    return validated_observations, available_fields, unavailable_fields, detected_flavor, identified_filename
