import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, BackgroundTasks, Request, HTTPException

from app.config import settings
from app.models.schemas import ApiResponse
from app.security.auth import get_current_user
from app.services.telegram_bot import telegram_bot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/telegram", tags=["Telegram"])

@router.post(
    "/webhook",
    summary="Telegram Webhook",
    description="Receive updates from Telegram servers.",
)
async def telegram_webhook(update: Dict[str, Any], background_tasks: BackgroundTasks):
    """Handle incoming Telegram updates.
    
    Processing is offloaded to background task to respond quickly to Telegram.
    """
    # Verify secret token if we set one (X-Telegram-Bot-Api-Secret-Token header)
    # For now, we trust the update structure.
    
    background_tasks.add_task(telegram_bot.process_update, update)
    return {"ok": True}


@router.post(
    "/send",
    summary="Send Message (Admin)",
    response_model=ApiResponse[bool],
)
async def send_telegram_message(
    chat_id: str,
    text: str,
    user: dict = Depends(get_current_user), # Only authenticated users (admins)
) -> ApiResponse[bool]:
    """Send a message to a specific chat ID via the bot."""
    success = telegram_bot.send_message(chat_id, text)
    if success:
         return ApiResponse(data=True, message="Message sent")
    else:
         return ApiResponse(success=False, data=False, message="Failed to send message")


@router.get(
    "/status",
    summary="Bot Status",
)
async def bot_status(
    user: dict = Depends(get_current_user),
) -> ApiResponse[dict]:
    """Check bot configuration status."""
    return ApiResponse(
        data={
            "configured": bool(settings.TELEGRAM_BOT_TOKEN),
            "webhook_url": settings.TELEGRAM_WEBHOOK_URL,
            "admin_chat_id": settings.TELEGRAM_CHAT_ID,
        },
        message="Bot status",
    )
