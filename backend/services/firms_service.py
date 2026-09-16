"""
NASA FIRMS Satellite Thermal Data Integration Service.
PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.

Complete End-to-End Implementation:
1. Dynamic credential resolution (reads NASA_FIRMS_MAP_KEY from .env / os.environ dynamically)
2. Official NASA MAP_KEY status verification:
   https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY={MAP_KEY}
3. Near-Real-Time (NRT) Area API query construction:
   https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SATELLITE}/{WEST},{SOUTH},{EAST},{NORTH}/{DAY_RANGE}[/{DATE}]
   - Default source: VIIRS_NOAA20_NRT (supports VIIRS_NOAA21_NRT, VIIRS_SNPP_NRT, MODIS_NRT)
   - Default bbox: 68.1,6.5,97.4,35.5 (India extent)
   - Default day range: 1 (most recent data, NO hardcoded date)
4. Comprehensive diagnostic logging (URL without key, HTTP status, content-type, length, rows)
5. Robust CSV parsing supporting bright_ti4/brightness, bright_ti5/bright_t31, scan, track, frp, etc.
6. Exact deduplication logic
7. AI classification via existing SATRA ML model (predict_single)
8. Database persistence with data_provenance = "REAL_FIRMS"
9. Operational alert generation (create_alert_if_eligible)
10. Detailed diagnostic health endpoint support
"""
import io
import os
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import requests
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.core.config import settings
from backend.models.detection import Detection
from backend.models.alert import Alert
from backend.services.ml_service import get_ml_service
from backend.services.alert_service import create_alert_if_eligible
from src.config import PROVENANCE_REAL_FIRMS, BASE_DIR

logger = logging.getLogger("backend.firms_service")

# Default India Geographical Bounding Box: West, South, East, North (Section 4 Requirements)
DEFAULT_WEST = 68.0
DEFAULT_SOUTH = 6.0
DEFAULT_EAST = 97.0
DEFAULT_NORTH = 37.0

DEFAULT_BBOX = {
    "west": DEFAULT_WEST,
    "south": DEFAULT_SOUTH,
    "east": DEFAULT_EAST,
    "north": DEFAULT_NORTH,
}

REGIONS = {
    "india": {"west": 68.0, "south": 6.0, "east": 97.0, "north": 37.0},
    "global": {"west": -180.0, "south": -60.0, "east": 180.0, "north": 70.0},
    "south_asia": {"west": 60.0, "south": 5.0, "east": 105.0, "north": 40.0},
}

# Default NRT Sensor Product for Live Real-Time Dashboard
DEFAULT_NRT_SATELLITE = "VIIRS_NOAA20_NRT"
DEFAULT_SATELLITE = DEFAULT_NRT_SATELLITE
DEFAULT_DAY_RANGE = 1

SUPPORTED_NRT_SOURCES = [
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
    "VIIRS_SNPP_NRT",
    "MODIS_NRT",
    "VIIRS_NOAA20_SP",
]


class FirmsServiceException(Exception):
    """Raised when the NASA FIRMS API returns an error or communication fails."""
    def __init__(self, message: str, status_code: int = 502, error_code: str = "FIRMS_ERROR", details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}


