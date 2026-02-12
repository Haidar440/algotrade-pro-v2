import React from 'react';
import { SignalFeedItem } from '../types';
import { TrendingUp, TrendingDown, Target, ShieldAlert, ArrowRight, Zap } from 'lucide-react';

interface SignalFeedCardProps {
  signal: SignalFeedItem;
  onAnalyze: (symbol: string) => void;
  onAddToWatchlist: (signal: SignalFeedItem) => void;
  isInWatchlist: boolean;
}

const SignalFeedCard: React.FC<SignalFeedCardProps> = ({ signal, onAnalyze, onAddToWatchlist, isInWatchlist }) => {
  // Logic for Signal Types
  const isStrongBuy = signal.signal === 'STRONG BUY';
  const isBuy = signal.signal === 'BUY' || isStrongBuy;
  const isSell = signal.signal === 'SELL';

  // Dynamic Styles
  const colorClass = isBuy ? 'text-emerald-400' : 'text-rose-400';
  const bgClass = isBuy ? 'bg-emerald-500' : 'bg-rose-500';
  const borderClass = isBuy ? 'border-emerald-500' : 'border-rose-500';
  
  // Glowing effect for STRONG BUY
  const glowEffect = isStrongBuy ? 'shadow-[0_0_15px_rgba(16,185,129,0.3)] border-emerald-400/50' : 'border-slate-700';

  return (
    <div className={`glass-panel p-4 rounded-xl border bg-slate-800/40 hover:bg-slate-800/60 transition-all active:scale-[0.98] group relative overflow-hidden ${glowEffect}`}>
      
      {/* Strong Buy Ribbon Effect */}
      {isStrongBuy && (
         <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-bold px-2 py-1 rounded-bl-lg z-10 shadow-lg">
            STRONG BUY
         </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
           <div className={`w-10 h-10 rounded-lg ${bgClass}/10 border ${borderClass}/20 flex items-center justify-center font-bold text-lg ${colorClass}`}>
             {signal.symbol[0]}
           </div>
           <div>
             <h3 className="font-bold text-white leading-tight flex items-center gap-1">
                {signal.symbol}
                {isStrongBuy && <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400 animate-pulse" />}
             </h3>
             <span className="text-[10px] text-slate-400 truncate max-w-[120px] block">{signal.name}</span>
           </div>
        </div>
        <div className="text-right">
           <div className="text-sm font-mono font-bold text-white">₹{signal.price.toFixed(2)}</div>
           <div className={`text-[10px] font-bold ${signal.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
             {signal.changePercent > 0 ? '+' : ''}{signal.changePercent.toFixed(2)}%
           </div>
        </div>
      </div>

      {/* Signal Badge & Confidence */}
      <div className="flex items-center justify-between mb-4">
        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${bgClass}/20 ${colorClass} border ${borderClass}/30`}>
           {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
           {signal.signal}
        </div>
        
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 bg-slate-700 rounded-full overflow-hidden">
             <div className={`h-full rounded-full ${bgClass}`} style={{ width: `${signal.confidence * 100}%` }}></div>
          </div>
          <span className="text-[9px] text-slate-400 font-bold">{Math.round(signal.confidence * 100)}%</span>
        </div>
      </div>

      {/* Strategy Tag */}
      <div className="mb-3">
         <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Detected Strategy</div>
         <div className="text-xs text-slate-300 bg-slate-900/50 p-1.5 rounded border border-slate-700/50 truncate">
            {signal.strategy}
         </div>
      </div>

      {/* Levels Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
         <div className="bg-slate-900/50 rounded p-1.5 border border-slate-700/50 text-center">
           <div className="text-[8px] text-slate-500 font-bold uppercase mb-0.5">Entry</div>
           <div className="text-[11px] font-mono font-bold text-slate-200">₹{signal.entry.toFixed(0)}</div>
         </div>
         <div className="bg-slate-900/50 rounded p-1.5 border border-slate-700/50 text-center">
           <div className="text-[8px] text-slate-500 font-bold uppercase mb-0.5">Target</div>
           <div className="text-[11px] font-mono font-bold text-emerald-400">₹{signal.target.toFixed(0)}</div>
         </div>
         <div className="bg-slate-900/50 rounded p-1.5 border border-slate-700/50 text-center">
           <div className="text-[8px] text-slate-500 font-bold uppercase mb-0.5">Stop</div>
           <div className="text-[11px] font-mono font-bold text-rose-400">₹{signal.stopLoss.toFixed(0)}</div>
         </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
         <button 
           onClick={() => onAddToWatchlist(signal)}
           className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-colors ${
             isInWatchlist 
               ? 'bg-slate-700 text-slate-400 cursor-default' 
               : 'bg-slate-700 hover:bg-slate-600 text-white'
           }`}
           disabled={isInWatchlist}
         >
           {isInWatchlist ? 'Added' : '+ Watchlist'}
         </button>
         <button 
           onClick={() => onAnalyze(signal.symbol)}
           className="flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
         >
           Analyze <ArrowRight className="w-3 h-3" />
         </button>
      </div>
    </div>
  );
};

export default SignalFeedCard;