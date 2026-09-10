"""Forwarder to backend.db.init_db."""
from backend.db.init_db import init_db

__all__ = ["init_db"]

if __name__ == "__main__":
    init_db()
