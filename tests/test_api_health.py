"""
Unit tests for FastAPI Health and Core API Foundation.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """Test root landing page returns status 200 and docs link."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert "/docs" in data["docs"]


def test_api_health_endpoint():
    """Test direct /api/health endpoint returns healthy status."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "app" in data
    assert "version" in data
    assert "timestamp" in data


def test_api_v1_health_endpoint():
    """Test versioned /api/v1/health endpoint."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_docs_available():
    """Test OpenAPI Swagger UI is available."""
    response = client.get("/docs")
    assert response.status_code == 200


def test_custom_404_error_handler():
    """Test custom error handling for nonexistent routes."""
    response = client.get("/api/v1/nonexistent_endpoint")
    assert response.status_code == 404
    data = response.json()
    assert data["status"] == "error"
    assert data["code"] == 404
    assert "Not Found" in data["message"]
