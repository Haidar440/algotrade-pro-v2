import React, { useState } from 'react';
import { StrategyEvaluation } from '../types';
import { CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronUp, Target, ShieldAlert, TrendingUp } from 'lucide-react';

interface StrategyCardProps {
  strategy: StrategyEvaluation;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy }) => {
  const [expanded, setExpanded] = useState(false);

  const isActive = strategy.is_valid && (strategy.signal === 'BUY' || strategy.signal === 'SELL');
  const isBuy = strategy.signal === 'BUY';
  const isSell = strategy.signal === 'SELL';

  // Confidence ring
  const rawPct = Math.round(strategy.quality_score * 100);
  const pct = Math.min(100, Math.max(0, rawPct));
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (pct / 100) * circumference;

  // Colors
  const ringColor = isActive
    ? (isBuy ? '#10b981' : '#f43f5e')
    : '#475569';
  const borderColor = isActive
    ? (isBuy ? 'border-emerald-500/40' : 'border-rose-500/40')
    : 'border-slate-700/50';
  const glowClass = isActive
    ? (isBuy ? 'shadow-emerald-500/10 shadow-lg' : 'shadow-rose-500/10 shadow-lg')
    : '';
  const bgClass = isActive
    ? (isBuy ? 'bg-emerald-500/5' : 'bg-rose-500/5')
    : 'bg-slate-800/30';
  const badgeClass = isActive
    ? (isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')
    : 'bg-slate-700/50 text-slate-500';

  return (
    <div className={`rounded-xl border transition-all duration-300 hover:scale-[1.01] ${borderColor} ${glowClass} ${bgClass}`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => isActive && setExpanded(!expanded)}
      >
        {/* Confidence Ring */}
        <div className="relative flex-shrink-0 w-12 h-12">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={radius} fill="none" stroke="#1e293b" strokeWidth="3" />
            <circle cx="24" cy="24" r={radius} fill="none" stroke={ringColor} strokeWidth="3"
              strokeDasharray={`${strokeDash} ${circumference}`}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-300">
            {pct}%
          </span>
        </div>

        {/* Name + Notes */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-200 truncate">
              {strategy.strategy_name}
            </h3>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeClass}`}>
              {isActive ? strategy.signal : 'SKIP'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{strategy.notes}</p>
        </div>

        {/* R:R Badge (only for active) */}
        {isActive && (
          <div className="flex-shrink-0 text-right">
            <span className="text-[10px] text-slate-500">R:R</span>
            <p className={`text-sm font-bold ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
              1:{strategy.risk_reward_ratio.toFixed(1)}
            </p>
          </div>
        )}

        {/* Expand arrow */}
        {isActive && (
          <div className="flex-shrink-0 text-slate-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && isActive && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-700/30">
          <div className="grid grid-cols-3 gap-3 mt-3">
            {/* Entry */}
            <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 mb-1">
                <TrendingUp className="w-3 h-3" /> Entry
              </div>
              <p className="text-sm font-semibold text-slate-200">
                ₹{strategy.ideal_entry_range[0]?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            {/* Stop Loss */}
            <div className="bg-rose-500/5 rounded-lg p-2.5 text-center border border-rose-500/10">
              <div className="flex items-center justify-center gap-1 text-[10px] text-rose-400/70 mb-1">
                <ShieldAlert className="w-3 h-3" /> Stop Loss
              </div>
              <p className="text-sm font-semibold text-rose-400">
                ₹{strategy.stop_loss?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            {/* Target */}
            <div className="bg-emerald-500/5 rounded-lg p-2.5 text-center border border-emerald-500/10">
              <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-400/70 mb-1">
                <Target className="w-3 h-3" /> Target
              </div>
              <p className="text-sm font-semibold text-emerald-400">
                ₹{strategy.target_prices[0]?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
          {/* Multiple targets */}
          {strategy.target_prices.length > 1 && (
            <div className="flex gap-2 mt-2">
              {strategy.target_prices.map((t, i) => (
                <span key={i} className="text-[10px] bg-emerald-500/10 text-emerald-400/70 px-2 py-0.5 rounded-full">
                  T{i + 1}: ₹{t.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StrategyCard;