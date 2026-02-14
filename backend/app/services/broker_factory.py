"""
Module: app/services/broker_factory.py
Purpose: Factory for creating broker instances — single entry point.

Uses BrokerName enum to determine which implementation to return.
Decouples the rest of the application from specific broker classes.
"""

import logging

from app.constants import BrokerName
from app.exceptions import BrokerNotConfiguredError
from app.services.broker_interface import BrokerInterface

logger = logging.getLogger(__name__)


def create_broker(broker_name: BrokerName) -> BrokerInterface:
    """Create a broker instance based on the broker name.

    Args:
        broker_name: Which broker to create (ANGEL, ZERODHA, or PAPER).

    Returns:
        An unconnected BrokerInterface implementation.

    Raises:
        BrokerNotConfiguredError: If the broker name is not recognized.
    """
    if broker_name == BrokerName.ANGEL:
        from app.services.angel_broker import AngelOneBroker
        logger.info("Creating Angel One broker instance")
        return AngelOneBroker()

    if broker_name == BrokerName.ZERODHA:
        from app.services.zerodha_broker import ZerodhaBroker
        logger.info("Creating Zerodha broker instance")
        return ZerodhaBroker()

    if broker_name == BrokerName.PAPER:
        from app.services.paper_trader import PaperTrader
        logger.info("Creating Paper Trader instance")
        return PaperTrader()

    raise BrokerNotConfiguredError(broker=broker_name.value)
