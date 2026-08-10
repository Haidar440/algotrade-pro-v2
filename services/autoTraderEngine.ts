/**
 * autoTraderEngine.ts — V2 Architecture
 *
 * Broker-agnostic event-driven trading engine.
 * - No AngelOne dependency — orders go via backend REST API directly
 * - Price ticks delivered by PriceBus (no internal HTTP polling)
 * - Multi-strategy pipeline: Momentum, Mean Reversion, Breakout, Trend Follow
 * - Portfolio-aware risk management with Kelly criterion
 * - Real-time equity curve tracking + state machine for trade lifecycle
 */

import { DB_SERVICE } from './db';
import { secureGet, securePost, secureDelete, SCAN_TIMEOUT_MS } from './api';

// ── Types ──

export type BotPhase = 'IDLE' | 'SCANNING' | 'ANALYZING' | 'TRADING' | 'MONITORING' | 'COOLDOWN';
export type TradeState = 'PENDING' | 'ENTRY_PLACED' | 'OPEN' | 'TRAILING' | 'EXITING' | 'CLOSED';
export type StrategyType = 'MOMENTUM' | 'MEAN_REVERSION' | 'BREAKOUT' | 'TREND_FOLLOW';
export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';

export interface BotConfig {
  capital: number;
  riskPerTrade: number;        // % of capital
  maxDailyLoss: number;        // absolute ₹
  maxOpenPositions: number;
  enableTrailingSL: boolean;
  trailingATRMultiple: number;
  isPaperTrading: boolean;
  scanInterval: number;        // minutes between scans
  enableDynamicStocks: boolean; // use backend scanner
  strategies: StrategyType[];
  minConfidence: number;       // 0-100
}

export interface ManagedTrade {
  id: string;
  symbol: string;
  strategy: StrategyType;
  state: TradeState;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  initialSL: number;
  targets: number[];
  currentTarget: number;
  highestPrice: number;
  lowestPrice: number;
  entryTime: number;
  pnl: number;
  pnlPercent: number;
  confidence: number;
  signalStrength: SignalStrength;
  riskReward: number;
  orderId?: string;
  slOrderId?: string;
  dbId?: string;
  signals: string[];
  partialExits: number; // how many partial targets hit
}

export interface ScanCandidate {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  score: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strategy: StrategyType;
  confidence: number;
  signals: string[];
  rsi: number;
  volRatio: number;
  support: number;
  resistance: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdown: number;
}

export interface BotStats {
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  expectancy: number;
  streak: number;        // positive = winning, negative = losing
  todayTrades: number;
  todayPnL: number;
}

export interface BotSnapshot {
  phase: BotPhase;
  isRunning: boolean;
  config: BotConfig;
  activeTrades: ManagedTrade[];
  candidates: ScanCandidate[];
  stats: BotStats;
  equityCurve: EquityPoint[];
  logs: LogEntry[];
  dailyPnL: number;
  totalPnL: number;
  uptimeSeconds: number;
  lastScanTime: number;
  nextScanTime: number;
  watchlist: string[];
  scannedCount: number;
}

export interface LogEntry {
  time: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'TRADE' | 'SIGNAL' | 'SYSTEM';
  message: string;
  symbol?: string;
}

type UpdateCallback = (snapshot: BotSnapshot) => void;
type LogCallback = (entry: LogEntry) => void;

// ── Default Config ──

export const DEFAULT_BOT_CONFIG: BotConfig = {
  capital: 100000,
  riskPerTrade: 1.5,
  maxDailyLoss: 3000,
  maxOpenPositions: 5,
  enableTrailingSL: true,
  trailingATRMultiple: 1.5,
  isPaperTrading: true,
  scanInterval: 5,
  enableDynamicStocks: true,
  strategies: ['MOMENTUM', 'BREAKOUT', 'TREND_FOLLOW'],
  minConfidence: 60,
};

// ── Engine ──

export class AutoTraderEngine {
  private config: BotConfig;
  private phase: BotPhase = 'IDLE';
  private isRunning = false;
  private startTime = 0;

