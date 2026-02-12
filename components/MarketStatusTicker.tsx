import React from 'react';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { MarketIndices } from '../types';

interface MarketStatusTickerProps {
  isMarketOpen: boolean;
  indices: MarketIndices | null;
}

const MarketStatusTicker: React.FC<MarketStatusTickerProps> = ({ isMarketOpen, indices }) => {
  const renderTickerItem = (label: string, data: { price: number; changePercent: number } | undefined) => {
    // 1. Check if data object exists
    if (!data) return (
      <div className="flex flex-col min-w-[100px] animate-pulse">
        <span className="text-[10px] text-slate-500 font-bold uppercase">{label}</span>
        <div className="h-4 w-20 bg-slate-800 rounded mt-1"></div>
      </div>
    );

    // 2. Safe Access: Default to 0 if properties are missing/null
    // This prevents the "Cannot read properties of null" error
    const price = data.price ?? 0;
    const change = data.changePercent ?? 0;
    const isPositive = change >= 0;

    return (
      <div className="flex flex-col min-w-[100px]">
        <span className="text-[10px] text-slate-500 font-bold uppercase">{label}</span>
        <div className="flex items-center gap-1">
           <span className="text-sm font-bold text-white font-mono">
             {price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
           </span>
           <span className={`text-[10px] font-bold flex items-center ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
             {isPositive ? '+' : ''}{change.toFixed(2)}% 
             {isPositive ? <TrendingUp className="w-3 h-3 ml-0.5"/> : <TrendingDown className="w-3 h-3 ml-0.5"/>}
           </span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full bg-slate-900 border-b border-slate-800 py-2 px-4 flex items-center justify-between overflow-x-auto gap-4 no-scrollbar">
      {/* Market Status Badge */}
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ${isMarketOpen ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700/50 text-slate-400 border border-slate-600'}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${isMarketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></div>
        {isMarketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
      </div>

      {/* Indices */}
      <div className="flex items-center gap-6 shrink-0">
        {renderTickerItem('NIFTY 50', indices?.nifty)}
        <div className="h-6 w-px bg-slate-800"></div>
        {renderTickerItem('SENSEX', indices?.sensex)}
        <div className="h-6 w-px bg-slate-800 hidden sm:block"></div>
        {renderTickerItem('BANK NIFTY', indices?.bankNifty)}
      </div>
      
      {!indices && (
        <div className="text-[10px] text-slate-600 flex items-center gap-1 animate-pulse">
           <Loader2 className="w-3 h-3 animate-spin" /> Updating...
        </div>
      )}
    </div>
  );
};

export default MarketStatusTicker;