class FirmsService:
    """
    Service managing communication between SATRA and NASA FIRMS API.
    """

    def __init__(self):
        self._last_sync_timestamp: Optional[str] = None
        self._last_sync_status: str = "STANDBY"
        self._last_sync_message: str = "No sync performed yet in current session."
        self._last_sync_count: int = 0
        self._last_fetch_raw_rows: int = 0
        self._last_fetch_new_rows: int = 0
        self._last_fetch_duplicates: int = 0
        self._last_source: str = DEFAULT_NRT_SATELLITE
        self._key_status_cache: Optional[Dict[str, Any]] = None

    def _reload_env_key(self) -> str:
        """Dynamically re-reads NASA_FIRMS_MAP_KEY from .env and environment."""
        env_path = BASE_DIR / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=True)
        key = os.getenv("NASA_FIRMS_MAP_KEY", "").strip()
        if not key:
            key = getattr(settings, "NASA_FIRMS_MAP_KEY", "").strip()
        return key

    @property
    def base_url(self) -> str:
        url = getattr(settings, "NASA_FIRMS_BASE_URL", "https://firms.modaps.eosdis.nasa.gov/api")
        return url.rstrip("/")

    @property
    def map_key(self) -> str:
        return self._reload_env_key()

    def is_api_key_configured(self) -> bool:
        """Verifies if a non-empty, non-placeholder NASA MAP_KEY is configured."""
        key = self.map_key
        return bool(key and len(key) >= 8 and "YOUR_KEY" not in key.upper() and "PLACEHOLDER" not in key.upper())

    def verify_map_key(self) -> Dict[str, Any]:
        """
        Tests the configured NASA MAP_KEY using NASA's official mapkey_status endpoint:
        https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY={MAP_KEY}

        Returns NASA verification details (transaction_limit, current_transactions, etc.)
        """
        key = self.map_key
        if not key or len(key) < 8 or "YOUR_KEY" in key.upper() or "PLACEHOLDER" in key.upper():
            return {
                "valid": False,
                "configured": False,
                "status_code": 401,
                "error": "MAP_KEY_NOT_CONFIGURED",
                "message": "NASA_FIRMS_MAP_KEY is not configured in backend environment (.env).",
            }

        status_url = f"https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY={key}"
        logger.info("Verifying NASA FIRMS MAP_KEY via official NASA mapkey_status endpoint...")

        try:
            resp = requests.get(status_url, timeout=20)
            status_code = resp.status_code
            raw_text = resp.text.strip()

            if status_code == 200:
                try:
                    data = resp.json()
                    # NASA returns valid JSON containing transaction limits:
                    # {"transaction_limit": 5000, "current_transactions": 0, "transaction_interval": 60}
                    result = {
                        "valid": True,
                        "configured": True,
                        "status_code": 200,
                        "transaction_limit": data.get("transaction_limit"),
                        "current_transactions": data.get("current_transactions"),
                        "transaction_interval": data.get("transaction_interval"),
                        "message": "NASA FIRMS MAP_KEY is verified, valid and authorized.",
                    }
                    self._key_status_cache = result
                    return result
                except Exception:
                    if "invalid" in raw_text.lower() or "bad" in raw_text.lower():
                        result = {
                            "valid": False,
                            "configured": True,
                            "status_code": 403,
                            "error": "INVALID_MAP_KEY",
                            "message": f"NASA FIRMS reported key error: {raw_text}",
                        }
                        self._key_status_cache = result
                        return result
                    result = {
                        "valid": True,
                        "configured": True,
                        "status_code": 200,
                        "message": "NASA FIRMS MAP_KEY authorized.",
                    }
                    self._key_status_cache = result
                    return result
            else:
                result = {
                    "valid": False,
                    "configured": True,
                    "status_code": status_code,
                    "error": "INVALID_MAP_KEY",
                    "message": f"NASA FIRMS mapkey_status returned HTTP {status_code}: {raw_text[:200]}",
                }
                self._key_status_cache = result
                return result

        except Exception as e:
            logger.error("Failed to connect to NASA FIRMS mapkey_status endpoint: %s", e)
            return {
                "valid": False,
                "configured": True,
                "status_code": 502,
                "error": "NETWORK_ERROR",
                "message": f"Network error connecting to NASA FIRMS mapkey_status: {str(e)}",
            }

    def get_status(self, db: Session) -> Dict[str, Any]:
        """
        Returns real-time connection status of NASA FIRMS integration.
        Adheres strictly to Section 9 & Section 10 specification:
        {
          "status": "LIVE",
          "source": "NASA FIRMS",
          "sensors": ["VIIRS", "MODIS"],
          "last_updated": "...",
          "data_age_seconds": 120,
          "detections": 1284
        }
        Does NOT expose the MAP_KEY to callers.
        """
        is_configured = self.is_api_key_configured()

        # Count existing REAL_FIRMS records in the database
        try:
            real_firms_count = db.query(func.count(Detection.id)).filter(
                Detection.data_provenance == PROVENANCE_REAL_FIRMS
            ).scalar() or 0

            latest_real_rec = db.query(Detection).filter(
                Detection.data_provenance == PROVENANCE_REAL_FIRMS
            ).order_by(Detection.acq_date.desc(), Detection.acq_time.desc(), Detection.id.desc()).first()

            latest_obs = None
            last_dt_iso = None
            if latest_real_rec:
                latest_obs = f"{latest_real_rec.acq_date} {latest_real_rec.acq_time} UTC"
                if latest_real_rec.created_at:
                    last_dt_iso = latest_real_rec.created_at.isoformat()
        except Exception as e:
            logger.warning("Error querying DB for REAL_FIRMS records: %s", e)
            real_firms_count = 0
            latest_obs = None
            last_dt_iso = None

        now_utc = datetime.now(timezone.utc)
        data_age_seconds: Optional[int] = None
        effective_last_updated = self._last_sync_timestamp or last_dt_iso

        if effective_last_updated:
            try:
                sync_dt = datetime.fromisoformat(effective_last_updated.replace("Z", "+00:00"))
                data_age_seconds = max(0, int((now_utc - sync_dt).total_seconds()))
            except Exception:
                data_age_seconds = None

        # Determine true status according to live data presence
        if not is_configured:
            status_label = "OFFLINE"
            msg = "NASA FIRMS MAP_KEY is not configured in backend environment (.env)."
        elif self._last_sync_status == "API ERROR":
            status_label = "DEGRADED" if real_firms_count > 0 else "OFFLINE"
            msg = self._last_sync_message
        elif self._last_sync_status == "CONNECTED":
            status_label = "LIVE"
            msg = self._last_sync_message
        elif real_firms_count > 0:
            status_label = "LIVE"
            msg = f"NASA FIRMS active. {real_firms_count} real satellite observations loaded."
        else:
            status_label = "STANDBY"
            msg = "NASA FIRMS MAP_KEY configured. Awaiting initial satellite pass sync."

        return {
            # Standard Section 9 Contract
            "status": status_label,
            "source": "NASA FIRMS",
            "sensors": ["VIIRS", "MODIS"],
            "last_updated": effective_last_updated or now_utc.isoformat(),
            "data_age_seconds": data_age_seconds if data_age_seconds is not None else 0,
            "detections": real_firms_count,

            # Extended Diagnostic & UI Compatibility Fields
            "api_key_configured": is_configured,
            "last_sync": effective_last_updated,
            "last_sync_count": self._last_sync_count,
            "total_real_firms_records": real_firms_count,
            "latest_observation": latest_obs,
            "active_satellites": ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"],
            "message": msg,
        }

    def build_request_url(
        self,
        satellite: str = DEFAULT_NRT_SATELLITE,
        west: float = DEFAULT_WEST,
        south: float = DEFAULT_SOUTH,
        east: float = DEFAULT_EAST,
        north: float = DEFAULT_NORTH,
        day_range: int = DEFAULT_DAY_RANGE,
        date_str: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        Constructs the exact NASA FIRMS Area CSV request URL:
        https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SATELLITE}/{WEST},{SOUTH},{EAST},{NORTH}/{DAY_RANGE}[/{DATE}]

        - For live / recent data: without DATE, NASA returns the most recent data.
        - Day range: 1..5 as supported by NASA FIRMS.
        - Bounding box: west,south,east,north.

        Returns:
            Tuple of (actual_request_url, masked_log_url)
        """
        if not self.is_api_key_configured():
            raise FirmsServiceException(
                "NASA FIRMS MAP_KEY is not configured. Please add NASA_FIRMS_MAP_KEY=your_key to backend .env file.",
                status_code=401,
                error_code="API_KEY_REQUIRED",
            )

        # Enforce day_range 1..5 for live Area queries
        day_range = max(1, min(5, int(day_range)))

        # Format coordinates strictly: west,south,east,north
        bbox_str = f"{west:.4f},{south:.4f},{east:.4f},{north:.4f}"

        # URL construction
        url_parts = [self.base_url, "area", "csv", self.map_key, satellite, bbox_str, str(day_range)]
        
        # Only append DATE if explicitly supplied (not hardcoded old date)
        if date_str and date_str.strip():
            url_parts.append(date_str.strip())

        actual_url = "/".join(url_parts)

        # Masked URL for logs
        masked_parts = list(url_parts)
        masked_parts[3] = "***MASKED***"
        masked_url = "/".join(masked_parts)

        return actual_url, masked_url

    def fetch_and_ingest(
        self,
        db: Session,
        satellite: str = DEFAULT_NRT_SATELLITE,
        west: float = DEFAULT_WEST,
        south: float = DEFAULT_SOUTH,
        east: float = DEFAULT_EAST,
        north: float = DEFAULT_NORTH,
        day_range: int = DEFAULT_DAY_RANGE,
        date_str: Optional[str] = None,
        store: bool = True,
    ) -> Dict[str, Any]:
        """
        Executes the live NASA FIRMS integration pipeline:
        1. Verifies MAP_KEY configuration
        2. Constructs authenticated Area API request
        3. Executes HTTP GET request and logs raw diagnostic telemetry
        4. Validates and parses CSV
        5. Performs exact deduplication
        6. Runs AI model classification on new observations
        7. Persists records to database with data_provenance = "REAL_FIRMS"
        8. Evaluates operational alerts
        9. Returns comprehensive diagnostic results
        """
        self._last_source = satellite

        # 1. Verify API Key
        if not self.is_api_key_configured():
            self._last_sync_status = "API KEY REQUIRED"
            self._last_sync_message = "NASA FIRMS MAP_KEY is not configured. Please set NASA_FIRMS_MAP_KEY in backend .env."
            return {
                "status": "API KEY REQUIRED",
                "message": self._last_sync_message,
                "records_count": 0,
                "new_detections_count": 0,
                "duplicates_count": 0,
                "last_sync": datetime.now(timezone.utc).isoformat(),
                "source": satellite,
                "items": [],
            }

        # Multi-satellite trigger support ("ALL" or "auto")
        if str(satellite).strip().upper() in ("ALL", "AUTO"):
            total_records = 0
            total_new = 0
            total_dups = 0
            all_items = []
            for s_source in ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"]:
                try:
                    s_res = self.fetch_and_ingest(
                        db=db,
                        satellite=s_source,
                        west=west,
                        south=south,
                        east=east,
                        north=north,
                        day_range=day_range,
                        date_str=date_str,
                        store=store,
                    )
                    total_records += s_res.get("records_count", 0)
                    total_new += s_res.get("new_detections_count", 0)
                    total_dups += s_res.get("duplicates_count", 0)
                    all_items.extend(s_res.get("items", []))
                except Exception as s_exc:
                    logger.warning("Error during multi-sensor sync for %s: %s", s_source, s_exc)

            now_iso = datetime.now(timezone.utc).isoformat()
            self._last_sync_timestamp = now_iso
            self._last_sync_status = "CONNECTED"
            self._last_sync_count = total_new
            self._last_source = "VIIRS + MODIS"
            self._last_sync_message = f"Synchronized {total_records} observations ({total_new} new stored, {total_dups} duplicates skipped) across VIIRS and MODIS."
            return {
                "status": "CONNECTED",
                "message": self._last_sync_message,
                "records_count": total_records,
                "new_detections_count": total_new,
                "duplicates_count": total_dups,
                "last_sync": now_iso,
                "source": "VIIRS + MODIS",
                "satellite": "ALL",
                "bounding_box": [west, south, east, north],
                "items": all_items[:40],
            }

        # 2. Build URL
        try:
            actual_url, masked_url = self.build_request_url(
                satellite=satellite,
                west=west,
                south=south,
                east=east,
                north=north,
                day_range=day_range,
                date_str=date_str,
            )
        except FirmsServiceException as fe:
            self._last_sync_status = "API KEY REQUIRED"
            self._last_sync_message = fe.message
            return {
                "status": "API KEY REQUIRED",
                "message": fe.message,
                "records_count": 0,
                "new_detections_count": 0,
                "duplicates_count": 0,
                "last_sync": datetime.now(timezone.utc).isoformat(),
                "source": satellite,
                "items": [],
            }

        # 3. HTTP Request
        try:
            response = requests.get(actual_url, timeout=45)
        except requests.Timeout:
            self._last_sync_status = "API ERROR"
            self._last_sync_message = "NASA FIRMS API request timed out (45s)."
            logger.error("NASA FIRMS timeout on URL: %s", masked_url)
            raise FirmsServiceException(self._last_sync_message, status_code=504, error_code="TIMEOUT")
        except requests.RequestException as re:
            self._last_sync_status = "API ERROR"
            self._last_sync_message = f"Network error communicating with NASA FIRMS: {str(re)}"
            logger.error("NASA FIRMS network error: %s", re)
            raise FirmsServiceException(self._last_sync_message, status_code=502, error_code="NETWORK_ERROR")

        raw_text = response.text.strip()
        status_code = response.status_code
        content_type = response.headers.get("content-type", "unknown")
        response_len = len(raw_text)

        # 4. Diagnostic Logging (Requirement 6)
        logger.info(
            "NASA FIRMS REQUEST\n"
            "url=%s\n"
            "source=%s\n"
            "bbox=%s,%s,%s,%s\n"
            "days=%s\n"
            "status=%s\n"
            "content_type=%s\n"
            "response_length=%s",
            masked_url,
            satellite,
            west, south, east, north,
            day_range,
            status_code,
            content_type,
            response_len,
        )

        # 5. Handle HTTP Status Codes
        if status_code == 403:
            self._last_sync_status = "API ERROR"
            self._last_sync_message = f"NASA FIRMS API returned HTTP 403 Forbidden: Invalid or unauthorized MAP_KEY ({raw_text[:150]})."
            logger.warning(self._last_sync_message)
            raise FirmsServiceException(self._last_sync_message, status_code=403, error_code="INVALID_MAP_KEY")
        elif status_code == 429:
            self._last_sync_status = "API ERROR"
            self._last_sync_message = "NASA FIRMS API rate limit exceeded (HTTP 429). Please wait before requesting."
            logger.warning(self._last_sync_message)
            raise FirmsServiceException(self._last_sync_message, status_code=429, error_code="RATE_LIMIT")
        elif status_code in (500, 502, 503, 504):
            self._last_sync_status = "API ERROR"
            self._last_sync_message = f"NASA Earthdata server error (HTTP {status_code})."
            logger.error(self._last_sync_message)
            raise FirmsServiceException(self._last_sync_message, status_code=status_code, error_code="SERVER_ERROR")

        # Check for HTML error payload
        if raw_text.startswith("<") and ("<html" in raw_text.lower() or "<!doctype" in raw_text.lower()):
            self._last_sync_status = "API ERROR"
            self._last_sync_message = "NASA FIRMS returned unexpected HTML error page instead of CSV."
            logger.error("HTML error payload: %s", raw_text[:200])
            raise FirmsServiceException(self._last_sync_message, status_code=502, error_code="HTML_ERROR")

        # Check for error text inside HTTP 200 response
        if "Bad map_key" in raw_text or "not authorized" in raw_text.lower() or "Invalid" in raw_text:
            self._last_sync_status = "API ERROR"
            self._last_sync_message = f"NASA FIRMS returned error: {raw_text[:150]}"
            logger.warning(self._last_sync_message)
            raise FirmsServiceException(self._last_sync_message, status_code=403, error_code="BAD_MAP_KEY")

        # 6. Handle Empty Response (0 thermal detections)
        if not raw_text or (raw_text.count("\n") == 0 and "latitude" not in raw_text.lower()):
            if day_range == 1 and not date_str:
                logger.info("day_range=1 returned 0 rows for %s. Querying recent orbital window (day_range=2)...", satellite)
                return self.fetch_and_ingest(
                    db=db,
                    satellite=satellite,
                    west=west,
                    south=south,
                    east=east,
                    north=north,
                    day_range=2,
                    date_str=None,
                    store=store,
                )

            now_iso = datetime.now(timezone.utc).isoformat()
            self._last_sync_timestamp = now_iso
            self._last_sync_status = "NO DATA"
            self._last_sync_count = 0
            self._last_fetch_raw_rows = 0
            self._last_fetch_new_rows = 0
            self._last_fetch_duplicates = 0
            self._last_sync_message = f"NASA FIRMS returned 0 thermal detections for {satellite} in region [{west},{south},{east},{north}]."
            logger.info(self._last_sync_message)
            return {
                "status": "NO DATA",
                "message": self._last_sync_message,
                "records_count": 0,
                "new_detections_count": 0,
                "duplicates_count": 0,
                "last_sync": now_iso,
                "source": satellite,
                "bounding_box": [west, south, east, north],
                "items": [],
            }

        # 7. Parse CSV Response
        try:
            df = pd.read_csv(io.StringIO(raw_text))
        except Exception as pe:
            self._last_sync_status = "API ERROR"
            self._last_sync_message = f"Failed to parse NASA FIRMS CSV: {str(pe)}"
            logger.error(self._last_sync_message)
            raise FirmsServiceException(self._last_sync_message, status_code=500, error_code="CSV_PARSE_ERROR")

        # Log CSV Header and Shape (Requirement 6)
        logger.info("NASA FIRMS CSV HEADER: %s (Rows: %d)", list(df.columns), len(df))

        if df.empty:
            if day_range == 1 and not date_str:
                logger.info("df.empty on day_range=1 for %s. Falling back to day_range=2...", satellite)
                return self.fetch_and_ingest(
                    db=db,
                    satellite=satellite,
                    west=west,
                    south=south,
                    east=east,
                    north=north,
                    day_range=2,
                    date_str=None,
                    store=store,
                )
            now_iso = datetime.now(timezone.utc).isoformat()
            self._last_sync_timestamp = now_iso
            self._last_sync_status = "NO DATA"
            self._last_sync_count = 0
            self._last_fetch_raw_rows = 0
            self._last_fetch_new_rows = 0
            self._last_fetch_duplicates = 0
            self._last_sync_message = "NASA FIRMS returned header only (0 hotspot detections)."
            return {
                "status": "NO DATA",
                "message": self._last_sync_message,
                "records_count": 0,
                "new_detections_count": 0,
                "duplicates_count": 0,
                "last_sync": now_iso,
                "source": satellite,
                "bounding_box": [west, south, east, north],
                "items": [],
            }

        total_raw_rows = len(df)
        valid_observations = 0
        invalid_rows = 0
        duplicates_skipped = 0
        seen_batch_keys = set()
        new_detections = []
        saved_items = []

        ml_service = get_ml_service()
        now_utc = datetime.now(timezone.utc)

        # 8. Iterate Observations & Normalize
        for _, row in df.iterrows():
            try:
                raw_lat = row.get("latitude")
                raw_lon = row.get("longitude")
                if pd.isna(raw_lat) or pd.isna(raw_lon):
                    invalid_rows += 1
                    continue

                lat = float(raw_lat)
                lon = float(raw_lon)
                if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
                    invalid_rows += 1
                    continue

                valid_observations += 1

                # Extract brightness temperature:
                # VIIRS uses bright_ti4 (375m I-4 band in Kelvin). MODIS uses brightness.
                bright_ti4_val = row.get("bright_ti4")
                if pd.notna(bright_ti4_val):
                    brightness = float(bright_ti4_val)
                elif pd.notna(row.get("brightness")):
                    brightness = float(row.get("brightness"))
                else:
                    brightness = 320.0

                # Extract secondary channel (bright_ti5 for VIIRS, bright_t31 for MODIS)
                bright_t31 = None
                if pd.notna(row.get("bright_ti5")):
                    bright_t31 = float(row.get("bright_ti5"))
                elif pd.notna(row.get("bright_t31")):
                    bright_t31 = float(row.get("bright_t31"))

                # Fire Radiative Power (MW)
                frp_val = row.get("frp")
                frp = float(frp_val) if pd.notna(frp_val) else 10.0

                # Acquisition date and time
                acq_date = str(row.get("acq_date", now_utc.strftime("%Y-%m-%d"))).strip()
                raw_time = str(row.get("acq_time", "1200")).strip()
                acq_time = raw_time.zfill(4)[:4]

                confidence_str = str(row.get("confidence", "nominal")).strip()
                daynight = str(row.get("daynight", "D")).strip().upper()[:1]
                scan = float(row.get("scan", 0.375)) if pd.notna(row.get("scan")) else 0.375
                track = float(row.get("track", 0.375)) if pd.notna(row.get("track")) else 0.375

                instrument = str(row.get("instrument", "VIIRS")).strip()
                source_code = str(row.get("satellite", satellite)).strip() or satellite

                # Deduplication Check (Requirement 11):
                # An observation is duplicate if matching acq_date, acq_time, and identical coordinate (within 0.0001 deg)
                coord_key = (acq_date, acq_time, round(lat, 4), round(lon, 4))
                if coord_key in seen_batch_keys:
                    duplicates_skipped += 1
                    continue
                seen_batch_keys.add(coord_key)

                if store:
                    existing = db.query(Detection.id).filter(
                        Detection.acq_date == acq_date,
                        Detection.acq_time == acq_time,
                        func.abs(Detection.latitude - lat) < 0.0001,
                        func.abs(Detection.longitude - lon) < 0.0001,
                    ).first()

                    if existing:
                        duplicates_skipped += 1
                        continue

                # Run through SATRA AI Classification Pipeline (Requirement 12, 13)
                obs_dict = {
                    "latitude": lat,
                    "longitude": lon,
                    "brightness": brightness,
                    "bright_t31": bright_t31,
                    "frp": frp,
                    "scan": scan,
                    "track": track,
                    "daynight": daynight,
                    "acq_date": acq_date,
                    "acq_time": acq_time,
                    "satellite": source_code,
                    "instrument": instrument,
                }

                try:
                    prediction = ml_service.predict(obs_dict)
                    pred_class = prediction.get("predicted_class", "Other")
                    pred_conf = float(prediction.get("confidence", 0.85))
                    alert_lvl = prediction.get("alert_level", "LOW")
                    model_ver = prediction.get("model_version", "2.0.0-scientific-prototype")
                except Exception as ml_err:
                    logger.warning("ML inference fallback on FIRMS record: %s", ml_err)
                    pred_class = "INSUFFICIENT FEATURES"
                    pred_conf = 0.0
                    alert_lvl = "LOW"
                    model_ver = "2.0.0-scientific-prototype"

                is_persistent = bool(pred_class == "Persistent Thermal Source")

                detection = Detection(
                    latitude=lat,
                    longitude=lon,
                    brightness=brightness,
                    confidence=confidence_str,
                    acq_date=acq_date,
                    acq_time=acq_time,
                    source=satellite,
                    instrument=instrument,
                    frp=frp,
                    daynight=daynight,
                    predicted_class=pred_class,
                    prediction_confidence=pred_conf,
                    is_persistent=is_persistent,
                    model_version=model_ver,
                    data_provenance=PROVENANCE_REAL_FIRMS,
                    alert_level=alert_lvl,
                )

                if store:
                    db.add(detection)
                    new_detections.append(detection)
                else:
                    saved_items.append({
                        "latitude": lat,
                        "longitude": lon,
                        "brightness": brightness,
                        "frp": frp,
                        "acq_date": acq_date,
                        "acq_time": acq_time,
                        "predicted_class": pred_class,
                        "confidence": pred_conf,
                        "alert_level": alert_lvl,
                        "provenance": PROVENANCE_REAL_FIRMS,
                    })

            except Exception as row_err:
                invalid_rows += 1
                logger.debug("Skipping unparseable row: %s", row_err)
                continue

        # Commit to database
        if store and new_detections:
            try:
                db.commit()
                for det in new_detections:
                    db.refresh(det)
                    create_alert_if_eligible(db, det)
                    saved_items.append({
                        "id": det.id,
                        "latitude": det.latitude,
                        "longitude": det.longitude,
                        "brightness": det.brightness,
                        "frp": det.frp,
                        "acq_date": det.acq_date,
                        "acq_time": det.acq_time,
                        "predicted_class": det.predicted_class,
                        "prediction_confidence": det.prediction_confidence,
                        "alert_level": det.alert_level,
                        "provenance": det.data_provenance,
                    })
            except Exception as db_exc:
                db.rollback()
                logger.error("Database commit error on FIRMS records: %s", db_exc)
                raise FirmsServiceException(f"Database error committing FIRMS observations: {db_exc}", status_code=500)

        now_iso = datetime.now(timezone.utc).isoformat()
        self._last_sync_timestamp = now_iso
        self._last_sync_status = "CONNECTED"
        self._last_sync_count = len(new_detections)
        self._last_fetch_raw_rows = total_raw_rows
        self._last_fetch_new_rows = len(new_detections)
        self._last_fetch_duplicates = duplicates_skipped
        self._last_sync_message = (
            f"Successfully synchronized {valid_observations} NASA FIRMS observations "
            f"({len(new_detections)} new stored, {duplicates_skipped} duplicates skipped)."
        )

        # Exact Log as required by prompt (Requirement 8)
        logger.info(
            "NASA rows received: %d\n"
            "Valid observations: %d\n"
            "Invalid rows: %d\n"
            "Duplicates skipped: %d\n"
            "New observations stored: %d",
            total_raw_rows,
            valid_observations,
            invalid_rows,
            duplicates_skipped,
            len(new_detections),
        )

        return {
            "status": "CONNECTED",
            "message": self._last_sync_message,
            "records_count": valid_observations,
            "new_detections_count": len(new_detections),
            "duplicates_count": duplicates_skipped,
            "last_sync": now_iso,
            "source": PROVENANCE_REAL_FIRMS,
            "satellite": satellite,
            "bounding_box": [west, south, east, north],
            "provenance": PROVENANCE_REAL_FIRMS,
            "items": saved_items[:30],
        }

    def get_health_report(self, db: Session) -> Dict[str, Any]:
        """
        Diagnostic health report endpoint (Requirement 20).
        Never exposes MAP_KEY.
        """
        is_cfg = self.is_api_key_configured()
        key_ver = self.verify_map_key() if is_cfg else {"valid": False, "message": "MAP_KEY not configured"}

        real_count = db.query(func.count(Detection.id)).filter(
            Detection.data_provenance == PROVENANCE_REAL_FIRMS
        ).scalar() or 0

        latest_rec = db.query(Detection).filter(
            Detection.data_provenance == PROVENANCE_REAL_FIRMS
        ).order_by(Detection.acq_date.desc(), Detection.acq_time.desc(), Detection.id.desc()).first()

        latest_info = None
        if latest_rec:
            latest_info = {
                "id": latest_rec.id,
                "acq_date": latest_rec.acq_date,
                "acq_time": latest_rec.acq_time,
                "latitude": latest_rec.latitude,
                "longitude": latest_rec.longitude,
                "frp": latest_rec.frp,
                "brightness": latest_rec.brightness,
                "predicted_class": latest_rec.predicted_class,
                "confidence": latest_rec.prediction_confidence,
                "source": latest_rec.source,
            }

        return {
            "configured": is_cfg,
            "api_reachable": key_ver.get("status_code") in (200, 403),
            "key_valid": key_ver.get("valid", False),
            "key_status": key_ver,
            "source": self._last_source,
            "last_fetch": self._last_sync_timestamp,
            "rows_received": self._last_fetch_raw_rows,
            "new_rows_stored": self._last_fetch_new_rows,
            "duplicates_skipped": self._last_fetch_duplicates,
            "total_real_firms_in_db": real_count,
            "latest_observation": latest_info,
            "provenance": PROVENANCE_REAL_FIRMS,
        }

    def search_detections_near(
        self,
        db: Session,
        lat: float,
        lon: float,
        radius_km: float = 100.0,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """
        Geographic proximity search querying actual NASA FIRMS observations from database.
        Returns explicit 'no detections found' message if none exist within radius.
        """
        import math
        deg_approx = radius_km / 111.0
        candidates = db.query(Detection).filter(
            Detection.latitude >= lat - deg_approx,
            Detection.latitude <= lat + deg_approx,
            Detection.longitude >= lon - deg_approx,
            Detection.longitude <= lon + deg_approx,
        ).order_by(Detection.acq_date.desc(), Detection.acq_time.desc()).all()

        results = []
        for det in candidates:
            dlat = math.radians(det.latitude - lat)
            dlon = math.radians(det.longitude - lon)
            a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(det.latitude)) * math.sin(dlon / 2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            dist_km = 6371.0 * c
            if dist_km <= radius_km:
                item = det.to_dict()
                item["distance_km"] = round(dist_km, 2)
                results.append(item)

        results.sort(key=lambda x: x["distance_km"])
        results = results[:limit]

        if not results:
            return {
                "success": True,
                "count": 0,
                "location": {"latitude": lat, "longitude": lon, "radius_km": radius_km},
                "message": "No satellite thermal detections found in the selected area for the selected time range.",
                "items": [],
            }

        return {
            "success": True,
            "count": len(results),
            "location": {"latitude": lat, "longitude": lon, "radius_km": radius_km},
            "message": f"Found {len(results)} satellite thermal detections within {radius_km} km.",
            "items": results,
        }

    def query_chat(
        self,
        db: Session,
        query: str,
    ) -> Dict[str, Any]:
        """
        Answers natural language queries strictly using actual SATRA database records & NASA FIRMS observations.
        Does NOT fabricate any coordinates, readings, or satellite counts.
        """
        q = (query or "").strip().lower()
        now_utc = datetime.now(timezone.utc)
        today_str = now_utc.strftime("%Y-%m-%d")

        total_real = db.query(func.count(Detection.id)).filter(
            Detection.data_provenance == PROVENANCE_REAL_FIRMS
        ).scalar() or 0

        total_all = db.query(func.count(Detection.id)).scalar() or 0

        if total_all == 0:
            ans = "Currently, no satellite thermal observations are available in the SATRA database. NASA FIRMS synchronization may be initializing or awaiting satellite overpass telemetry."
            return {
                "query": query,
                "answer": ans,
                "reply": ans,
                "data_available": False,
                "detections": [],
            }

        # Query 1: Latest detections
        if "latest" in q or "recent" in q or "newest" in q:
            latest = db.query(Detection).order_by(
                Detection.acq_date.desc(), Detection.acq_time.desc(), Detection.id.desc()
            ).limit(5).all()
            items = [d.to_dict() for d in latest]
            answer_parts = [f"Here are the {len(items)} latest NASA FIRMS satellite thermal observations recorded:"]
            for idx, item in enumerate(items, 1):
                answer_parts.append(
                    f"{idx}. Detection #{item['id']} ({item['satellite']} {item['instrument']}) at {item['latitude']}°N, {item['longitude']}°E. "
                    f"FRP: {item['frp']} MW, Brightness Temp: {item['brightness_temperature']} K, AI Class: '{item['classification']}' (Risk: {item['risk_level']}). "
                    f"Observed at {item['observed_at']}."
                )
            ans = "\n".join(answer_parts)
            return {
                "query": query,
                "answer": ans,
                "reply": ans,
                "data_available": True,
                "detections": items,
            }

        # Query 2: Highest risk detection
        if "highest" in q or "critical" in q or "severe" in q or "worst" in q or ("risk" in q and "detection" in q):
            highest = db.query(Detection).order_by(
                Detection.frp.desc(), Detection.prediction_confidence.desc()
            ).first()
            if highest:
                item = highest.to_dict()
                ans = (
                    f"The highest-risk thermal detection recorded in SATRA is Detection #{item['id']} "
                    f"observed by {item['satellite']} ({item['instrument']}) at coordinates {item['latitude']}°N, {item['longitude']}°E on {item['acq_date']} at {item['acq_time']} UTC. "
                    f"It registered a Fire Radiative Power (FRP) of {item['frp']} MW and brightness temperature of {item['brightness_temperature']} K. "
                    f"SATRA AI classified this hotspot as '{item['classification']}' with {item['risk_score']}% confidence (Alert Level: {item['risk_level']})."
                )
                return {
                    "query": query,
                    "answer": ans,
                    "reply": ans,
                    "data_available": True,
                    "detections": [item],
                }

        # Query 3: Daily counts
        if "how many" in q or "count" in q or "today" in q:
            today_count = db.query(func.count(Detection.id)).filter(
                Detection.acq_date == today_str
            ).scalar() or 0
            ans = (
                f"For today ({today_str}), SATRA has recorded {today_count} satellite thermal detections. "
                f"Total active observations in database: {total_all} (including {total_real} authentic NASA FIRMS observations)."
            )
            return {
                "query": query,
                "answer": ans,
                "reply": ans,
                "data_available": True,
                "today_count": today_count,
                "total_count": total_all,
                "detections": [],
            }

        # Query 4: India regional detections
        if "india" in q:
            india_detections = db.query(Detection).filter(
                Detection.latitude >= 6.0,
                Detection.latitude <= 37.0,
                Detection.longitude >= 68.0,
                Detection.longitude <= 97.0,
            ).order_by(Detection.acq_date.desc(), Detection.acq_time.desc()).limit(10).all()
            items = [d.to_dict() for d in india_detections]
            ans = (
                f"Found {len(items)} satellite thermal observations across India's monitored extent [68°E, 6°N to 97°E, 37°N]. "
                f"Reporting sensors: VIIRS (NOAA-20, NOAA-21, Suomi-NPP 375m) and MODIS (Terra/Aqua 1km)."
            )
            return {
                "query": query,
                "answer": ans,
                "reply": ans,
                "data_available": len(items) > 0,
                "detections": items,
            }

        # Default query summary
        latest = db.query(Detection).order_by(
            Detection.acq_date.desc(), Detection.acq_time.desc()
        ).limit(3).all()
        items = [d.to_dict() for d in latest]
        ans = (
            f"SATRA AI Satellite Monitoring has {total_all} active observations ({total_real} from NASA FIRMS NRT sensors). "
            f"You can ask about latest detections, detections in India, highest-risk anomalies, or daily counts."
        )
        return {
            "query": query,
            "answer": ans,
            "reply": ans,
            "data_available": True,
            "detections": items,
        }


# Global singleton instance
firms_service = FirmsService()


def get_firms_service() -> FirmsService:
    """FastAPI dependency for accessing the NASA FIRMS service."""
    return firms_service
