"""
Module: app/services/llm_providers.py
Purpose: Provider-agnostic LLM adapters for Multi-LLM Intelligence System.

Each provider implements the same interface (LLMProvider ABC).
The LLM Router selects the best available provider at runtime.

Providers:
  - GeminiProvider:   Google Gemini 2.5 Flash/Pro (primary — already configured)
  - GroqProvider:     Groq Llama 3.3 70B (fastest free — 877 tok/sec)
  - TogetherProvider: Together AI (backup with free credits)
  - OllamaProvider:   Local Ollama (offline fallback — unlimited)

All API keys come from app.config.settings — zero hardcoding.
"""

import json
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━ Data Classes ━━━━━━━━━━━━━━━


@dataclass
class LLMMessage:
    """A single message in a chat conversation."""
    role: str  # "system", "user", "assistant"
    content: str


@dataclass
class LLMResponse:
    """Standardized response from any LLM provider."""
    content: str
    provider: str
    model: str
    tokens_used: int = 0
    latency_ms: int = 0
    raw: Optional[dict] = field(default=None, repr=False)


# ━━━━━━━━━━━━━━━ Circuit Breaker ━━━━━━━━━━━━━━━


class CircuitBreaker:
    """Per-provider circuit breaker with configurable cooldown.

    Opens after `failure_threshold` consecutive failures.
    Auto-resets after `cooldown_seconds`.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        cooldown_seconds: int = 300,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._failure_count = 0
        self._open_until = 0.0
        self._is_open = False

    @property
    def is_available(self) -> bool:
        """Check if circuit is closed (provider is available)."""
        if not self._is_open:
            return True
        if time.time() >= self._open_until:
            logger.info("[%s] Circuit breaker reset — provider available again", self.name)
            self._is_open = False
            self._failure_count = 0
            return True
        return False

    def record_success(self) -> None:
        """Reset failure count on success."""
        self._failure_count = 0

    def record_failure(self) -> None:
        """Record a failure. Opens circuit if threshold reached."""
        self._failure_count += 1
        if self._failure_count >= self.failure_threshold:
            self._is_open = True
            self._open_until = time.time() + self.cooldown_seconds
            logger.warning(
                "[%s] Circuit breaker OPEN — %d failures, cooling down %ds",
                self.name, self._failure_count, self.cooldown_seconds,
            )

    @property
    def status(self) -> dict:
        """Current circuit breaker state."""
        remaining = max(0, int(self._open_until - time.time())) if self._is_open else 0
        return {
            "name": self.name,
            "is_open": self._is_open,
            "failure_count": self._failure_count,
            "cooldown_remaining_s": remaining,
        }


# ━━━━━━━━━━━━━━━ Abstract Base ━━━━━━━━━━━━━━━


class LLMProvider(ABC):
    """Abstract base class for all LLM providers.

    Every provider must implement:
      - name: unique provider identifier
      - is_available(): checks API key + circuit breaker
      - chat(): sends messages and returns standardized response
    """

    name: str = "base"
    default_model: str = ""
    circuit_breaker: CircuitBreaker

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this provider has a valid API key and is healthy."""
        ...

    @abstractmethod
    async def chat(
        self,
        messages: list[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Send messages and get a response.

        Args:
            messages: List of LLMMessage (system, user, assistant).
            model: Override default model name.
            temperature: Sampling temperature (0.0 = deterministic).
            max_tokens: Max output tokens.

        Returns:
            LLMResponse with content, provider name, tokens used, latency.

        Raises:
            Exception: On API errors (caught by router for fallback).
        """
        ...

    @property
    def status(self) -> dict:
        """Provider status for monitoring."""
        return {
            "name": self.name,
            "available": self.is_available(),
            "default_model": self.default_model,
            "circuit_breaker": self.circuit_breaker.status,
        }


# ━━━━━━━━━━━━━━━ Gemini Provider ━━━━━━━━━━━━━━━


class GeminiProvider(LLMProvider):
    """Google Gemini via LangChain (already in our stack).

    Uses langchain-google-genai which is already installed.
    API key from settings.GEMINI_API_KEY.
    """

    name = "gemini"
    default_model = "gemini-2.5-flash"

    def __init__(self) -> None:
        self.circuit_breaker = CircuitBreaker("gemini", failure_threshold=3, cooldown_seconds=300)
        self._api_key = settings.GEMINI_API_KEY
        self._llm = None

    def _get_llm(self, model: Optional[str] = None, temperature: float = 0.3):
        """Lazy-initialize LangChain Gemini LLM."""
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model or self.default_model,
            google_api_key=self._api_key,
            temperature=temperature,
            max_retries=1,
        )

    def is_available(self) -> bool:
        return bool(self._api_key) and self.circuit_breaker.is_available

    async def chat(
        self,
        messages: list[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        from langchain_core.messages import HumanMessage, SystemMessage

        start = time.time()
        llm = self._get_llm(model, temperature)

        lc_messages = []
        for msg in messages:
            if msg.role == "system":
                lc_messages.append(SystemMessage(content=msg.content))
            else:
                lc_messages.append(HumanMessage(content=msg.content))

        try:
            response = await llm.ainvoke(lc_messages)
            content = response.content if hasattr(response, "content") else str(response)
            latency = int((time.time() - start) * 1000)

            self.circuit_breaker.record_success()
            logger.debug("[gemini] Response in %dms (%d chars)", latency, len(content))

            return LLMResponse(
                content=content,
                provider="gemini",
                model=model or self.default_model,
                latency_ms=latency,
            )
        except Exception as e:
            self.circuit_breaker.record_failure()
            logger.warning("[gemini] Chat failed: %s", str(e)[:200])
            raise


# ━━━━━━━━━━━━━━━ Groq Provider ━━━━━━━━━━━━━━━


class GroqProvider(LLMProvider):
    """Groq API — Llama 3.3 70B at 877 tokens/sec.

    Fastest free inference. Free tier: 30 RPM, 14.4K RPD.
    API key from settings.GROQ_API_KEY.
    """

    name = "groq"
    default_model = "llama-3.3-70b-versatile"

    def __init__(self) -> None:
        self.circuit_breaker = CircuitBreaker("groq", failure_threshold=3, cooldown_seconds=180)
        self._api_key = settings.GROQ_API_KEY
        self._client = None

    def _get_client(self):
        """Lazy-initialize Groq client."""
        if self._client is None:
            try:
                from groq import AsyncGroq
                self._client = AsyncGroq(api_key=self._api_key)
            except ImportError:
                logger.debug("[groq] groq package not installed — provider unavailable")
                return None
        return self._client

    def is_available(self) -> bool:
        return bool(self._api_key) and self.circuit_breaker.is_available

    async def chat(
        self,
        messages: list[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        client = self._get_client()
        if client is None:
            raise RuntimeError("Groq client not available (package not installed)")

        start = time.time()
        groq_messages = [{"role": m.role, "content": m.content} for m in messages]

        try:
            response = await client.chat.completions.create(
                model=model or self.default_model,
                messages=groq_messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content
            tokens = getattr(response.usage, "total_tokens", 0) if response.usage else 0
            latency = int((time.time() - start) * 1000)

            self.circuit_breaker.record_success()
            logger.debug("[groq] Response in %dms (%d tokens)", latency, tokens)

            return LLMResponse(
                content=content,
                provider="groq",
                model=model or self.default_model,
                tokens_used=tokens,
                latency_ms=latency,
            )
        except Exception as e:
            self.circuit_breaker.record_failure()
            logger.warning("[groq] Chat failed: %s", str(e)[:200])
            raise


# ━━━━━━━━━━━━━━━ Together Provider ━━━━━━━━━━━━━━━


class TogetherProvider(LLMProvider):
    """Together AI — many open models with free Build tier credits.

    API key from settings.TOGETHER_API_KEY.
    """

    name = "together"
    default_model = "meta-llama/Llama-3.3-70B-Instruct-Turbo"

    def __init__(self) -> None:
        self.circuit_breaker = CircuitBreaker("together", failure_threshold=3, cooldown_seconds=300)
        self._api_key = settings.TOGETHER_API_KEY
        self._client = None

    def _get_client(self):
        """Lazy-initialize Together client."""
        if self._client is None:
            try:
                from together import AsyncTogether
                self._client = AsyncTogether(api_key=self._api_key)
            except ImportError:
                logger.debug("[together] together package not installed — provider unavailable")
                return None
        return self._client

    def is_available(self) -> bool:
        return bool(self._api_key) and self.circuit_breaker.is_available

    async def chat(
        self,
        messages: list[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        client = self._get_client()
        if client is None:
            raise RuntimeError("Together client not available (package not installed)")

        start = time.time()
        together_messages = [{"role": m.role, "content": m.content} for m in messages]

        try:
            response = await client.chat.completions.create(
                model=model or self.default_model,
                messages=together_messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content
            tokens = getattr(response.usage, "total_tokens", 0) if response.usage else 0
            latency = int((time.time() - start) * 1000)

            self.circuit_breaker.record_success()
            logger.debug("[together] Response in %dms (%d tokens)", latency, tokens)

            return LLMResponse(
                content=content,
                provider="together",
                model=model or self.default_model,
                tokens_used=tokens,
                latency_ms=latency,
            )
        except Exception as e:
            self.circuit_breaker.record_failure()
            logger.warning("[together] Chat failed: %s", str(e)[:200])
            raise


# ━━━━━━━━━━━━━━━ Ollama Provider ━━━━━━━━━━━━━━━


class OllamaProvider(LLMProvider):
    """Local Ollama — completely free, offline, unlimited.

    Connects to local Ollama server at settings.OLLAMA_BASE_URL.
    Uses httpx for HTTP calls (already installed).
    """

    name = "ollama"
    default_model = "llama3"

    def __init__(self) -> None:
        self.circuit_breaker = CircuitBreaker("ollama", failure_threshold=2, cooldown_seconds=60)
        self._base_url = settings.OLLAMA_BASE_URL
        self._verified = False

    def is_available(self) -> bool:
        """Check if Ollama server is reachable (cached check)."""
        if not self.circuit_breaker.is_available:
            return False
        # Don't check server health on every call — too slow
        # Rely on circuit breaker to detect failures
        return True

    async def chat(
        self,
        messages: list[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        import httpx

        start = time.time()
        ollama_messages = [{"role": m.role, "content": m.content} for m in messages]

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(
                    f"{self._base_url}/api/chat",
                    json={
                        "model": model or self.default_model,
                        "messages": ollama_messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()

            content = data.get("message", {}).get("content", "")
            latency = int((time.time() - start) * 1000)

            self.circuit_breaker.record_success()
            logger.debug("[ollama] Response in %dms (%d chars)", latency, len(content))

            return LLMResponse(
                content=content,
                provider="ollama",
                model=model or self.default_model,
                latency_ms=latency,
            )
        except Exception as e:
            self.circuit_breaker.record_failure()
            logger.warning("[ollama] Chat failed: %s", str(e)[:200])
            raise
