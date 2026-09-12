"""
Pytest global configuration and test database isolation fixture.
Ensures that running automated tests uses an in-memory SQLite database
and NEVER writes test fixture observations into production 'thermal_detections.db'.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.db.base import Base
from backend.main import app
from backend.db.session import get_db

TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def test_override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def isolate_database_for_all_tests():
    """Isolate every test to use in-memory database and prevent database leakage."""
    Base.metadata.create_all(bind=test_engine)
    original_override = app.dependency_overrides.get(get_db)
    
    if not original_override:
        app.dependency_overrides[get_db] = test_override_get_db
        
    yield
    
    # Restore original override or remove if none
    if not original_override and app.dependency_overrides.get(get_db) == test_override_get_db:
        app.dependency_overrides.pop(get_db, None)
