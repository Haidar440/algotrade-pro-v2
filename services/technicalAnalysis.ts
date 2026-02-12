import { AnalysisResult, StrategyEvaluation, Technicals, PrimaryRecommendation } from '../types';

interface Candle {
  date: string;   // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MACDResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

export class TechnicalAnalysisEngine {

  /* ==========================================================
   * 0.  MATH & INDICATOR KERNEL
   * ========================================================== */

  private static slice<T>(arr: T[], start: number, end?: number): T[] {
    const len = arr.length;
    return arr.slice(Math.max(0, len + start), end ? Math.max(0, len + end) : undefined);
  }

  private static sum(data: number[]): number {
    return data.reduce((a, b) => a + b, 0);
  }

  private static sma(data: number[], n: number): number {
    if (n <= 0 || data.length < n) return 0;
    return this.sum(this.slice(data, -n)) / n;
  }

  private static ema(data: number[], n: number): number {
    if (n <= 1 || data.length < n) return 0;
    const k = 2 / (n + 1);
    let ema = this.sum(data.slice(0, n)) / n;
    for (let i = n; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private static emaSeries(data: number[], n: number): number[] {
    if (n <= 1 || data.length < n) return new Array(data.length).fill(0);
    const k = 2 / (n + 1);
    const result: number[] = new Array(data.length).fill(0);
    let ema = this.sum(data.slice(0, n)) / n;
    result[n - 1] = ema;
    for (let i = n; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
      result[i] = ema;
    }
    return result;
  }

  private static calculateMACD(closes: number[], fast = 12, slow = 26, sig = 9): { current: MACDResult, prev: MACDResult } {
    const emaFast = this.emaSeries(closes, fast);
    const emaSlow = this.emaSeries(closes, slow);
    const macdLineSeries = closes.map((_, i) => emaFast[i] - emaSlow[i]);
    const signalLineSeries = this.emaSeries(macdLineSeries, sig);
    const idx = closes.length - 1;
    const prevIdx = closes.length - 2;
    return {
      current: {
        macdLine: macdLineSeries[idx],
        signalLine: signalLineSeries[idx],
        histogram: macdLineSeries[idx] - signalLineSeries[idx]
      },
      prev: {
        macdLine: macdLineSeries[prevIdx],
        signalLine: signalLineSeries[prevIdx],
        histogram: macdLineSeries[prevIdx] - signalLineSeries[prevIdx]
      }
    };
  }

  private static rsi(closes: number[], period = 14): number {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      d > 0 ? (gains += d) : (losses -= d);
    }
    let avgG = gains / period, avgL = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
      avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (avgL === 0) return 100;
    const rs = avgG / avgL;
    return 100 - 100 / (1 + rs);
  }

  private static bb(closes: number[], period = 20, stdDev = 2) {
    const m = this.sma(closes, period);
    const slice = this.slice(closes, -period);
    const variance = slice.reduce((a, b) => a + Math.pow(b - m, 2), 0) / period;
    const s = Math.sqrt(variance);
    return { upper: m + s * stdDev, middle: m, lower: m - s * stdDev };
  }

  private static adx(highs: number[], lows: number[], closes: number[], period = 14): number {
    if (highs.length < period * 2) return 0;
    const tr: number[] = [], dmP: number[] = [], dmM: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      const h = highs[i], l = lows[i], pc = closes[i - 1];
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      dmP.push(h - highs[i - 1] > lows[i - 1] - l ? Math.max(h - highs[i - 1], 0) : 0);
      dmM.push(lows[i - 1] - l > h - highs[i - 1] ? Math.max(lows[i - 1] - l, 0) : 0);
    }
    const smooth = (d: number[]) => {
      const out: number[] = [];
      let sum = d.slice(0, period).reduce((a, b) => a + b, 0);
      out.push(sum);
      for (let i = period; i < d.length; i++) {
        sum = sum - (sum / period) + d[i];
        out.push(sum);
      }
      return out;
    };
    const trS = smooth(tr), dpS = smooth(dmP), dmS = smooth(dmM);
    const dx = trS.map((t, i) => {
      const p = (dpS[i] / t) * 100, m = (dmS[i] / t) * 100;
      const div = p + m;
      return div === 0 ? 0 : Math.abs(p - m) / div * 100;
    });
    return this.sma(dx, period);
  }

