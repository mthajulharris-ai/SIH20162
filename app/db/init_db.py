"""
Database initialization and table creation utilities.
"""
import logging
from sqlalchemy import Engine
from app.db.base import Base
from app.db.session import engine as default_engine
# Import models to ensure they are registered with Base.metadata
from app.models import Detection  # noqa: F401

logger = logging.getLogger(__name__)


def init_db(engine: Engine = default_engine) -> None:
    """
    Creates all database tables defined by SQLAlchemy models if they don't exist.
    """
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables successfully initialized.")


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully.")
