"""
Universal Streaming Parser for NASA FIRMS Satellite Datasets.
Supports:
1. NASA FIRMS MODIS (CSV, JSON, GeoJSON, Shapefile ZIP)
2. NASA FIRMS VIIRS (CSV, JSON, GeoJSON, Shapefile ZIP)
3. Direct ESRI Shapefile components (.shp, .shx, .dbf, .prj)
4. Large ZIP archives containing single or multiple datasets
5. Memory-safe streaming generators for 100,000 to 1,000,000+ observations
   without buffering the whole dataset in RAM.
"""

import csv
from datetime import datetime, timezone
import io
import json
import logging
import os
from pathlib import Path
import re
import shutil
import tempfile
from typing import Any, Dict, Generator, List, Optional, Set, Tuple
import zipfile

import ijson
import numpy as np
import pandas as pd
import shapefile

logger = logging.getLogger("backend.firms_stream_parser")

# Standard Column Mapping Dictionary
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
    # Brightness Temperature (T4 / Channel 4 / I4)
    "brightness": "brightness",
    "bright_ti4": "brightness",
    "brightness_temperature": "brightness",
    "temp": "brightness",
    "temperature": "brightness",
    "bt": "brightness",
    "temp_k": "brightness",
    "temp_c": "brightness",
    "t4": "brightness",
    # Window Channel Brightness Temperature (T31 / Channel 31 / I5)
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
    # Version / Type
    "type": "type",
    "fire_type": "type",
    "version": "version",
}

THERMAL_INDICATORS: Set[str] = {
    "brightness",
    "bright_t31",
    "bright_ti4",
    "bright_ti5",
    "frp",
    "confidence",
    "satellite",
    "instrument",
    "acq_date",
    "daynight",
    "scan",
    "track",
}


_CANONICAL_COL_CACHE: Dict[str, str] = {}


def clean_column_name(raw_name: Any) -> str:
    """Standardizes column string for alias lookup."""
    if raw_name is None:
        return ""
    s = str(raw_name).strip().lower()
    s = re.sub(r"[\s\-\.]+", "_", s)
    s = re.sub(r"[^\w]", "", s)
    return s


def get_canonical_column(raw_name: Any) -> str:
    """High-speed cached column alias lookup for million-record streams."""
    if raw_name is None:
        return ""
    cached = _CANONICAL_COL_CACHE.get(raw_name)
    if cached is not None:
        return cached
    cleaned = clean_column_name(raw_name)
    canonical = COLUMN_ALIASES.get(cleaned, cleaned)
    _CANONICAL_COL_CACHE[raw_name] = canonical
    return canonical