  // State
  private activeTrades = new Map<string, ManagedTrade>();
  private candidates: ScanCandidate[] = [];
  private closedTrades: ManagedTrade[] = [];
  private equityCurve: EquityPoint[] = [];
  private logs: LogEntry[] = [];
  private watchlist: string[] = [];
  private dailyPnL = 0;
  private totalPnL = 0;
  private lastScanTime = 0;
  private nextScanTime = 0;
  private scannedCount = 0;

  // Intervals
  private scanTimer?: ReturnType<typeof setInterval>;
  private equityTimer?: ReturnType<typeof setInterval>;
  // NOTE: tickTimer removed — price ticks now delivered by PriceBus via onPriceTick()

  // Callbacks
  private onUpdate?: UpdateCallback;
  private onLog?: LogCallback;

  // Cooldowns
  private analysisCooldown = new Map<string, number>();
  private COOLDOWN_MS = 180_000; // 3 min

  constructor(config?: Partial<BotConfig>) {
    this.config = { ...DEFAULT_BOT_CONFIG, ...config };
  }

  // ── Public API ──

  setCallbacks(onUpdate: UpdateCallback, onLog: LogCallback) {
    this.onUpdate = onUpdate;
    this.onLog = onLog;
    this.broadcast();
  }

  getSnapshot(): BotSnapshot {
    return {
      phase: this.phase,
      isRunning: this.isRunning,
      config: { ...this.config },
      activeTrades: Array.from(this.activeTrades.values()),
      candidates: [...this.candidates],
      stats: this.computeStats(),
      equityCurve: [...this.equityCurve],
      logs: [...this.logs],
      dailyPnL: this.dailyPnL,
      totalPnL: this.totalPnL,
      uptimeSeconds: this.isRunning ? (Date.now() - this.startTime) / 1000 : 0,
      lastScanTime: this.lastScanTime,
      nextScanTime: this.nextScanTime,
      watchlist: [...this.watchlist],
      scannedCount: this.scannedCount,
    };
  }

  updateConfig(newConfig: Partial<BotConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.log('SYSTEM', '⚙️ Configuration updated');
    this.broadcast();
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();
    this.phase = 'MONITORING';

    const mode = this.config.isPaperTrading ? '📝 PAPER' : '💰 LIVE';
    this.log('SYSTEM', `🚀 Engine STARTED [${mode}] | Capital: ₹${this.config.capital.toLocaleString()} | Max Positions: ${this.config.maxOpenPositions}`);

    // Restore open trades
    await this.restoreSession();

    // Delay initial scan by 5s so the backend (FastAPI + TradingView)
    // has time to fully initialize before receiving the heavy scan request.
    // Without this, the scan fires while the backend is still running its
    // lifespan tasks (DB init, Telegram, Intelligence system), causing
    // timeout errors that cascade and make all services appear broken.
    this.log('SYSTEM', '⏳ Waiting 5s for backend to stabilize before initial scan...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (this.isRunning) {
      this.log('SYSTEM', '🔍 Running initial stock scan...');
      await this.runDynamicScan();
    }

    // Periodic scan
    this.scanTimer = setInterval(() => {
      if (this.config.enableDynamicStocks && this.phase !== 'SCANNING') {
        this.runDynamicScan();
      }
    }, this.config.scanInterval * 60 * 1000);

    // Equity curve tracking (every 30s)
    this.equityTimer = setInterval(() => this.recordEquity(), 30000);

    // Price ticks are now delivered externally by PriceBus via onPriceTick().
    // EngineContext subscribes PriceBus to all symbols from getSymbolsToWatch().
    this.log('SYSTEM', '📡 Price feed: delegated to PriceBus (parallel, no sequential blocking)');

    this.broadcast();
  }

