"""
Module: app/routers/websocket.py
Purpose: WebSocket endpoint for real-time price streaming to frontend.

Provides:
    - /ws/prices — live tick data from Angel One SmartWebSocketV2
    - /api/ws/start — start upstream Angel One connection
    - /api/ws/subscribe — subscribe tokens for live data
    - /api/ws/status — connection status
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.models.schemas import ApiResponse
from app.security.auth import get_current_user
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


# ━━━━━━━━━━━━━━━ WebSocket Endpoint (no JWT — WS handles auth via query param) ━━━━━━━━━━━━━━━


@router.websocket("/ws/indices")
async def websocket_indices(ws: WebSocket):
    """WebSocket endpoint for real-time market index streaming.

    Streams NIFTY, SENSEX, BANK NIFTY + 10 sector indices.
    Automatically starts yfinance poller on first connection.

    Message format (server → client):
        {"type": "indices_snapshot", "data": {...}}  — on connect
        {"type": "indices_update", "data": {...}}    — periodic updates
    """
    await ws_manager.add_index_client(ws)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = __import__("json").loads(raw)
                if msg.get("action") == "ping":
                    await ws.send_json({"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        await ws_manager.remove_index_client(ws)
    except Exception as exc:
        logger.error("Index WS error: %s", exc)
        await ws_manager.remove_index_client(ws)


@router.websocket("/ws/prices")
async def websocket_prices(ws: WebSocket):
    """WebSocket endpoint for real-time price streaming.

    Frontend connects here to receive live tick data.
    Authentication is via query parameter token (optional for paper trading).

    Message format (server → client):
        {"type": "snapshot", "prices": {...}}  — on connect
        {"type": "tick", "data": {"token": "3787", "ltp": 452.50, ...}}  — live updates

    Message format (client → server):
        {"action": "subscribe", "tokens": ["3787", "2885"], "exchange": "NSE"}
        {"action": "unsubscribe", "tokens": ["3787"], "exchange": "NSE"}
    """
    await ws_manager.add_client(ws)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = __import__("json").loads(raw)
                action = msg.get("action", "")
                tokens = msg.get("tokens", [])
                exchange = msg.get("exchange", "NSE")

                if action == "subscribe" and tokens:
                    ws_manager.subscribe_tokens(tokens, exchange)
                    await ws.send_json({
                        "type": "ack",
                        "action": "subscribed",
                        "tokens": tokens,
                        "exchange": exchange,
                    })
                elif action == "unsubscribe" and tokens:
                    ws_manager.unsubscribe_tokens(tokens, exchange)
                    await ws.send_json({
                        "type": "ack",
                        "action": "unsubscribed",
                        "tokens": tokens,
                    })
                elif action == "ping":
                    await ws.send_json({"type": "pong"})
                else:
                    await ws.send_json({"type": "error", "message": f"Unknown action: {action}"})

            except Exception as parse_err:
                await ws.send_json({"type": "error", "message": str(parse_err)})

    except WebSocketDisconnect:
        await ws_manager.remove_client(ws)
    except Exception as exc:
        logger.error("WS error: %s", exc)
        await ws_manager.remove_client(ws)


# ━━━━━━━━━━━━━━━ REST Endpoints (JWT-protected) ━━━━━━━━━━━━━━━


class StartWSRequest(BaseModel):
    """Request to start upstream Angel One WebSocket."""
    auth_token: str = Field(..., description="Angel One JWT auth token")
    feed_token: str = Field(..., description="Angel One feed token")
    api_key: str = Field(..., description="Angel One API key")
    client_code: str = Field(..., description="Angel One client code")


class SubscribeRequest(BaseModel):
    """Request to subscribe/unsubscribe tokens."""
    tokens: list[str] = Field(..., description="List of Angel One symbol tokens")
    exchange: str = Field(default="NSE", description="Exchange: NSE, BSE, NFO, MCX")


@router.post(
    "/api/ws/start",
    response_model=ApiResponse[dict],
    summary="Start Angel One WebSocket",
)
async def start_websocket(
    body: StartWSRequest,
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Start the upstream Angel One SmartWebSocketV2 connection.

    Args:
        body: Angel One session credentials (auth_token, feed_token, api_key, client_code).
        user: Authenticated user from JWT.

    Returns:
        ApiResponse confirming WS start.
    """
    loop = asyncio.get_event_loop()
    ws_manager.start_upstream(
        auth_token=body.auth_token,
        feed_token=body.feed_token,
        api_key=body.api_key,
        client_code=body.client_code,
        loop=loop,
    )

    logger.info("WebSocket started by user=%s", user["sub"])

    return ApiResponse(
        data={
            "connected": ws_manager.is_connected,
            "message": "Angel One WebSocket starting...",
        },
        message="WebSocket connection initiated",
    )


@router.post(
    "/api/ws/subscribe",
    response_model=ApiResponse[dict],
    summary="Subscribe Tokens",
)
async def subscribe_tokens(
    body: SubscribeRequest,
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Subscribe to live tick data for given tokens.

    Args:
        body: Tokens and exchange to subscribe.
        user: Authenticated user from JWT.

    Returns:
        ApiResponse confirming subscription.
    """
    ws_manager.subscribe_tokens(body.tokens, body.exchange)

    return ApiResponse(
        data={
            "subscribed_tokens": body.tokens,
            "exchange": body.exchange,
            "total_subscriptions": ws_manager.subscribed_token_count,
        },
        message=f"Subscribed to {len(body.tokens)} tokens on {body.exchange}",
    )


@router.get(
    "/api/ws/status",
    response_model=ApiResponse[dict],
    summary="WebSocket Status",
)
async def ws_status(
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Get WebSocket connection status.

    Returns:
        ApiResponse with connection stats.
    """
    return ApiResponse(
        data={
            "upstream_connected": ws_manager.is_connected,
            "frontend_clients": ws_manager.client_count,
            "subscribed_tokens": ws_manager.subscribed_token_count,
        },
        message="WebSocket status",
    )


@router.post(
    "/api/ws/stop",
    response_model=ApiResponse[dict],
    summary="Stop WebSocket",
)
async def stop_websocket(
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Stop the upstream Angel One WebSocket connection.

    Returns:
        ApiResponse confirming stop.
    """
    ws_manager.stop_upstream()
    logger.info("WebSocket stopped by user=%s", user["sub"])

    return ApiResponse(
        data={"connected": False},
        message="WebSocket connection stopped",
    )
