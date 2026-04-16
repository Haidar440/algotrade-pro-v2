import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BacktestResult, BrokerState } from '../types';
import { secureGet, securePost } from '../services/api';
import { getUserErrorMessage } from '../services/errorMessages';
import { PlayCircle, Activity, Loader2, AlertTriangle, Lock, Info, TrendingUp, TrendingDown, Wifi, WifiOff, Database, Zap, Bot, Clock, CheckCircle2 } from 'lucide-react';
import { saveOptimized, getOptimized, getParamLabel, markDeployed, OptimizedResult } from '../services/optimizedParamsStore';

/** Map frontend display names to backend registry keys */
const STRATEGY_MAP: Record<string, string> = {
  'Supertrend + RSI': 'supertrend_rsi',
  'VWAP ORB': 'vwap_orb',
  'EMA + ADX': 'ema_adx',
  'RSI + MACD': 'rsi_macd',
  'VCP Breakout': 'vcp_breakout',
  'Volume Breakout': 'volume_breakout',
  'Golden Cross': 'golden_cross',
  'Bollinger Squeeze': 'bollinger_squeeze',
  'Double Bottom': 'double_bottom',
};

/** Strategy metadata for UI display */
const STRATEGY_INFO: Record<string, { desc: string; type: string; winRate: string }> = {
  'Supertrend + RSI': { desc: 'Trend-following with RSI momentum filter', type: 'BOTH', winRate: '55-60%' },
  'VWAP ORB': { desc: 'Opening range breakout above VWAP', type: 'INTRADAY', winRate: '50-55%' },
  'EMA + ADX': { desc: 'EMA crossover confirmed by ADX trend strength', type: 'BOTH', winRate: '55-60%' },
  'RSI + MACD': { desc: 'RSI oversold bounce with MACD histogram reversal', type: 'BOTH', winRate: '52-58%' },
  'VCP Breakout': { desc: 'Volatility contraction pattern breakout', type: 'SWING', winRate: '58-65%' },
  'Volume Breakout': { desc: 'Range breakout confirmed by volume spike', type: 'BOTH', winRate: '52-58%' },
  'Golden Cross': { desc: 'Classic EMA(50)/SMA(200) institutional trend signal', type: 'SWING', winRate: '50-55%' },
  'Bollinger Squeeze': { desc: 'Low volatility squeeze → breakout above upper band', type: 'BOTH', winRate: '52-58%' },
  'Double Bottom': { desc: 'W-pattern reversal with neckline breakout', type: 'SWING', winRate: '55-62%' },
};

interface BacktestDashboardProps {
  brokerState?: BrokerState;
}

