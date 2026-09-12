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
            # Check for columns in detections
            res = conn.execute(text("PRAGMA table_info(detections);")).fetchall()
            col_names = [row[1] for row in res]
            if col_names:
                if "model_version" not in col_names:
                    conn.execute(text("ALTER TABLE detections ADD COLUMN model_version VARCHAR(32) DEFAULT '2.0.0-scientific-prototype';"))
                    conn.commit()
                    logger.info("Added missing column 'model_version' to detections table.")
                if "data_provenance" not in col_names:
                    conn.execute(text("ALTER TABLE detections ADD COLUMN data_provenance VARCHAR(32) DEFAULT 'REAL_FIRMS';"))
                    conn.commit()
                    logger.info("Added missing column 'data_provenance' to detections table.")
                if "alert_level" not in col_names:
                    conn.execute(text("ALTER TABLE detections ADD COLUMN alert_level VARCHAR(32) DEFAULT 'LOW';"))
                    conn.commit()
                    logger.info("Added missing column 'alert_level' to detections table.")
                if "source_file" not in col_names:
                    conn.execute(text("ALTER TABLE detections ADD COLUMN source_file VARCHAR(255);"))
                    conn.commit()
                    logger.info("Added missing column 'source_file' to detections table.")

                # Ensure brightness column is nullable in SQLite
                for row in res:
                    if row[1] == "brightness" and row[3] == 1:
                        logger.info("Migrating detections table to allow nullable brightness...")
                        conn.execute(text("""
                            CREATE TABLE IF NOT EXISTS detections_mig (
                                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                                latitude FLOAT NOT NULL,
                                longitude FLOAT NOT NULL,
                                brightness FLOAT,
                                confidence VARCHAR(32),
                                acq_date VARCHAR(10) NOT NULL,
                                acq_time VARCHAR(8) NOT NULL,
                                source VARCHAR(64) NOT NULL,
                                instrument VARCHAR(32),
                                frp FLOAT,
                                daynight VARCHAR(2),
                                predicted_class VARCHAR(64) NOT NULL,
                                prediction_confidence FLOAT NOT NULL,
                                is_persistent BOOLEAN NOT NULL,
                                created_at DATETIME NOT NULL,
                                model_version VARCHAR(32) DEFAULT '2.0.0-scientific-prototype',
                                data_provenance VARCHAR(32) DEFAULT 'USER_UPLOADED',
                                alert_level VARCHAR(32) DEFAULT 'LOW',
                                source_file VARCHAR(255)
                            );
                        """))
                        conn.execute(text("""
                            INSERT INTO detections_mig SELECT id, latitude, longitude, brightness, confidence, acq_date, acq_time, source, instrument, frp, daynight, predicted_class, prediction_confidence, is_persistent, created_at, model_version, data_provenance, alert_level, source_file FROM detections;
                        """))
                        conn.execute(text("DROP TABLE detections;"))
                        conn.execute(text("ALTER TABLE detections_mig RENAME TO detections;"))
                        conn.commit()
                        logger.info("Successfully migrated detections table brightness to nullable.")
                        break

            # Check for columns in alerts
            res_a = conn.execute(text("PRAGMA table_info(alerts);")).fetchall()
            col_names_a = [row[1] for row in res_a]
            if col_names_a:
                if "data_provenance" not in col_names_a:
                    conn.execute(text("ALTER TABLE alerts ADD COLUMN data_provenance VARCHAR(32) DEFAULT 'REAL_FIRMS';"))
                    conn.commit()
                    logger.info("Added missing column 'data_provenance' to alerts table.")
                if "model_version" not in col_names_a:
                    conn.execute(text("ALTER TABLE alerts ADD COLUMN model_version VARCHAR(32) DEFAULT '2.0.0-scientific-prototype';"))
                    conn.commit()
                    logger.info("Added missing column 'model_version' to alerts table.")
    except Exception as e:
        logger.debug("Schema migration check notice: %s", e)

    logger.info("Database tables successfully initialized: %s", list(Base.metadata.tables.keys()))


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully:", list(Base.metadata.tables.keys()))