def normalize_record_dict(
    raw_dict: Dict[str, Any],
    source_filename: str = "dataset",
) -> Optional[Dict[str, Any]]:
    """
    Maps raw record dictionary to the canonical SATRA schema:
    [latitude, longitude, brightness, bright_t31, frp, confidence,
     acq_date, acq_time, satellite, instrument, scan, track, daynight,
     hour_utc, source_file, data_provenance].

    Returns None if record has invalid latitude/longitude.
    """
    mapped: Dict[str, Any] = {get_canonical_column(k): v for k, v in raw_dict.items()}

    # 1. Validate Latitude
    raw_lat = mapped.get("latitude")
    if raw_lat in (None, "", "null"):
        return None
    try:
        lat = float(raw_lat)
        if not (-90.0 <= lat <= 90.0) or np.isnan(lat):
            return None
    except (ValueError, TypeError):
        return None

    # 2. Validate Longitude
    raw_lon = mapped.get("longitude")
    if raw_lon in (None, "", "null"):
        return None
    try:
        lon = float(raw_lon)
        if not (-180.0 <= lon <= 180.0) or np.isnan(lon):
            return None
    except (ValueError, TypeError):
        return None

    # 3. Brightness (T4 / I4)
    brightness = None
    raw_bright = mapped.get("brightness")
    if raw_bright not in (None, "", "null"):
        try:
            b_val = float(raw_bright)
            if b_val > 0 and not np.isnan(b_val):
                brightness = b_val
        except (ValueError, TypeError):
            pass

    # 4. Window Channel (T31 / I5)
    bright_t31 = None
    raw_t31 = mapped.get("bright_t31")
    if raw_t31 not in (None, "", "null"):
        try:
            t_val = float(raw_t31)
            if t_val > 0 and not np.isnan(t_val):
                bright_t31 = t_val
        except (ValueError, TypeError):
            pass

    # 5. FRP
    frp = None
    raw_frp = mapped.get("frp")
    if raw_frp not in (None, "", "null"):
        try:
            f_val = float(raw_frp)
            if f_val >= 0 and not np.isnan(f_val):
                frp = f_val
        except (ValueError, TypeError):
            pass

    # 6. Confidence
    confidence = "nominal"
    raw_conf = mapped.get("confidence")
    if raw_conf not in (None, "", "null"):
        confidence = str(raw_conf).strip().lower()

    # 7. Acquisition Date
    acq_date = None
    raw_date = mapped.get("acq_date")
    if raw_date not in (None, "", "null"):
        clean_date = str(raw_date).strip()
        if "T" in clean_date:
            clean_date = clean_date.split("T")[0]
        elif " " in clean_date:
            clean_date = clean_date.split(" ")[0]
        if re.match(r"^\d{4}-\d{2}-\d{2}$", clean_date):
            acq_date = clean_date
        elif re.match(r"^\d{4}/\d{2}/\d{2}$", clean_date):
            acq_date = clean_date.replace("/", "-")

    if not acq_date:
        acq_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 8. Acquisition Time
    acq_time = None
    raw_time = mapped.get("acq_time")
    if raw_time not in (None, "", "null"):
        clean_time = str(raw_time).strip().replace(":", "")
        if clean_time.isdigit():
            acq_time = clean_time.zfill(4)[:4]

    if not acq_time:
        acq_time = datetime.now(timezone.utc).strftime("%H%M")

    hour_val = int(acq_time[:2]) if len(acq_time) >= 2 and acq_time[:2].isdigit() else datetime.now(timezone.utc).hour

    # 9. Satellite & Instrument determination
    raw_sat = mapped.get("satellite")
    raw_inst = mapped.get("instrument")

    # Detect if source is VIIRS or MODIS from keys
    is_viirs = any(k in raw_dict for k in ["bright_ti4", "bright_ti5", "BRIGHT_TI4", "BRIGHT_TI5"])
    is_modis = not is_viirs and any(k in raw_dict for k in ["bright_t31", "BRIGHT_T31", "t31", "T31"])

    if raw_sat not in (None, "", "null"):
        satellite = str(raw_sat).strip()
    else:
        satellite = "VIIRS_SNPP_NRT" if is_viirs else ("MODIS_NRT" if is_modis else "VIIRS_SNPP_NRT")

    if raw_inst not in (None, "", "null"):
        instrument = str(raw_inst).strip()
    else:
        instrument = "VIIRS" if is_viirs else ("MODIS" if is_modis else "VIIRS")

    # 10. Scan & Track
    scan = 0.375
    if mapped.get("scan") not in (None, "", "null"):
        try:
            s_val = float(mapped["scan"])
            if s_val > 0:
                scan = s_val
        except (ValueError, TypeError):
            pass

    track = 0.375
    if mapped.get("track") not in (None, "", "null"):
        try:
            tr_val = float(mapped["track"])
            if tr_val > 0:
                track = tr_val
        except (ValueError, TypeError):
            pass

    # 11. Day / Night
    daynight = "D"
    raw_dn = mapped.get("daynight")
    if raw_dn not in (None, "", "null"):
        dn = str(raw_dn).strip().upper()
        if dn in ("D", "N"):
            daynight = dn
    else:
        # Fallback to hour-based diurnal cycle
        daynight = "N" if (hour_val < 6 or hour_val >= 18) else "D"

    return {
        "latitude": lat,
        "longitude": lon,
        "brightness": brightness if brightness is not None else 300.0,
        "bright_t31": bright_t31,
        "frp": frp if frp is not None else 0.0,
        "confidence": confidence,
        "acq_date": acq_date,
        "acq_time": acq_time,
        "satellite": satellite,
        "instrument": instrument,
        "scan": scan,
        "track": track,
        "daynight": daynight,
        "hour_utc": hour_val,
        "source_file": source_filename,
        "data_provenance": "USER_UPLOADED",
        "raw_properties": raw_dict,
    }


