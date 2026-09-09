"""
Unit tests for Database Models, Sessions, and ORM Operations.
Uses an in-memory SQLite database for isolated test execution.
"""
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base
from app.models.detection import Detection


@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database session for each test."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_create_detection_record(db_session):
    """Test creating and persisting a thermal detection record."""
    record = Detection(
        latitude=22.5726,
        longitude=88.3639,
        brightness=345.5,
        confidence="nominal",
        acq_date="2026-09-09",
        acq_time="1230",
        source="VIIRS_SNPP_NRT",
        instrument="VIIRS",
        frp=45.2,
        daynight="D",
        predicted_class="industrial_fire",
        prediction_confidence=0.94,
        is_persistent=False,
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)

    assert record.id is not None
    assert record.latitude == 22.5726
    assert record.longitude == 88.3639
    assert record.predicted_class == "industrial_fire"
    assert record.prediction_confidence == 0.94
    assert record.is_persistent is False
    assert record.created_at is not None


def test_detection_to_dict_serialization(db_session):
    """Test to_dict() returns all required fields in appropriate format."""
    record = Detection(
        latitude=19.0760,
        longitude=72.8777,
        brightness=380.0,
        confidence="high",
        acq_date="2026-09-09",
        acq_time="2145",
        source="MODIS_NRT",
        instrument="MODIS",
        frp=120.0,
        daynight="N",
        predicted_class="persistent_thermal_source",
        prediction_confidence=0.98,
        is_persistent=True,
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)

    data = record.to_dict()
    assert isinstance(data, dict)
    assert data["id"] == record.id
    assert data["latitude"] == 19.0760
    assert data["longitude"] == 72.8777
    assert data["predicted_class"] == "persistent_thermal_source"
    assert data["is_persistent"] is True
    assert "created_at" in data


def test_query_filtering_by_class_and_date(db_session):
    """Test filtering detections by predicted class and acquisition date."""
    d1 = Detection(
        latitude=28.7041,
        longitude=77.1025,
        brightness=310.0,
        confidence="nominal",
        acq_date="2026-09-08",
        acq_time="1000",
        source="VIIRS_SNPP_NRT",
        predicted_class="agricultural",
        prediction_confidence=0.88,
    )
    d2 = Detection(
        latitude=21.1702,
        longitude=72.8311,
        brightness=395.0,
        confidence="high",
        acq_date="2026-09-09",
        acq_time="1400",
        source="VIIRS_NOAA20_NRT",
        predicted_class="industrial_fire",
        prediction_confidence=0.96,
    )
    db_session.add_all([d1, d2])
    db_session.commit()

    # Filter by predicted_class
    industrial_records = db_session.query(Detection).filter(
        Detection.predicted_class == "industrial_fire"
    ).all()
    assert len(industrial_records) == 1
    assert industrial_records[0].predicted_class == "industrial_fire"

    # Filter by date
    today_records = db_session.query(Detection).filter(
        Detection.acq_date == "2026-09-09"
    ).all()
    assert len(today_records) == 1
    assert today_records[0].acq_date == "2026-09-09"


def test_spatial_bounding_box_query(db_session):
    """Test querying detections within a geographic bounding box."""
    # Hotspot inside Gujarat bounding box (lat: 20-24, lon: 68-74)
    inside = Detection(
        latitude=21.5,
        longitude=71.0,
        brightness=330.0,
        confidence="nominal",
        acq_date="2026-09-09",
        acq_time="1100",
        source="VIIRS_SNPP_NRT",
        predicted_class="industrial_fire",
        prediction_confidence=0.91,
    )
    # Hotspot outside (West Bengal)
    outside = Detection(
        latitude=22.5,
        longitude=88.3,
        brightness=320.0,
        confidence="low",
        acq_date="2026-09-09",
        acq_time="1100",
        source="VIIRS_SNPP_NRT",
        predicted_class="wildfire",
        prediction_confidence=0.85,
    )
    db_session.add_all([inside, outside])
    db_session.commit()

    results = db_session.query(Detection).filter(
        Detection.latitude >= 20.0,
        Detection.latitude <= 24.0,
        Detection.longitude >= 68.0,
        Detection.longitude <= 74.0,
    ).all()

    assert len(results) == 1
    assert results[0].latitude == 21.5
