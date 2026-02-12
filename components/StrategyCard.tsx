import React from 'react';
import { StrategyEvaluation } from '../types';
import { CheckCircle2, XCircle, MinusCircle, AlertCircle } from 'lucide-react';

interface StrategyCardProps {
  strategy: StrategyEvaluation;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy }) => {
  const getStatusColor = () => {
    if (!strategy.is_valid) return 'text-slate-500 border-slate-700 bg-slate-800/30';
    if (strategy.signal === 'BUY') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (strategy.signal === 'SELL') return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
    return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  };

  const getStatusIcon = () => {
    if (!strategy.is_valid) return <MinusCircle className="w-5 h-5" />;
    if (strategy.signal === 'BUY') return <CheckCircle2 className="w-5 h-5" />;
    if (strategy.signal === 'SELL') return <XCircle className="w-5 h-5" />;
    return <AlertCircle className="w-5 h-5" />;
  };

  const colorClasses = getStatusColor();
  
  // ✅ FIX: Clamp value between 0 and 100 to prevent overflow
  const rawPercentage = Math.round(strategy.quality_score * 100);
  const percentage = Math.min(100, Math.max(0, rawPercentage));

  return (
    <div className={`glass-panel rounded-xl p-4 border transition-all duration-300 hover:scale-[1.01] ${colorClasses.replace('text-', 'border-').split(' ')[1]}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-200 pr-2">
          {strategy.strategy_name}
        </h3>
        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${colorClasses.split(' ')[0]} bg-slate-900/50`}>
          {getStatusIcon()}
          <span>{strategy.is_valid ? strategy.signal : 'INVALID'}</span>
        </div>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed mb-4 min-h-[60px] line-clamp-3">
        {strategy.notes}
      </p>

      <div className="flex items-center gap-2 mt-auto">
        {/* Progress Bar Container */}
        <div className="flex-1 bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
          <div 
            className={`h-1.5 rounded-full ${strategy.is_valid ? (strategy.signal === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-600'}`} 
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <span className="text-[10px] text-slate-500 font-mono w-8 text-right">{percentage}%</span>
      </div>
    </div>
  );
};

export default StrategyCard;