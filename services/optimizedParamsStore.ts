/**
 * Optimized Parameters Store
 * 
 * Persists optimization results to localStorage keyed by symbol + strategy.
 * Used across BacktestDashboard, AutoTraderDashboard, and AI Picks
 * so optimized params flow through the entire pipeline.
 */

export interface OptimizedResult {
    symbol: string;
    strategy: string;          // Backend key e.g. "supertrend_rsi"
    strategyDisplay: string;   // Frontend label e.g. "Supertrend + RSI"
    params: Record<string, number>;
    returnPct: number;
    optimizedAt: string;       // ISO timestamp
    deployedToBot?: boolean;   // Whether user has deployed to Auto-Bot
}

const STORAGE_KEY = 'algotrade_optimized_params';

/** Get all saved optimized results */
export function getAllOptimized(): OptimizedResult[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/** Get optimized result for a specific symbol + strategy */
export function getOptimized(symbol: string, strategy: string): OptimizedResult | null {
    const all = getAllOptimized();
    const clean = symbol.replace('.NS', '').replace(/-EQ$/, '').toUpperCase();
    return all.find(
        r => r.symbol.toUpperCase() === clean && r.strategy === strategy
    ) || null;
}

/** Save an optimized result (overwrites if same symbol+strategy exists) */
export function saveOptimized(result: OptimizedResult): void {
    const all = getAllOptimized();
    const idx = all.findIndex(
        r => r.symbol === result.symbol && r.strategy === result.strategy
    );
    if (idx >= 0) {
        all[idx] = result;
    } else {
        all.push(result);
    }
    // Keep max 50 entries to avoid localStorage bloat
    const trimmed = all.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** Remove an optimized result */
export function removeOptimized(symbol: string, strategy: string): void {
    const all = getAllOptimized();
    const filtered = all.filter(
        r => !(r.symbol === symbol && r.strategy === strategy)
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/** Get all optimized symbols (for Auto-Bot badge display) */
export function getOptimizedSymbols(): string[] {
    return [...new Set(getAllOptimized().map(r => r.symbol))];
}

/** Mark a result as deployed to Auto-Bot */
export function markDeployed(symbol: string, strategy: string): void {
    const all = getAllOptimized();
    const entry = all.find(r => r.symbol === symbol && r.strategy === strategy);
    if (entry) {
        entry.deployedToBot = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
}

/** Unmark a result from Auto-Bot deployment */
export function unmarkDeployed(symbol: string, strategy: string): void {
    const all = getAllOptimized();
    const entry = all.find(r => r.symbol === symbol && r.strategy === strategy);
    if (entry) {
        entry.deployedToBot = false;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
}

/** Get all results deployed to Auto-Bot */
export function getDeployedResults(): OptimizedResult[] {
    return getAllOptimized().filter(r => r.deployedToBot === true);
}

/** Human-readable param labels */
export const PARAM_LABELS: Record<string, string> = {
    atr_period: 'ATR Period',
    atr_multiplier: 'ATR Multiplier',
    rsi_period: 'RSI Period',
    rsi_threshold: 'RSI Threshold',
    rsi_oversold: 'RSI Oversold',
    rsi_target: 'RSI Target',
    rsi_min: 'RSI Minimum',
    ema_period: 'EMA Period',
    ema_trend: 'EMA Trend',
    ema_fast: 'Fast EMA',
    ema_slow: 'Slow EMA',
    sma_slow: 'Slow SMA',
    adx_threshold: 'ADX Threshold',
    macd_fast: 'MACD Fast',
    macd_slow: 'MACD Slow',
    macd_signal: 'MACD Signal',
    vwap_deviation: 'VWAP Dev',
    range_lookback: 'Range Lookback',
    volume_filter: 'Volume Filter',
    sl_pct: 'Stop Loss %',
    target_pct: 'Target %',
    lookback: 'Lookback',
    breakout_pct: 'Breakout %',
    // Golden Cross
    // ema_fast already covered above
    // sma_slow already covered above
    // Bollinger Squeeze
    bb_period: 'BB Period',
    bb_std: 'BB Std Dev',
    squeeze_threshold: 'Squeeze Threshold',
    // Double Bottom
    tolerance_pct: 'Tolerance %',
};

/** Get human-readable label for a param key */
export function getParamLabel(key: string): string {
    return PARAM_LABELS[key] || key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
