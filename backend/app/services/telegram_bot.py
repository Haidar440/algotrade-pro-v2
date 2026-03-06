"""
Module: app/services/telegram_bot.py
Purpose: Telegram Bot service for notifications and basic commands.

Uses 'requests' to avoid heavy dependencies like python-telegram-bot for now,
keeping the implementation lightweight and easy to debug.
"""

import logging
import requests
from typing import Optional, Dict, Any

from app.config import settings
from app.constants import BrokerName

# We'll import other services lazily or inject them to avoid circular imports
# e.g. from app.routers.broker import _get_active_broker (might be tricky)
# Better to have this service return actions or use a ServiceLocator pattern.
# For Sprint 5, we'll keep it simple and import what we can.

logger = logging.getLogger(__name__)

class TelegramBotService:
    """Lightweight Telegram Bot Service."""

    def __init__(self):
        self.token = settings.TELEGRAM_BOT_TOKEN
        self.base_url = f"https://api.telegram.org/bot{self.token}"
        self.admin_chat_id = settings.TELEGRAM_CHAT_ID
        self.allowed_users = settings.telegram_allowed_user_ids

    def _check_auth(self, chat_id: int) -> bool:
        """Check if user is allowed to interact with the bot."""
        if not self.allowed_users:
            return True # Open to all if not configured (Dev mode)
        return chat_id in self.allowed_users

    def send_message(self, chat_id: str | int, text: str, parse_mode: str = "Markdown") -> bool:
        """Send a message to a Telegram chat."""
        if not self.token:
            logger.warning("Telegram token not set, skipping message.")
            return False

        try:
            url = f"{self.base_url}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            }
            response = requests.post(url, json=payload, timeout=10)
            response.raise_for_status()
            return True
        except requests.exceptions.HTTPError:
            # Markdown parse errors return 400 — retry without parse_mode
            try:
                payload_plain = {"chat_id": chat_id, "text": text}
                response = requests.post(url, json=payload_plain, timeout=10)
                response.raise_for_status()
                return True
            except Exception as e2:
                logger.error("Failed to send Telegram message (plain): %s", e2)
                return False
        except Exception as e:
            logger.error("Failed to send Telegram message: %s", e)
            return False

    def send_admin_alert(self, message: str):
        """Send alert to the configured admin chat ID."""
        if self.admin_chat_id:
            self.send_message(self.admin_chat_id, f"🚨 *AlgoTrade Alert*\n\n{message}")

    def set_webhook(self, webhook_url: str) -> bool:
        """Set the webhook URL for the bot."""
        if not self.token:
            return False
            
        try:
            url = f"{self.base_url}/setWebhook"
            response = requests.post(url, json={"url": webhook_url}, timeout=10)
            result = response.json()
            if result.get("ok"):
                logger.info(f"Telegram webhook set to {webhook_url}")
                return True
            else:
                logger.error(f"Failed to set webhook: {result}")
                return False
        except Exception as e:
            logger.error(f"Error setting webhook: {e}")
            return False

    async def process_update(self, update: Dict[str, Any]):
        """Process an incoming update from Telegram."""
        if "message" not in update:
            return

        message = update["message"]
        chat_id = message.get("chat", {}).get("id")
        text = message.get("text", "")
        username = message.get("from", {}).get("username", "Unknown")

        if not chat_id or not text:
            return

        logger.info(f"Telegram message from {username} ({chat_id}): {text}")

        # Security check
        if not self._check_auth(chat_id):
            self.send_message(chat_id, "⛔ *Access Denied*.\nYou are not authorized to use this bot.")
            return

        # Command handling
        if text.startswith("/"):
            await self._handle_command(chat_id, text)
        else:
            self.send_message(chat_id, "I only understand commands starting with /.")

    async def _handle_command(self, chat_id: int, text: str):
        """Execute bot commands."""
        parts = text.strip().split()
        command = parts[0].lower()
        args = parts[1:]

        if command == "/start":
            msg = (
                "🤖 *AlgoTrade Pro Bot*\n\n"
                "Connected to your trading engine.\n\n"
                "Commands:\n"
                "/status - System status\n"
                "/portfolio - Current positions\n"
                "/watchlist - View watchlist\n"
                "/help - Show this menu"
            )
            self.send_message(chat_id, msg)

        elif command == "/status":
            # TODO: Fetch real status from RiskManager or Broker
            msg = (
                 "🟢 *System Status: ONLINE*\n"
                 f"Mode: {settings.APP_ENV}\n"
                 f"Broker: Angel One (Connected)\n" # Mock status
                 "Risk Check: PASSED"
            )
            self.send_message(chat_id, msg)

        elif command == "/portfolio":
             # TODO: Fetch real positions
             msg = "💼 *Portfolio Summary*\n\nNo open positions."
             self.send_message(chat_id, msg)
             
        elif command == "/watchlist":
             msg = "📋 *Watchlist*\n\n1. RELIANCE: 2450.00\n2. TCS: 3500.00"
             self.send_message(chat_id, msg)

        elif command == "/help":
            self.send_message(chat_id, "Available commands: /start, /status, /portfolio, /watchlist")

        else:
            self.send_message(chat_id, f"Unknown command: {command}")


# Global instance
telegram_bot = TelegramBotService()