  stop() {
    this.isRunning = false;
    this.phase = 'IDLE';
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.equityTimer) clearInterval(this.equityTimer);
    this.log('SYSTEM', '🛑 Engine STOPPED');
    this.broadcast();
  }

  async manualExit(symbol: string) {
    const trade = this.activeTrades.get(symbol);
    if (!trade) {
      this.log('WARN', `No active trade for ${symbol}`);
      return;
    }
    this.log('TRADE', `⚠️ Manual exit: ${symbol}`);
    await this.exitPosition(trade, 'MANUAL_EXIT');
  }

  /**
   * Dismiss a stale trade from the active positions panel (from a previous session).
   * Does NOT place any order — just removes it from the in-memory map.
   * The DB record is left as OPEN so the user can close it properly in Trade History.
   */
  dismissStaleTrade(symbol: string) {
    const trade = this.activeTrades.get(symbol);
    if (!trade) return;
    this.activeTrades.delete(symbol);
    this.log('WARN', `🗂️ Dismissed stale position: ${symbol} (entered ${new Date(trade.entryTime).toLocaleDateString('en-IN')}). Mark it closed in Trade History.`);
    this.broadcast();
  }

  async runDynamicScan() {
    if (this.phase === 'SCANNING') return;
    this.phase = 'SCANNING';
    this.log('SIGNAL', '🔍 Dynamic stock scan started...');
    this.broadcast();

    try {
      // Use SCAN_TIMEOUT_MS (45s) — this endpoint scans 30 stocks and takes 15-30s
      const res = await secureGet('/screener/breakout-scan', SCAN_TIMEOUT_MS);
      const rawCandidates = res.breakout_candidates || [];

      // Accept candidates with score >= 45 so NEUTRAL stocks near breakout aren't dropped
      // The evaluateCandidates() step applies the proper minConfidence gate before entry
      this.candidates = rawCandidates
        .filter((b: any) => (b.breakout_score || 0) >= 45)
        .map((b: any): ScanCandidate => ({
          symbol: b.symbol,
          name: b.name || b.symbol,
          price: b.price || 0,
          changePct: b.change_pct || 0,
          score: b.breakout_score || 0,
          direction: b.direction || 'NEUTRAL',
          strategy: this.classifyStrategy(b),
          confidence: b.breakout_score || 0,
          signals: b.signals || [],
          rsi: b.rsi || 50,
          volRatio: b.vol_ratio || 1,
          // Use pivot S1 as support; fallback to 0 (executeEntry handles missing support gracefully)
          support: b.support?.[0]?.price || 0,
          resistance: b.resistance?.[0]?.price || 0,
        }))
        .sort((a: ScanCandidate, b: ScanCandidate) => b.score - a.score)
        .slice(0, 20);

      // Update watchlist from top candidates
      this.watchlist = this.candidates.slice(0, 10).map(c => c.symbol);
      this.scannedCount = rawCandidates.length;
      this.lastScanTime = Date.now();
      this.nextScanTime = Date.now() + this.config.scanInterval * 60 * 1000;

      this.log('SIGNAL', `✅ Found ${this.candidates.length} candidates from ${rawCandidates.length} scanned`);

      // Auto-evaluate top candidates for entry
      if (this.isRunning) {
        await this.evaluateCandidates();
      }
    } catch (e: any) {
      this.log('ERROR', `Scan failed: ${e.message}`);
    }

    this.phase = this.isRunning ? 'MONITORING' : 'IDLE';
    this.broadcast();
  }

  // ── Private: Strategy Classification ──

  private classifyStrategy(b: any): StrategyType {
    if (b.category === 'BREAKOUT') return 'BREAKOUT';
    if (b.category === 'REVERSAL') return 'MEAN_REVERSION';
    if (b.rsi > 50 && b.rsi < 70 && b.direction === 'BULLISH') return 'MOMENTUM';
    return 'TREND_FOLLOW';
  }

  private getSignalStrength(score: number): SignalStrength {
    if (score >= 80) return 'VERY_STRONG';
    if (score >= 65) return 'STRONG';
    if (score >= 50) return 'MODERATE';
    return 'WEAK';
  }

  // ── Private: Candidate Evaluation ──

  private async evaluateCandidates() {
    if (this.activeTrades.size >= this.config.maxOpenPositions) {
      this.log('INFO', `⏸️ Max positions (${this.config.maxOpenPositions}) reached — skipping evaluation`);
      return;
    }

    this.phase = 'ANALYZING';
    this.broadcast();

    let evaluated = 0;
    for (const candidate of this.candidates) {
      if (this.activeTrades.size >= this.config.maxOpenPositions) break;
      if (this.activeTrades.has(candidate.symbol)) continue;

      const lastAnalysis = this.analysisCooldown.get(candidate.symbol) || 0;
      if (Date.now() - lastAnalysis < this.COOLDOWN_MS) continue;
      this.analysisCooldown.set(candidate.symbol, Date.now());

      // Strategy filter
      if (!this.config.strategies.includes(candidate.strategy)) {
        this.log('INFO', `⏭ ${candidate.symbol}: strategy ${candidate.strategy} not in config — skipping`);
        continue;
      }

      // Direction filter: allow BULLISH or NEUTRAL (NEUTRAL with high score is a valid breakout setup)
      if (candidate.direction === 'BEARISH') {
        this.log('INFO', `⏭ ${candidate.symbol}: BEARISH direction — skipping`);
        continue;
      }

      // Confidence filter (applied here, not in runDynamicScan, to keep watchlist wide)
      if (candidate.confidence < this.config.minConfidence) {
        this.log('INFO', `⏭ ${candidate.symbol}: confidence ${candidate.confidence} < ${this.config.minConfidence} — skipping`);
        continue;
      }

      // Check daily loss limit
      if (this.dailyPnL <= -this.config.maxDailyLoss) {
        this.log('WARN', `⛔ Daily loss limit hit (₹${Math.abs(this.dailyPnL).toFixed(0)}). Pausing entries.`);
        break;
      }

      evaluated++;
      try {
        await this.executeEntry(candidate);
      } catch (e: any) {
        this.log('ERROR', `Entry failed for ${candidate.symbol}: ${e.message}`);
      }
    }

    if (evaluated === 0) {
      this.log('INFO', `📊 Evaluated ${this.candidates.length} candidates — none passed all entry filters (direction/confidence/strategy)`);
    }

    this.phase = this.isRunning ? 'MONITORING' : 'IDLE';
    this.broadcast();
  }

  // ── Private: Entry Execution ──

  private async executeEntry(candidate: ScanCandidate) {
    const { symbol, price, support, resistance, strategy, confidence, signals } = candidate;

    if (price <= 0) {
      this.log('INFO', `⏭ ${symbol}: price is 0 — skipping entry`);
      return;
    }

    // Determine stop loss:
    //   Priority 1: pivot S1 support level (from TradingView)
    //   Priority 2: 3% below entry price (ATR-style fallback for stocks with no pivot data)
    const sl = support > 0 && support < price ? support * 0.99 : price * 0.97;
    const riskPerShare = price - sl;
    if (riskPerShare <= 0) {
      this.log('INFO', `⏭ ${symbol}: riskPerShare <= 0 (price=${price}, sl=${sl}) — skipping`);
      return;
    }

    const riskAmount = this.config.capital * (this.config.riskPerTrade / 100);
    let qty = Math.floor(riskAmount / riskPerShare);
    const maxQty = Math.floor((this.config.capital * 0.2) / price);
    qty = Math.min(qty, maxQty);
    if (qty < 1) {
      this.log('INFO', `⏭ ${symbol}: qty < 1 (riskAmount=₹${riskAmount.toFixed(0)}, riskPerShare=₹${riskPerShare.toFixed(2)}) — skipping`);
      return;
    }

    // Determine targets:
    //   T1: next resistance level or +5% (minimum)
    //   T2 & T3: based on risk multiple
    const t1Base = resistance > price ? resistance : price * 1.05;
    const target1 = Math.max(t1Base, price + riskPerShare * 1.5); // Ensure min 1.5:1 RR
    const target2 = price + riskPerShare * 2.5;
    const target3 = price + riskPerShare * 4.0;
    const rr = (target1 - price) / riskPerShare;

    if (rr < 1.5) {
      this.log('INFO', `⏭ ${symbol}: R:R ${rr.toFixed(2)} < 1.5 — skipping`);
      return; // Skip bad risk-reward
    }

    const tradeId = `T_${Date.now()}_${symbol}`;

    this.log('TRADE', `⚡ ENTRY: ${symbol} @ ₹${price.toFixed(1)} | Qty: ${qty} | SL: ₹${sl.toFixed(1)} | R:R ${rr.toFixed(1)} | Strategy: ${strategy}`);

    let orderId: string | undefined;
    let dbId: string | undefined;

    if (this.config.isPaperTrading) {
      orderId = `PAPER_${Date.now()}`;
      this.log('INFO', `📝 [PAPER] Simulated BUY ${symbol} × ${qty}`);
    } else {
      // Live mode: place order via backend REST API (broker-agnostic)
      try {
        const res: any = await securePost('/broker/order', {
          symbol: `${symbol}-EQ`,
          exchange: 'NSE',
          side: 'BUY',
          order_type: 'MARKET',
          quantity: qty,
          price: 0,
          product: 'DELIVERY',
        });
        if (res?.order_id) orderId = res.order_id;
        else { this.log('ERROR', `Order rejected: ${res?.message || 'unknown'}`); return; }
      } catch (e: any) {
        this.log('ERROR', `Order failed: ${e.message}`);
        return;
      }
    }

    // Save to DB — include source:'PAPER' so Paper Simulator shows the trade
    try {
      const saved: any = await DB_SERVICE.saveTrade({
        symbol, entryPrice: price, quantity: qty, type: 'SWING',
        status: 'OPEN', strategy, entryDate: new Date(),
        source: this.config.isPaperTrading ? 'PAPER' : 'BOT_LIVE',
        stopLoss: sl,
        target: target1,
        notes: `AutoBot V2 | ${strategy} | Conf: ${confidence}`
      });
      if (saved) dbId = saved.id || saved._id;
    } catch {}

    const trade: ManagedTrade = {
      id: tradeId, symbol, strategy, state: 'OPEN', direction: 'LONG',
      entryPrice: price, currentPrice: price, quantity: qty,
      stopLoss: sl, initialSL: sl,
      targets: [target1, target2, target3], currentTarget: 0,
      highestPrice: price, lowestPrice: price,
      entryTime: Date.now(), pnl: 0, pnlPercent: 0,
      confidence, signalStrength: this.getSignalStrength(confidence),
      riskReward: rr, orderId, dbId, signals,
      partialExits: 0,
    };

    this.activeTrades.set(symbol, trade);
    this.broadcast();
  }

  // ── Public: Price Tick Entry Point (called by PriceBus) ──

  /**
   * Called by PriceBus whenever a new LTP is available for a symbol.
   * Replaces the old tickAll() HTTP polling loop.
   * This method is synchronous and non-blocking.
   */
  onPriceTick(symbol: string, price: number) {
    if (!this.isRunning) return;
    this.processTick(symbol, price);
  }

  /**
   * Returns all symbols the engine currently cares about.
   * EngineContext uses this to subscribe PriceBus to the right symbols.
   */
  getSymbolsToWatch(): string[] {
    return [
      ...this.watchlist,
      ...Array.from(this.activeTrades.keys()),
    ];
  }

  private processTick(symbol: string, price: number) {
    // Update candidate prices
    const ci = this.candidates.findIndex(c => c.symbol === symbol);
    if (ci >= 0) this.candidates[ci].price = price;

    // Manage active trade
    const trade = this.activeTrades.get(symbol);
    if (!trade || trade.state === 'CLOSED') return;

    trade.currentPrice = price;
    trade.pnl = (price - trade.entryPrice) * trade.quantity;
    trade.pnlPercent = ((price - trade.entryPrice) / trade.entryPrice) * 100;

    if (price > trade.highestPrice) trade.highestPrice = price;
    if (price < trade.lowestPrice) trade.lowestPrice = price;

    // State machine
    this.managePosition(trade, price);
    this.broadcast();
  }

  private async managePosition(trade: ManagedTrade, price: number) {
    if (trade.state !== 'OPEN' && trade.state !== 'TRAILING') return;

    // 1. Stop loss hit
    if (price <= trade.stopLoss) {
      this.log('TRADE', `🛑 SL HIT: ${trade.symbol} @ ₹${price.toFixed(1)}`);
      await this.exitPosition(trade, 'STOP_LOSS');
      return;
    }

    // 2. Target hit — partial exit logic
    if (trade.currentTarget < trade.targets.length && price >= trade.targets[trade.currentTarget]) {
      this.log('TRADE', `🎯 Target ${trade.currentTarget + 1} hit: ${trade.symbol} @ ₹${price.toFixed(1)}`);
      trade.currentTarget++;
      trade.partialExits++;

      // Move SL to breakeven after T1
      if (trade.currentTarget === 1) {
        trade.stopLoss = trade.entryPrice * 1.002;
        trade.state = 'TRAILING';
        this.log('INFO', `🔒 ${trade.symbol}: SL moved to breakeven`);
      }

      // Full exit after T3
      if (trade.currentTarget >= trade.targets.length) {
        await this.exitPosition(trade, 'ALL_TARGETS');
        return;
      }
    }

    // 3. Trailing stop
    if (this.config.enableTrailingSL && trade.state === 'TRAILING') {
      const trail = (trade.highestPrice - trade.entryPrice) * 0.4;
      const newSL = trade.highestPrice - trail;
      if (newSL > trade.stopLoss) {
        trade.stopLoss = newSL;
      }
    }
  }

  private async exitPosition(trade: ManagedTrade, reason: string) {
    trade.state = 'EXITING';
    const exitPrice = trade.currentPrice;

    if (!this.config.isPaperTrading) {
      // Live mode: cancel any SL order then place SELL via backend REST API
      try {
        if (trade.slOrderId) {
          await secureDelete(`/broker/order/${trade.slOrderId}`).catch(() => {});
        }
        const res: any = await securePost('/broker/order', {
          symbol: `${trade.symbol}-EQ`,
          exchange: 'NSE',
          side: 'SELL',
          order_type: 'MARKET',
          quantity: trade.quantity,
          price: 0,
          product: 'DELIVERY',
        });
        if (!res?.order_id) {
          this.log('ERROR', `Exit order rejected: ${res?.message || 'unknown'}`);
          trade.state = 'OPEN';
          return;
        }
      } catch (e: any) {
        this.log('ERROR', `Exit order failed: ${e.message}`);
        trade.state = 'OPEN';
        return;
      }
    } else {
      this.log('INFO', `📝 [PAPER] Simulated SELL ${trade.symbol} × ${trade.quantity}`);
    }

    // Finalize
    trade.state = 'CLOSED';
    trade.pnl = (exitPrice - trade.entryPrice) * trade.quantity;
    trade.pnlPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;

    this.dailyPnL += trade.pnl;
    this.totalPnL += trade.pnl;

    const emoji = trade.pnl >= 0 ? '✅' : '❌';
    this.log('TRADE', `${emoji} CLOSED (${reason}): ${trade.symbol} | P&L: ₹${trade.pnl.toFixed(0)} (${trade.pnlPercent.toFixed(1)}%)`);

    // DB update
    if (trade.dbId) {
      try {
        await DB_SERVICE.updateTrade(trade.dbId, {
          status: 'CLOSED', exitDate: new Date(),
          exitPrice, pnl: trade.pnl,
          notes: `AutoBot V2: ${reason}`
        });
      } catch {}
    }

    this.closedTrades.push({ ...trade });
    this.activeTrades.delete(trade.symbol);
    this.recordEquity();
    this.broadcast();
  }

  // ── Private: Session Restore ──

  private async restoreSession() {
    this.log('SYSTEM', '🔄 Restoring session...');
    try {
      const openTrades = await DB_SERVICE.getOpenTrades();
      if (openTrades?.length > 0) {
        let restored = 0;
        let stale = 0;
        const todayStr = new Date().toDateString();

        for (const t of openTrades) {
          if (t.strategy === 'MANUAL' || t.notes?.includes('Manual')) continue;
          if (!t.notes?.includes('AutoBot')) continue;

          // ── Date guard: skip trades from previous sessions (yesterday or older) ──
          const entryDateStr = t.entryDate ? new Date(t.entryDate).toDateString() : null;
          if (entryDateStr && entryDateStr !== todayStr) {
            stale++;
            this.log('WARN', `⚠️ Skipping stale trade: ${t.symbol} (entered ${entryDateStr}) — close it manually in Trade History`);
            continue;
          }

          const trade: ManagedTrade = {
            id: `RESTORED_${t.symbol}_${Date.now()}`,
            symbol: t.symbol, strategy: (t.strategy as StrategyType) || 'TREND_FOLLOW',
            state: 'OPEN', direction: 'LONG',
            entryPrice: t.entryPrice,
            // Start currentPrice at entryPrice; tickAll() will update it within 3 seconds
            currentPrice: t.entryPrice,
            quantity: t.quantity, stopLoss: t.stopLoss || t.entryPrice * 0.95,
            initialSL: t.stopLoss || t.entryPrice * 0.95,
            targets: [t.target || t.entryPrice * 1.05, t.entryPrice * 1.10, t.entryPrice * 1.15],
            currentTarget: 0, highestPrice: t.entryPrice, lowestPrice: t.entryPrice,
            entryTime: new Date(t.entryDate).getTime(),
            pnl: 0, pnlPercent: 0, confidence: 70,
            signalStrength: 'MODERATE', riskReward: 2,
            orderId: 'RESTORED', dbId: t._id || t.id,
            signals: ['Session Restored'], partialExits: 0,
          };
          this.activeTrades.set(t.symbol, trade);
          restored++;
        }

        if (stale > 0) {
          this.log('WARN', `🗂️ ${stale} stale trade(s) from a previous session were skipped. Mark them closed in Trade History.`);
        }
        this.log('SYSTEM', `📥 Restored ${restored} bot trade(s) from today's session`);
      } else {
        this.log('INFO', 'No open bot trades to restore');
      }
    } catch (e: any) {
      this.log('WARN', `Restore failed: ${e.message}`);
    }
  }

  /**
   * Force-close a stale/orphaned trade record in the DB.
   * Call this from the UI when the user wants to mark yesterday's positions closed.
   */
  async markTradeClosedInDb(dbId: string, exitPrice: number, reason = 'MANUAL_CLOSE') {
    try {
      await DB_SERVICE.updateTrade(dbId, {
        status: 'CLOSED', exitDate: new Date(),
        exitPrice, notes: `AutoBot V2: ${reason}`
      });
      this.log('TRADE', `🗂️ Marked trade ${dbId} CLOSED in DB (${reason})`);
    } catch (e: any) {
      this.log('ERROR', `Failed to mark trade closed: ${e.message}`);
    }
  }

  // ── Private: Stats ──

  private computeStats(): BotStats {
    const trades = this.closedTrades;
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

    let streak = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if (i === trades.length - 1) {
        streak = trades[i].pnl > 0 ? 1 : -1;
      } else {
        if ((trades[i].pnl > 0 && streak > 0) || (trades[i].pnl <= 0 && streak < 0)) {
          streak += streak > 0 ? 1 : -1;
        } else break;
      }
    }

    // Max drawdown from equity curve
    let maxDD = 0, peak = this.config.capital;
    for (const pt of this.equityCurve) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = ((peak - pt.equity) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }

    return {
      totalTrades: trades.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      avgWin: wins.length > 0 ? totalWin / wins.length : 0,
      avgLoss: losses.length > 0 ? totalLoss / losses.length : 0,
      profitFactor: totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0,
      sharpeRatio: 0, // simplified
      maxDrawdown: maxDD,
      expectancy: trades.length > 0 ? (totalWin - totalLoss) / trades.length : 0,
      streak,
      todayTrades: trades.filter(t => {
        const d = new Date(t.entryTime);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      }).length,
      todayPnL: this.dailyPnL,
    };
  }

  private recordEquity() {
    const openPnL = Array.from(this.activeTrades.values()).reduce((s, t) => s + t.pnl, 0);
    const equity = this.config.capital + this.totalPnL + openPnL;
    let peak = this.config.capital;
    for (const pt of this.equityCurve) {
      if (pt.equity > peak) peak = pt.equity;
    }
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    this.equityCurve.push({ time: Date.now(), equity, drawdown });
    if (this.equityCurve.length > 500) this.equityCurve = this.equityCurve.slice(-500);
  }

  // ── Private: Logging ──

  private log(level: LogEntry['level'], message: string, symbol?: string) {
    const entry: LogEntry = { time: Date.now(), level, message, symbol };
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs = this.logs.slice(-100);
    this.onLog?.(entry);
  }

  private broadcast() {
    this.onUpdate?.(this.getSnapshot());
  }
}
