/**
 * BrokerContext.tsx — App-wide broker connection state
 *
 * Lifts brokerState out of Dashboard.tsx (was a 496-line God Component).
 * Provides ONE shared AngelOne instance used by all child components.
 * Persists credentials to localStorage.
 * Wires the PriceBus broker instance automatically on login/logout.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AngelOne } from '../services/angel';
import { priceBus } from '../services/priceBus';
import { secureGet, securePost, SCAN_TIMEOUT_MS } from '../services/api';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AngelCredentials {
  apiKey: string;
  clientCode: string;
  jwtToken?: string;
  refreshToken?: string;
  feedToken?: string;
}

export interface BrokerState {
  angel?: AngelCredentials;
}

interface BrokerContextValue {
  brokerState: BrokerState;
  setBrokerState: (state: BrokerState) => void;
  angel: AngelOne | null;          // Shared AngelOne instance (null if not connected)
  isConnected: boolean;
  isReconnecting: boolean;
}

// ── Context ────────────────────────────────────────────────────────────────

const BrokerContext = createContext<BrokerContextValue>({
  brokerState: {},
  setBrokerState: () => {},
  angel: null,
  isConnected: false,
  isReconnecting: false,
});

export const useBroker = () => useContext(BrokerContext);

// ── Provider ───────────────────────────────────────────────────────────────

export const BrokerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [brokerState, setBrokerStateRaw] = useState<BrokerState>(() => {
    try { return JSON.parse(localStorage.getItem('algoTradePro_brokerState') || '{}'); }
    catch { return {}; }
  });

  const [angel, setAngel] = useState<AngelOne | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttempted = useRef(false);

  // Persist to localStorage whenever brokerState changes
  const setBrokerState = useCallback((state: BrokerState) => {
    setBrokerStateRaw(state);
    localStorage.setItem('algoTradePro_brokerState', JSON.stringify(state));
  }, []);

  // Build/destroy shared AngelOne instance when credentials change
  useEffect(() => {
    if (brokerState.angel?.jwtToken) {
      const instance = new AngelOne(brokerState.angel);
      setAngel(instance);
      priceBus.setBroker(instance);    // Wire PriceBus to live LTP
    } else {
      setAngel(null);
      priceBus.setBroker(null);        // Fall back to yfinance polling
    }
  }, [brokerState.angel?.jwtToken]);

  // Auto-reconnect broker session on backend after page refresh.
  // Backend's in-memory broker is lost on restart; frontend has stored credentials.
  useEffect(() => {
    if (!brokerState.angel || reconnectAttempted.current) return;
    reconnectAttempted.current = true;

    const ensureConnected = async () => {
      try {
        const status: any = await secureGet('/broker/status');
        if (status?.connected) return; // Already connected, nothing to do
      } catch { /* status check failed, try reconnecting */ }

      setIsReconnecting(true);
      try {
        // Angel One TOTP login can take 10-15s — use SCAN_TIMEOUT_MS
        await securePost('/broker/connect', {
          broker: 'angel',
          api_key: brokerState.angel?.apiKey,
          client_id: brokerState.angel?.clientCode,
        }, SCAN_TIMEOUT_MS);
      } catch (e) {
        console.warn('⚠️ Auto-reconnect failed (credentials may be in .env):', e);
      } finally {
        setIsReconnecting(false);
      }
    };

    ensureConnected();
  }, [!!brokerState.angel]);

  const value: BrokerContextValue = {
    brokerState,
    setBrokerState,
    angel,
    isConnected: !!brokerState.angel?.jwtToken,
    isReconnecting,
  };

  return (
    <BrokerContext.Provider value={value}>
      {children}
    </BrokerContext.Provider>
  );
};
