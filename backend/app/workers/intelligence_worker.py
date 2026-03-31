"""
Module: app/workers/intelligence_worker.py
Purpose: Background task manager for CPU-heavy intelligence scans.

CONSTRAINT #1: Never blocks FastAPI event loop.
CONSTRAINT #12: Backpressure — max concurrent scans, rejects if overloaded.

Uses asyncio.Queue + asyncio.Task for non-blocking background work.
Tasks are tracked by unique task_id and results are pushed via WebSocket.

Usage:
    task_id = await task_manager.submit_task("full_scan")
    status = task_manager.get_task_status(task_id)
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Task Status ━━━━━━━━━━━━━━━


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


@dataclass
class TaskInfo:
    """Metadata for a tracked background task."""
    task_id: str
    task_type: str
    status: TaskStatus = TaskStatus.QUEUED
    progress: int = 0
    stage: str = ""
    result: Optional[Any] = field(default=None, repr=False)
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    priority: int = 0  # Higher = more important

    @property
    def elapsed_ms(self) -> int:
        """Time elapsed since task start."""
        if self.started_at is None:
            return 0
        end = self.completed_at or time.time()
        return int((end - self.started_at) * 1000)

    def to_dict(self) -> dict:
        """Serialize for API response."""
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status.value,
            "progress": self.progress,
            "stage": self.stage,
            "error": self.error,
            "elapsed_ms": self.elapsed_ms,
            "created_at": self.created_at,
        }


# ━━━━━━━━━━━━━━━ Task Manager ━━━━━━━━━━━━━━━


class TaskManager:
    """Manages background intelligence tasks with backpressure.

    Features:
        - Async task queue with configurable max concurrency
        - Backpressure: rejects new tasks when queue is full
        - Task tracking by ID (status, progress, result)
        - Progress callbacks for WebSocket updates
        - Auto-cleanup of old completed tasks
    """

    def __init__(
        self,
        max_concurrent: int = settings.INTELLIGENCE_MAX_CONCURRENT,
        max_queue_size: int = 10,
        max_history: int = 50,
    ) -> None:
        self._max_concurrent = max_concurrent
        self._max_queue_size = max_queue_size
        self._max_history = max_history

        self._tasks: dict[str, TaskInfo] = {}
        self._active_count = 0
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue_size)
        self._handlers: dict[str, Any] = {}  # task_type → handler coroutine
        self._ws_callback = None  # WebSocket broadcast callback
        self._worker_task: Optional[asyncio.Task] = None

    def register_handler(self, task_type: str, handler) -> None:
        """Register a handler coroutine for a task type.

        The handler must be an async function that accepts:
            handler(task_info: TaskInfo, progress_callback)

        Args:
            task_type: e.g., "full_scan", "news_scan"
            handler: async callable
        """
        self._handlers[task_type] = handler
        logger.info("[worker] Registered handler for '%s'", task_type)

    def set_ws_callback(self, callback) -> None:
        """Set the WebSocket broadcast callback for real-time updates."""
        self._ws_callback = callback

    async def start(self) -> None:
        """Start the background worker loop."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())
            logger.info("[worker] Background worker started (max %d concurrent)", self._max_concurrent)

    async def stop(self) -> None:
        """Stop the background worker."""
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            logger.info("[worker] Background worker stopped")

    async def submit_task(
        self,
        task_type: str,
        priority: int = 0,
    ) -> str:
        """Submit a new background task.

        CONSTRAINT #12: Rejects if queue is full (backpressure).

        Args:
            task_type: Type of task to run.
            priority: Higher = processed first (0 = normal).

        Returns:
            task_id: Unique identifier for tracking.

        Raises:
            RuntimeError: If queue is full or handler not registered.
        """
        if task_type not in self._handlers:
            raise RuntimeError(f"No handler registered for task type '{task_type}'")

        # Backpressure check
        if self._queue.full():
            logger.warning("[worker] Queue full — rejecting task '%s'", task_type)
            task_id = str(uuid.uuid4())[:8]
            self._tasks[task_id] = TaskInfo(
                task_id=task_id,
                task_type=task_type,
                status=TaskStatus.REJECTED,
                error="System busy — try again in a few minutes",
            )
            return task_id

        task_id = str(uuid.uuid4())[:8]
        task_info = TaskInfo(
            task_id=task_id,
            task_type=task_type,
            priority=priority,
        )
        self._tasks[task_id] = task_info

        await self._queue.put(task_info)
        logger.info("[worker] Task '%s' queued (id=%s, priority=%d)", task_type, task_id, priority)

        # Broadcast queue event
        await self._broadcast_event("SCAN_QUEUED", task_info)

        # Cleanup old tasks
        self._cleanup_history()

        return task_id

    def get_task_status(self, task_id: str) -> Optional[dict]:
        """Get current status of a task."""
        task = self._tasks.get(task_id)
        if task is None:
            return None
        result = task.to_dict()
        if task.status == TaskStatus.COMPLETED and task.result is not None:
            result["result"] = task.result
        return result

    def get_active_tasks(self) -> list[dict]:
        """List all active (queued + running) tasks."""
        return [
            t.to_dict()
            for t in self._tasks.values()
            if t.status in (TaskStatus.QUEUED, TaskStatus.RUNNING)
        ]

    async def _worker_loop(self) -> None:
        """Main worker loop — processes tasks from queue."""
        while True:
            try:
                # Wait for a task
                task_info = await self._queue.get()

                # Wait for a slot if at max concurrency
                while self._active_count >= self._max_concurrent:
                    await asyncio.sleep(0.5)

                # Process task in background (don't await — non-blocking)
                asyncio.create_task(self._execute_task(task_info))

            except asyncio.CancelledError:
                logger.info("[worker] Worker loop cancelled")
                break
            except Exception as e:
                logger.error("[worker] Worker loop error: %s", str(e))
                await asyncio.sleep(1)

    async def _execute_task(self, task_info: TaskInfo) -> None:
        """Execute a single task with error handling.

        CONSTRAINT #7: Fault-tolerant — catches all exceptions.
        """
        self._active_count += 1
        task_info.status = TaskStatus.RUNNING
        task_info.started_at = time.time()
        task_info.stage = "initializing"

        await self._broadcast_event("SCAN_STARTED", task_info)

        try:
            handler = self._handlers[task_info.task_type]

            # Progress callback for WebSocket updates
            async def on_progress(progress: int, stage: str):
                task_info.progress = progress
                task_info.stage = stage
                await self._broadcast_event("SCAN_PROGRESS", task_info)

            # Run the handler
            result = await handler(task_info, on_progress)

            task_info.status = TaskStatus.COMPLETED
            task_info.result = result
            task_info.progress = 100
            task_info.stage = "complete"
            task_info.completed_at = time.time()

            logger.info(
                "[worker] Task '%s' completed (id=%s, %dms)",
                task_info.task_type, task_info.task_id, task_info.elapsed_ms,
            )

            await self._broadcast_event("SCAN_COMPLETE", task_info)

        except Exception as e:
            task_info.status = TaskStatus.FAILED
            task_info.error = str(e)[:500]
            task_info.completed_at = time.time()

            logger.error(
                "[worker] Task '%s' failed (id=%s): %s",
                task_info.task_type, task_info.task_id, str(e)[:200],
            )

            await self._broadcast_event("SCAN_FAILED", task_info)

        finally:
            self._active_count -= 1

    async def _broadcast_event(self, event_type: str, task_info: TaskInfo) -> None:
        """Push event to WebSocket clients."""
        if self._ws_callback:
            try:
                await self._ws_callback({
                    "type": event_type,
                    "task_id": task_info.task_id,
                    "task_type": task_info.task_type,
                    "status": task_info.status.value,
                    "progress": task_info.progress,
                    "stage": task_info.stage,
                    "elapsed_ms": task_info.elapsed_ms,
                    "data": task_info.result if event_type == "SCAN_COMPLETE" else None,
                    "error": task_info.error if event_type == "SCAN_FAILED" else None,
                })
            except Exception as e:
                logger.debug("[worker] WS broadcast failed: %s", str(e)[:100])

    def _cleanup_history(self) -> None:
        """Remove old completed/failed tasks to prevent memory leak."""
        completed = [
            (k, v) for k, v in self._tasks.items()
            if v.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.REJECTED)
        ]
        if len(completed) > self._max_history:
            # Remove oldest first
            completed.sort(key=lambda x: x[1].created_at)
            for k, _ in completed[: len(completed) - self._max_history]:
                del self._tasks[k]

    @property
    def stats(self) -> dict:
        """Worker statistics for monitoring."""
        return {
            "active_tasks": self._active_count,
            "queued_tasks": self._queue.qsize(),
            "max_concurrent": self._max_concurrent,
            "total_tracked": len(self._tasks),
            "handlers": list(self._handlers.keys()),
        }


# ━━━━━━━━━━━━━━━ Singleton ━━━━━━━━━━━━━━━

_task_manager_instance: Optional[TaskManager] = None


def get_task_manager() -> TaskManager:
    """Get or create the global task manager singleton."""
    global _task_manager_instance
    if _task_manager_instance is None:
        _task_manager_instance = TaskManager()
    return _task_manager_instance
