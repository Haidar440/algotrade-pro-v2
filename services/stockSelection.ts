import { AngelOne } from './angel';
import { FNO_UNIVERSE } from './fnoUniverse'; 

interface StockCandidate {
  symbol: string;
  bias: 'BULLISH' | 'BEARISH';
  score: number;
  reason: string;
}

export class StockSelector {
  
  // ⚙️ RELAXED SETTINGS (For Debugging)
  private static MIN_TURNOVER = 10000000; // ₹1 Cr
  private static MIN_PRICE = 20;          
  private static ATR_MIN_PERCENT = 0.5;   
  private static ATR_MAX_PERCENT = 10.0;

  public static async scanUniverse(angel: AngelOne, onProgress?: (msg: string) => void): Promise<StockCandidate[]> {
    const candidates: StockCandidate[] = [];
    const universe = FNO_UNIVERSE; 
    
    // DEBUG COUNTERS
    let failData = 0;
    let failTrend = 0;
    let failLiq = 0;
    let failVol = 0;

    if (onProgress) onProgress(`🚀 Starting Scan on ${universe.length} Stocks...`);

    const BATCH_SIZE = 5;
    
    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);
      if (onProgress) onProgress(`Scanning ${i + 1}-${Math.min(i + BATCH_SIZE, universe.length)}...`);

      const results = await Promise.all(batch.map(async (rawSymbol) => {
         try {
             // 1. Fetch Data (200 Days)
             const data = await angel.getHistoricalData(rawSymbol, "ONE_DAY", 200);
             
             // ❌ DATA CHECK
             if (!data || data.length < 50) {
                 return { passed: false, symbol: rawSymbol, reason: "NO DATA (Check Login)" };
             }
             
             // 2. Run Filters
             return this.runFilters(rawSymbol, data);
         } catch (e) { 
             return { passed: false, symbol: rawSymbol, reason: "API CRASH" }; 
         }
      }));

      // PROCESS RESULTS
      results.forEach(res => {
         if (res.passed && res.candidate) {
            candidates.push(res.candidate);
            console.log(`✅ MATCH: ${res.candidate.symbol}`); 
         } else {
            // Count Failures
            const r = res.reason || "";
            if (r.includes("DATA") || r.includes("API")) failData++;
            else if (r.includes("Downtrend")) failTrend++;
            else if (r.includes("Liquidity") || r.includes("Penny")) failLiq++;
            else failVol++;

            // Log first 3 failures to Console (F12) so you can see them!
            if (i === 0) console.log(`❌ [DEBUG] Rejected ${res.symbol}: ${res.reason}`);
         }
      });

      await new Promise(r => setTimeout(r, 200)); 
    }

    // FINAL REPORT
    const statsMsg = `📊 REPORT: Data Errors: ${failData} | Downtrend: ${failTrend} | Liquidity: ${failLiq} | Volatility: ${failVol}`;
    if (onProgress) onProgress(statsMsg);
    console.log(statsMsg); // Force print to console

    return candidates.sort((a, b) => b.score - a.score);
  }

  private static runFilters(symbol: string, data: any[]): { passed: boolean, candidate?: StockCandidate, reason?: string, symbol?: string } {
    const curr = data[data.length - 1];
    const closes = data.map((c:any) => c.close);
    const volumes = data.map((c:any) => c.volume);
    const price = curr.close;

    // 1. Price & Liquidity
    if (price < this.MIN_PRICE) return { passed: false, symbol, reason: "Penny Stock" };
    const avgVol = this.avg(volumes.slice(-20));
    if ((avgVol * price) < this.MIN_TURNOVER) return { passed: false, symbol, reason: "Low Liquidity" };

    // 2. Trend (RELAXED)
    const sma200 = this.avg(closes.slice(-200));
    const ema50 = this.calculateEMA(closes, 50);

    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let score = 0;

    // Allow if Price > 200 SMA OR Price > 50 EMA
    if (price > sma200 || price > ema50) {
        bias = 'BULLISH';
        score = 50;
    } 
    
    if (bias === 'NEUTRAL') return { passed: false, symbol, reason: "Downtrend (Below 50 & 200)" };

    // 3. Volatility
    const atr = this.calculateATR(data, 14);
    const atrPct = (atr / price) * 100;
    
    if (atrPct < this.ATR_MIN_PERCENT) return { passed: false, symbol, reason: "Dead Stock (No Volatility)" }; 

    return { 
        passed: true, 
        candidate: { symbol, bias, score, reason: `Trend Found` } 
    };
  }

  private static avg(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  private static calculateEMA(data: number[], period: number): number {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return ema;
  }
  private static calculateATR(data: any[], period: number): number {
    let trSum = 0;
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const pc = data[i-1].close;
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        if (i > data.length - period - 1) trSum += tr;
    }
    return trSum / period;
  }
}