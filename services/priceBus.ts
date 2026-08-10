/**
 * priceBus.ts — Centralised Price Polling Singleton
 *
 * PROBLEM SOLVED:
 *   Before: AutoTraderEngine, PaperTradingDashboard and AutoTraderDashboard
 *   each had their own independent setInterval polling the same LTP endpoint,
 *   causing 3× backend traffic and blocking the UI.
 *
 * SOLUTION:
 *   One polling loop for ALL symbols. Components subscribe with a callback
 *   and receive price updates. The bus fetches all subscribed symbols in
 *   PARALLEL (Promise.allSettled) every 4 seconds when broker is live, or
 *   falls back to yfinance every 30 seconds when no broker is connected.
 *
 * USAGE:
 *   priceBus.subscribe('RELIANCE', (price) => setState(price));
 *   priceBus.unsubscribe('RELIANCE', callback);
 *   priceBus.getPrice('RELIANCE'); // instant cached value
 *   priceBus.setBroker(angelInstance); // call after login
 */

import { AngelOne } from './angel';
import { DB_SERVICE } from './db';

type PriceCallback = (price: number) => void;

const LIVE_POLL_MS = 4000;   // 4 seconds when broker connected
const DELAYED_POLL_MS = 30000; // 30 seconds fallback via yfinance
const CACHE_TTL_MS = 3500;   // Don't re-fetch if updated within 3.5s

interface CacheEntry {
  price: number;
  updatedAt: number;
}

class PriceBus {
  private subscribers = new Map<string, Set<PriceCallback>>();
  private cache = new Map<string, CacheEntry>();
  private angel: AngelOne | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private currentInterval = DELAYED_POLL_MS;

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Call this after Angel One login so PriceBus can use live LTP. */
  setBroker(angel: AngelOne | null) {
    this.angel = angel;
    const newInterval = angel ? LIVE_POLL_MS : DELAYED_POLL_MS;
    if (newInterval !== this.currentInterval) {
      this.currentInterval = newInterval;
      this._restartLoop();
    }
  }

  /** Subscribe to live price updates for a symbol. */
  subscribe(symbol: string, cb: PriceCallback): void {
    if (!symbol) return;
    const sym = symbol.toUpperCase().replace('.NS', '').replace('-EQ', '');
    if (!this.subscribers.has(sym)) {
      this.subscribers.set(sym, new Set());
    }
    this.subscribers.get(sym)!.add(cb);

    // Immediately deliver cached price if available
    const cached = this.cache.get(sym);
    if (cached) cb(cached.price);

    // Start polling if not already running
    if (!this.pollTimer) this._startLoop();
  }

  /** Unsubscribe a callback. Stops polling if no more subscribers. */
  unsubscribe(symbol: string, cb: PriceCallback): void {
    const sym = symbol.toUpperCase().replace('.NS', '').replace('-EQ', '');
    const set = this.subscribers.get(sym);
    if (set) {
      set.delete(cb);
      if (set.size === 0) this.subscribers.delete(sym);
    }
    if (this.subscribers.size === 0) this._stopLoop();
  }

  /** Unsubscribe ALL callbacks for a symbol at once (useful on unmount). */
  unsubscribeAll(symbol: string): void {
    const sym = symbol.toUpperCase().replace('.NS', '').replace('-EQ', '');
    this.subscribers.delete(sym);
    if (this.subscribers.size === 0) this._stopLoop();
  }

  /** Get the last known price instantly (0 if unknown). */
  getPrice(symbol: string): number {
    const sym = symbol.toUpperCase().replace('.NS', '').replace('-EQ', '');
    return this.cache.get(sym)?.price ?? 0;
  }

  /** Manually push a price update (e.g. from WebSocket). */
  push(symbol: string, price: number): void {
    if (!price || price <= 0) return;
    const sym = symbol.toUpperCase().replace('.NS', '').replace('-EQ', '');
    this._deliver(sym, price);
  }

  /** Force an immediate fetch cycle (e.g. on component mount). */
  async fetchNow(symbols?: string[]): Promise<void> {
    const syms = symbols
      ? symbols.map(s => s.toUpperCase().replace('.NS', '').replace('-EQ', ''))
      : Array.from(this.subscribers.keys());
    if (syms.length > 0) await this._fetchPrices(syms);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _startLoop() {
    if (this.pollTimer) return;
    // Fire immediately, then on interval
    this._tick();
    this.pollTimer = setInterval(() => this._tick(), this.currentInterval);
  }

  private _stopLoop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private _restartLoop() {
    this._stopLoop();
    if (this.subscribers.size > 0) this._startLoop();
  }

  private async _tick() {
    const symbols = Array.from(this.subscribers.keys());
    if (symbols.length === 0) return;

    // Filter out symbols recently updated (skip cache hits)
    const toFetch = symbols.filter(sym => {
      const cached = this.cache.get(sym);
      return !cached || (Date.now() - cached.updatedAt) > CACHE_TTL_MS;
    });

    if (toFetch.length > 0) await this._fetchPrices(toFetch);
  }

  private async _fetchPrices(symbols: string[]) {
    if (this.angel) {
      await this._fetchFromBroker(symbols);
    } else {
      await this._fetchFromYFinance(symbols);
    }
  }

  /** Fetch all symbols IN PARALLEL from Angel One LTP endpoint. */
  private async _fetchFromBroker(symbols: string[]) {
    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        const ltp = await this.angel!.getLtpValue('NSE', '', sym);
        return { sym, price: ltp?.price ?? 0 };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.price > 0) {
        this._deliver(r.value.sym, r.value.price);
      }
    }
  }

  /** Fallback: batch fetch from yfinance via backend /watchlists/quotes. */
  private async _fetchFromYFinance(symbols: string[]) {
    try {
      const quotes: any = await DB_SERVICE.getQuotes(symbols);
      if (!quotes || typeof quotes !== 'object') return;
      for (const sym of symbols) {
        const q = quotes[sym] || quotes[`${sym}-EQ`] || quotes[`${sym}.NS`];
        if (q?.price && q.price > 0) this._deliver(sym, q.price);
      }
    } catch {
      // Silent failure — components keep showing cached price
    }
  }

  /** Store in cache and notify all subscribers for this symbol. */
  private _deliver(symbol: string, price: number) {
    this.cache.set(symbol, { price, updatedAt: Date.now() });
    const callbacks = this.subscribers.get(symbol);
    if (callbacks) {
      callbacks.forEach(cb => {
        try { cb(price); } catch { /* don't let a bad callback break the bus */ }
      });
    }
  }
}

// Export a single app-wide singleton
export const priceBus = new PriceBus();
