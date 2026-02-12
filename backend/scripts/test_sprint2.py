"""
Sprint 2 — Quick Verification Script
Tests all broker endpoints are importable and schemas are valid.
Does NOT require a running server.
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("=" * 60)
print("Sprint 2 — Import & Validation Test")
print("=" * 60)

errors = []

# 1. Test broker_interface imports
try:
    from app.services.broker_interface import (
        BrokerInterface, OrderRequest, OrderResponse, Position, Holding
    )
    print("✅ broker_interface — BrokerInterface, OrderRequest, OrderResponse, Position, Holding")
except Exception as e:
    errors.append(f"❌ broker_interface: {e}")
    print(f"❌ broker_interface: {e}")

# 2. Test angel_broker imports
try:
    from app.services.angel_broker import AngelOneBroker
    print("✅ angel_broker — AngelOneBroker")
except Exception as e:
    errors.append(f"❌ angel_broker: {e}")
    print(f"❌ angel_broker: {e}")

# 3. Test zerodha_broker imports
try:
    from app.services.zerodha_broker import ZerodhaBroker
    print("✅ zerodha_broker — ZerodhaBroker")
except Exception as e:
    errors.append(f"❌ zerodha_broker: {e}")
    print(f"❌ zerodha_broker: {e}")

# 4. Test paper_trader imports
try:
    from app.services.paper_trader import PaperTrader
    print("✅ paper_trader — PaperTrader")
except Exception as e:
    errors.append(f"❌ paper_trader: {e}")
    print(f"❌ paper_trader: {e}")

# 5. Test risk_manager imports
try:
    from app.services.risk_manager import RiskManager
    print("✅ risk_manager — RiskManager")
except Exception as e:
    errors.append(f"❌ risk_manager: {e}")
    print(f"❌ risk_manager: {e}")

# 6. Test broker_factory imports
try:
    from app.services.broker_factory import create_broker
    print("✅ broker_factory — create_broker")
except Exception as e:
    errors.append(f"❌ broker_factory: {e}")
    print(f"❌ broker_factory: {e}")

# 7. Test new schemas
try:
    from app.models.schemas import (
        BrokerConnectRequest, OrderCreateRequest, OrderResponseSchema,
        PositionSchema, HoldingSchema, PaperTradingSummary, RiskStatusSchema
    )
    print("✅ schemas — All 7 Sprint 2 Pydantic models")
except Exception as e:
    errors.append(f"❌ schemas: {e}")
    print(f"❌ schemas: {e}")

# 8. Test broker router
try:
    from app.routers.broker import router
    routes = [r.path for r in router.routes if hasattr(r, 'path')]
    print(f"✅ broker router — {len(routes)} endpoints:")
    for path in sorted(routes):
        print(f"   {path}")
except Exception as e:
    errors.append(f"❌ broker router: {e}")
    print(f"❌ broker router: {e}")

# 9. Test PaperTrader functionality
try:
    pt = PaperTrader()
    summary = pt.get_summary()
    assert summary["starting_capital"] == 100_000.0
    assert summary["total_pnl"] == 0.0
    assert pt._real_broker is None  # Hard wall check
    print(f"✅ PaperTrader — Virtual capital: ₹{summary['starting_capital']:,.0f}")
except Exception as e:
    errors.append(f"❌ PaperTrader test: {e}")
    print(f"❌ PaperTrader test: {e}")

# 10. Test RiskManager functionality
try:
    rm = RiskManager()
    status = rm.get_status()
    assert status["kill_switch_active"] == False
    assert "max_order_value" in status
    print(f"✅ RiskManager — Kill switch: {status['kill_switch_active']}, Max order: ₹{status['max_order_value']:,}")
except Exception as e:
    errors.append(f"❌ RiskManager test: {e}")
    print(f"❌ RiskManager test: {e}")

# Summary
print("\n" + "=" * 60)
if errors:
    print(f"⚠️  {len(errors)} errors found:")
    for err in errors:
        print(f"  {err}")
else:
    print("🎉 ALL SPRINT 2 TESTS PASSED — 10/10")
print("=" * 60)