  private static vwap(candles: Candle[], period = 20): number {
    const slice = this.slice(candles, -period);
    let pv = 0, vol = 0;
    slice.forEach(c => { const tp = (c.high + c.low + c.close) / 3; pv += tp * c.volume; vol += c.volume; });
    return vol ? pv / vol : 0;
  }

  private static atr(candles: Candle[], period = 14): number {
    if (candles.length < period + 1) return 0;
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < tr.length; i++) {
      atr = (atr * (period - 1) + tr[i]) / period;
    }
    return atr;
  }

  private static stochK(closes: number[], highs: number[], lows: number[], period = 14): number {
    const c = closes[closes.length - 1];
    const hh = Math.max(...this.slice(highs, -period));
    const ll = Math.min(...this.slice(lows, -period));
    return hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100;
  }

  private static highest(arr: number[], n: number) { return Math.max(...this.slice(arr, -n)); }
  private static lowest(arr: number[], n: number) { return Math.min(...this.slice(arr, -n)); }

  /* ==========================================================
   * 1.  🛡️ INDIA MARKET SAFETIES (Circuit, Liquidity, Calendar)
   * ========================================================== */
  
  private static isIndianHoliday(dateStr: string): boolean {
    // 🛑 Simple Static Holiday List (Update annually)
    // Format: YYYY-MM-DD
    const holidays = [
        "2025-01-26", // Republic Day
        "2025-03-14", // Holi
        "2025-04-10", // Id-Ul-Fitr (Tentative)
        "2025-04-14", // Ambedkar Jayanti
        "2025-08-15", // Independence Day
        "2025-10-02", // Gandhi Jayanti
        "2025-10-20", // Diwali
        "2025-12-25"  // Christmas
    ];
    // Check if weekend (0=Sun, 6=Sat)
    const d = new Date(dateStr);
    const day = d.getDay();
    if (day === 0 || day === 6) return true;

    return holidays.includes(dateStr);
  }

  private static checkLiquidity(avgVolume: number, exchange: 'NSE' | 'BSE'): boolean {
     // 💧 Liquidity Rule: Avoid traps in illiquid counters
     // NSE stocks generally need higher volume to be safe
     const MIN_NSE_VOL = 100000; 
     const MIN_BSE_VOL = 50000; // stricter for BSE to avoid "operator" stocks

     if (exchange === 'NSE' && avgVolume < MIN_NSE_VOL) return false;
     if (exchange === 'BSE' && avgVolume < MIN_BSE_VOL) return false;
     
     return true;
  }

  private static isCircuitLocked(curr: Candle): boolean {
     // ⚡ Circuit Filter: If High == Close (Upper Circuit Candidate) 
     // AND Low is very close to High (Flat movement)
     // This often means the stock opened at UC and stayed there (Buying impossible/dangerous)
     const isFlat = (curr.high - curr.low) / curr.low < 0.005; // Less than 0.5% movement
     const isAtHigh = curr.close === curr.high;
     
     return isAtHigh && isFlat;
  }

  /* ==========================================================
   * 2.  STRATEGY ENGINE
   * ========================================================== */
  
  // ✅ Added 'exchange' parameter (default NSE)
  public static analyze(symbol: string, candles: Candle[], exchange: 'NSE' | 'BSE' = 'NSE'): AnalysisResult {
    
    // 1. Data Integrity Check
    if (candles.length < 60) throw new Error(`Insufficient data for ${symbol} (Need 60+, Got ${candles.length})`);
    
    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const price = curr.close;
    const dateStr = curr.date.split('T')[0]; // Handle ISO strings
    const previousClose = prev.close;

    // 2. 📅 Holiday Check
    // If the latest candle is from a holiday (data error) or today is holiday, we might warn
    // (Here we just log or tag it, but usually we proceed if we have data)

    // 3. Pre-Process Data Arrays
    const closes = candles.map(c => c.close);
    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);
    const vols   = candles.map(c => c.volume);
    const avgVol = this.sma(vols, 20);

