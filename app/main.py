"""
FastAPI Main Application Entry Point (Forwarder to backend.main).
SIH 2026 Problem Statement PS 26162.
Ensures single canonical backend implementation in backend/ while maintaining
full compatibility with 'uvicorn app.main:app'.
"""
from backend.main import app, lifespan  # noqa: F401

__all__ = ["app", "lifespan"]
