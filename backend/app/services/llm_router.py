"""
Module: app/services/llm_router.py
Purpose: Smart multi-LLM routing with circuit breakers, retry, and fallback.

The router is the ONLY entry point for LLM calls in the intelligence system.
Agents call `router.chat(task, messages)` — they never know which provider handles it.

Features:
  - Dynamic provider selection via .env (LLM_NEWS_PROVIDER=groq)
  - "auto" mode: tries providers in priority order until one works
  - Per-provider circuit breaker (inherits from llm_providers.py)
  - Retry with exponential backoff (max 2 retries per provider)
  - Usage tracking for observability (Constraint #14)
  - Thread-safe singleton

Priority order (configurable per task):
  1. Groq     — fastest free (877 tok/sec)
  2. Together  — free Build tier
  3. Gemini    — reliable, already configured
  4. Ollama    — local offline fallback
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings
from app.services.llm_providers import (
    CircuitBreaker,
    GeminiProvider,
    GroqProvider,
    LLMMessage,
    LLMProvider,
    LLMResponse,
    OllamaProvider,
    TogetherProvider,
)

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Task Types ━━━━━━━━━━━━━━━

TASK_NEWS = "news"
TASK_MARKET = "market"
TASK_REASONING = "reasoning"
TASK_SELECTOR = "selector"


# Default priority chain when provider is "auto"
DEFAULT_PRIORITY = ["groq", "together", "gemini", "ollama"]


# ━━━━━━━━━━━━━━━ Usage Tracking ━━━━━━━━━━━━━━━


@dataclass
class ProviderUsageStats:
    """Track usage per provider for observability."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    total_tokens: int = 0
    total_latency_ms: int = 0

    @property
    def avg_latency_ms(self) -> float:
        if self.successful_calls == 0:
            return 0
        return self.total_latency_ms / self.successful_calls

    @property
    def success_rate(self) -> float:
        if self.total_calls == 0:
            return 0
        return self.successful_calls / self.total_calls * 100


# ━━━━━━━━━━━━━━━ LLM Router ━━━━━━━━━━━━━━━