    // 4. 💧 Liquidity Check
    if (!this.checkLiquidity(avgVol, exchange)) {
        // Return a "No Trade" result immediately
        return this.createRejectionResult(symbol, curr, `Liquidity Too Low (Avg Vol: ${Math.floor(avgVol)})`);
    }

    // 5. ⚡ Circuit Check
    if (this.isCircuitLocked(curr)) {
        return this.createRejectionResult(symbol, curr, "⚠️ Circuit Locked / Flat Price Action (Risk of Trap)");
    }

    /* ---------- Indicator Computation ---------- */
    const rsi     = this.rsi(closes);
    const bb      = this.bb(closes);
    const adx     = this.adx(highs, lows, closes);
    const vwap    = this.vwap(candles, 20);
    const atr14   = this.atr(candles, 14);
    
    // Moving Averages
    const ema9    = this.ema(closes, 9);
    const ema20   = this.ema(closes, 20);
    const ema50   = this.ema(closes, 50);
    const ema200  = this.ema(closes, 200);
    const sma200  = this.sma(closes, 200);
    
    const stoch   = this.stochK(closes, highs, lows, 14);
    const volSpike = curr.volume > avgVol * 1.5;
    const macdData = this.calculateMACD(closes);

    /* ---------- Market Condition ---------- */
    let condition: 'UPTREND' | 'DOWNTREND' | 'RANGE-BOUND' = 'RANGE-BOUND';
    if (price > ema50 && ema50 > ema200) condition = 'UPTREND';
    else if (price < ema50 && ema50 < ema200) condition = 'DOWNTREND';

    const strategies: StrategyEvaluation[] = [];

    // Helper to add strategies
    const addStrat = (name: string, isValid: boolean, riskRatio: number, confidence: number, notes: string, targets: number[], stop: number) => {
        strategies.push({
            strategy_name: name,
            is_valid: isValid,
            signal: isValid ? 'BUY' : 'NO-TRADE',
            ideal_entry_range: [price, price * 1.01],
            stop_loss: Number(stop.toFixed(2)),
            target_prices: targets.map(t => Number(t.toFixed(2))),
            risk_reward_ratio: riskRatio,
            quality_score: isValid ? confidence : 0.3,
            confidence: isValid ? confidence : 0,
            notes
        });
    };

    /* =================== STRATEGY DEFINITIONS =================== */

    // 1. VCP Setup
    const vcpContraction = () => {
      const r1 = this.highest(highs, 15) - this.lowest(lows, 15);
      const r2 = this.highest(highs, 10) - this.lowest(lows, 10);
      const r3 = this.highest(highs, 5)  - this.lowest(lows, 5);
      return r3 < r2 * 0.8 && r2 < r1 * 0.8;
    };
    const isVCP = vcpContraction() && price > ema50 && curr.volume < avgVol;
    addStrat("VCP Setup", isVCP, 3, 0.9, 
        isVCP ? "Volatility contracting significantly." : "No VCP.", 
        [price * 1.10, price * 1.20], this.lowest(lows, 3));

    // 2. Trend Following (ADX)
    const isTrendBuy = price > ema50 && adx > 25 && ema20 > ema50;
    addStrat("Trend Following (ADX)", isTrendBuy, 2.5, 0.85, 
        isTrendBuy ? `Strong Trend (ADX ${adx.toFixed(0)}).` : "Trend weak.",
        [price * 1.15], ema50);

    // 3. Golden Cross 
    const isGolden = ema50 > sma200 && prev.close < sma200 && price > sma200;
    const isGoldenZone = ema50 > sma200 && price > ema20;
    addStrat("Golden Cross", isGolden || isGoldenZone, 3, isGolden ? 0.95 : 0.8,
        isGolden ? "Fresh Golden Cross!" : isGoldenZone ? "Golden Cross Zone." : "No Golden Cross.",
        [price * 1.25], sma200);

