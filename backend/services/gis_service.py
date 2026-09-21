"""
GIS Service for SATRA (PS 26162).
Queries real OpenStreetMap physical features via Overpass API within a radius
around satellite thermal detection coordinates.

Strictly ZERO mock/simulated data. Only real OSM mapped features.
"""

import logging
import math
import time
from typing import Any, Dict, List, Optional, Tuple
import requests

logger = logging.getLogger(__name__)

# Overpass API endpoints (high-performance official mirrors first)
OVERPASS_ENDPOINTS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

USER_AGENT = "SATRA-Thermal-Analysis/4.0 (https://satra.ai; contact@satra.ai)"

# In-memory cache for GIS query results: key -> (timestamp, data)
_GIS_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour TTL


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """Calculate geodesic distance in meters using Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return int(round(R * c))


def calculate_compass_direction(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    """Calculate 8-point compass bearing from origin (lat1, lon1) to target (lat2, lon2)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    bearing_deg = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int((bearing_deg + 22.5) // 45) % 8
    return directions[idx]


def classify_osm_element(tags: Dict[str, str]) -> Tuple[str, str, str]:
    """
    Classifies OSM tags into normalized category, subcategory, and human label.
    Returns: (type_key, subcategory, category_label)
    """
    landuse = tags.get("landuse", "").lower()
    man_made = tags.get("man_made", "").lower()
    industrial_val = tags.get("industrial", "").lower()
    power_val = tags.get("power", "").lower()
    building_val = tags.get("building", "").lower()
    highway_val = tags.get("highway", "").lower()
    railway_val = tags.get("railway", "").lower()
    natural_val = tags.get("natural", "").lower()
    place_val = tags.get("place", "").lower()
    amenity_val = tags.get("amenity", "").lower()
    water_val = tags.get("water", "").lower()
    waterway_val = tags.get("waterway", "").lower()

    # 1. Industrial & Factory
    is_factory = (
        man_made in ["works", "refinery", "storage_tank", "chimney"]
        or industrial_val in ["factory", "manufacturing", "plant", "oil", "gas", "refinery", "chemical"]
        or building_val in ["factory", "manufacture"]
        or "factory" in tags.get("name", "").lower()
        or "refinery" in tags.get("name", "").lower()
        or "plant" in tags.get("name", "").lower()
    )

    is_industrial = (
        is_factory
        or landuse in ["industrial", "construction", "quarry", "landfill"]
        or "industrial" in tags
        or power_val in ["plant", "substation", "generator"]
        or building_val in ["industrial", "warehouse"]
    )

    if is_factory:
        return ("industrial", "factory", "Factory")
    if is_industrial:
        return ("industrial", "industrial_facility", "Industrial Facility")

    # 2. Land / Environment / Forest
    if landuse in ["forest", "wood", "scrub", "orchard", "farmland", "meadow", "grass"] or natural_val in ["wood", "scrub", "wetland", "grassland", "tree"]:
        if landuse in ["forest", "wood"] or natural_val in ["wood", "forest"]:
            return ("forest", "woodland", "Forest / Woodland")
        return ("forest", "vegetation", "Vegetation / Scrub")

    # 3. Transport & Roads
    if highway_val:
        return ("roads", "highway", "Road")
    if railway_val:
        return ("roads", "railway", "Railway")
    if "aeroway" in tags:
        return ("roads", "aeroway", "Airport / Helipad")

    # 4. Built Environment / Buildings
    if building_val and building_val != "no":
        return ("buildings", "building", "Building")

    # 5. Settlements / Populated Places
    if place_val in ["city", "town", "village", "hamlet", "suburb", "neighbourhood", "isolated_dwelling"] or landuse == "residential":
        return ("settlements", "populated_place", "Settlement")

    # 6. Water Bodies
    if natural_val in ["water", "bay"] or water_val or waterway_val:
        return ("water", "water_body", "Water Body")

    # 7. Other Relevant POIs
    if amenity_val in ["hospital", "clinic", "school", "college", "university", "fire_station", "police", "waste_disposal"]:
        return ("other", "amenity", "Public / Emergency POI")
    if power_val:
        return ("other", "power_infrastructure", "Energy Infrastructure")

    return ("other", "poi", "Mapped POI")


def resolve_feature_name(tags: Dict[str, str], type_key: str, subcategory: str) -> str:
    """
    Extracts authentic name from OSM tags. If unnamed, generates an honest descriptive label.
    Strictly NEVER fabricates or hardcodes fictional names.
    """
    # Prefer real name tags
    raw_name = (
        tags.get("name")
        or tags.get("name:en")
        or tags.get("official_name")
        or tags.get("operator")
        or tags.get("brand")
    )
    if raw_name and str(raw_name).strip():
        return str(raw_name).strip()

    # Honest descriptor based on OSM tag structure
    if tags.get("highway"):
        hw_type = tags.get("highway", "").replace("_", " ").title()
        ref = tags.get("ref")
        if ref:
            return f"{ref} ({hw_type})"
        return f"{hw_type} Road"

    if tags.get("railway"):
        return f"Railway Line"

    if tags.get("place"):
        return f"Settlement ({tags.get('place').title()})"

    if tags.get("waterway"):
        return f"{tags.get('waterway').title()} Watercourse"

    if subcategory == "factory":
        return "Unnamed factory"

    if type_key == "industrial":
        return "Unnamed industrial feature"

    if type_key == "forest":
        return "Woodland area"

    if type_key == "water":
        return "Water body"

    if type_key == "buildings":
        b_type = tags.get("building")
        if b_type and b_type != "yes":
            return f"{b_type.title()} Building"
        return "Building structure"

    if tags.get("amenity"):
        return f"{tags.get('amenity').replace('_', ' ').title()}"

    return f"Unnamed {type_key} feature"


class GisService:
    """Service to query and normalize real nearby GIS features from OpenStreetMap."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        })

    def query_nearby(self, lat: float, lon: float, radius_m: int = 1000) -> Dict[str, Any]:
        """
        Queries real OSM features within radius_m of (lat, lon).
        Returns normalized JSON structure compliant with SATRA PS 26162 specifications.
        """
        # Clamp radius between 100m and 10,000m
        radius_m = max(100, min(10000, int(radius_m)))
        cache_key = f"{round(lat, 4)}:{round(lon, 4)}:{radius_m}"

        # 1. Check in-memory cache
        now = time.time()
        if cache_key in _GIS_CACHE:
            cached_time, cached_data = _GIS_CACHE[cache_key]
            if now - cached_time < CACHE_TTL_SECONDS:
                logger.debug(f"[GIS] Cache hit for {cache_key}")
                return cached_data

        # 2. Build optimized Overpass QL query
        bldg_radius = min(radius_m, 800)
        settlement_radius = min(max(radius_m, 2000), 5000)

        overpass_query = f"""[out:json][timeout:6];
(
  nwr["landuse"~"industrial|construction|quarry|landfill"](around:{radius_m},{lat},{lon});
  nwr["man_made"~"works|pipeline|storage_tank|refinery|chimney"](around:{radius_m},{lat},{lon});
  nwr["industrial"](around:{radius_m},{lat},{lon});
  nwr["power"~"plant|substation|generator"](around:{radius_m},{lat},{lon});
  nwr["building"~"industrial|commercial|manufacture|warehouse"](around:{radius_m},{lat},{lon});
  nwr["building"](around:{bldg_radius},{lat},{lon});
  nwr["highway"~"motorway|trunk|primary|secondary|tertiary|residential"](around:{radius_m},{lat},{lon});
  nwr["railway"~"rail|station"](around:{radius_m},{lat},{lon});
  nwr["aeroway"~"aerodrome|runway|helipad"](around:{radius_m},{lat},{lon});
  nwr["landuse"~"forest|wood|scrub|grass|farmland"](around:{radius_m},{lat},{lon});
  nwr["natural"~"wood|scrub|water|wetland"](around:{radius_m},{lat},{lon});
  nwr["waterway"~"river|canal|stream"](around:{radius_m},{lat},{lon});
  nwr["place"~"city|town|village|hamlet|suburb"](around:{settlement_radius},{lat},{lon});
  nwr["amenity"~"hospital|school|fire_station|police|waste_disposal"](around:{radius_m},{lat},{lon});
);
out center 60;"""

        raw_elements: List[Dict[str, Any]] = []
        fetch_success = False

        # 3. Attempt query across endpoints
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                resp = self.session.post(
                    endpoint,
                    data={"data": overpass_query},
                    timeout=5.0,
                )
                if resp.status_code == 200:
                    resp_data = resp.json()
                    raw_elements = resp_data.get("elements", [])
                    fetch_success = True
                    break
                else:
                    logger.warning(f"[GIS] Overpass endpoint {endpoint} returned status {resp.status_code}")
            except Exception as e:
                logger.warning(f"[GIS] Overpass endpoint {endpoint} failed: {e}")

        # If Overpass is completely unavailable or timed out
        if not fetch_success:
            logger.error(f"[GIS] All Overpass endpoints failed for coordinate ({lat}, {lon})")
            return {
                "detection": {"latitude": lat, "longitude": lon},
                "radius_m": radius_m,
                "status": "unavailable",
                "message": "Nearby GIS context unavailable",
                "features": [],
                "summary": {
                    "industrial": 0,
                    "factories": 0,
                    "roads": 0,
                    "buildings": 0,
                    "forest": 0,
                    "settlements": 0,
                    "water": 0,
                    "other": 0,
                },
            }

        # 4. Normalize elements and compute metrics
        features: List[Dict[str, Any]] = []
        summary = {
            "industrial": 0,
            "factories": 0,
            "roads": 0,
            "buildings": 0,
            "forest": 0,
            "settlements": 0,
            "water": 0,
            "other": 0,
        }

        seen_feature_keys = set()

        for el in raw_elements:
            el_lat = el.get("lat") or (el.get("center") or {}).get("lat")
            el_lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if el_lat is None or el_lon is None:
                continue

            dist_m = haversine_distance_meters(lat, lon, el_lat, el_lon)
            tags = el.get("tags", {})
            type_key, subcategory, category_label = classify_osm_element(tags)

            if type_key != "settlements" and dist_m > radius_m:
                continue

            name = resolve_feature_name(tags, type_key, subcategory)
            direction = calculate_compass_direction(lat, lon, el_lat, el_lon)

            # Deduplication key to prevent repeated OSM nodes/ways for same physical asset
            dedup_key = f"{type_key}-{name}-{round(el_lat, 3)}-{round(el_lon, 3)}"
            if dedup_key in seen_feature_keys:
                continue
            seen_feature_keys.add(dedup_key)

            # Update summary counts
            if type_key == "industrial":
                summary["industrial"] += 1
                if subcategory == "factory":
                    summary["factories"] += 1
            elif type_key == "roads":
                summary["roads"] += 1
            elif type_key == "buildings":
                summary["buildings"] += 1
            elif type_key == "forest":
                summary["forest"] += 1
            elif type_key == "settlements":
                summary["settlements"] += 1
            elif type_key == "water":
                summary["water"] += 1
            else:
                summary["other"] += 1

            feature_obj = {
                "id": f"osm-{el.get('type', 'node')}-{el.get('id', '')}",
                "type": type_key,
                "subcategory": subcategory,
                "category_label": category_label,
                "name": name,
                "latitude": round(el_lat, 6),
                "longitude": round(el_lon, 6),
                "distance_m": dist_m,
                "direction": direction,
                "tags": {k: v for k, v in tags.items() if k not in ["source", "created_by"]},
            }
            features.append(feature_obj)

        # Sort features by distance ascending
        features.sort(key=lambda f: f["distance_m"])

        result_payload = {
            "detection": {"latitude": lat, "longitude": lon},
            "radius_m": radius_m,
            "status": "success",
            "features": features,
            "summary": summary,
        }

        # 5. Store in in-memory cache
        _GIS_CACHE[cache_key] = (now, result_payload)
        # Prevent memory growth by capping cache size
        if len(_GIS_CACHE) > 500:
            oldest_key = min(_GIS_CACHE.keys(), key=lambda k: _GIS_CACHE[k][0])
            _GIS_CACHE.pop(oldest_key, None)

        return result_payload


# Global singleton instance
gis_service = GisService()