const BacktestDashboard: React.FC<BacktestDashboardProps> = ({ brokerState }) => {
  const [selectedStock, setSelectedStock] = useState('RELIANCE.NS');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('Supertrend + RSI');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendStrategies, setBackendStrategies] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState<'auto' | 'angel_one' | 'yfinance'>('auto');
  const [backendBrokerConnected, setBackendBrokerConnected] = useState(false);
  const [backendBrokerName, setBackendBrokerName] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState('RELIANCE.NS');
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [stockSuggestions, setStockSuggestions] = useState<any[]>([]);
  const stockInputRef = useRef<HTMLDivElement>(null);
  const selectedStockRef = useRef(selectedStock);

  useEffect(() => {
    selectedStockRef.current = selectedStock;
  }, [selectedStock]);

  // Debounced backend symbol search
  useEffect(() => {
    if (!stockSearch || stockSearch === selectedStockRef.current) {
      setStockSuggestions([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await secureGet(`/watchlists/search?q=${encodeURIComponent(stockSearch)}&limit=8`);
        if (res.data) {
          setStockSuggestions(res.data);
        }
      } catch (err) {
        console.error('Stock search failed', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [stockSearch]);

  // Optimization State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState(0);
  const [optStage, setOptStage] = useState('');
  const [optResult, setOptResult] = useState<{ message: string, bestParams: Record<string, any> } | null>(null);
  const [savedOptimized, setSavedOptimized] = useState<OptimizedResult | null>(null);
  const [deployedToBot, setDeployedToBot] = useState(false);

  // Ref to hold polling interval ID — survives re-renders, accessible from useEffect cleanup
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup: clear any active polling interval when component unmounts
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // Check localStorage for previously optimized params when stock/strategy changes
  useEffect(() => {
    const backendKey = STRATEGY_MAP[selectedStrategy] || selectedStrategy;
    const cleanSym = selectedStock.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
    const saved = getOptimized(cleanSym, backendKey);
    setSavedOptimized(saved);
    setDeployedToBot(false);
  }, [selectedStock, selectedStrategy]);

  // Auto-save optimization results to localStorage when they arrive
  useEffect(() => {
    if (optResult && optResult.bestParams && Object.keys(optResult.bestParams).length > 0) {
      const backendKey = STRATEGY_MAP[selectedStrategy] || selectedStrategy;
      const cleanSym = selectedStock.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
      // Extract return % from the message string
      const retMatch = optResult.message?.match(/Return\s+([\d.]+)%/);
      const returnPct = retMatch ? parseFloat(retMatch[1]) : 0;
      const entry: OptimizedResult = {
        symbol: cleanSym,
        strategy: backendKey,
        strategyDisplay: selectedStrategy,
        params: optResult.bestParams,
        returnPct,
        optimizedAt: new Date().toISOString(),
      };
      saveOptimized(entry);
      setSavedOptimized(entry);
    }
  }, [optResult]);

  // Check both: localStorage brokerState AND backend broker status
  const isAngelConnected = backendBrokerConnected || !!(brokerState?.angel?.jwtToken);

  // Fetch available strategies + broker status from backend on mount
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const data: any = await secureGet('/backtest/strategies');
        if (Array.isArray(data)) {
          setBackendStrategies(data);
          // If backend returns strategies not in our STRATEGY_MAP, add them dynamically
          data.forEach((s: any) => {
            const existing = Object.entries(STRATEGY_MAP).find(([, v]) => v === s.name);
            if (!existing && s.name) {
              // Auto-generate display name from backend key
              const displayName = s.description?.split(':')[0]?.trim()
                || s.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              STRATEGY_MAP[displayName] = s.name;
            }
          });
        }
      } catch (e) { console.warn("Could not load strategies from backend"); }
    };
    const checkBrokerStatus = async () => {
      try {
        const data: any = await secureGet('/broker/status');
        setBackendBrokerConnected(!!data?.connected);
        setBackendBrokerName(data?.broker || null);
      } catch (e) { console.warn("Could not check broker status"); }
    };
    loadStrategies();
    checkBrokerStatus();
  }, [brokerState]);

  const handleRunBacktest = async (customParams?: Record<string, any>) => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    if (!customParams) setOptResult(null);
    try {
      // Use backend API with selected data source
      const backendStrategyName = STRATEGY_MAP[selectedStrategy] || selectedStrategy;
      // Strip .NS suffix — backend handles it internally
      const cleanSymbol = selectedStock.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
      const payload: any = {
        strategy_name: backendStrategyName,
        symbol: cleanSymbol,
        cash: 100000,
        commission: 0.002,
        days: 365,
        data_source: dataSource === 'auto' ? null : dataSource,
      };

      if (customParams) {
        payload.params = customParams;
      }

      const res: any = await securePost('/backtest/run', payload);

      if (!res?.success && res?.error) {
        setError(res.error);
        return;
      }

      // Map backend response to frontend BacktestResult type
      const stats = res.stats || {};
      const mappedResult: BacktestResult = {
        symbol: selectedStock,
        strategy: selectedStrategy,
        trades: (res.trades || []).map((t: any, i: number) => ({
          id: `tr_${i}`,
          type: 'BUY',
          entryDate: t.entry_date || '',
          exitDate: t.exit_date || '',
          entryPrice: t.entry_price || 0,
          exitPrice: t.exit_price || 0,
          quantity: t.size || 1,
          pnl: t.pnl || 0,
          roi: t.return_pct || 0,
          holdingPeriod: t.duration || 1,
        })),
        equityCurve: (res.equity_curve || []).map((p: any) => ({
          date: p.date || '',
          equity: p.equity || 100000,
        })),
        metrics: {
          totalTrades: stats.total_trades || 0,
          winRate: stats.win_rate_pct || 0,
          profitFactor: stats.profit_factor || 0,
          netProfit: stats.return_pct ? (stats.return_pct / 100) * 100000 : 0,
          maxDrawdown: stats.max_drawdown_pct || 0,
          avgWin: stats.avg_trade_pct || 0,
          avgLoss: stats.avg_trade_pct || 0,
          expectancy: stats.expectancy || 0,
        },
      };

      setResult(mappedResult);
    } catch (err: unknown) {
      setError(getUserErrorMessage(err, 'backtest'));
    } finally {
      setIsRunning(false);
    }
  };

  const handleOptimizeStrategy = async () => {
    setIsOptimizing(true);
    setOptProgress(0);
    setOptStage('Initiating background sequence...');
    setError(null);
    setResult(null);
    setOptResult(null);
    try {
      const backendStrategyName = STRATEGY_MAP[selectedStrategy] || selectedStrategy;
      const cleanSymbol = selectedStock.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
      const res: any = await securePost('/backtest/optimize', {
        strategy_name: backendStrategyName,
        symbol: cleanSymbol,
        cash: 100000,
        commission: 0.002,
        days: 365,
        maximize: 'Return [%]'
      });

      if (!res?.task_id) {
        setError(res?.message || "Failed to start optimization.");
        setIsOptimizing(false);
        return;
      }

      const taskId = res.task_id;

      // Clear any previous polling interval (prevents stacking)
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      const poll = setInterval(async () => {
        try {
          const statusRes: any = await secureGet(`/backtest/optimize/status/${taskId}`);

          if (statusRes.status === 'completed') {
            clearInterval(poll);
            pollRef.current = null;
            setIsOptimizing(false);
            setOptStage('');
            setOptResult({
              message: statusRes.message,
              bestParams: statusRes.result?.best_params || {},
            });
          } else if (statusRes.status === 'failed' || statusRes.status === 'not_found') {
            clearInterval(poll);
            pollRef.current = null;
            setIsOptimizing(false);
            setOptStage('');
            setError(statusRes.message || "Optimization failed or disappeared.");
          } else {
            setOptProgress(statusRes.progress || 0);
            setOptStage(statusRes.stage || 'Running optimization...');
          }
        } catch (pollErr) {
          // don't stop polling on single network error, wait for next tick
          console.warn("Polling error", pollErr);
        }
      }, 2000);

      // Store in ref so useEffect cleanup can kill it on unmount
      pollRef.current = poll;

    } catch (err: unknown) {
      setError(getUserErrorMessage(err, 'backtest'));
      setIsOptimizing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header & Controls */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-700 bg-slate-800/40">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Activity className="text-purple-400" /> Strategy Backtester
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Simulate strategies on Real Market Data
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
            {/* Searchable Stock Input */}
            <div className="relative" ref={stockInputRef}>
              <input
                type="text"
                value={stockSearch}
                onChange={(e) => {
                  setStockSearch(e.target.value);
                  setShowStockDropdown(true);
                }}
                onFocus={() => {
                  setStockSearch('');
                  setShowStockDropdown(true);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setShowStockDropdown(false);
                    setStockSearch(selectedStockRef.current);
                  }, 200);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const query = stockSearch.toUpperCase().trim();
                    if (query) {
                      const match = stockSuggestions.find(s => s.symbol.replace('.NS', '').toUpperCase() === query || s.symbol.toUpperCase() === query);
                      const finalSymbol = match ? match.symbol : (query.endsWith('.NS') ? query : query + '.NS');
                      setSelectedStock(finalSymbol);
                      setStockSearch(finalSymbol);
                      setShowStockDropdown(false);
                      e.currentTarget.blur();
                    }
                  }
                }}
                placeholder="Search stock..."
                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 outline-none min-w-[200px] w-[200px]"
              />
              {showStockDropdown && stockSearch.length > 0 && stockSearch !== selectedStockRef.current && (() => {
                if (isSearching) return (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-3 text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                  </div>
                );
                if (stockSuggestions.length === 0) return (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-3 text-xs text-slate-400">
                    No exact matches. Press Enter to force use '{stockSearch}'
                  </div>
                );
                return (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-[280px] overflow-y-auto">
                    {stockSuggestions.map(s => (
                      <button
                        key={s.symbol}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors flex items-center justify-between gap-2 border-b border-slate-800/50 last:border-0"
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevents input from blurring before this fires
                          setSelectedStock(s.symbol);
                          setStockSearch(s.symbol);
                          setShowStockDropdown(false);
                        }}
                      >
                        <span className="text-white text-sm font-mono font-bold">{s.symbol.replace('.NS', '')}</span>
                        <span className="text-slate-500 text-xs truncate">{s.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 outline-none min-w-[180px]"
              title={STRATEGY_INFO[selectedStrategy]?.desc || ''}
            >
              {Object.keys(STRATEGY_MAP).map(s => (
                <option key={s} value={s}>
                  {s} ({STRATEGY_INFO[s]?.winRate || 'N/A'})
                </option>
              ))}
            </select>

            {/* Data Source Toggle */}
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as 'auto' | 'angel_one' | 'yfinance')}
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 outline-none"
            >
              <option value="auto">📡 Auto (Best Available)</option>
              <option value="angel_one">🔴 Angel One (Live Data)</option>
              <option value="yfinance">🟢 Yahoo Finance (Free)</option>
            </select>

            <button
              onClick={() => handleRunBacktest()}
              disabled={isRunning}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              Run Test
            </button>

            <button
              onClick={handleOptimizeStrategy}
              disabled={isRunning || isOptimizing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Optimize
            </button>
          </div>
        </div>

        {/* Data Source Status Bar */}
        <div className="mt-4 flex items-center gap-3 text-xs">
          {isAngelConnected ? (
            <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <Wifi className="w-3 h-3" /> Angel One Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <WifiOff className="w-3 h-3" /> Angel One Not Connected
            </span>
          )}
          <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">
            <Database className="w-3 h-3" /> Yahoo Finance Available
          </span>
          {dataSource === 'angel_one' && !isAngelConnected && (
            <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
              <AlertTriangle className="w-3 h-3" /> Connect Angel One in Settings to use live data
            </span>
          )}
        </div>

        {/* Strategy Info Bar */}
        {STRATEGY_INFO[selectedStrategy] && (
          <div className="mt-3 flex items-center gap-3 text-xs bg-slate-900/60 rounded-lg px-4 py-2.5 border border-slate-700/50">
            <Info className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span className="text-slate-300">{STRATEGY_INFO[selectedStrategy].desc}</span>
            <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${STRATEGY_INFO[selectedStrategy].type === 'INTRADAY'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
              : STRATEGY_INFO[selectedStrategy].type === 'SWING'
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                : 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
              }`}>
              {STRATEGY_INFO[selectedStrategy].type}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-200">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Previously Optimized Banner (shows when returning to a stock/strategy that was optimized before) */}
      {!optResult && savedOptimized && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-amber-200 text-sm font-semibold">Previously Optimized</p>
              <p className="text-amber-300/60 text-xs">
                {savedOptimized.strategyDisplay} on {savedOptimized.symbol} — {savedOptimized.returnPct.toFixed(1)}% return
                <span className="ml-2 text-slate-500">
                  {new Date(savedOptimized.optimizedAt).toLocaleDateString()}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={() => handleRunBacktest(savedOptimized.params)}
            disabled={isRunning}
            className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Use Saved Params
          </button>
        </div>
      )}

      {/* Optimization Result Card — Premium styled parameter grid */}
      {optResult && (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-slate-800/60 to-slate-900/80 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Optimization Complete</h3>
                <p className="text-emerald-300/70 text-xs mt-0.5">
                  {selectedStrategy} on {selectedStock}
                </p>
              </div>
            </div>
            {/* Return badge */}
            {(() => {
              const retMatch = optResult.message?.match(/Return\s+([\d.-]+)%/);
              const retPct = retMatch ? parseFloat(retMatch[1]) : null;
              if (retPct === null) return null;
              return (
                <div className={`px-4 py-2 rounded-lg font-bold text-lg font-mono ${retPct >= 0
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                  {retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}%
                </div>
              );
            })()}
          </div>

          {/* Parameter Grid */}
          <div className="px-6 py-5">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Best Parameters Found</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Object.entries(optResult.bestParams).map(([key, value]) => (
                <div
                  key={key}
                  className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-3 text-center hover:border-emerald-500/30 transition-colors"
                >
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wide mb-1">
                    {getParamLabel(key)}
                  </div>
                  <div className="text-xl font-mono font-bold text-white">
                    {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-900/40 flex flex-wrap gap-3">
            <button
              onClick={() => handleRunBacktest(optResult.bestParams)}
              disabled={isRunning}
              className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold text-sm transition-all disabled:opacity-50 shadow-lg shadow-purple-900/20"
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              Apply & Backtest
            </button>
            <button
              onClick={() => {
                const backendKey = STRATEGY_MAP[selectedStrategy] || selectedStrategy;
                const cleanSym = selectedStock.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
                markDeployed(cleanSym, backendKey);
                setDeployedToBot(true);
              }}
              disabled={deployedToBot}
              className={`px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold text-sm transition-all shadow-lg ${deployedToBot
                ? 'bg-emerald-800/50 text-emerald-400 border border-emerald-500/30 cursor-default'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                }`}
            >
              {deployedToBot ? <CheckCircle2 className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              {deployedToBot ? 'Deployed to Auto-Bot ✓' : 'Deploy to Auto-Bot'}
            </button>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500 ml-auto">
              <Zap className="w-3 h-3" /> Auto-saved to library
            </span>
          </div>
        </div>
      )}

      {(isRunning || isOptimizing) && (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <div className="animate-pulse">
            {isRunning
              ? `Running ${selectedStrategy} simulation on ${selectedStock}...`
              : `Optimizing ${selectedStrategy} on ${selectedStock} `
            }
          </div>

          {isOptimizing && (
            <div className="w-full max-w-md mx-auto space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-500">
                <span>{optStage || 'Working...'}</span>
                <span>{optProgress}%</span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                  style={{ width: `${optProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
              <div className="text-xs text-slate-400 uppercase font-bold mb-1">Net Profit</div>
              <div className={`text-2xl font-mono font-bold ${result.metrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.metrics.netProfit >= 0 ? '+' : ''}₹{result.metrics.netProfit.toLocaleString()}
              </div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
              <div className="text-xs text-slate-400 uppercase font-bold mb-1">Win Rate</div>
              <div className="text-2xl font-mono font-bold text-amber-400">
                {result.metrics.winRate.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500">{result.metrics.totalTrades} Trades Executed</div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
              <div className="text-xs text-slate-400 uppercase font-bold mb-1">Profit Factor</div>
              <div className="text-2xl font-mono font-bold text-blue-400">
                {result.metrics.profitFactor.toFixed(2)}
              </div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
              <div className="text-xs text-slate-400 uppercase font-bold mb-1">Max Drawdown</div>
              <div className="text-2xl font-mono font-bold text-rose-400">
                -{result.metrics.maxDrawdown.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Equity Curve Chart & Guide */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-panel p-6 rounded-xl border border-slate-700 bg-slate-800/30">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  Equity Curve (Account Growth)
                </h3>
                <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">Start: ₹1,00,000</span>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.equityCurve}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      stroke="#64748b"
                      fontSize={10}
                      tickFormatter={(str) => str.slice(5)}
                      minTickGap={30}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      domain={['auto', 'auto']}
                      tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                      itemStyle={{ color: '#a855f7', fontWeight: 'bold' }}
                      formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Account Value']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    {/* Breakeven Line */}
                    <ReferenceLine y={100000} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'insideBottomRight', value: 'Initial Capital', fill: '#64748b', fontSize: 10 }} />

                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="#a855f7"
                      fillOpacity={1}
                      fill="url(#colorEquity)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* How to Read This Chart */}
            <div className="glass-panel p-5 rounded-xl border border-slate-700 bg-slate-800/20">
              <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" /> How to read this?
              </h4>
              <ul className="space-y-4 text-xs text-slate-400">
                <li className="flex gap-3">
                  <div className="mt-0.5 p-1 bg-purple-500/20 rounded">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <strong className="text-slate-200 block mb-0.5">Rising Line</strong>
                    Strategy is profitable. Your account balance is growing.
                  </div>
                </li>
                <li className="flex gap-3">
                  <div className="mt-0.5 p-1 bg-rose-500/20 rounded">
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                  </div>
                  <div>
                    <strong className="text-slate-200 block mb-0.5">Falling Line (Drawdown)</strong>
                    Strategy is losing money. Deep drops indicate high risk.
                  </div>
                </li>
                <li className="flex gap-3">
                  <div className="mt-0.5 p-1 bg-slate-700/50 rounded">
                    <div className="w-4 h-0.5 bg-slate-400 mt-2"></div>
                  </div>
                  <div>
                    <strong className="text-slate-200 block mb-0.5">Flat Line</strong>
                    No trades active. The strategy is waiting for a setup.
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Trade Table */}
          <div className="glass-panel rounded-xl overflow-hidden border border-slate-700 bg-slate-800/30">
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
              <h3 className="font-bold text-white">Trade History</h3>
            </div>
            <div className="overflow-x-auto max-h-[300px]">
              {result.trades.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No trades generated. Strategy conditions were not met in this period.</div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 sticky top-0 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3">Entry Date</th>
                      <th className="px-4 py-3">Exit Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Entry</th>
                      <th className="px-4 py-3 text-right">Exit</th>
                      <th className="px-4 py-3 text-right">ROI</th>
                      <th className="px-4 py-3 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {result.trades.map((trade) => (
                      <tr key={trade.id} className="hover:bg-slate-700/20">
                        <td className="px-4 py-3 text-slate-400">{trade.entryDate}</td>
                        <td className="px-4 py-3 text-slate-400">{trade.exitDate}</td>
                        <td className="px-4 py-3">
                          <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold border border-emerald-500/20">
                            {trade.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">₹{trade.entryPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">₹{trade.exitPrice.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${trade.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trade.roi.toFixed(2)}%
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BacktestDashboard;