    // 4. RSI Divergence
    const priceLow5 = this.lowest(lows, 5);
    const priceLow15 = this.lowest(lows, 15);
    const isDivergence = priceLow5 < priceLow15 && rsi > 30 && rsi < 50;
    addStrat("RSI Divergence", isDivergence, 3, 0.85,
        isDivergence ? "Bullish Divergence detected." : "No divergence.",
        [price * 1.08], priceLow5);

    // 5. 20-Day Breakout
    const resistance20 = this.highest(highs, 20);
    const isBreakout = price > resistance20 && volSpike;
    addStrat("20-Day Breakout", isBreakout, 2, 0.92,
        isBreakout ? "Breaking 20-day high + Vol." : "Inside range.",
        [price * 1.10], price * 0.97);

    // 6. VWAP Reversion
    const isVWAPBounce = prev.low <= vwap && price > vwap && condition === 'UPTREND';
    addStrat("VWAP Reversion", isVWAPBounce, 2.5, 0.88,
        isVWAPBounce ? "Bounced off VWAP." : "No VWAP interaction.",
        [resistance20], vwap * 0.98);

    // 7. 50 EMA Pullback
    const distTo50 = Math.abs(price - ema50) / price;
    const isPullback = condition === 'UPTREND' && distTo50 < 0.015 && price >= ema50;
    addStrat("50 EMA Pullback", isPullback, 3, 0.9,
        isPullback ? "Perfect pullback to 50 EMA." : "Not near 50 EMA.",
        [price * 1.1], ema50 * 0.97);

    // 8. Bollinger Squeeze 
    const bandwidth = (bb.upper - bb.lower) / bb.middle;
    const isSqueeze = bandwidth < 0.10;
    const isBBreakout = isSqueeze && price > bb.upper;
    addStrat("Bollinger Squeeze", isBBreakout, 2.5, 0.95,
        isBBreakout ? "Breakout from Squeeze." : isSqueeze ? "Market Squeezing." : "No squeeze.",
        [price * 1.15], bb.middle);

    // 9. Volume Spread (VPA)
    const spread = curr.high - curr.low;
    const avgSpread = (this.highest(highs, 10) - this.lowest(lows, 10)) / 10;
    const isWideSpread = spread > avgSpread * 1.5;
    const isVPA = isWideSpread && volSpike && curr.close > curr.open;
    addStrat("Volume Spread (VPA)", isVPA, 2, 0.85,
        isVPA ? "Wide spread green candle + Volume." : "Normal VPA.",
        [price + spread * 2], curr.low);

    // 10. Stochastic Oversold Bounce
    const stochOversold = stoch < 20 && prev.close < curr.close && condition === 'UPTREND';
    addStrat("Stochastic Oversold Bounce", stochOversold, 2.5, 0.82,
        stochOversold ? "Stochastic < 20 turning up." : "Not oversold.",
        [price * 1.08], this.lowest(lows, 5));

    // 11. MACD Histogram Reversal
    const histPrev = macdData.prev.histogram;
    const histCurr = macdData.current.histogram;
    const macdRev = histPrev < 0 && histCurr > 0;
    addStrat("MACD Histogram Reversal", macdRev, 2.8, 0.84,
        macdRev ? "MACD histogram flipped positive." : "No MACD flip.",
        [price * 1.12], this.lowest(lows, 3));

    // 12. 3-Bar Inside-Up
    const inside3 = (() => {
        if (candles.length < 4) return false;
        const c1 = candles[candles.length - 2], c2 = candles[candles.length - 3], c3 = candles[candles.length - 4];
        return c3.high > c2.high && c3.low < c2.low &&
               c2.high > c1.high && c2.low < c1.low &&
               curr.close > c1.high && volSpike;
    })();
    addStrat("3-Bar Inside-Up", inside3, 2.3, 0.86,
        inside3 ? "Triple inside bars broken upward." : "No pattern.",
        [price * 1.09], curr.low);

    // 13. RSI Swing Re-entry
    const rsiSwing = rsi > 45 && rsi < 55 && condition === 'UPTREND' && ema20 > ema50;
    addStrat("RSI Swing Re-entry", rsiSwing, 2.4, 0.8,
        rsiSwing ? "RSI mid-zone pullback." : "RSI out of zone.",
        [price * 1.07], ema50);

