import React, { useState } from 'react';
import { fetchAIStockPicks, StockPicksResult, StockPick } from '../services/gemini';
import { getUserErrorMessage } from '../services/errorMessages';
import {
  Target, TrendingUp, TrendingDown, AlertTriangle, Zap,
  RefreshCw, DollarSign, Shield, Star, ChevronDown, ChevronUp,
  Bot, CheckCircle2
} from 'lucide-react';
import { getOptimizedSymbols, markDeployed, getOptimized, getAllOptimized } from '../services/optimizedParamsStore';

/**
 * AiPicksDashboard — AI-powered stock picker using 10-layer scoring.
 * Calls GET /api/ai/picks?capital=X
 * Scans 15 stocks, returns top picks with entry/SL/target.
 */
const AiPicksDashboard: React.FC = () => {
  const [result, setResult] = useState<StockPicksResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capital, setCapital] = useState<number>(100000);
  const [expandedPick, setExpandedPick] = useState<string | null>(null);
  const [deployedSet, setDeployedSet] = useState<Set<string>>(new Set());

  // Check if a symbol has optimized params
  const isOptimized = (symbol: string): boolean => {
    const clean = symbol.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
    return getOptimizedSymbols().includes(clean);
  };

  // Get the best optimized result for a symbol
  const getOptInfo = (symbol: string) => {
    const clean = symbol.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
    const all = getAllOptimized().filter(r => r.symbol === clean);
    if (all.length === 0) return null;
    return all.sort((a, b) => b.returnPct - a.returnPct)[0];
  };

  // Deploy optimized params to Auto-Bot
  const handleDeploy = (symbol: string) => {
    const clean = symbol.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
    const opt = getOptInfo(symbol);
    if (opt) {
      markDeployed(clean, opt.strategy);
      setDeployedSet(prev => new Set(prev).add(clean));
    }
  };

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAIStockPicks(capital);
      setResult(data);
    } catch (err: unknown) {
      setError(getUserErrorMessage(err, 'ai-picks'));
    } finally {
      setLoading(false);
    }
  };

  const getRatingStyle = (rating: string) => {
    if (rating === 'GOLDEN') return { color: 'var(--accent-amber)', bg: 'var(--ring-green)' };
    if (rating === 'STRONG') return { color: 'var(--accent-green)', bg: 'var(--ring-green)' };
    if (rating === 'MODERATE') return { color: 'var(--accent-cyan)', bg: 'var(--ring-blue)' };
    return { color: 'var(--text-muted)', bg: 'var(--bg-inset)' };
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'var(--accent-green)';
    if (score >= 50) return 'var(--accent-amber)';
    return 'var(--accent-red)';
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 70) return 'var(--ring-green)';
    if (score >= 50) return 'rgba(217, 119, 6, 0.2)';
    return 'var(--ring-red)';
  };

  const formatINR = (n: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-5xl mx-auto space-y-3 md:space-y-5">

      {/* ━━━ HEADER CARD ━━━ */}
      <div className="rounded-xl p-4 md:p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg shrink-0" style={{ background: 'var(--ring-blue)' }}>
            <Target className="w-5 h-5 md:w-5 md:h-5" style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm md:text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>AI Stock Picker</h2>
            <p className="text-[10px] md:text-xs truncate" style={{ color: 'var(--text-muted)' }}>10-layer scoring · Technicals + Fundamentals + News Sentiment</p>
          </div>
        </div>

        {/* Capital + Scan */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] uppercase font-medium tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>Investment Capital (₹)</label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono tabular-nums outline-none transition-all"
              style={{
                background: 'var(--bg-inset)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              min={10000}
              step={10000}
            />
          </div>
          <button
            onClick={handleScan}
            disabled={loading}
            className="px-5 py-2.5 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all shrink-0 disabled:opacity-40"
            style={{ background: loading ? 'var(--text-muted)' : 'var(--accent-blue)' }}
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? 'Scanning…' : 'Scan Market'}
          </button>
        </div>
      </div>

      {/* ━━━ ERROR ━━━ */}
      {error && (
        <div className="rounded-lg p-3 md:p-4 flex items-center gap-3" style={{ background: 'var(--ring-red)', border: '1px solid var(--accent-red)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-red)' }} />
          <p className="text-xs md:text-sm" style={{ color: 'var(--accent-red)' }}>{error}</p>
        </div>
      )}

      {/* ━━━ RESULTS SUMMARY — 3-stat bar ━━━ */}
      {result && (
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {[
            { label: 'Scanned', value: result.total_scanned.toString(), color: 'var(--text)' },
            { label: 'Picks', value: result.picks_found.toString(), color: 'var(--accent-green)' },
            { label: 'Capital', value: `₹${(result.capital / 1000).toFixed(0)}K`, color: 'var(--accent-cyan)' },
          ].map(s => (
            <div key={s.label} className="rounded-lg p-3 md:p-4 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-[9px] md:text-[10px] uppercase font-medium tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              <p className="text-lg md:text-2xl font-mono font-semibold tabular-nums mt-0.5" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ━━━ STOCK PICK CARDS ━━━ */}
      {result && result.top_picks.length > 0 && (
        <div className="space-y-2 md:space-y-2.5">
          <h3 className="text-[10px] md:text-xs font-medium uppercase tracking-wider flex items-center gap-2 px-1" style={{ color: 'var(--text-muted)' }}>
            <Star className="w-3.5 h-3.5" style={{ color: 'var(--accent-amber)' }} /> Top Picks
          </h3>
          {result.top_picks.map((pick: StockPick) => {
            const isExpanded = expandedPick === pick.symbol;
            const upside = ((pick.target - pick.price) / pick.price * 100).toFixed(1);
            const downside = ((pick.price - pick.stop_loss) / pick.price * 100).toFixed(1);
            const ratingStyle = getRatingStyle(pick.rating);
            return (
              <div
                key={pick.symbol}
                className="rounded-xl overflow-hidden transition-all"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                {/* ── Main Row ── */}
                <div
                  className="p-3 md:p-4 flex items-center justify-between cursor-pointer transition-colors"
                  onClick={() => setExpandedPick(isExpanded ? null : pick.symbol)}
                  style={{ borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    {/* Score Circle */}
                    <div
                      className="w-10 h-10 md:w-11 md:h-11 rounded-full flex flex-col items-center justify-center shrink-0"
                      style={{ background: 'var(--bg-inset)', border: `2px solid ${getScoreRingColor(pick.score)}` }}
                    >
                      <p className="text-sm md:text-base font-semibold tabular-nums" style={{ color: getScoreColor(pick.score) }}>{pick.score}</p>
                      <p className="text-[7px] md:text-[8px] font-medium -mt-0.5" style={{ color: 'var(--text-muted)' }}>SCORE</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm md:text-sm font-semibold tracking-tight flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                        {pick.symbol}
                        {isOptimized(pick.symbol) && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5" /> Optimized
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] md:text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>₹{pick.price.toFixed(2)} · {pick.entry_range}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 shrink-0">
                    <span
                      className="px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-semibold tracking-wider uppercase"
                      style={{ color: ratingStyle.color, background: ratingStyle.bg }}
                    >
                      {pick.rating}
                    </span>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    }
                  </div>
                </div>

                {/* ── Expanded Details ── */}
                {isExpanded && (
                  <div className="px-3 md:px-4 pb-3 md:pb-4 pt-3 space-y-3">
                    {/* Key Levels Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { label: 'Stop Loss', value: `₹${pick.stop_loss.toFixed(2)}`, sub: `-${downside}%`, color: 'var(--accent-red)', subColor: 'var(--accent-red)' },
                        { label: 'Target', value: `₹${pick.target.toFixed(2)}`, sub: `+${upside}%`, color: 'var(--accent-green)', subColor: 'var(--accent-green)' },
                        { label: 'Risk:Reward', value: pick.risk_reward, sub: null, color: 'var(--accent-cyan)', subColor: null },
                        { label: 'Qty', value: String(pick.shares), sub: `₹${formatINR(pick.investment)}`, color: 'var(--text)', subColor: 'var(--text-muted)' },
                      ].map(item => (
                        <div key={item.label} className="rounded-lg p-2.5 md:p-3 text-center" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)' }}>
                          <p className="text-[8px] md:text-[9px] uppercase font-medium tracking-wider" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                          <p className="text-xs md:text-sm font-mono font-semibold tabular-nums mt-0.5" style={{ color: item.color }}>{item.value}</p>
                          {item.sub && <p className="text-[8px] md:text-[9px] tabular-nums" style={{ color: item.subColor || 'var(--text-muted)', opacity: 0.7 }}>{item.sub}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Risk Badge */}
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3" style={{ color: 'var(--accent-amber)', opacity: 0.7 }} />
                      <span className="text-[10px] md:text-xs" style={{ color: 'var(--text-muted)' }}>Max Risk:</span>
                      <span className="text-[10px] md:text-xs font-semibold font-mono tabular-nums" style={{ color: 'var(--accent-red)' }}>₹{formatINR(pick.risk_amount)}</span>
                    </div>

                    {/* Reasons */}
                    <div className="space-y-1">
                      <p className="text-[9px] md:text-[10px] uppercase font-medium tracking-wider" style={{ color: 'var(--text-muted)' }}>Analysis Reasons</p>
                      {pick.reasons.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] md:text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          <span className="mt-px shrink-0" style={{ color: 'var(--accent-cyan)', opacity: 0.6 }}>•</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>

                    {/* Optimized Params Deploy */}
                    {isOptimized(pick.symbol) && (() => {
                      const opt = getOptInfo(pick.symbol);
                      const clean = pick.symbol.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
                      const alreadyDeployed = deployedSet.has(clean);
                      if (!opt) return null;
                      return (
                        <div className="flex items-center justify-between rounded-lg p-2.5" style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                          <div className="flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent-amber)' }} />
                            <div>
                              <p className="text-[10px] font-semibold" style={{ color: 'var(--accent-amber)' }}>Optimized: {opt.strategyDisplay}</p>
                              <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>+{opt.returnPct.toFixed(1)}% backtested return</p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeploy(pick.symbol); }}
                            disabled={alreadyDeployed}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all ${alreadyDeployed
                                ? 'bg-emerald-800/50 text-emerald-400 border border-emerald-500/30 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                              }`}
                          >
                            {alreadyDeployed ? <CheckCircle2 className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                            {alreadyDeployed ? 'Deployed ✓' : 'Deploy'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ━━━ No Picks ━━━ */}
      {result && result.top_picks.length === 0 && (
        <div className="rounded-xl p-8 md:p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--accent-amber)', opacity: 0.6 }} />
          <p className="font-semibold text-sm md:text-base" style={{ color: 'var(--text)' }}>No Strong Picks Found</p>
          <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>Market conditions don't favor any stock right now. Try again later.</p>
        </div>
      )}

      {/* ━━━ Initial State ━━━ */}
      {!result && !loading && !error && (
        <div className="rounded-xl p-8 md:p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Target className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--accent-cyan)', opacity: 0.3 }} />
          <p className="font-semibold text-sm md:text-base" style={{ color: 'var(--text)' }}>Smart Stock Scanner</p>
          <p className="text-[11px] md:text-xs mt-2 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Dynamically discovers NSE swing candidates via TradingView screener (EMA alignment,
            volume surge, RSI filter), then deep-scores using technicals, yfinance fundamentals
            (PE, debt, market cap), Nifty relative strength, and Gemini AI news sentiment.
            Composite score out of 100. Enter your capital and hit Scan.
          </p>
        </div>
      )}
    </div>
  );
};

export default AiPicksDashboard;
