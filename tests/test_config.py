"""
Test basic configuration and directory availability.
"""
from src.config import BASE_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR, SAMPLES_DATA_DIR, MODELS_DIR

def test_directories_exist():
    assert BASE_DIR.exists()
    assert RAW_DATA_DIR.exists()
    assert PROCESSED_DATA_DIR.exists()
    assert SAMPLES_DATA_DIR.exists()
    assert MODELS_DIR.exists()
