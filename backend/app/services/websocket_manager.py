"""
Module: app/services/websocket_manager.py
Purpose: Real-time price streaming via Angel One SmartWebSocketV2.

Manages a single upstream WebSocket connection to Angel One and
broadcasts parsed tick data to all connected frontend WebSocket clients.

Architecture:
    Frontend WS ──→ FastAPI /ws/prices ──→ WebSocketManager
                                              ↕
                                        SmartWebSocketV2 (Angel One)
"""

import asyncio
import json
import logging
import threading
from typing import Optional

from fastapi import WebSocket
from SmartApi.smartWebSocketV2 import SmartWebSocketV2

logger = logging.getLogger(__name__)

# Angel One exchange segment codes
_EXCHANGE_MAP = {
    "NSE": SmartWebSocketV2.NSE_CM,
    "BSE": SmartWebSocketV2.BSE_CM,
    "NFO": SmartWebSocketV2.NSE_FO,
    "MCX": SmartWebSocketV2.MCX_FO,
}


class WebSocketManager:
    """Manages Angel One SmartWebSocketV2 upstream + frontend WS clients.

    Singleton-style manager — one upstream feed, many downstream consumers.

    Attributes:
        _clients: Set of connected frontend WebSocket instances.
        _subscribed_tokens: Dict of exchange → set of tokens currently subscribed.
        _sws: SmartWebSocketV2 instance (None until started).
        _last_prices: Cache of last known prices per token.
        _loop: asyncio event loop for cross-thread dispatch.
        _connected: Whether upstream Angel One WS is connected.
    """

    def __init__(self) -> None:
        """Initialize empty manager."""
        self._clients: set[WebSocket] = set()
        self._subscribed_tokens: dict[str, set[str]] = {}
        self._sws: Optional[SmartWebSocketV2] = None
        self._last_prices: dict[str, dict] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._connected: bool = False
        self._thread: Optional[threading.Thread] = None
        self._credentials: dict = {}

    @property
    def is_connected(self) -> bool:
        """Check if upstream Angel One WS is active."""
        return self._connected

    @property
    def client_count(self) -> int:
        """Number of connected frontend clients."""
        return len(self._clients)

    @property
    def subscribed_token_count(self) -> int:
        """Total number of subscribed tokens across all exchanges."""
        return sum(len(tokens) for tokens in self._subscribed_tokens.values())

    async def add_client(self, ws: WebSocket) -> None:
        """Register a new frontend WebSocket client.

        Sends cached prices immediately so the client starts with data.

        Args:
            ws: FastAPI WebSocket instance.
        """
        await ws.accept()
        self._clients.add(ws)
        logger.info("WS client connected. Total: %d", len(self._clients))

        # Send cached prices immediately
        if self._last_prices:
            try:
                await ws.send_json({
                    "type": "snapshot",
                    "prices": self._last_prices,
                })
            except Exception:
                pass

    async def remove_client(self, ws: WebSocket) -> None:
        """Unregister a frontend WebSocket client.

        Args:
            ws: FastAPI WebSocket instance to remove.
        """
        self._clients.discard(ws)
        logger.info("WS client disconnected. Total: %d", len(self._clients))

    async def broadcast(self, data: dict) -> None:
        """Send data to ALL connected frontend clients.

        Removes any clients that have disconnected.

        Args:
            data: JSON-serializable dict to send.
        """
        dead_clients: list[WebSocket] = []
        for client in self._clients.copy():
            try:
                await client.send_json(data)
            except Exception:
                dead_clients.append(client)

        for dc in dead_clients:
            self._clients.discard(dc)

    def start_upstream(
        self,
        auth_token: str,
        feed_token: str,
        api_key: str,
        client_code: str,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        """Start the Angel One SmartWebSocketV2 upstream connection.

        Runs in a background thread since SmartWebSocketV2 uses
        synchronous websocket-client internally.

        Args:
            auth_token: JWT auth token from Angel One session.
            feed_token: Feed token from Angel One session.
            api_key: Angel One API key.
            client_code: Angel One client ID.
            loop: asyncio event loop for dispatching to async handlers.
        """
        if self._connected:
            logger.warning("Upstream WebSocket already connected, skipping.")
            return

        self._loop = loop
        self._credentials = {
            "auth_token": auth_token,
            "feed_token": feed_token,
            "api_key": api_key,
            "client_code": client_code,
        }

        self._sws = SmartWebSocketV2(
            auth_token=auth_token,
            api_key=api_key,
            client_code=client_code,
            feed_token=feed_token,
        )

        # Register callbacks
        self._sws.on_open = self._on_open  # type: ignore[assignment]
        self._sws.on_data = self._on_data  # type: ignore[assignment]
        self._sws.on_error = self._on_error  # type: ignore[assignment]
        self._sws.on_close = self._on_close  # type: ignore[assignment]

        # Run in background thread (SmartWebSocketV2 blocks)
        self._thread = threading.Thread(
            target=self._run_upstream, daemon=True, name="angel-ws"
        )
        self._thread.start()
        logger.info("Angel One WebSocket thread started.")

    def _run_upstream(self) -> None:
        """Thread target — connects SmartWebSocketV2 (blocking)."""
        try:
            if self._sws:
                self._sws.connect()
        except Exception as exc:
            logger.error("SmartWebSocketV2 connect failed: %s", exc)
            self._connected = False

    def _on_open(self, wsapp: object) -> None:
        """Callback: upstream WS connected. Re-subscribe all tokens."""
        self._connected = True
        logger.info("✅ Angel One WebSocket connected.")

        # Re-subscribe existing tokens
        if self._subscribed_tokens and self._sws:
            for exchange, tokens in self._subscribed_tokens.items():
                if tokens:
                    exchange_code = _EXCHANGE_MAP.get(exchange, SmartWebSocketV2.NSE_CM)
                    token_list = [
                        {"exchangeType": exchange_code, "tokens": list(tokens)}
                    ]
                    correlation_id = f"sub_{exchange}"
                    try:
                        self._sws.subscribe(correlation_id, SmartWebSocketV2.LTP_MODE, token_list)
                        logger.info("Re-subscribed %d tokens on %s", len(tokens), exchange)
                    except Exception as e:
                        logger.error("Re-subscribe failed for %s: %s", exchange, e)

    def _on_data(self, wsapp: object, data: dict) -> None:
        """Callback: received tick data from Angel One.

        Parses the data and dispatches to frontend clients via asyncio.

        Args:
            wsapp: WebSocket app reference (unused).
            data: Parsed tick dict from SmartWebSocketV2.
        """
        if not data:
            return

        try:
            token = str(data.get("token", ""))
            ltp = data.get("last_traded_price", 0)

            # SmartWebSocketV2 returns prices in paisa (x100)
            if isinstance(ltp, (int, float)) and ltp > 0:
                price = ltp / 100.0
            else:
                price = 0

            if token and price > 0:
                tick = {
                    "token": token,
                    "ltp": price,
                    "timestamp": data.get("exchange_timestamp", ""),
                    "volume": data.get("volume_trade_for_the_day", 0),
                    "open": (data.get("open_price_of_the_day", 0) or 0) / 100.0,
                    "high": (data.get("high_price_of_the_day", 0) or 0) / 100.0,
                    "low": (data.get("low_price_of_the_day", 0) or 0) / 100.0,
                    "close": (data.get("closed_price", 0) or 0) / 100.0,
                }

                self._last_prices[token] = tick

                # Dispatch to async broadcast
                if self._loop and not self._loop.is_closed():
                    asyncio.run_coroutine_threadsafe(
                        self.broadcast({"type": "tick", "data": tick}),
                        self._loop,
                    )

        except Exception as exc:
            logger.debug("Tick parse error: %s | raw: %s", exc, data)

    def _on_error(self, wsapp: object, error: object) -> None:
        """Callback: upstream WS error."""
        logger.error("Angel One WebSocket error: %s", error)

    def _on_close(self, wsapp: object) -> None:
        """Callback: upstream WS closed."""
        self._connected = False
        logger.warning("Angel One WebSocket closed.")

    def subscribe_tokens(
        self, tokens: list[str], exchange: str = "NSE"
    ) -> None:
        """Subscribe to live tick data for given tokens.

        Args:
            tokens: List of Angel One symbol tokens (e.g., ['3787', '2885']).
            exchange: Exchange segment — 'NSE', 'BSE', 'NFO', 'MCX'.
        """
        if not tokens:
            return

        # Track subscriptions
        if exchange not in self._subscribed_tokens:
            self._subscribed_tokens[exchange] = set()

        new_tokens = [t for t in tokens if t not in self._subscribed_tokens[exchange]]
        if not new_tokens:
            return

        self._subscribed_tokens[exchange].update(new_tokens)

        if self._sws and self._connected:
            exchange_code = _EXCHANGE_MAP.get(exchange, SmartWebSocketV2.NSE_CM)
            token_list = [{"exchangeType": exchange_code, "tokens": new_tokens}]
            correlation_id = f"sub_{exchange}_{len(new_tokens)}"
            try:
                self._sws.subscribe(correlation_id, SmartWebSocketV2.LTP_MODE, token_list)
                logger.info("Subscribed to %d tokens on %s: %s", len(new_tokens), exchange, new_tokens)
            except Exception as e:
                logger.error("Subscribe failed: %s", e)

    def unsubscribe_tokens(
        self, tokens: list[str], exchange: str = "NSE"
    ) -> None:
        """Unsubscribe from live tick data for given tokens.

        Args:
            tokens: List of Angel One symbol tokens to unsubscribe.
            exchange: Exchange segment.
        """
        if not tokens or exchange not in self._subscribed_tokens:
            return

        self._subscribed_tokens[exchange] -= set(tokens)

        if self._sws and self._connected:
            exchange_code = _EXCHANGE_MAP.get(exchange, SmartWebSocketV2.NSE_CM)
            token_list = [{"exchangeType": exchange_code, "tokens": tokens}]
            correlation_id = f"unsub_{exchange}"
            try:
                self._sws.unsubscribe(correlation_id, SmartWebSocketV2.LTP_MODE, token_list)
                logger.info("Unsubscribed %d tokens on %s", len(tokens), exchange)
            except Exception as e:
                logger.error("Unsubscribe failed: %s", e)

    def stop_upstream(self) -> None:
        """Disconnect the Angel One upstream WebSocket."""
        if self._sws and self._connected:
            try:
                self._sws.close_connection()
            except Exception as e:
                logger.warning("Error closing upstream WS: %s", e)
        self._connected = False
        self._sws = None
        logger.info("Upstream WebSocket stopped.")

    def get_cached_price(self, token: str) -> Optional[dict]:
        """Get the last known tick data for a token.

        Args:
            token: Angel One symbol token.

        Returns:
            Tick dict with ltp, volume, etc. or None if not cached.
        """
        return self._last_prices.get(token)


# ━━━━━━━━━━━━━━━ Singleton ━━━━━━━━━━━━━━━
ws_manager = WebSocketManager()
