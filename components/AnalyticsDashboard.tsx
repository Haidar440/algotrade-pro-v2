import React, { useState, useEffect } from 'react';
import { fetchPerformanceAnalytics, PerformanceAnalytics } from '../services/gemini';
import {
  BarChart3, TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Trophy, Target, Shield, Clock, Zap, DollarSign, Activity
} from 'lucide-react';

/**
 * AnalyticsDashboard — Performance analytics from trade history.
 * Calls GET /api/ai/analytics
 * Returns win rate, PnL, Sharpe ratio, max drawdown, etc.
 */
const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<PerformanceAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPerformanceAnalytics();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatCurrency = (val: number) => {
    const prefix = val >= 0 ? '+' : '';
    return `${prefix}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getPnlColor = (val: number) => val >= 0 ? 'text-emerald-400' : 'text-rose-400';

  if (loading && !data) {
    return (
      <div className="max-w-5xl mx-auto p-4 flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading performance analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-3" />
          <p className="text-rose-300 font-bold">{error}</p>
          <button onClick={fetchData} className="mt-3 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold">
            <RefreshCw className="w-3 h-3 inline mr-2" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasTradeData = data.total_trades > 0;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-900/10 to-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20">
              <BarChart3 className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Performance Analytics</h2>
              <p className="text-xs text-slate-400">Trade performance metrics and risk analysis</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {!hasTradeData ? (
        /* No Trade Data */
        <div className="glass-panel p-10 rounded-xl border border-slate-700 text-center">
          <BarChart3 className="w-12 h-12 text-purple-400/50 mx-auto mb-4" />
          <p className="text-white font-bold text-lg">No Trade Data Yet</p>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
            Start trading to see your performance analytics. Metrics like win rate, 
            Sharpe ratio, and max drawdown will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Net P&L */}
            <div className="glass-panel p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] text-slate-500 uppercase font-bold">Net P&L</span>
              </div>
              <p className={`text-2xl font-mono font-bold ${getPnlColor(data.net_pnl)}`}>
                {formatCurrency(data.net_pnl)}
              </p>
              <p className={`text-xs ${getPnlColor(data.roi_percent)} mt-1`}>
                {data.roi_percent >= 0 ? '+' : ''}{data.roi_percent.toFixed(2)}% ROI
              </p>
            </div>

            {/* Win Rate */}
            <div className="glass-panel p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] text-slate-500 uppercase font-bold">Win Rate</span>
              </div>
              <p className={`text-2xl font-mono font-bold ${data.win_rate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.win_rate.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {data.winning_trades}W / {data.losing_trades}L of {data.total_trades}
              </p>
            </div>

            {/* Sharpe Ratio */}
            <div className="glass-panel p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] text-slate-500 uppercase font-bold">Sharpe Ratio</span>
              </div>
              <p className={`text-2xl font-mono font-bold ${data.sharpe_ratio >= 1 ? 'text-emerald-400' : data.sharpe_ratio >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                {data.sharpe_ratio.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {data.sharpe_ratio >= 2 ? 'Excellent' : data.sharpe_ratio >= 1 ? 'Good' : data.sharpe_ratio >= 0 ? 'Fair' : 'Poor'}
              </p>
            </div>

            {/* Max Drawdown */}
            <div className="glass-panel p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] text-slate-500 uppercase font-bold">Max Drawdown</span>
              </div>
              <p className="text-2xl font-mono font-bold text-rose-400">
                {data.max_drawdown.toFixed(2)}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {data.max_drawdown <= 5 ? 'Low risk' : data.max_drawdown <= 15 ? 'Moderate' : 'High risk'}
              </p>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Trade Stats */}
            <div className="glass-panel p-5 rounded-xl border border-slate-700 space-y-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" /> Trade Statistics
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Total Trades', value: data.total_trades.toString(), icon: <Zap className="w-3 h-3" /> },
                  { label: 'Average Profit', value: formatCurrency(data.average_profit), color: 'text-emerald-400' },
                  { label: 'Average Loss', value: formatCurrency(data.average_loss), color: 'text-rose-400' },
                  { label: 'Largest Win', value: formatCurrency(data.largest_win), color: 'text-emerald-400' },
                  { label: 'Largest Loss', value: formatCurrency(data.largest_loss), color: 'text-rose-400' },
                  { label: 'Profit Factor', value: data.profit_factor.toFixed(2), color: data.profit_factor >= 1 ? 'text-emerald-400' : 'text-rose-400' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span className={`text-sm font-mono font-bold ${item.color || 'text-white'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Insights */}
            <div className="glass-panel p-5 rounded-xl border border-slate-700 space-y-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Performance Insights
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Best Strategy', value: data.best_strategy },
                  { label: 'Avg Holding Period', value: data.avg_holding_period, icon: <Clock className="w-3 h-3" /> },
                  { label: 'Total Fees', value: `₹${data.total_fees.toFixed(2)}`, color: 'text-amber-400' },
                  { label: 'Gross P&L', value: formatCurrency(data.total_pnl), color: getPnlColor(data.total_pnl) },
                  { label: 'Current Streak', value: `${data.current_streak > 0 ? '+' : ''}${data.current_streak} trades`, color: data.current_streak > 0 ? 'text-emerald-400' : data.current_streak < 0 ? 'text-rose-400' : 'text-slate-400' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span className={`text-sm font-mono font-bold ${item.color || 'text-white'}`}>{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Win/Loss Bar */}
              <div className="pt-2">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Win / Loss Distribution</p>
                <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-l-full"
                    style={{ width: `${data.win_rate}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-r-full"
                    style={{ width: `${100 - data.win_rate}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[9px]">
                  <span className="text-emerald-400">{data.win_rate.toFixed(0)}% Wins</span>
                  <span className="text-rose-400">{(100 - data.win_rate).toFixed(0)}% Losses</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
