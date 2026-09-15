"""
Comprehensive Integration Tests for Universal NASA FIRMS Dataset Ingestion and Analysis.
Tests:
A. FIRMS MODIS JSON (upload & analyze)
B. FIRMS VIIRS JSON (upload & analyze)
C. FIRMS Shapefile ZIP (upload & analyze)
D. Direct multi-file Shapefile upload (.shp + .shx + .dbf + .prj)
E. Streaming chunk inference verification test (bounded memory, zero fallback)
"""

import io
import json
import os
import tempfile
import zipfile
import pytest
import shapefile
from pathlib import Path
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.ml_service import get_ml_service
from backend.utils.firms_stream_parser import FIRMSDataStreamer
from backend.utils.analysis_engine import IncrementalDatasetAggregator

client = TestClient(app)

# Real MODIS JSON Record
SAMPLE_MODIS_JSON = [
    {
        "latitude": 22.4707,
        "longitude": 70.0577,
        "brightness": 362.5,
        "scan": 1.0,
        "track": 1.0,
        "acq_date": "2024-03-03",
        "acq_time": "1030",
        "satellite": "Aqua",
        "instrument": "MODIS",
        "confidence": 85,
        "version": "6.1NRT",
        "bright_t31": 305.8,
        "frp": 54.0,
        "daynight": "D",
    },
    {
        "latitude": 22.4810,
        "longitude": 70.0650,
        "brightness": 355.2,
        "scan": 1.0,
        "track": 1.0,
        "acq_date": "2024-03-03",
        "acq_time": "1030",
        "satellite": "Aqua",
        "instrument": "MODIS",
        "confidence": 80,
        "version": "6.1NRT",
        "bright_t31": 302.1,
        "frp": 42.0,
        "daynight": "D",
    },
]

# Real VIIRS JSON Record
SAMPLE_VIIRS_JSON = [
    {
        "latitude": 21.1702,
        "longitude": 72.8311,
        "bright_ti4": 378.2,
        "scan": 0.37,
        "track": 0.35,
        "acq_date": "2024-03-02",
        "acq_time": "1845",
        "satellite": "N",
        "instrument": "VIIRS",
        "confidence": "high",
        "version": "2.0NRT",
        "bright_ti5": 312.0,
        "frp": 68.4,
        "daynight": "N",
    },
    {
        "latitude": 22.8046,
        "longitude": 86.2029,
        "bright_ti4": 335.4,
        "scan": 0.39,
        "track": 0.36,
        "acq_date": "2024-03-01",
        "acq_time": "0730",
        "satellite": "N",
        "instrument": "VIIRS",
        "confidence": "high",
        "version": "2.0NRT",
        "bright_ti5": 298.2,
        "frp": 18.5,
        "daynight": "D",
    },
]


def test_firms_modis_json_upload_and_analyze():
    """Test A: Upload real NASA FIRMS MODIS JSON, verify ensemble inference & coordinates."""
    content = json.dumps(SAMPLE_MODIS_JSON).encode("utf-8")
    files = {"file": ("fire_nrt_MODIS.json", io.BytesIO(content), "application/json")}

    res = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "SUCCESS"
    assert data["total_records"] == 2
    assert data["is_fallback"] is False
    assert data["prediction"]["model_type"] == "RF_LightGBM_XGBoost_SoftVoting"
    assert data["prediction"]["predicted_class"] in [
        "Industrial Fire",
        "Forest Fire",
        "Persistent Thermal Source",
        "Other",
    ]
    assert abs(data["exact_location"]["latitude"] - 22.4707) < 1e-3
    assert abs(data["exact_location"]["longitude"] - 70.0577) < 1e-3


