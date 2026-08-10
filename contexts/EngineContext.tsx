/**
 * EngineContext.tsx — App-wide AutoTrader Engine singleton context
 *
 * Lifts autoTraderInstance out of Dashboard.tsx.
 * Wires the engine to the PriceBus — the engine no longer polls LTP itself.
 * All other components (AutoBotCommand, DashboardHome) subscribe here.
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AutoTraderEngine, BotSnapshot, DEFAULT_BOT_CONFIG } from '../services/autoTraderEngine';
import { priceBus } from '../services/priceBus';
import { useBroker } from './BrokerContext';

// ── Context ────────────────────────────────────────────────────────────────

interface EngineContextValue {
  engine: AutoTraderEngine | null;
  engineSnap: BotSnapshot | null;
}

const EngineContext = createContext<EngineContextValue>({
  engine: null,
  engineSnap: null,
});

export const useEngine = () => useContext(EngineContext);

// ── Provider ───────────────────────────────────────────────────────────────

export const EngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConnected } = useBroker(); // Used to wire broker to PriceBus
  const [engine, setEngine] = useState<AutoTraderEngine | null>(null);
  const [engineSnap, setEngineSnap] = useState<BotSnapshot | null>(null);
  const engineRef = useRef<AutoTraderEngine | null>(null);

  // Create engine ONCE on mount — persists for the entire app session.
  // The engine is NEVER destroyed on broker disconnect — that would wipe
  // all active trades, candidates, and in-memory state.
  useEffect(() => {
    if (engineRef.current) return;

    // Delay start to allow backend/PriceBus to stabilize
    const timer = setTimeout(() => {
      const trader = new AutoTraderEngine(DEFAULT_BOT_CONFIG);

      trader.setCallbacks(
        (snap) => setEngineSnap({ ...snap }),
        (_) => {} // Logs handled by AutoBotCommand's own subscription
      );

      engineRef.current = trader;
      setEngine(trader);
      setEngineSnap(trader.getSnapshot());

      console.log('🤖 AutoTrader Engine V2 initialized (broker-agnostic, persistent)');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // ── Wire PriceBus → Engine ────────────────────────────────────────────────
  // The engine no longer calls tickAll(). Instead PriceBus delivers prices
  // here and we forward them via eng.onPriceTick(). This is non-blocking.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    // Map of symbol → callback so we can clean up properly
    const subscribedCallbacks = new Map<string, (price: number) => void>();

    const subscribeSymbol = (sym: string) => {
      if (subscribedCallbacks.has(sym)) return; // Already subscribed
      const cb = (price: number) => eng.onPriceTick(sym, price);
      subscribedCallbacks.set(sym, cb);
      priceBus.subscribe(sym, cb);
    };

    const syncSubscriptions = () => {
      const symbols = eng.getSymbolsToWatch();
      symbols.forEach(subscribeSymbol);
    };

    // Initial sync + periodic re-sync (picks up new watchlist symbols / new trades)
    syncSubscriptions();
    const unsubTimer = setInterval(syncSubscriptions, 5000);

    return () => {
      clearInterval(unsubTimer);
      // Clean up all subscriptions on unmount
      subscribedCallbacks.forEach((cb, sym) => priceBus.unsubscribe(sym, cb));
    };
  }, [engine]);

  // ── REMOVED: Engine destroy on broker disconnect ──────────────────────────
  // Previously, the engine was nulled whenever isConnected became false.
  // This caused ALL bot state (trades, candidates, config) to be wiped on
  // any session refresh or Angel One re-authentication.
  // The engine now lives for the full app session — broker state is irrelevant
  // to the paper trading engine, and live mode re-connects are handled by PriceBus.

  return (
    <EngineContext.Provider value={{ engine, engineSnap }}>
      {children}
    </EngineContext.Provider>
  );
};
