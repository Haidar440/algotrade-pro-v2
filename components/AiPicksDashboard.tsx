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

  const getRatingColor = (rating: string) => {
    if (rating === 'GOLDEN') return 'text-amber-300 bg-amber-500/20 border-amber-400/50';
    if (rating === 'STRONG') return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40';
    if (rating === 'MODERATE') return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40';
    return 'text-slate-400 bg-slate-500/20 border-slate-500/40';  // SKIP
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-900/10 to-slate-900">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-cyan-500/20">
            <Target className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">AI Stock Picker</h2>
            <p className="text-xs text-slate-400">10-layer scoring: Technicals + Fundamentals + News Sentiment</p>
          </div>
        </div>

        {/* Capital Input + Scan Button */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Investment Capital (₹)</label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
              min={10000}
              step={10000}
            />
          </div>
          <button
            onClick={handleScan}
            disabled={loading}
            className="mt-5 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-bold rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? 'Scanning...' : 'Scan Market'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}

      {/* Results Summary */}
      {result && (
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-panel p-4 rounded-xl border border-slate-700 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Stocks Scanned</p>
            <p className="text-2xl font-mono font-bold text-white">{result.total_scanned}</p>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-700 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Picks Found</p>
            <p className="text-2xl font-mono font-bold text-emerald-400">{result.picks_found}</p>
          </div>
          <div className="glass-panel p-4 rounded-xl border border-slate-700 text-center">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Capital</p>
            <p className="text-2xl font-mono font-bold text-cyan-400">₹{(result.capital / 1000).toFixed(0)}K</p>
          </div>
        </div>
      )}

      {/* Stock Pick Cards */}
      {result && result.top_picks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" /> Top Picks
          </h3>
          {result.top_picks.map((pick: StockPick) => {
            const isExpanded = expandedPick === pick.symbol;
            const upside = ((pick.target - pick.price) / pick.price * 100).toFixed(1);
            const downside = ((pick.price - pick.stop_loss) / pick.price * 100).toFixed(1);
            return (
              <div
                key={pick.symbol}
                className="glass-panel rounded-xl border border-slate-700 overflow-hidden transition-all hover:border-cyan-500/30"
              >
                {/* Main Row */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedPick(isExpanded ? null : pick.symbol)}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className={`text-2xl font-mono font-bold ${getScoreColor(pick.score)}`}>{pick.score}</p>
                      <p className="text-[9px] text-slate-500">SCORE</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">{pick.symbol}</p>
                      <p className="text-xs text-slate-400">₹{pick.price.toFixed(2)} • {pick.entry_range}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRatingColor(pick.rating)}`}>
                      {pick.rating}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-slate-800 space-y-3">
                    {/* Levels */}
                    <div className="grid grid-cols-4 gap-3 pt-3">
                      <div className="bg-slate-900 rounded-lg p-3 text-center border border-slate-800">
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Stop Loss</p>
                        <p className="text-sm font-mono font-bold text-rose-400">₹{pick.stop_loss.toFixed(2)}</p>
                        <p className="text-[9px] text-rose-400/60">-{downside}%</p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center border border-slate-800">
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Target</p>
                        <p className="text-sm font-mono font-bold text-emerald-400">₹{pick.target.toFixed(2)}</p>
                        <p className="text-[9px] text-emerald-400/60">+{upside}%</p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center border border-slate-800">
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Risk:Reward</p>
                        <p className="text-sm font-mono font-bold text-cyan-400">{pick.risk_reward}</p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center border border-slate-800">
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Qty</p>
                        <p className="text-sm font-mono font-bold text-white">{pick.shares}</p>
                        <p className="text-[9px] text-slate-400">₹{pick.investment.toFixed(0)}</p>
                      </div>
                    </div>

                    {/* Risk */}
                    <div className="flex items-center gap-2 text-xs">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-slate-400">Max Risk: </span>
                      <span className="text-rose-400 font-bold font-mono">₹{pick.risk_amount.toFixed(0)}</span>
                    </div>

                    {/* Reasons */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Analysis Reasons</p>
                      {pick.reasons.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <span className="text-cyan-400 mt-0.5">•</span>
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

      {/* No Picks */}
      {result && result.top_picks.length === 0 && (
        <div className="glass-panel p-8 rounded-xl border border-slate-700 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-white font-bold">No Strong Picks Found</p>
          <p className="text-sm text-slate-400 mt-1">Market conditions don't favor any stock right now. Try again later.</p>
        </div>
      )}

      {/* Initial State */}
      {!result && !loading && !error && (
        <div className="glass-panel p-10 rounded-xl border border-slate-700 text-center">
          <Target className="w-12 h-12 text-cyan-400/50 mx-auto mb-4" />
          <p className="text-white font-bold text-lg">Smart Stock Scanner</p>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
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
