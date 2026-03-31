"""
Module: app/routers/intelligence.py
Purpose: API endpoints for Multi-LLM Intelligence System.

CONSTRAINT #1: POST /scan triggers background task, returns task_id immediately.
CONSTRAINT #5: Results pushed via WebSocket (SCAN_COMPLETE event).
CONSTRAINT #6: WebSocket auth via JWT query param.
CONSTRAINT #12: Backpressure — rejects if queue full.

Endpoints:
  POST /api/intelligence/scan          → Trigger full scan (returns task_id)
  GET  /api/intelligence/status/{id}   → Get task status
  GET  /api/intelligence/latest        → Get cached latest report
  GET  /api/intelligence/providers     → Active LLM provider status
  GET  /api/intelligence/health        → Worker + system health
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.services.llm_router import get_llm_router
from app.services.intelligence_pipeline import get_pipeline
from app.services.cache import TTLCache
from app.workers.intelligence_worker import get_task_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])

# Cache for the latest report (shared with pipeline)
_latest_cache = TTLCache(default_ttl=900)


# ━━━━━━━━━━━━━━━ Startup Hook ━━━━━━━━━━━━━━━


async def setup_intelligence():
    """Initialize the intelligence system — call from app startup.

    Registers the pipeline handler with TaskManager and starts the worker.
    """
    pipeline = get_pipeline()
    task_manager = get_task_manager()

    # Register the pipeline as a task handler
    task_manager.register_handler("full_scan", pipeline.run_full_scan)
    task_manager.register_handler("news_scan", _news_only_handler)
    task_manager.register_handler("market_scan", _market_only_handler)

    # Start the background worker
    await task_manager.start()

    logger.info("[intelligence] System initialized — handlers registered, worker started")


async def _news_only_handler(task_info, progress_callback):
    """Handler for news-only scan."""
    from app.services.news_intelligence import NewsIntelligence
    news = NewsIntelligence()
    result = await news.analyze(progress_callback)
    return result.to_dict()


async def _market_only_handler(task_info, progress_callback):
    """Handler for market-only scan."""
    from app.services.market_intelligence import MarketIntelligence
    market = MarketIntelligence()
    result = await market.get_summary(progress_callback)
    return result.to_dict()


# ━━━━━━━━━━━━━━━ Endpoints ━━━━━━━━━━━━━━━


@router.post("/scan")
async def trigger_scan(
    scan_type: str = "full_scan",
    priority: int = 0,
    user=Depends(get_current_user),
):
    """Trigger an intelligence scan. Returns task_id immediately.

    CONSTRAINT #1: Non-blocking — work runs in background.
    CONSTRAINT #12: Backpressure — rejects if queue full.

    Args:
        scan_type: "full_scan", "news_scan", or "market_scan"
        priority: Higher = processed first (0=normal, 1=high)
    """
    valid_types = ["full_scan", "news_scan", "market_scan"]
    if scan_type not in valid_types:
        raise HTTPException(400, f"Invalid scan_type. Must be one of: {valid_types}")

    task_manager = get_task_manager()

    try:
        task_id = await task_manager.submit_task(scan_type, priority=priority)
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    status = task_manager.get_task_status(task_id)

    # Check if rejected due to backpressure
    if status and status.get("status") == "rejected":
        raise HTTPException(
            429,
            detail="System busy — too many concurrent scans. Try again in a few minutes.",
        )

    logger.info("[intelligence] Scan triggered: type=%s, task_id=%s", scan_type, task_id)

    return {
        "task_id": task_id,
        "scan_type": scan_type,
        "status": "queued",
        "message": "Scan queued. Results will be pushed via WebSocket.",
    }


@router.get("/status/{task_id}")
async def get_scan_status(
    task_id: str,
    user=Depends(get_current_user),
):
    """Get the status of a scan task.

    Fallback for when WebSocket is unavailable.
    Prefer WebSocket events (SCAN_PROGRESS, SCAN_COMPLETE) for real-time updates.
    """
    task_manager = get_task_manager()
    status = task_manager.get_task_status(task_id)

    if status is None:
        raise HTTPException(404, f"Task '{task_id}' not found")

    return status


@router.get("/latest")
async def get_latest_report(
    user=Depends(get_current_user),
):
    """Get the latest cached intelligence report.

    Returns cached report without triggering a new scan.
    Use POST /scan to trigger a fresh analysis.
    """
    report = _latest_cache.get("full_report")

    if report is None:
        # Try the pipeline cache
        from app.services.intelligence_pipeline import _pipeline_cache
        report = _pipeline_cache.get("full_report")

    if report is None:
        return {
            "status": "no_report",
            "message": "No recent report available. Trigger a scan with POST /scan.",
        }

    return {
        "status": "cached",
        "report": report,
    }


@router.get("/providers")
async def get_provider_status(
    user=Depends(get_current_user),
):
    """Show active LLM providers and their health status.

    Includes circuit breaker state, usage stats, and task assignments.
    """
    try:
        llm_router = get_llm_router()
        providers = llm_router.list_providers()
        assignments = llm_router.get_task_assignments()

        return {
            "providers": providers,
            "task_assignments": assignments,
        }
    except Exception as e:
        logger.error("[intelligence] Provider status failed: %s", str(e))
        return {
            "providers": [],
            "task_assignments": {},
            "error": str(e)[:200],
        }


@router.get("/health")
async def get_system_health(
    user=Depends(get_current_user),
):
    """Get intelligence system health and worker status."""
    task_manager = get_task_manager()

    return {
        "status": "healthy",
        "worker": task_manager.stats,
        "active_tasks": task_manager.get_active_tasks(),
    }


@router.post("/reset-circuit-breakers")
async def reset_circuit_breakers(
    user=Depends(get_current_user),
):
    """Manually reset all LLM provider circuit breakers."""
    try:
        llm_router = get_llm_router()
        llm_router.reset_circuit_breakers()
        return {"status": "ok", "message": "All circuit breakers reset"}
    except Exception as e:
        raise HTTPException(500, str(e))
