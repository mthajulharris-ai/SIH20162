"""
FastAPI Main Application Entry Point.
SIH 2026 Problem Statement PS 26162:
AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
import logging
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from contextlib import asynccontextmanager
from backend.core.config import settings
from backend.db.init_db import init_db
from backend.api.v1.router import api_router
from backend.api.v1.endpoints.health import router as health_router

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("thermal_detection_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager:
    Initializes database tables on startup.
    """
    logger.info("Application starting: initializing database tables...")
    init_db()
    yield
    logger.info("Application shutting down.")


# Initialize FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "FastAPI Backend for Satellite-Based AI Detection and Classification "
        "of Industrial Fires and Persistent Thermal Sources."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Configure CORS for React frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# Error Handling Handlers
# =====================================================================

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.warning("HTTP %d error on %s: %s", exc.status_code, request.url.path, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "code": exc.status_code,
            "message": exc.detail,
            "detail": exc.detail,
        },
    )


from fastapi.encoders import jsonable_encoder

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Validation error on %s: %s", request.url.path, exc.errors())
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "code": 422,
            "message": "Validation failed for request parameters or body.",
            "details": jsonable_encoder(exc.errors()),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s: %s", request.url.path, str(exc), exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "code": 500,
            "message": "Internal server error occurred.",
        },
    )


# =====================================================================
# Routers Mounting
# =====================================================================

# Direct /api/health route convenience endpoint
app.include_router(health_router, prefix="/api", tags=["Health"])

# Versioned API Router (/api/v1/...)
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root_info():
    """
    Root landing endpoint directing to documentation and health status.
    """
    return {
        "message": "SIH 2026 Thermal Detection & Classification Platform API",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/api/health",
        "status": "running",
    }
