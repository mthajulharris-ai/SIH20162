"""
Database initialization and table creation utilities.
PS 26162: Thermal Detection Database Model
"""
import logging
from sqlalchemy import Engine
from backend.db.base import Base
from backend.db.session import engine as default_engine
# Import models to ensure they are registered with Base.metadata
from backend.models.detection import Detection  # noqa: F401
from backend.models.alert import Alert  # noqa: F401

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def init_db(engine: Engine = default_engine) -> None:
    """
    Creates all database tables defined by SQLAlchemy models if they don't exist.
    """
    logger.info("Initializing database tables for PS 26162...")
    Base.metadata.create_all(bind=engine)
    
    # Ensure existing sqlite databases have any newly added model columns
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            # Check for model_version in detections
            res = conn.execute(text("PRAGMA table_info(detections);")).fetchall()
            col_names = [row[1] for row in res]
            if col_names and "model_version" not in col_names:
                conn.execute(text("ALTER TABLE detections ADD COLUMN model_version VARCHAR(32) DEFAULT '1.0.0-baseline';"))
                conn.commit()
                logger.info("Added missing column 'model_version' to detections table.")
    except Exception as e:
        logger.debug("Schema migration check notice: %s", e)

    logger.info("Database tables successfully initialized: %s", list(Base.metadata.tables.keys()))


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully:", list(Base.metadata.tables.keys()))

