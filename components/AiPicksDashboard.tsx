import React, { useState } from 'react';
import { fetchAIStockPicks, StockPicksResult, StockPick } from '../services/gemini';
import {
  Target, TrendingUp, TrendingDown, AlertTriangle, Zap,
  RefreshCw, DollarSign, Shield, Star, ChevronDown, ChevronUp
} from 'lucide-react';

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

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAIStockPicks(capital);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch AI picks');
    } finally {
      setLoading(false);
    }
  };

  const getRatingStyle = (rating: string) => {
    if (rating === 'GOLDEN') return 'text-amber-400 bg-amber-500/10';
    if (rating === 'STRONG') return 'text-emerald-400 bg-emerald-500/10';
    if (rating === 'MODERATE') return 'text-cyan-400 bg-cyan-500/10';
    return 'text-slate-400 bg-slate-500/10';
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getScoreRing = (score: number) => {
    if (score >= 70) return 'ring-emerald-500/30';
    if (score >= 50) return 'ring-amber-500/30';
    return 'ring-rose-500/30';
  };

  const formatINR = (n: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">

      {/* ━━━ HEADER CARD ━━━ */}
      <div className="bg-[#0c1120] rounded-2xl border border-white/[0.04] p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-cyan-500/10 shrink-0">
            <Target className="w-5 h-5 md:w-6 md:h-6 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold text-white tracking-tight">AI Stock Picker</h2>
            <p className="text-[10px] md:text-xs text-slate-500 truncate">10-layer scoring · Technicals + Fundamentals + News Sentiment</p>
          </div>
        </div>

        {/* Capital + Scan */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider block mb-1.5">Investment Capital (₹)</label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm md:text-base text-white font-mono tabular-nums focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 outline-none transition-all"
              min={10000}
              step={10000}
            />
          </div>
          <button
            onClick={handleScan}
            disabled={loading}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shrink-0"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? 'Scanning...' : 'Scan Market'}
          </button>
        </div>
      </div>

      {/* ━━━ ERROR ━━━ */}
      {error && (
        <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 md:p-4 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <p className="text-rose-300 text-xs md:text-sm">{error}</p>
        </div>
      )}

      {/* ━━━ RESULTS SUMMARY — 3-stat bar ━━━ */}
      {result && (
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          {[
            { label: 'Scanned', value: result.total_scanned.toString(), color: 'text-white' },
            { label: 'Picks', value: result.picks_found.toString(), color: 'text-emerald-400' },
            { label: 'Capital', value: `₹${(result.capital / 1000).toFixed(0)}K`, color: 'text-cyan-400' },
          ].map(s => (
            <div key={s.label} className="bg-[#0c1120] rounded-xl border border-white/[0.04] p-3 md:p-4 text-center">
              <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-semibold tracking-wider">{s.label}</p>
              <p className={`text-lg md:text-2xl font-mono font-bold tabular-nums mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ━━━ STOCK PICK CARDS ━━━ */}
      {result && result.top_picks.length > 0 && (
        <div className="space-y-2 md:space-y-3">
          <h3 className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2 px-1">
            <Star className="w-3.5 h-3.5 text-amber-400" /> Top Picks
          </h3>
          {result.top_picks.map((pick: StockPick) => {
            const isExpanded = expandedPick === pick.symbol;
            const upside = ((pick.target - pick.price) / pick.price * 100).toFixed(1);
            const downside = ((pick.price - pick.stop_loss) / pick.price * 100).toFixed(1);
            return (
              <div
                key={pick.symbol}
                className="bg-[#0c1120] rounded-xl border border-white/[0.04] overflow-hidden transition-all hover:border-white/[0.08]"
              >
                {/* ── Main Row ── */}
                <div
                  className="p-3 md:p-4 flex items-center justify-between cursor-pointer active:bg-white/[0.02]"
                  onClick={() => setExpandedPick(isExpanded ? null : pick.symbol)}
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    {/* Score Circle */}
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full ring-2 ${getScoreRing(pick.score)} flex flex-col items-center justify-center shrink-0 bg-black/30`}>
                      <p className={`text-sm md:text-base font-bold tabular-nums ${getScoreColor(pick.score)}`}>{pick.score}</p>
                      <p className="text-[7px] md:text-[8px] text-slate-500 -mt-0.5 font-medium">SCORE</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm md:text-base font-bold text-white tracking-tight">{pick.symbol}</p>
                      <p className="text-[10px] md:text-xs text-slate-500 tabular-nums">₹{pick.price.toFixed(2)} · {pick.entry_range}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 shrink-0">
                    <span className={`px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-semibold tracking-wider uppercase ${getRatingStyle(pick.rating)}`}>
                      {pick.rating}
                    </span>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-slate-600" />
                      : <ChevronDown className="w-4 h-4 text-slate-600" />
                    }
                  </div>
                </div>

                {/* ── Expanded Details ── */}
                {isExpanded && (
                  <div className="px-3 md:px-4 pb-3 md:pb-4 pt-0 border-t border-white/[0.04] space-y-3">
                    {/* Key Levels Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3">
                      <div className="bg-black/20 rounded-lg p-2.5 md:p-3 text-center border border-white/[0.03]">
                        <p className="text-[8px] md:text-[9px] text-slate-500 uppercase font-semibold tracking-wider">Stop Loss</p>
                        <p className="text-xs md:text-sm font-mono font-bold text-rose-400 tabular-nums mt-0.5">₹{pick.stop_loss.toFixed(2)}</p>
                        <p className="text-[8px] md:text-[9px] text-rose-500/60 tabular-nums">-{downside}%</p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2.5 md:p-3 text-center border border-white/[0.03]">
                        <p className="text-[8px] md:text-[9px] text-slate-500 uppercase font-semibold tracking-wider">Target</p>
                        <p className="text-xs md:text-sm font-mono font-bold text-emerald-400 tabular-nums mt-0.5">₹{pick.target.toFixed(2)}</p>
                        <p className="text-[8px] md:text-[9px] text-emerald-500/60 tabular-nums">+{upside}%</p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2.5 md:p-3 text-center border border-white/[0.03]">
                        <p className="text-[8px] md:text-[9px] text-slate-500 uppercase font-semibold tracking-wider">Risk:Reward</p>
                        <p className="text-xs md:text-sm font-mono font-bold text-cyan-400 tabular-nums mt-0.5">{pick.risk_reward}</p>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2.5 md:p-3 text-center border border-white/[0.03]">
                        <p className="text-[8px] md:text-[9px] text-slate-500 uppercase font-semibold tracking-wider">Qty</p>
                        <p className="text-xs md:text-sm font-mono font-bold text-white tabular-nums mt-0.5">{pick.shares}</p>
                        <p className="text-[8px] md:text-[9px] text-slate-500 tabular-nums">₹{formatINR(pick.investment)}</p>
                      </div>
                    </div>

                    {/* Risk Badge */}
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3 text-amber-400/70" />
                      <span className="text-[10px] md:text-xs text-slate-500">Max Risk:</span>
                      <span className="text-[10px] md:text-xs text-rose-400 font-semibold font-mono tabular-nums">₹{formatINR(pick.risk_amount)}</span>
                    </div>

                    {/* Reasons */}
                    <div className="space-y-1">
                      <p className="text-[9px] md:text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Analysis Reasons</p>
                      {pick.reasons.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] md:text-xs text-slate-400 leading-relaxed">
                          <span className="text-cyan-500/60 mt-px shrink-0">•</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ━━━ No Picks ━━━ */}
      {result && result.top_picks.length === 0 && (
        <div className="bg-[#0c1120] rounded-xl border border-white/[0.04] p-8 md:p-12 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400/60 mx-auto mb-3" />
          <p className="text-white font-semibold text-sm md:text-base">No Strong Picks Found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Market conditions don't favor any stock right now. Try again later.</p>
        </div>
      )}

      {/* ━━━ Initial State ━━━ */}
      {!result && !loading && !error && (
        <div className="bg-[#0c1120] rounded-xl border border-white/[0.04] p-8 md:p-12 text-center">
          <Target className="w-10 h-10 text-cyan-500/30 mx-auto mb-4" />
          <p className="text-white font-semibold text-sm md:text-base">Smart Stock Scanner</p>
          <p className="text-[11px] md:text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
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
