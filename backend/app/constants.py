"""
Module: app/constants.py
Purpose: Application-wide constants and enumerations.

All magic strings are defined here as Enums. This ensures type safety,
IDE autocompletion, and prevents typo-related bugs throughout the codebase.
"""

from enum import Enum


# ━━━━━━━━━━━━━━━ Trade Domain ━━━━━━━━━━━━━━━


class TradeStatus(str, Enum):
    """Lifecycle status of a trade."""
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class TradeType(str, Enum):
    """Duration category of a trade."""
    SWING = "SWING"
    INTRADAY = "INTRADAY"


class TradeSource(str, Enum):
    """Origin of a trade — how it was initiated."""
    MANUAL = "MANUAL"
    AUTO = "AUTO"
    PAPER = "PAPER"


class OrderSide(str, Enum):
    """Direction of an order."""
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    """Execution type of an order."""
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL = "SL"
    SL_M = "SL-M"


# ━━━━━━━━━━━━━━━ Market Domain ━━━━━━━━━━━━━━━


class Exchange(str, Enum):
    """Supported stock exchanges."""
    NSE = "NSE"
    BSE = "BSE"
    NFO = "NFO"
    MCX = "MCX"


class CandleInterval(str, Enum):
    """Supported timeframes for candle/OHLCV data."""
    ONE_MINUTE = "ONE_MINUTE"
    FIVE_MINUTE = "FIVE_MINUTE"
    FIFTEEN_MINUTE = "FIFTEEN_MINUTE"
    ONE_HOUR = "ONE_HOUR"
    ONE_DAY = "ONE_DAY"


class MarketCondition(str, Enum):
    """Broad market trend classification."""
    UPTREND = "UPTREND"
    DOWNTREND = "DOWNTREND"
    RANGE_BOUND = "RANGE_BOUND"


# ━━━━━━━━━━━━━━━ Broker Domain ━━━━━━━━━━━━━━━


class BrokerName(str, Enum):
    """Supported broker integrations."""
    ANGEL = "angel"
    ZERODHA = "zerodha"
    PAPER = "paper"


# ━━━━━━━━━━━━━━━ Signal Domain ━━━━━━━━━━━━━━━


class Signal(str, Enum):
    """Trading signal output from analysis engines."""
    BUY = "BUY"
    SELL = "SELL"
    STRONG_BUY = "STRONG_BUY"
    NO_TRADE = "NO_TRADE"


class PickerRating(str, Enum):
    """Stock picker quality rating based on composite score."""
    GOLDEN = "GOLDEN"       # 85-100
    STRONG = "STRONG"       # 70-84
    MODERATE = "MODERATE"   # 55-69
    SKIP = "SKIP"           # <55


# ━━━━━━━━━━━━━━━ Audit Domain ━━━━━━━━━━━━━━━


class AuditAction(str, Enum):
    """Actions recorded in the audit log for traceability."""
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    ORDER_PLACED = "ORDER_PLACED"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    SL_HIT = "SL_HIT"
    TARGET_HIT = "TARGET_HIT"
    AUTO_TRADE_ENTRY = "AUTO_TRADE_ENTRY"
    AUTO_TRADE_EXIT = "AUTO_TRADE_EXIT"
    KILL_SWITCH_ON = "KILL_SWITCH_ON"
    KILL_SWITCH_OFF = "KILL_SWITCH_OFF"
    SETTINGS_CHANGED = "SETTINGS_CHANGED"
    BROKER_CONNECTED = "BROKER_CONNECTED"
    BROKER_DISCONNECTED = "BROKER_DISCONNECTED"
    RISK_CHECK_FAILED = "RISK_CHECK_FAILED"
    ERROR = "ERROR"


class AuditCategory(str, Enum):
    """Audit log grouping for filtering and reporting."""
    AUTH = "AUTH"
    TRADE = "TRADE"
    AUTO_TRADER = "AUTO_TRADER"
    SYSTEM = "SYSTEM"
    BROKER = "BROKER"
    RISK = "RISK"
