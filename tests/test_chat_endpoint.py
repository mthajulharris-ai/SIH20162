"""
Unit and integration tests for SATRA AI Assistant / Chatbot endpoint.
Verifies RAG classification, domain knowledge, live database retrieval, specific detection reasoning,
taxonomy (0=Industrial Fire, 1=Forest Fire, 2=Persistent Thermal Source, 3=Other), and guardrails.
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_chat_firms_query():
    """Verify chatbot answers questions about NASA FIRMS accurately."""
    response = client.post("/api/chat", json={"message": "What is NASA FIRMS?"})
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert "VIIRS" in data["response"]
    assert "MODIS" in data["response"]
    assert data["sources"] is not None


def test_chat_frp_query():
    """Verify chatbot explains Fire Radiative Power (FRP) and brightness temperature."""
    response = client.post("/api/chat", json={"message": "Why is FRP used in fire detection?"})
    assert response.status_code == 200
    data = response.json()
    assert "Fire Radiative Power" in data["response"]
    assert "Megawatt" in data["response"]


def test_chat_ml_model_and_taxonomy():
    """Verify chatbot explains the ML soft-voting ensemble and taxonomy."""
    response = client.post("/api/chat", json={"message": "How does the ML model classify a thermal anomaly?"})
    assert response.status_code == 200
    data = response.json()
    resp = data["response"]
    assert "Random Forest" in resp
    assert "LightGBM" in resp
    assert "XGBoost" in resp
    assert "0 = Industrial Fire" in resp
    assert "1 = Forest Fire" in resp
    assert "2 = Persistent Thermal Source" in resp
    assert "3 = Other" in resp


def test_chat_today_fires_database_query():
    """Verify chatbot queries today's/latest fire detections from the database."""
    response = client.post("/api/chat", json={"message": "How many fires were detected today?"})
    assert response.status_code == 200
    data = response.json()
    assert "Total Thermal Anomalies Detected" in data["response"]
    assert "Breakdown by Classification" in data["response"]


def test_chat_specific_detection_reasoning():
    """Verify chatbot explains why a hotspot was classified as an industrial fire with real parameters."""
    # 1. When no data exists, it must say clearly:
    # "I don't have enough data in the SATRA system to determine that."
    empty_resp = client.post("/api/chat", json={"message": "Why was detection #999999 classified as Industrial Fire?"})
    assert empty_resp.status_code == 200
    assert "I don't have enough data in the SATRA system to determine that." in empty_resp.json()["response"]

    # 2. When detection exists in DB, it provides full scientific parameter analysis
    from tests.conftest import TestSessionLocal
    from backend.models.detection import Detection

    db = TestSessionLocal()
    det = Detection(
        id=777,
        latitude=21.1702,
        longitude=72.8311,
        brightness=385.4,
        frp=34.2,
        acq_date="2026-09-16",
        acq_time="1230",
        source="VIIRS_SNPP_NRT",
        predicted_class="Industrial Fire",
        prediction_confidence=0.92,
        is_persistent=False,
        alert_level="CRITICAL",
    )
    db.add(det)
    db.commit()
    db.close()

    response = client.post("/api/chat", json={"message": "Why was detection #777 classified as Industrial Fire?"})
    assert response.status_code == 200
    data = response.json()
    resp = data["response"]
    assert "Scientific Classification Analysis" in resp
    assert "Detection #777" in resp
    assert "Coordinates" in resp
    assert "385.4 K" in resp
    assert "34.2 MW" in resp
    assert "92.0% Confidence" in resp


def test_chat_unresolved_alerts_query():
    """Verify chatbot returns operational alert telemetry."""
    response = client.post("/api/chat", json={"message": "Show recent fire alerts and unresolved alerts"})
    assert response.status_code == 200
    data = response.json()
    assert "SATRA Operational Alert Telemetry" in data["response"]
    assert "Unresolved Alerts" in data["response"]


def test_chat_out_of_scope_exact_guardrail():
    """Verify chatbot returns the exact required response for unrelated questions."""
    response = client.post("/api/chat", json={"message": "Can you bake me a chocolate cake?"})
    assert response.status_code == 200
    data = response.json()
    assert data["response"] == (
        "I’m the SATRA AI Assistant. I’m specialized in industrial fire detection, "
        "thermal anomalies, satellite data, fire classification, alerts, GIS analysis, "
        "and SATRA system information."
    )


def test_chat_empty_message_rejected():
    """Verify empty message returns 400 Bad Request."""
    response = client.post("/api/chat", json={"message": "   "})
    assert response.status_code == 400
