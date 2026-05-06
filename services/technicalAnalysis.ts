/**
 * technicalAnalysis.ts — GUTTED
 * 
 * All indicator calculations and strategy evaluations have been moved to the
 * Python backend (analysis_engine.py). This file now only contains:
 * 1. Position sizing (risk management utility)
 * 2. Safety checks (circuit lock, liquidity) — kept for optional frontend guard
 * 
 * The analyze() method is REMOVED. Use gemini.ts → analyzeStockTicker() which
 * calls the backend /api/analysis/{symbol} endpoint.
 */

import { AnalysisResult } from '../types';

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class TechnicalAnalysisEngine {

  /* ==========================================================
   * POSITION SIZING (Risk Management) — kept for frontend use
   * ========================================================== */

  /**
   * Calculate position size based on account equity, risk %, and ATR.
   * Used by TradePlanCard for "Shares to Buy" calculation.
   */
  public static positionSize(
    accountEquity: number,
    riskPct: number,
    atr: number,
    atrMultiple = 2
  ): number {
    if (atr <= 0 || accountEquity <= 0) return 0;
    const riskDollars = accountEquity * (riskPct / 100);
    const stopDistance = atr * atrMultiple;
    return Math.floor(riskDollars / stopDistance);
  }

  /* ==========================================================
   * SAFETY CHECKS — optional frontend guards
   * ========================================================== */

  /** Check if stock is circuit locked (UC/LC trap) */
  public static isCircuitLocked(curr: Candle): boolean {
    const isFlat = (curr.high - curr.low) / curr.low < 0.005;
    const isAtHigh = curr.close === curr.high;
    return isAtHigh && isFlat;
  }

  /** Check minimum liquidity */
  public static checkLiquidity(avgVolume: number, exchange: 'NSE' | 'BSE' = 'NSE'): boolean {
    const MIN_NSE_VOL = 100000;
    const MIN_BSE_VOL = 50000;
    if (exchange === 'NSE' && avgVolume < MIN_NSE_VOL) return false;
    if (exchange === 'BSE' && avgVolume < MIN_BSE_VOL) return false;
    return true;
  }

  /* ==========================================================
   * DEPRECATED: analyze() — DO NOT USE
   * ========================================================== 
   * All analysis is now done by the backend.
   * Use: import { analyzeStockTicker } from './gemini';
   * Which calls: GET /api/analysis/{symbol}
   */
}