"""
FastAPI Main Application Entry Point.
SIH 2026 Problem Statement PS 26162:
AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources.
"""
from datetime import datetime, timezone
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
    Initializes database tables and preloads production ensemble model on startup.
    """
    logger.info("Application starting: initializing database tables...")
    init_db()

    # Preload SATRA soft-voting ensemble model
    try:
        from backend.ml.model_loader import load_model
        load_model()
        logger.info("Production SATRA soft-voting ensemble preloaded successfully.")
    except Exception as err:
        logger.info("Ensemble model initialization note: %s", str(err))

    # Start NASA FIRMS automated background ingestion worker
    try:
        from backend.services.firms_worker import start_firms_worker, stop_firms_worker
        start_firms_worker()
        logger.info("NASA FIRMS automated background ingestion worker launched.")
    except Exception as worker_err:
        logger.warning("Failed to launch FIRMS background worker: %s", worker_err)

    yield

    # Clean shutdown
    try:
        from backend.services.firms_worker import stop_firms_worker
        await stop_firms_worker()
    except Exception:
        pass
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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# Error Handling Handlers
# =====================================================================

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.warning("[SATRA API] HTTP %d error on %s: %s", exc.status_code, request.url.path, exc.detail)
    detail_str = str(exc.detail) if not isinstance(exc.detail, dict) else exc.detail.get("message", str(exc.detail))
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "status": "error",
            "error": detail_str,
            "code": exc.status_code,
            "message": detail_str,
            "detail": exc.detail,
        },
    )


from fastapi.encoders import jsonable_encoder

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("[SATRA API] Validation error on %s: %s", request.url.path, exc.errors())
    errors_list = exc.errors()
    first_msg = errors_list[0].get("msg", "") if errors_list else "Validation error"
    first_loc = " -> ".join([str(l) for l in errors_list[0].get("loc", []) if str(l) != "body"]) if errors_list else ""
    user_msg = f"Invalid observation parameter ({first_loc}): {first_msg}" if first_loc else f"Invalid observation parameter: {first_msg}"
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "status": "error",
            "error": user_msg,
            "code": 422,
            "message": user_msg,
            "details": jsonable_encoder(exc.errors()),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("[SATRA ERROR] Unhandled error on %s: %s", request.url.path, str(exc), exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "status": "error",
            "error": "AI inference failed",
            "code": 500,
            "message": f"Internal server error: {str(exc)}",
        },
    )


# =====================================================================
# Routers Mounting
# =====================================================================

# Direct /health returning online (per root test contract) and /api/health returning healthy
@app.get("/health", tags=["Health"])
def root_health():
    return {
        "status": "online",
        "service": "SATRA FastAPI",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

app.include_router(health_router, prefix="/api", tags=["Health"])

from backend.api.v1.endpoints.chat import router as chat_router
app.include_router(chat_router, prefix="/api/chat", tags=["AI Assistant"])

# Versioned API Router (/api/v1/...)
app.include_router(api_router, prefix=settings.API_V1_STR)

# Direct Satellite Router (/api/satellite/...) for seamless client integration
from backend.api.v1.endpoints.satellite import router as satellite_router
app.include_router(satellite_router, prefix="/api/satellite", tags=["Satellite Telemetry"])


@app.get("/", tags=["Root"])
def root_info():
    """
    Root landing endpoint directing to documentation and health status.
    """
    return {
        "message": "SIH 2026 Thermal Detection & Classification Platform API",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
        "status": "running",
    }
