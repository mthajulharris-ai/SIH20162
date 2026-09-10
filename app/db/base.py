"""
SQLAlchemy Base Model Definition (Single Source of Truth from backend).
"""
from backend.db.base import Base
from backend.models.detection import Detection  # noqa: F401
from backend.models.alert import Alert  # noqa: F401

__all__ = ["Base"]
