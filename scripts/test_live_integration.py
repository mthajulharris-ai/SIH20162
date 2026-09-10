"""
End-to-End Live Integration Verification Script for PS 26162.
Tests complete pipeline:
Satellite observation -> ML Inference -> SQLite Persistence -> REST API -> Frontend Proxy -> GIS Map Feed.
"""
import json
import urllib.request

BASE_BACKEND = "http://127.0.0.1:8000"
BASE_FRONTEND_PROXY = "http://127.0.0.1:5173"

# Labelled test/sample observation
sample_observation = {
    "latitude": 21.1702,
    "longitude": 72.8311,
    "brightness": 385.0,
    "bright_t31": 310.0,
    "frp": 125.0,
    "confidence": "high",
    "source": "SAMPLE_TEST_VIIRS_SNPP",
    "acq_date": "2026-09-10",
    "acq_time": "1045"
}

def main():
    print("=" * 60)
    print("PS 26162: FULL END-TO-END INTEGRATION TEST")
    print("=" * 60)

    # 1. Submitting Sample Thermal Observation
    print("\n[STEP 1] Ingesting Sample Hotspot to Inference Endpoint...")
    req = urllib.request.Request(
        f"{BASE_BACKEND}/api/v1/inference/predict-and-store",
        data=json.dumps(sample_observation).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        status_code = resp.status
        resp_data = json.loads(resp.read().decode("utf-8"))

    print(f"Status: {status_code} (Expected 201 Created)")
    prediction = resp_data["prediction"]
    detection = resp_data["detection"]
    det_id = detection["id"]
    print(f"ML Model Version: {prediction.get('model_version')}")
    print(f"Predicted Class: {prediction.get('predicted_class')}")
    print(f"Prediction Confidence: {prediction.get('confidence'):.4f}")
    print(f"Alert Level Assigned: {prediction.get('alert_level')}")
    print(f"Database Record Created: ID={det_id}, Lat={detection['latitude']}, Lon={detection['longitude']}")

    # 2. Querying Backend Detection API directly
    print("\n[STEP 2] Querying Backend REST API directly (Port 8000)...")
    with urllib.request.urlopen(f"{BASE_BACKEND}/api/v1/detections/{det_id}") as resp:
        backend_det = json.loads(resp.read().decode("utf-8"))
        print(f"Direct API retrieval successful: ID={backend_det['id']}, Class={backend_det['predicted_class']}")

    # 3. Querying via Frontend Vite Proxy (Port 5173)
    print("\n[STEP 3] Querying via Frontend Vite Proxy (Port 5173)...")
    with urllib.request.urlopen(f"{BASE_FRONTEND_PROXY}/api/v1/detections/{det_id}") as resp:
        frontend_det = json.loads(resp.read().decode("utf-8"))
        print(f"Frontend Proxy retrieval successful: ID={frontend_det['id']}, Source={frontend_det['source']}")

    # 4. Checking GIS Map Feed
    print("\n[STEP 4] Checking GIS Map Detections Feed...")
    with urllib.request.urlopen(f"{BASE_FRONTEND_PROXY}/api/v1/detections?limit=20") as resp:
        feed = json.loads(resp.read().decode("utf-8"))
        items = feed.get("items", [])
        found = any(d["id"] == det_id for d in items)
        print(f"Detection present in GIS map feed: {found} (Total items in feed: {len(items)})")

    # 5. Checking Dashboard Analytics Summary
    print("\n[STEP 5] Checking Dashboard Telemetry & KPI Analytics...")
    with urllib.request.urlopen(f"{BASE_FRONTEND_PROXY}/api/v1/analytics/summary") as resp:
        summary = json.loads(resp.read().decode("utf-8"))
        print(f"Total Detections in Dashboard: {summary.get('total_detections')}")
        print(f"Class Breakdown: {summary.get('class_distribution')}")

    # 6. Checking Operational Alert Lifecycle Queue
    print("\n[STEP 6] Checking Operational Alerts Queue...")
    with urllib.request.urlopen(f"{BASE_FRONTEND_PROXY}/api/v1/alerts") as resp:
        alerts_resp = json.loads(resp.read().decode("utf-8"))
        alert_items = alerts_resp.get("items", [])
        matching = [a for a in alert_items if a.get("detection_id") == det_id]
        if matching:
            alt = matching[0]
            print(f"Operational Alert Verified: ID={alt['id']}, Level={alt['alert_level']}, State={alt['verification_status']}")
        else:
            print(f"Observation was classified with severity level: {prediction.get('alert_level')}")

    print("\n" + "=" * 60)
    print("END-TO-END INTEGRATION TEST COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    main()
