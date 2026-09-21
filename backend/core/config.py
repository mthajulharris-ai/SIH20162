"""
Application configuration management using Pydantic Settings.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Project Info
    PROJECT_NAME: str = "SIH 2026 Thermal Detection API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Database Configuration
    DATABASE_URL: str = "sqlite:///./thermal_detections.db"
    
    # CORS Configuration (allows frontend development servers)
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "http://10.172.57.71:3000",
        "http://10.172.57.71:5173",
        "http://10.172.57.71:8000",
    ]
    CORS_ORIGIN_REGEX: str = (
        r"^https?://(localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$"
    )

    # NASA FIRMS API Configurations
    NASA_FIRMS_BASE_URL: str = "https://firms.modaps.eosdis.nasa.gov/api"
    NASA_FIRMS_MAP_KEY: str = ""
    NASA_FIRMS_POLL_INTERVAL_MINUTES: int = 15

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