class LLMRouter:
    """Routes LLM requests to best available provider.

    Usage:
        router = LLMRouter()

        # Simple call — router picks best provider
        response = await router.chat(
            task="news",
            messages=[LLMMessage(role="user", content="Summarize today's news")]
        )

        # Force specific provider
        response = await router.chat(
            task="reasoning",
            messages=[...],
            force_provider="gemini"
        )
    """

    def __init__(self) -> None:
        """Initialize router with all available providers.

        Providers are registered dynamically based on which API keys
        are configured in .env. No API key = provider not registered.
        """
        self._providers: dict[str, LLMProvider] = {}
        self._usage: dict[str, ProviderUsageStats] = {}
        self._task_provider_map: dict[str, str] = {}
        self._lock = asyncio.Lock()

        # Register providers dynamically
        self._register_providers()
        self._load_task_assignments()

        logger.info(
            "LLM Router initialized with %d providers: %s",
            len(self._providers),
            list(self._providers.keys()),
        )

    def _register_providers(self) -> None:
        """Register all providers that have valid API keys."""
        # Gemini — always available (required key)
        self._providers["gemini"] = GeminiProvider()
        self._usage["gemini"] = ProviderUsageStats()

        # Groq — if API key configured
        if settings.GROQ_API_KEY:
            self._providers["groq"] = GroqProvider()
            self._usage["groq"] = ProviderUsageStats()
            logger.info("Groq provider registered (Llama 3.3 70B)")

        # Together — if API key configured
        if settings.TOGETHER_API_KEY:
            self._providers["together"] = TogetherProvider()
            self._usage["together"] = ProviderUsageStats()
            logger.info("Together AI provider registered")

        # Ollama — always register, but availability depends on server
        self._providers["ollama"] = OllamaProvider()
        self._usage["ollama"] = ProviderUsageStats()

    def _load_task_assignments(self) -> None:
        """Load task-to-provider assignments from settings."""
        self._task_provider_map = {
            TASK_NEWS: settings.LLM_NEWS_PROVIDER,
            TASK_MARKET: settings.LLM_MARKET_PROVIDER,
            TASK_REASONING: settings.LLM_REASONING_PROVIDER,
            TASK_SELECTOR: settings.LLM_SELECTOR_PROVIDER,
        }

    def get_provider_for_task(self, task: str) -> str:
        """Resolve which provider to use for a given task.

        Returns configured provider name, or "auto" if not set.
        """
        return self._task_provider_map.get(task, "auto")

    def _get_priority_chain(self, preferred: str) -> list[str]:
        """Build the fallback chain starting from preferred provider.

        If preferred is "auto", uses DEFAULT_PRIORITY.
        Otherwise, puts preferred first, then DEFAULT_PRIORITY as fallback.
        """
        if preferred == "auto":
            return [p for p in DEFAULT_PRIORITY if p in self._providers]

        chain = [preferred] if preferred in self._providers else []
        for p in DEFAULT_PRIORITY:
            if p != preferred and p in self._providers:
                chain.append(p)
        return chain

    async def chat(
        self,
        task: str,
        messages: list[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        force_provider: Optional[str] = None,
        max_retries: int = 2,
    ) -> LLMResponse:
        """Route a chat request to the best available provider.

        Tries providers in priority order. Each provider gets up to
        `max_retries` attempts before moving to the next.

        Args:
            task: Task type (news, market, reasoning, selector).
            messages: Chat messages.
            model: Override model name (provider-specific).
            temperature: Sampling temperature.
            max_tokens: Max output tokens.
            force_provider: Skip auto-routing, use this provider.
            max_retries: Max retries per provider before fallback.

        Returns:
            LLMResponse from whichever provider succeeded.

        Raises:
            RuntimeError: If ALL providers fail.
        """
        preferred = force_provider or self.get_provider_for_task(task)
        chain = self._get_priority_chain(preferred)

        if not chain:
            raise RuntimeError("No LLM providers available. Check API keys in .env")

        errors: list[str] = []

        for provider_name in chain:
            provider = self._providers[provider_name]

            if not provider.is_available():
                logger.debug("[router] Skipping %s — circuit breaker open", provider_name)
                continue

            for attempt in range(1, max_retries + 1):
                try:
                    response = await provider.chat(
                        messages=messages,
                        model=model,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )

                    # Track usage
                    stats = self._usage[provider_name]
                    stats.total_calls += 1
                    stats.successful_calls += 1
                    stats.total_tokens += response.tokens_used
                    stats.total_latency_ms += response.latency_ms

                    logger.info(
                        "[router] %s/%s → %s (attempt %d, %dms)",
                        task, provider_name, "OK", attempt, response.latency_ms,
                    )

                    return response

                except Exception as e:
                    error_msg = f"{provider_name} attempt {attempt}: {str(e)[:150]}"
                    errors.append(error_msg)
                    logger.warning("[router] %s", error_msg)

                    stats = self._usage.get(provider_name)
                    if stats:
                        stats.total_calls += 1
                        stats.failed_calls += 1

                    # Exponential backoff between retries (0.5s, 1s)
                    if attempt < max_retries:
                        await asyncio.sleep(0.5 * attempt)

        # All providers failed
        raise RuntimeError(
            f"All LLM providers failed for task '{task}'. "
            f"Errors: {'; '.join(errors[-3:])}"  # Last 3 errors
        )

    def list_providers(self) -> list[dict]:
        """List all registered providers with their status.

        Returns:
            List of provider status dicts (for /api/intelligence/providers).
        """
        result = []
        for name, provider in self._providers.items():
            status = provider.status
            status["usage"] = {
                "total_calls": self._usage[name].total_calls,
                "success_rate": round(self._usage[name].success_rate, 1),
                "avg_latency_ms": round(self._usage[name].avg_latency_ms),
                "total_tokens": self._usage[name].total_tokens,
            }
            result.append(status)
        return result

    def get_task_assignments(self) -> dict:
        """Show which provider is assigned to each task.

        Returns:
            Dict of {task: provider_name} with resolved "auto" values.
        """
        assignments = {}
        for task, provider_name in self._task_provider_map.items():
            if provider_name == "auto":
                chain = self._get_priority_chain("auto")
                resolved = chain[0] if chain else "none"
                assignments[task] = f"auto → {resolved}"
            else:
                assignments[task] = provider_name
        return assignments

    def reset_circuit_breakers(self) -> None:
        """Reset all circuit breakers (manual recovery)."""
        for provider in self._providers.values():
            provider.circuit_breaker._is_open = False
            provider.circuit_breaker._failure_count = 0
        logger.info("[router] All circuit breakers reset")

    def reset_usage_stats(self) -> None:
        """Reset usage statistics."""
        for name in self._usage:
            self._usage[name] = ProviderUsageStats()
        logger.info("[router] Usage stats reset")


# ━━━━━━━━━━━━━━━ Singleton ━━━━━━━━━━━━━━━

_router_instance: Optional[LLMRouter] = None


def get_llm_router() -> LLMRouter:
    """Get or create the global LLM router singleton.

    Lazy initialization — created on first use, not at import time.
    This prevents import-time errors if optional packages aren't installed.
    """
    global _router_instance
    if _router_instance is None:
        _router_instance = LLMRouter()
    return _router_instance
