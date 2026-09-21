"""
Unit & Integration Tests for GIS Service & API Endpoint.
PS 26162: SATRA OpenStreetMap Overpass GIS Integration.
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.gis_service import (
    haversine_distance_meters,
    calculate_compass_direction,
    classify_osm_element,
    resolve_feature_name,
    gis_service,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_haversine_distance_calculation():
    # Jamnagar refinery flare area to a point ~1 km north
    lat1, lon1 = 22.4700, 70.0500
    lat2, lon2 = 22.4790, 70.0500
    dist = haversine_distance_meters(lat1, lon1, lat2, lon2)
    assert 990 <= dist <= 1010
    # Zero distance
    assert haversine_distance_meters(lat1, lon1, lat1, lon1) == 0


def test_calculate_compass_direction():
    # True North
    assert calculate_compass_direction(20.0, 75.0, 21.0, 75.0) == "N"
    # True South
    assert calculate_compass_direction(21.0, 75.0, 20.0, 75.0) == "S"
    # East
    assert calculate_compass_direction(20.0, 75.0, 20.0, 76.0) == "E"
    # West
    assert calculate_compass_direction(20.0, 76.0, 20.0, 75.0) == "W"
    # North East
    assert calculate_compass_direction(20.0, 75.0, 21.0, 76.0) == "NE"
    # South West
    assert calculate_compass_direction(21.0, 76.0, 20.0, 75.0) == "SW"


def test_classify_osm_element():
    # Factory / refinery
    t1, s1, l1 = classify_osm_element({"man_made": "works", "industrial": "refinery"})
    assert t1 == "industrial"
    assert s1 == "factory"
    assert "Factory" in l1

    # Industrial landuse
    t2, s2, l2 = classify_osm_element({"landuse": "industrial"})
    assert t2 == "industrial"
    assert "Industrial" in l2

    # Highway / road
    t3, s3, l3 = classify_osm_element({"highway": "primary"})
    assert t3 == "roads"
    assert l3 == "Road"

    # Forest / wood
    t4, s4, l4 = classify_osm_element({"landuse": "forest"})
    assert t4 == "forest"
    assert "Forest" in l4

    # Settlement
    t5, s5, l5 = classify_osm_element({"place": "town"})
    assert t5 == "settlements"
    assert l5 == "Settlement"

    # Water
    t6, s6, l6 = classify_osm_element({"natural": "water"})
    assert t6 == "water"
    assert l6 == "Water Body"


def test_resolve_feature_name():
    # Named feature
    assert resolve_feature_name({"name": "IOCL Panipat Refinery"}, "industrial", "factory") == "IOCL Panipat Refinery"
    # Unnamed factory
    assert resolve_feature_name({}, "industrial", "factory") == "Unnamed factory"
    # Unnamed industrial feature
    assert resolve_feature_name({}, "industrial", "industrial_facility") == "Unnamed industrial feature"
    # Highway with ref
    assert resolve_feature_name({"highway": "primary", "ref": "NH 44"}, "roads", "highway") == "NH 44 (Primary)"
    # Highway without ref
    assert resolve_feature_name({"highway": "residential"}, "roads", "highway") == "Residential Road"


def test_gis_endpoint_validation(client):
    # Invalid lat (> 90)
    res = client.get("/api/v1/gis/nearby?lat=95.0&lon=75.0")
    assert res.status_code == 422

    # Invalid lon (> 180)
    res = client.get("/api/v1/gis/nearby?lat=20.0&lon=195.0")
    assert res.status_code == 422


def test_gis_endpoint_real_query(client):
    # Test with prompt example coordinates (33.147110, 75.358510)
    res = client.get("/api/v1/gis/nearby?lat=33.147110&lon=75.358510&radius=2000")
    assert res.status_code == 200
    data = res.json()
    assert "detection" in data
    assert data["detection"]["latitude"] == 33.14711
    assert data["detection"]["longitude"] == 75.35851
    assert data["radius_m"] == 2000
    assert "status" in data
    assert "features" in data
    assert "summary" in data
    assert isinstance(data["summary"]["industrial"], int)
    assert isinstance(data["summary"]["roads"], int)

    # Second call must be instant and come from cache
    res_cached = client.get("/api/v1/gis/nearby?lat=33.147110&lon=75.358510&radius=2000")
    assert res_cached.status_code == 200
    data_cached = res_cached.json()
    assert len(data_cached["features"]) == len(data["features"])