class FIRMSDataStreamer:
    """
    Memory-safe streaming extractor and iterator for FIRMS files of any size.
    Handles CSV, JSON, GeoJSON, Shapefile, and ZIP archives directly on disk.
    """

    def __init__(self, file_path: Path, filename: str, temp_dir: Optional[Path] = None):
        self.file_path = Path(file_path)
        self.filename = filename
        self.temp_dir = temp_dir
        self.identified_file = filename
        self.format_detected = "Unknown"
        self.detected_flavor = "NASA FIRMS Data"
        self.data_file_path: Optional[Path] = None
        self._inspect_and_setup()

    def _inspect_and_setup(self) -> None:
        """Inspects file headers / ZIP content and configures the streaming target."""
        fn_lower = self.filename.lower()

        # Check if ZIP
        if fn_lower.endswith(".zip") or (self.file_path.exists() and self._is_zip_file()):
            self._setup_zip_archive()
        elif fn_lower.endswith(".shp"):
            self.format_detected = "Shapefile"
            self.detected_flavor = "ESRI Shapefile"
            self.data_file_path = self.file_path
            self.identified_file = self.filename
        elif fn_lower.endswith((".json", ".geojson")):
            self.format_detected = "JSON"
            self.detected_flavor = "NASA FIRMS JSON"
            self.data_file_path = self.file_path
            self.identified_file = self.filename
        elif fn_lower.endswith((".csv", ".tsv", ".txt")):
            self.format_detected = "CSV"
            self.detected_flavor = "NASA FIRMS CSV"
            self.data_file_path = self.file_path
            self.identified_file = self.filename
        else:
            # Detect by magic bytes / first characters
            if self._is_zip_file():
                self._setup_zip_archive()
            elif self._is_shp_file():
                self.format_detected = "Shapefile"
                self.detected_flavor = "ESRI Shapefile"
                self.data_file_path = self.file_path
            elif self._is_json_file():
                self.format_detected = "JSON"
                self.detected_flavor = "NASA FIRMS JSON"
                self.data_file_path = self.file_path
            else:
                self.format_detected = "CSV"
                self.detected_flavor = "NASA FIRMS CSV"
                self.data_file_path = self.file_path

    def _is_zip_file(self) -> bool:
        try:
            with open(self.file_path, "rb") as f:
                return f.read(4) == b"PK\x03\x04"
        except Exception:
            return False

    def _is_shp_file(self) -> bool:
        try:
            with open(self.file_path, "rb") as f:
                magic = f.read(4)
                return magic == b"\x00\x00\x27\x0a"  # Big-endian 9994
        except Exception:
            return False

    def _is_json_file(self) -> bool:
        try:
            with open(self.file_path, "rb") as f:
                head = f.read(200).strip()
                return head.startswith(b"{") or head.startswith(b"[")
        except Exception:
            return False

    def _setup_zip_archive(self) -> None:
        """Safely extracts ZIP to temporary folder and finds data candidate."""
        if not self.temp_dir:
            self._owned_temp_dir = tempfile.TemporaryDirectory()
            self.temp_dir = Path(self._owned_temp_dir.name)

        try:
            with zipfile.ZipFile(self.file_path, "r") as zf:
                # Protection against path traversal
                for member in zf.infolist():
                    m_path = member.filename
                    if os.path.isabs(m_path) or m_path.startswith(("/", "\\")) or ".." in Path(m_path).parts:
                        raise ValueError(f"Security error: ZIP archive contains unsafe path traversal '{m_path}'.")
                zf.extractall(self.temp_dir)
        except zipfile.BadZipFile:
            raise ValueError(f"File '{self.filename}' is not a valid or readable ZIP archive.")

        # Candidate scan
        candidates: List[Path] = []
        ignore_patterns = ["readme", "license", "licence", "notice", "changelog", "manifest", ".ds_store", "__macosx"]

        for p in self.temp_dir.rglob("*"):
            if not p.is_file():
                continue
            name_lower = p.name.lower()
            rel_lower = str(p.relative_to(self.temp_dir)).lower()
            if any(ign in rel_lower for ign in ignore_patterns):
                continue
            if name_lower.endswith((".shp", ".csv", ".tsv", ".txt", ".json", ".geojson")):
                candidates.append(p)

        if not candidates:
            raise ValueError("No compatible NASA FIRMS / VIIRS / MODIS observation file found inside ZIP.")

        # Prioritize:
        # 1. Shapefiles (.shp with .dbf)
        # 2. Files with 'nrt' in name
        # 3. CSV / JSON
        def score_candidate(p: Path) -> int:
            score = 0
            n = p.name.lower()
            if n.endswith(".shp"):
                dbf = p.with_suffix(".dbf")
                if dbf.exists() or any(p.parent.glob("*.dbf")):
                    score += 50
            if "nrt" in n:
                score += 20
            if n.endswith((".csv", ".tsv", ".json", ".geojson")):
                score += 10
            return score

        candidates.sort(key=score_candidate, reverse=True)
        chosen = candidates[0]
        self.data_file_path = chosen
        self.identified_file = str(chosen.relative_to(self.temp_dir)).replace("\\", "/")

        if chosen.name.lower().endswith(".shp"):
            self.format_detected = "Shapefile"
            self.detected_flavor = "ESRI Shapefile ZIP"
        elif chosen.name.lower().endswith((".json", ".geojson")):
            self.format_detected = "JSON"
            self.detected_flavor = "NASA FIRMS JSON ZIP"
        else:
            self.format_detected = "CSV"
            self.detected_flavor = "NASA FIRMS CSV ZIP"

    def iter_record_chunks(self, chunk_size: int = 5000) -> Generator[List[Dict[str, Any]], None, None]:
        """
        Memory-safe generator: yields batches of canonical normalized records
        of size chunk_size.
        """
        if not self.data_file_path or not self.data_file_path.exists():
            raise ValueError(f"Data file '{self.identified_file}' is missing or unreadable.")

        if self.format_detected == "Shapefile":
            yield from self._stream_shapefile_chunks(chunk_size)
        elif self.format_detected == "JSON":
            yield from self._stream_json_chunks(chunk_size)
        else:
            yield from self._stream_csv_chunks(chunk_size)

    def _stream_csv_chunks(self, chunk_size: int) -> Generator[List[Dict[str, Any]], None, None]:
        """Streams CSV in chunks using pandas with comments ignored."""
        chunk_buffer: List[Dict[str, Any]] = []

        try:
            for df_chunk in pd.read_csv(
                self.data_file_path,
                chunksize=chunk_size,
                comment="#",
                dtype=str,
                encoding="utf-8",
                on_bad_lines="skip",
            ):
                records = df_chunk.to_dict(orient="records")
                del df_chunk
                for r in records:
                    norm = normalize_record_dict(r, self.identified_file)
                    if norm:
                        chunk_buffer.append(norm)
                        if len(chunk_buffer) >= chunk_size:
                            yield chunk_buffer
                            chunk_buffer = []

        except UnicodeDecodeError:
            # Fallback to latin-1 encoding
            for df_chunk in pd.read_csv(
                self.data_file_path,
                chunksize=chunk_size,
                comment="#",
                dtype=str,
                encoding="latin-1",
                on_bad_lines="skip",
            ):
                records = df_chunk.to_dict(orient="records")
                del df_chunk
                for r in records:
                    norm = normalize_record_dict(r, self.identified_file)
                    if norm:
                        chunk_buffer.append(norm)
                        if len(chunk_buffer) >= chunk_size:
                            yield chunk_buffer
                            chunk_buffer = []

        if chunk_buffer:
            yield chunk_buffer

    def _stream_json_chunks(self, chunk_size: int) -> Generator[List[Dict[str, Any]], None, None]:
        """Streams JSON using ijson without loading full payload into RAM."""
        chunk_buffer: List[Dict[str, Any]] = []
        found_any = False

        # 1. Try streaming as top-level array: `item`
        with open(self.data_file_path, "rb") as f:
            try:
                for obj in ijson.items(f, "item"):
                    found_any = True
                    if isinstance(obj, dict):
                        norm = normalize_record_dict(obj, self.identified_file)
                        if norm:
                            chunk_buffer.append(norm)
                            if len(chunk_buffer) >= chunk_size:
                                yield chunk_buffer
                                chunk_buffer = []
            except Exception as e:
                logger.debug("ijson 'item' stream did not match: %s", str(e))

        if found_any:
            if chunk_buffer:
                yield chunk_buffer
            return

        # 2. Try streaming as GeoJSON FeatureCollection: `features.item`
        with open(self.data_file_path, "rb") as f:
            try:
                for feat in ijson.items(f, "features.item"):
                    found_any = True
                    if isinstance(feat, dict):
                        props = dict(feat.get("properties") or {})
                        geom = feat.get("geometry") or {}
                        if isinstance(geom, dict) and geom.get("type") == "Point":
                            coords = geom.get("coordinates") or []
                            if len(coords) >= 2:
                                props["longitude"] = coords[0]
                                props["latitude"] = coords[1]
                        norm = normalize_record_dict(props, self.identified_file)
                        if norm:
                            chunk_buffer.append(norm)
                            if len(chunk_buffer) >= chunk_size:
                                yield chunk_buffer
                                chunk_buffer = []
            except Exception as e:
                logger.debug("ijson 'features.item' stream did not match: %s", str(e))

        if found_any:
            if chunk_buffer:
                yield chunk_buffer
            return

        # 3. Try container keys: `data.item`, `records.item`, `detections.item`, `observations.item`
        for key in ["data", "records", "detections", "observations"]:
            with open(self.data_file_path, "rb") as f:
                try:
                    for obj in ijson.items(f, f"{key}.item"):
                        found_any = True
                        if isinstance(obj, dict):
                            norm = normalize_record_dict(obj, self.identified_file)
                            if norm:
                                chunk_buffer.append(norm)
                                if len(chunk_buffer) >= chunk_size:
                                    yield chunk_buffer
                                    chunk_buffer = []
                except Exception:
                    pass
            if found_any:
                break

        if found_any:
            if chunk_buffer:
                yield chunk_buffer
            return

        # 4. Fallback for single object dictionary
        with open(self.data_file_path, "r", encoding="utf-8", errors="replace") as f:
            try:
                single_obj = json.load(f)
                if isinstance(single_obj, dict):
                    norm = normalize_record_dict(single_obj, self.identified_file)
                    if norm:
                        yield [norm]
            except Exception as e:
                raise ValueError(f"Malformed JSON in uploaded file '{self.filename}': {str(e)}")

    def _stream_shapefile_chunks(self, chunk_size: int) -> Generator[List[Dict[str, Any]], None, None]:
        """Streams ESRI Shapefile records (.shp + .dbf) without RAM exhaustion."""
        shp_path = str(self.data_file_path)
        try:
            # encoding='utf-8' with fallback encodingErrors='replace'
            sf = shapefile.Reader(shp_path, encoding="utf-8", encodingErrors="replace")
        except Exception as e:
            raise ValueError(f"Failed to open Shapefile '{self.identified_file}': {str(e)}")

        chunk_buffer: List[Dict[str, Any]] = []

        try:
            for shape_rec in sf.iterShapeRecords():
                try:
                    rec_dict = shape_rec.record.as_dict()
                except Exception:
                    rec_dict = {}

                # Extract coordinates from Point geometry if missing in attributes
                has_lat = any(k.lower() in ("latitude", "lat", "y") for k in rec_dict.keys())
                has_lon = any(k.lower() in ("longitude", "lon", "long", "x") for k in rec_dict.keys())

                if not (has_lat and has_lon):
                    geom = shape_rec.shape
                    if geom and geom.points:
                        pt = geom.points[0]
                        rec_dict["longitude"] = pt[0]
                        rec_dict["latitude"] = pt[1]

                norm = normalize_record_dict(rec_dict, self.identified_file)
                if norm:
                    chunk_buffer.append(norm)
                    if len(chunk_buffer) >= chunk_size:
                        yield chunk_buffer
                        chunk_buffer = []

            if chunk_buffer:
                yield chunk_buffer

        finally:
            sf.close()

    def get_preview(self, max_records: int = 10, quick: bool = False) -> Dict[str, Any]:
        """Fetches lightweight preview for dataset validation."""
        sample_records: List[Dict[str, Any]] = []
        detected_fields: Set[str] = set()

        for chunk in self.iter_record_chunks(chunk_size=max_records):
            for r in chunk:
                sample_records.append(r)
                detected_fields.update(r.keys())
                if len(sample_records) >= max_records:
                    break
            if len(sample_records) >= max_records:
                break

        if not sample_records:
            raise ValueError(f"Zero valid satellite observation records found in '{self.identified_file}'.")

        first = sample_records[0]
        has_thermal = any(k in detected_fields for k in THERMAL_INDICATORS)
        if not has_thermal:
            raise ValueError(
                "Unsupported observation format. We could not identify sufficient satellite thermal/fire observation fields "
                "in this file. Please upload a NASA FIRMS, MODIS, VIIRS-compatible CSV or JSON file."
            )

        # Estimate total record count without loading all records into RAM
        estimated_count = 0
        if self.format_detected == "Shapefile":
            try:
                sf = shapefile.Reader(str(self.data_file_path), encoding="utf-8", encodingErrors="replace")
                estimated_count = len(sf)
                sf.close()
            except Exception:
                estimated_count = len(sample_records)
        elif self.format_detected == "CSV":
            try:
                with open(self.data_file_path, "rb") as f:
                    estimated_count = sum(1 for line in f if line.strip() and not line.strip().startswith(b"#")) - 1
                    estimated_count = max(len(sample_records), estimated_count)
            except Exception:
                estimated_count = len(sample_records)
        else:
            # JSON format
            if quick:
                # Instantaneous file-size based estimate for background job start
                try:
                    f_sz = self.data_file_path.stat().st_size
                    # Approx 400 bytes per JSON record
                    estimated_count = max(len(sample_records), int(f_sz / 400))
                except Exception:
                    estimated_count = len(sample_records)
            else:
                # Fast counting of JSON objects with ijson without record normalization
                total_counted = 0
                try:
                    with open(self.data_file_path, "rb") as f:
                        for _ in ijson.items(f, "item"):
                            total_counted += 1
                    if total_counted == 0:
                        with open(self.data_file_path, "rb") as f:
                            for _ in ijson.items(f, "features.item"):
                                total_counted += 1
                    estimated_count = max(len(sample_records), total_counted)
                except Exception:
                    try:
                        f_sz = self.data_file_path.stat().st_size
                        estimated_count = max(len(sample_records), int(f_sz / 400))
                    except Exception:
                        estimated_count = len(sample_records)

        # Detect MODIS / VIIRS flavor from sample records
        is_viirs = any(
            "viirs" in str(r.get("instrument", "") or "").lower()
            or "viirs" in str(r.get("satellite", "") or "").lower()
            or "bright_ti4" in str(r)
            for r in sample_records
        )
        is_modis = any(
            "modis" in str(r.get("instrument", "") or "").lower()
            or "terra" in str(r.get("satellite", "") or "").lower()
            or "aqua" in str(r.get("satellite", "") or "").lower()
            or "bright_t31" in str(r)
            for r in sample_records
        )

        sensor_name = "NASA FIRMS VIIRS" if is_viirs else ("NASA FIRMS MODIS" if is_modis else "NASA FIRMS Data")
        if self.format_detected == "Shapefile":
            detected_label = f"{sensor_name} Shapefile"
        elif "ZIP" in self.detected_flavor:
            detected_label = f"{sensor_name} ({self.format_detected} ZIP)"
        else:
            detected_label = f"{sensor_name} {self.format_detected}"

        return {
            "status": "VALID",
            "filename": self.filename,
            "identified_file": self.identified_file,
            "record_count": estimated_count,
            "format_detected": detected_label,
            "detected_fields": list(detected_fields),
            "sample_preview": {
                "latitude": first["latitude"],
                "longitude": first["longitude"],
                "brightness": first.get("brightness"),
                "frp": first.get("frp"),
                "acq_date": first.get("acq_date"),
                "satellite": first.get("satellite"),
                "instrument": first.get("instrument"),
            },
        }

    def cleanup(self) -> None:
        """Cleans up temporary directory if created."""
        if hasattr(self, "_owned_temp_dir"):
            try:
                self._owned_temp_dir.cleanup()
            except Exception:
                pass