def test_firms_viirs_json_upload_and_analyze():
    """Test B: Upload real NASA FIRMS VIIRS JSON, verify ensemble inference & VIIRS fields."""
    content = json.dumps(SAMPLE_VIIRS_JSON).encode("utf-8")
    files = {"file": ("fire_nrt_VIIRS.json", io.BytesIO(content), "application/json")}

    res = client.post("/api/v1/inference/upload-and-analyze", files=files)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "SUCCESS"
    assert data["total_records"] == 2
    assert data["is_fallback"] is False
    assert data["prediction"]["model_type"] == "RF_LightGBM_XGBoost_SoftVoting"
    assert abs(data["exact_location"]["latitude"] - 21.1702) < 1e-3
    assert abs(data["exact_location"]["longitude"] - 72.8311) < 1e-3


def test_firms_shapefile_zip_upload_and_analyze():
    """Test C: Upload ZIP archive containing ESRI Shapefile, verify reader and classification."""
    td = tempfile.mkdtemp()
    try:
        shp_base = str(Path(td) / "fire_archive_M-C61_test")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINT)
        w.field("LATITUDE", "F", 10, 5)
        w.field("LONGITUDE", "F", 10, 5)
        w.field("BRIGHTNESS", "F", 8, 2)
        w.field("SCAN", "F", 6, 2)
        w.field("TRACK", "F", 6, 2)
        w.field("ACQ_DATE", "C", 10)
        w.field("ACQ_TIME", "C", 4)
        w.field("SATELLITE", "C", 10)
        w.field("INSTRUMENT", "C", 10)
        w.field("CONFIDENCE", "N", 5, 0)
        w.field("BRIGHT_T31", "F", 8, 2)
        w.field("FRP", "F", 8, 2)
        w.field("DAYNIGHT", "C", 1)

        w.point(70.0577, 22.4707)
        w.record(22.4707, 70.0577, 362.5, 1.0, 1.0, "2024-03-03", "1030", "Terra", "MODIS", 85, 305.8, 54.0, "D")
        w.point(72.8311, 21.1702)
        w.record(21.1702, 72.8311, 378.2, 1.0, 1.0, "2024-03-02", "1845", "Aqua", "MODIS", 92, 312.0, 68.4, "N")
        w.close()

        # Build ZIP
        mem_zip = io.BytesIO()
        with zipfile.ZipFile(mem_zip, "w") as zf:
            zf.writestr("README.txt", "NASA FIRMS Shapefile download")
            for ext in [".shp", ".shx", ".dbf"]:
                p = Path(shp_base + ext)
                if p.exists():
                    zf.write(p, arcname=f"fire_archive/{p.name}")

        files = {"file": ("DL_FIRE_M-C61_SHP.zip", mem_zip.getvalue(), "application/zip")}
        res = client.post("/api/v1/inference/upload-and-analyze", files=files)
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "SUCCESS"
        assert data["total_records"] == 2
        assert data["is_fallback"] is False
        assert data["prediction"]["model_type"] == "RF_LightGBM_XGBoost_SoftVoting"
        assert abs(data["exact_location"]["latitude"] - 22.4707) < 1e-3
    finally:
        import shutil
        shutil.rmtree(td, ignore_errors=True)


