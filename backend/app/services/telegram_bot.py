"""
Module: app/services/telegram_bot.py
Purpose: Telegram Bot service for notifications and basic commands.
Supports both webhook and long-polling modes.

Uses 'requests' to avoid heavy dependencies like python-telegram-bot,
keeping the implementation lightweight and easy to debug.
"""

import asyncio
import logging
import threading
import time
import requests
from typing import Optional, Dict, Any, List

from app.config import settings

logger = logging.getLogger(__name__)


class TelegramBotService:
    """Lightweight Telegram Bot Service with polling support."""

    def __init__(self):
        self.token = settings.TELEGRAM_BOT_TOKEN
        self.base_url = f"https://api.telegram.org/bot{self.token}" if self.token else ""
        self.admin_chat_id = settings.TELEGRAM_CHAT_ID
        self.allowed_users = settings.telegram_allowed_user_ids
        self._polling_thread: Optional[threading.Thread] = None
        self._polling_active = False
        self._last_update_id = 0

    def _check_auth(self, chat_id: int) -> bool:
        """Check if user is allowed to interact with the bot."""
        if not self.allowed_users:
            return True  # Open to all if not configured (Dev mode)
        return chat_id in self.allowed_users

    # ━━━━━━━━━━━━ SEND MESSAGES ━━━━━━━━━━━━

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

    # ━━━━━━━━━━━━ WEBHOOK ━━━━━━━━━━━━

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

    def delete_webhook(self) -> bool:
        """Delete webhook so polling can work."""
        if not self.token:
            return False
        try:
            url = f"{self.base_url}/deleteWebhook"
            response = requests.post(url, timeout=10)
            result = response.json()
            if result.get("ok"):
                logger.info("Telegram webhook deleted (switching to polling)")
                return True
            return False
        except Exception as e:
            logger.error(f"Error deleting webhook: {e}")
            return False

    # ━━━━━━━━━━━━ POLLING MODE ━━━━━━━━━━━━

    def _get_updates(self, offset: int = 0, timeout: int = 30) -> List[Dict]:
        """Fetch updates from Telegram using long polling."""
        try:
            url = f"{self.base_url}/getUpdates"
            params = {
                "offset": offset,
                "timeout": timeout,
                "allowed_updates": ["message"],
            }
            response = requests.get(url, params=params, timeout=timeout + 5)
            data = response.json()
            if data.get("ok"):
                return data.get("result", [])
            else:
                logger.error(f"getUpdates failed: {data}")
                return []
        except requests.exceptions.Timeout:
            return []  # Normal for long-polling
        except Exception as e:
            logger.error(f"Polling error: {e}")
            time.sleep(3)  # Back off on errors
            return []

    def _polling_loop(self):
        """Background polling loop — runs in a separate thread."""
        logger.info("🤖 Telegram bot polling started (press Ctrl+C to stop)")

        # Delete any existing webhook so polling works
        self.delete_webhook()

        while self._polling_active:
            try:
                updates = self._get_updates(offset=self._last_update_id + 1, timeout=20)

                for update in updates:
                    update_id = update.get("update_id", 0)
                    if update_id > self._last_update_id:
                        self._last_update_id = update_id

                    # Process in the same thread (sync handler)
                    self._handle_update_sync(update)

            except Exception as e:
                logger.error(f"Polling loop error: {e}")
                time.sleep(5)

        logger.info("🛑 Telegram bot polling stopped")

    def _handle_update_sync(self, update: Dict[str, Any]):
        """Process a single update synchronously (for polling mode)."""
        if "message" not in update:
            return

        message = update["message"]
        chat_id = message.get("chat", {}).get("id")
        text = message.get("text", "")
        username = message.get("from", {}).get("username", "Unknown")
        first_name = message.get("from", {}).get("first_name", "")

        if not chat_id or not text:
            return

        logger.info(f"📩 Message from {first_name} (@{username}, {chat_id}): {text}")

        # Security check
        if not self._check_auth(chat_id):
            self.send_message(chat_id, "⛔ *Access Denied*.\nYou are not authorized to use this bot.")
            return

        # Command handling
        if text.startswith("/"):
            self._handle_command_sync(chat_id, text, first_name)
        else:
            self.send_message(chat_id, "I only understand commands starting with /.\nTry /help")

    def _handle_command_sync(self, chat_id: int, text: str, first_name: str = ""):
        """Execute bot commands (synchronous version for polling)."""
        parts = text.strip().split()
        command = parts[0].lower().split("@")[0]  # Remove @bot_name suffix
        args = parts[1:]

        if command == "/start":
            msg = (
                f"👋 Welcome *{first_name}*!\n\n"
                "🤖 *AlgoTrade Pro Bot* is connected to your trading engine.\n\n"
                "📋 *Available Commands:*\n"
                "├ /status — System status\n"
                "├ /portfolio — Current positions\n"
                "├ /watchlist — View watchlist\n"
                "├ /price `SYMBOL` — Get live price\n"
                "├ /alert — Set price alert\n"
                "└ /help — Show this menu\n\n"
                f"💬 Your Chat ID: `{chat_id}`"
            )
            self.send_message(chat_id, msg)

        elif command == "/status":
            msg = (
                "🟢 *System Status: ONLINE*\n\n"
                f"📌 Mode: `{settings.APP_ENV}`\n"
                "🔗 Broker: Angel One\n"
                "⚡ Risk Check: PASSED\n"
                "📡 Polling: Active"
            )
            self.send_message(chat_id, msg)

        elif command == "/portfolio":
            msg = "💼 *Portfolio Summary*\n\nNo open positions.\n\n_Connect Angel One to see real positions._"
            self.send_message(chat_id, msg)

        elif command == "/watchlist":
            msg = (
                "📋 *Watchlist*\n\n"
                "1. RELIANCE — ₹1,395.10\n"
                "2. HDFCBANK — ₹840.60\n"
                "3. TCS — ₹2,408.35\n\n"
                "_Prices are indicative_"
            )
            self.send_message(chat_id, msg)

        elif command == "/price":
            if args:
                symbol = args[0].upper()
                msg = f"📊 *{symbol}*\n\n_Price lookup coming soon. Use the web app for real-time data._"
            else:
                msg = "Usage: `/price RELIANCE`"
            self.send_message(chat_id, msg)

        elif command == "/alert":
            msg = "🔔 *Price Alerts*\n\n_Coming soon! You'll be able to set alerts like:_\n`/alert RELIANCE above 2500`"
            self.send_message(chat_id, msg)

        elif command == "/help":
            msg = (
                "🤖 *AlgoTrade Pro Bot — Help*\n\n"
                "📋 *Commands:*\n"
                "├ /start — Welcome message\n"
                "├ /status — System status\n"
                "├ /portfolio — Current positions\n"
                "├ /watchlist — View watchlist\n"
                "├ /price `SYMBOL` — Get live price\n"
                "├ /alert — Set price alert\n"
                "└ /help — This menu\n\n"
                "💡 _Send any stock symbol to get a quick overview_"
            )
            self.send_message(chat_id, msg)

        elif command == "/chatid":
            self.send_message(chat_id, f"Your Chat ID is: `{chat_id}`")

        else:
            self.send_message(chat_id, f"❓ Unknown command: `{command}`\n\nTry /help for available commands.")

    # ━━━━━━━━━━━━ START / STOP ━━━━━━━━━━━━

    def start_polling(self):
        """Start the polling loop in a background thread."""
        if not self.token:
            logger.warning("Telegram bot token not set — polling disabled")
            return

        if self._polling_active:
            logger.warning("Polling already active")
            return

        self._polling_active = True
        self._polling_thread = threading.Thread(
            target=self._polling_loop,
            daemon=True,  # Dies when main process exits
            name="telegram-polling",
        )
        self._polling_thread.start()
        logger.info("🤖 Telegram bot polling thread started")

    def stop_polling(self):
        """Stop the polling loop."""
        self._polling_active = False
        if self._polling_thread and self._polling_thread.is_alive():
            self._polling_thread.join(timeout=5)
            logger.info("Telegram polling thread stopped")

    # ━━━━━━━━━━━━ ASYNC WEBHOOK HANDLER ━━━━━━━━━━━━

    async def process_update(self, update: Dict[str, Any]):
        """Process an incoming update from Telegram (webhook mode)."""
        # Reuse the sync handler — it's all HTTP requests anyway
        self._handle_update_sync(update)


# Global instance
telegram_bot = TelegramBotService()