    // 14. BhavCopy Pullback
    const bcPullback = condition === 'UPTREND' && ema20 > ema50 && price <= ema20 * 1.01 && price <= this.lowest(lows, 5) * 1.02 && rsi < 45;
    addStrat("BhavCopy Pullback", bcPullback, 2.5, 0.85,
        bcPullback ? "Mid-cap pullback to 20-SMA." : "No setup.",
        [ema20 + (ema20 - Math.min(ema50, this.lowest(lows, 5)))], Math.min(ema50, this.lowest(lows, 5)));


    /* =================== FINAL DECISION =================== */
    const activeBuys = strategies.filter(s => s.signal === 'BUY');
    const bestStrategy = activeBuys.length ? activeBuys.sort((a, b) => b.quality_score - a.quality_score)[0] : strategies[0];

    const technicals: Technicals = {
      rsi: Number(rsi.toFixed(2)),
      adx: Number(adx.toFixed(2)),
      macd: macdData.current.macdLine > macdData.current.signalLine ? 'BULLISH' : 'BEARISH',
      ema_20: Number(ema20.toFixed(2)),
      ema_50: Number(ema50.toFixed(2)),
      ema_200: Number(ema200.toFixed(2)),
      support: Number(this.lowest(lows, 20).toFixed(2)),
      resistance: Number(this.highest(highs, 20).toFixed(2)),
      volume_status: volSpike ? 'HIGH' : 'AVERAGE',
      atr14: Number(atr14.toFixed(2))
    };

    const primary: PrimaryRecommendation = {
      strategy_name: activeBuys.length ? bestStrategy.strategy_name : "No Trade Setup",
      signal: activeBuys.length ? 'BUY' : 'NO-TRADE',
      ideal_entry_range: bestStrategy.ideal_entry_range,
      stop_loss: bestStrategy.stop_loss,
      target_prices: bestStrategy.target_prices,
      risk_reward_ratio: bestStrategy.risk_reward_ratio,
      confidence: bestStrategy.confidence,
      reason: activeBuys.length
        ? `Buy Signal: ${bestStrategy.strategy_name}. ${bestStrategy.notes}`
        : "No high-probability setup detected."
    };

  return {
      symbol,
      timeframe: "Daily",
      market_condition: condition,
      current_price: price,
      previous_close: previousClose,
      data_timestamp: curr.date,
      technicals,
      strategies_evaluated: strategies,
      primary_recommendation: primary,
      disclaimer: "Algorithmic Analysis. Verify before trading. Not investment advice."
    };
  }

  // Helper to create a "REJECTION" result when safety checks fail
  private static createRejectionResult(symbol: string, curr: Candle, reason: string): AnalysisResult {
      return {
          symbol,
          timeframe: "Daily",
          market_condition: 'RANGE-BOUND',
          current_price: curr.close,
          previous_close: curr.close,
          data_timestamp: curr.date,
          technicals: {
              rsi: 0, adx: 0, macd: 'BEARISH', ema_20: 0, ema_50: 0, ema_200: 0,
              support: 0, resistance: 0, volume_status: 'AVERAGE', atr14: 0
          },
          strategies_evaluated: [],
          primary_recommendation: {
              strategy_name: "Safety Lock",
              signal: 'NO-TRADE',
              ideal_entry_range: [],
              stop_loss: 0,
              target_prices: [],
              risk_reward_ratio: 0,
              confidence: 0,
              reason: `⛔ BLOCKED: ${reason}`
          },
          disclaimer: "Safety Block Triggered."
      };
  }

  /* ==========================================================
   * 3.  POSITION SIZING (Risk Management)
   * ========================================================== */
  public static positionSize(accountEquity: number, riskPct: number, atr: number, atrMultiple = 2): number {
    const riskDollars = accountEquity * (riskPct / 100);
    const stopDistance = atr * atrMultiple;
    return Math.floor(riskDollars / stopDistance);
  }
}