def test_direct_multifile_shapefile_upload():
    """Test D: Direct multi-file upload (.shp + .shx + .dbf + .prj) without ZIP container."""
    td = tempfile.mkdtemp()
    try:
        shp_base = str(Path(td) / "viirs_anomaly")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINT)
        w.field("LATITUDE", "F", 10, 5)
        w.field("LONGITUDE", "F", 10, 5)
        w.field("BRIGHT_TI4", "F", 8, 2)
        w.field("FRP", "F", 8, 2)
        w.field("CONFIDENCE", "C", 10)
        w.field("DAYNIGHT", "C", 1)

        w.point(86.2029, 22.8046)
        w.record(22.8046, 86.2029, 345.2, 35.4, "high", "D")
        w.close()

        # Write .prj
        prj_path = Path(shp_base + ".prj")
        prj_path.write_text('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')

        files = [
            ("files", ("viirs_anomaly.shp", open(shp_base + ".shp", "rb").read(), "application/octet-stream")),
            ("files", ("viirs_anomaly.shx", open(shp_base + ".shx", "rb").read(), "application/octet-stream")),
            ("files", ("viirs_anomaly.dbf", open(shp_base + ".dbf", "rb").read(), "application/octet-stream")),
            ("files", ("viirs_anomaly.prj", open(shp_base + ".prj", "rb").read(), "application/octet-stream")),
        ]

        # 1. Validation test
        val_res = client.post("/api/v1/inference/validate-dataset", files=files)
        assert val_res.status_code == 200
        val_data = val_res.json()
        assert val_data["status"] == "VALID"
        assert val_data["record_count"] == 1
        assert "Shapefile" in val_data["format_detected"]

        # 2. Async job test
        files_job = [
            ("files", ("viirs_anomaly.shp", open(shp_base + ".shp", "rb").read(), "application/octet-stream")),
            ("files", ("viirs_anomaly.shx", open(shp_base + ".shx", "rb").read(), "application/octet-stream")),
            ("files", ("viirs_anomaly.dbf", open(shp_base + ".dbf", "rb").read(), "application/octet-stream")),
            ("files", ("viirs_anomaly.prj", open(shp_base + ".prj", "rb").read(), "application/octet-stream")),
        ]
        job_res = client.post("/api/v1/inference/start-job", files=files_job)
        assert job_res.status_code == 202
        job_data = job_res.json()
        job_id = job_data["job_id"]
        assert job_data["total_records"] == 1

        # Poll until complete
        import time
        for _ in range(20):
            time.sleep(0.1)
            status_res = client.get(f"/api/v1/inference/job-status/{job_id}")
            assert status_res.status_code == 200
            st = status_res.json()
            if st["status"] == "COMPLETED":
                assert st["result"]["prediction"]["model_type"] == "RF_LightGBM_XGBoost_SoftVoting"
                assert st["result"]["is_fallback"] is False
                break
        else:
            pytest.fail("Job did not complete in time")
    finally:
        import shutil
        shutil.rmtree(td, ignore_errors=True)


def test_streaming_chunk_bounded_memory_zero_fallback():
    """Test E: Verify chunk generator + incremental aggregator processes records with bounded RAM and zero fallback."""
    import tracemalloc
    tracemalloc.start()

    ml_service = get_ml_service()
    assert ml_service.is_available() is True

    aggregator = IncrementalDatasetAggregator(max_map_hotspots=1000)

    # 10,000 records streamed in chunks of 2,000
    TOTAL = 10000
    CHUNK_SZ = 2000
    chunks_processed = 0

    chunk = [
        {
            "latitude": 22.8046 + (i * 0.001),
            "longitude": 86.2029 + (i * 0.001),
            "brightness": 340.0 + (i % 40),
            "bright_t31": 300.0,
            "frp": 20.0 + (i % 50),
            "confidence": "high",
            "daynight": "D" if i % 2 == 0 else "N",
            "satellite": "VIIRS",
            "instrument": "VIIRS",
            "acq_date": "2024-03-01",
            "acq_time": "0730",
        }
        for i in range(CHUNK_SZ)
    ]

    for c_idx in range(TOTAL // CHUNK_SZ):
        preds = ml_service.predict_batch(chunk)
        for p in preds:
            assert p.get("model_type") == "RF_LightGBM_XGBoost_SoftVoting"
        aggregator.add_chunk(chunk, preds)
        chunks_processed += 1

    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    peak_mb = peak / (1024 * 1024)
    assert peak_mb < 50.0  # Bounded RAM usage
    assert aggregator.total_records == TOTAL
    assert len(aggregator.top_hotspots) <= 1000

    summary = aggregator.build_summary(
        files_info=[{"filename": "stream_test.csv", "record_count": TOTAL, "format_detected": "CSV"}],
        global_available_fields={"latitude", "longitude", "brightness", "frp", "confidence"},
        global_unavailable_fields=set(),
    )
    assert summary.total_records == TOTAL
    assert summary.frp_analysis is not None
    assert summary.frp_analysis.mean > 0
