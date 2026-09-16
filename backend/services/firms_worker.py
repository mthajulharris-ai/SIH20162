"""
NASA FIRMS Automated Background Ingestion Worker.
PS 26162: AI-Based Detection & Classification of Industrial Fires & Persistent Thermal Sources.

Features:
- Configurable polling interval via NASA_FIRMS_POLL_INTERVAL_MINUTES (default: 15 minutes).
- Immediate startup ingestion for zero-wait dashboard population.
- Multi-constellation synchronization (VIIRS NOAA-20, NOAA-21, Suomi-NPP, MODIS).
- Non-blocking asynchronous task integrated into FastAPI lifespan context.
- Graceful exception recovery: maintains last successful cache without crashing.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from backend.core.config import settings
from backend.db.session import SessionLocal
from backend.services.firms_service import firms_service, DEFAULT_BBOX

logger = logging.getLogger("backend.firms_worker")

# Worker state reference
_worker_task: Optional[asyncio.Task] = None
_is_running = False


async def run_firms_ingestion_cycle():
    """
    Executes a single cycle of NASA FIRMS Area ingestion across supported constellations.
    """
    if not firms_service.is_api_key_configured():
        logger.info("[FIRMS Worker] NASA_FIRMS_MAP_KEY is not configured; skipping automatic polling.")
        return

    logger.info("[FIRMS Worker] Starting scheduled NASA FIRMS Area satellite ingestion cycle...")

    # Run blocking DB & HTTP operations in an executor to keep asyncio event loop responsive
    loop = asyncio.get_running_loop()

    def _sync_task():
        db = SessionLocal()
        try:
            # Sync across all supported NRT constellations for India
            res = firms_service.fetch_and_ingest(
                db=db,
                satellite="ALL",
                west=DEFAULT_BBOX["west"],
                south=DEFAULT_BBOX["south"],
                east=DEFAULT_BBOX["east"],
                north=DEFAULT_BBOX["north"],
                day_range=1,
                store=True,
            )
            return res
        except Exception as exc:
            logger.error("[FIRMS Worker] Ingestion cycle error: %s", exc)
            return None
        finally:
            db.close()

    result = await loop.run_in_executor(None, _sync_task)
    if result:
        logger.info(
            "[FIRMS Worker] Cycle completed: %d observations (%d new stored, %d duplicates skipped).",
            result.get("records_count", 0),
            result.get("new_detections_count", 0),
            result.get("duplicates_count", 0),
        )


async def firms_polling_loop():
    """
    Periodic background loop polling NASA FIRMS Area API every NASA_FIRMS_POLL_INTERVAL_MINUTES.
    """
    global _is_running
    _is_running = True

    interval_minutes = getattr(settings, "NASA_FIRMS_POLL_INTERVAL_MINUTES", 15)
    interval_seconds = max(60, int(interval_minutes) * 60)

    logger.info(
        "[FIRMS Worker] NASA FIRMS background ingestion service started (Interval: %d min / %d sec).",
        interval_minutes,
        interval_seconds,
    )

    # Short delay on startup to allow FastAPI lifespan and DB tables to complete initialization
    await asyncio.sleep(3)

    # Initial sync on application start
    try:
        await run_firms_ingestion_cycle()
    except Exception as e:
        logger.warning("[FIRMS Worker] Initial startup sync encountered error: %s", e)

    # Main periodic loop
    while _is_running:
        try:
            await asyncio.sleep(interval_seconds)
            if not _is_running:
                break
            await run_firms_ingestion_cycle()
        except asyncio.CancelledError:
            logger.info("[FIRMS Worker] Background loop received cancellation signal.")
            break
        except Exception as loop_err:
            logger.error("[FIRMS Worker] Unexpected error in polling loop: %s", loop_err)
            await asyncio.sleep(10)


def start_firms_worker():
    """
    Starts the NASA FIRMS background ingestion task if not already running.
    """
    global _worker_task, _is_running
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(firms_polling_loop())
        logger.info("[FIRMS Worker] Background ingestion worker task spawned.")


async def stop_firms_worker():
    """
    Gracefully stops the NASA FIRMS background worker.
    """
    global _worker_task, _is_running
    _is_running = False
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
        logger.info("[FIRMS Worker] Background ingestion worker successfully stopped.")
