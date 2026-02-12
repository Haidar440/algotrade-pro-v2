import React, { useState, useMemo } from 'react';
import { PrimaryRecommendation } from '../types';
import { Crosshair, ShieldAlert, Target, PlayCircle, MousePointer2 } from 'lucide-react';

interface TradePlanCardProps {
  plan: PrimaryRecommendation;
  currentPrice: number;
  symbol: string;
  onPaperTrade: (qty: number) => void;
}

const TradePlanCard: React.FC<TradePlanCardProps> = ({ 
  plan, 
  currentPrice, 
  symbol, 
  onPaperTrade, 
}) => {
  const [qty, setQty] = useState<string>('10');
  const [showTradeForm, setShowTradeForm] = useState(false);

  // --- LEVEL CALCULATIONS ---
  const levels = useMemo(() => {
     // Default Stop Loss if missing
     const sl = plan.stop_loss || currentPrice * 0.95;
     
     // Base Target (TP1)
     const tp1 = (plan.target_prices && plan.target_prices.length > 0) ? plan.target_prices[0] : currentPrice * 1.05;
     
     // Calculate TP2 and TP3 strictly based on Risk:Reward steps
     const risk = Math.abs(currentPrice - sl);
     const tp2 = plan.signal === 'BUY' ? tp1 + (risk * 1) : tp1 - (risk * 1);
     const tp3 = plan.signal === 'BUY' ? tp2 + (risk * 1) : tp2 - (risk * 1);

     return { 
       stopLoss: sl, 
       targets: [tp1, tp2, tp3] 
     };
  }, [plan, currentPrice]);

  const { stopLoss, targets } = levels;
  
  // Safe defaults for Entry Range
  const entryLow = plan.ideal_entry_range?.[0] || currentPrice;
  const entryHigh = plan.ideal_entry_range?.[1] || currentPrice;
  
  // Chart Range Calculation (Dynamic Scaling)
  const allPrices = [currentPrice, stopLoss, entryLow, entryHigh, ...targets].filter(p => p > 0);
  const minPrice = Math.min(...allPrices) * 0.99;
  const maxPrice = Math.max(...allPrices) * 1.01;
  const range = maxPrice - minPrice || 1; 

  // Invert calculation so High Price is at Top (0%) and Low Price is at Bottom (100%)
  const getPosition = (val: number) => {
    const pct = ((maxPrice - val) / range) * 100;
    return Math.max(5, Math.min(95, pct));
  };

  const isBuy = plan.signal === 'BUY' || plan.signal === 'STRONG BUY';
  const accentColor = isBuy ? 'text-emerald-400' : 'text-rose-400';
  const bgColor = isBuy ? 'bg-emerald-500' : 'bg-rose-500';
  
  const handleTradeSubmit = () => {
    const quantity = parseInt(qty);
    if (quantity > 0) {
      onPaperTrade(quantity);
      setShowTradeForm(false);
    }
  };

  return (
    <div className="glass-panel rounded-xl p-6 border border-slate-700 bg-slate-900/50 shadow-xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-700/50 pb-4">
        <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Crosshair className={`w-5 h-5 ${accentColor}`} />
            Execution Plan: <span className="text-slate-300 font-normal">{plan.strategy_name}</span>
            </h3>
            <p className="text-xs text-slate-500 ml-7 mt-1">
                Risk:Reward Ratio <span className="text-slate-300 font-mono">1:{plan.risk_reward_ratio || '2.0'}</span>
            </p>
        </div>
        
        <div className="flex items-center gap-3">
           <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg ${bgColor} text-white`}>
             {plan.signal}
           </span>
           
           <button 
             onClick={() => setShowTradeForm(!showTradeForm)}
             className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-blue-900/20"
           >
             <PlayCircle className="w-4 h-4" /> Paper Trade
           </button>
        </div>
      </div>

      {/* PAPER TRADE FORM (Collapsible) */}
      {showTradeForm && (
        <div className="mb-6 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-end gap-3">
             <div className="flex-1">
                <label className="text-[10px] text-blue-300 font-bold block mb-1 uppercase">Quantity</label>
                <input 
                  type="number" 
                  value={qty} 
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full bg-slate-900 border border-blue-500/50 rounded-lg px-3 py-2 text-white font-mono outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
             </div>
             <div className="flex-1">
                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase">Total Value</label>
                <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 font-mono">
                  ₹{(parseInt(qty || '0') * currentPrice).toFixed(0)}
                </div>
             </div>
             <button 
                onClick={handleTradeSubmit}
                className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-8 py-2 rounded-lg h-[42px] transition-colors shadow-lg shadow-blue-900/40"
             >
                Execute
             </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT: METRICS GRID */}
        <div className="space-y-4">
          
          {/* Row 1: Entry Zone */}
          <div className={`p-4 rounded-xl border transition-all ${
             currentPrice >= entryLow && currentPrice <= entryHigh 
             ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
             : 'bg-slate-800/50 border-slate-700'
          }`}>
            <div className="flex justify-between items-start mb-1">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1">
                    <MousePointer2 className="w-3 h-3" /> Ideal Entry
                </div>
                {currentPrice >= entryLow && currentPrice <= entryHigh && (
                    <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">
                        IN ZONE
                    </span>
                )}
            </div>
            <div className="text-2xl font-mono text-white font-bold tracking-tight">
              {entryLow.toFixed(2)} - {entryHigh.toFixed(2)}
            </div>
          </div>

          {/* Row 2: Stop Loss */}
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
             <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2 text-[10px] text-rose-400 uppercase tracking-widest font-bold">
                  <ShieldAlert className="w-3 h-3" /> Stop Loss
                </div>
                <div className="text-[10px] text-rose-400 font-bold">
                   -{((Math.abs(currentPrice - stopLoss) / currentPrice) * 100).toFixed(2)}% Risk
                </div>
             </div>
             <div className="text-xl font-mono text-rose-100 font-bold">{stopLoss.toFixed(2)}</div>
          </div>

          {/* Row 3: Targets */}
          <div className="space-y-2 pt-2">
            {targets.map((target, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                <span className={`text-xs font-bold flex items-center gap-2 ${idx === 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                  <Target className="w-4 h-4"/> Target {idx + 1}
                </span>
                <div className="text-right">
                    <span className="font-mono font-bold text-slate-200 block">{target.toFixed(2)}</span>
                    <span className="text-[9px] text-emerald-500 font-bold">
                        +{((Math.abs(target - currentPrice) / currentPrice) * 100).toFixed(2)}%
                    </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: VISUAL CHART  */}
        <div className="relative h-[340px] bg-[#0b1120] rounded-xl border border-slate-800 w-full overflow-hidden shadow-inner">
            {/* Y-Axis Labels */}
            <div className="absolute right-0 top-0 bottom-0 w-12 border-l border-slate-800/50 flex flex-col justify-between py-2 text-[9px] text-slate-600 font-mono text-right pr-2 pointer-events-none z-10">
              <span>{maxPrice.toFixed(0)}</span>
              <span>{((maxPrice + minPrice)/2).toFixed(0)}</span>
              <span>{minPrice.toFixed(0)}</span>
            </div>

            {/* Grid Lines */}
            {[0.25, 0.5, 0.75].map(p => (
               <div key={p} className="absolute left-0 right-12 border-t border-slate-800/30 border-dashed" style={{ top: `${p * 100}%` }}></div>
            ))}

            {/* TARGET LINES */}
            {targets.map((target, idx) => (
              <div key={idx} className="absolute left-4 right-16 flex items-center z-10" style={{ top: `${getPosition(target)}%` }}>
                <div className="flex-1 border-t border-dashed border-blue-500/40"></div>
                <span className="ml-2 text-blue-400 text-[9px] font-bold bg-[#0b1120]/80 px-1 rounded">TP{idx+1}</span>
              </div>
            ))}

            {/* ENTRY ZONE (Highlighted Box) */}
            <div 
              className={`absolute left-4 right-20 opacity-20 border-y ${isBuy ? 'bg-emerald-500 border-emerald-400' : 'bg-rose-500 border-rose-400'}`}
              style={{ 
                top: `${getPosition(entryHigh)}%`, 
                height: `${Math.max(4, Math.abs(getPosition(entryHigh) - getPosition(entryLow)))}%` // Ensure min-height visibility
              }}
            >
            </div>
            {/* Entry Label */}
            <div className="absolute right-24 text-[8px] text-slate-500 uppercase font-bold tracking-widest z-0" style={{ top: `${getPosition(entryHigh) - 5}%` }}>
               Entry Zone
            </div>

            {/* CURRENT PRICE (Live Tag) */}
            <div className="absolute left-0 right-12 flex items-center z-30 transition-all duration-500 ease-out" style={{ top: `${getPosition(currentPrice)}%` }}>
               <div className="bg-white text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded-r shadow-lg border-y border-r border-slate-300 flex items-center gap-1">
                 <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isBuy ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                 {currentPrice.toFixed(2)}
               </div>
               <div className="flex-1 border-t border-white/40 shadow-[0_1px_2px_rgba(0,0,0,0.5)]"></div>
            </div>

             {/* STOP LOSS (Solid Line) */}
             <div className="absolute left-4 right-16 flex items-center z-20" style={{ top: `${getPosition(stopLoss)}%` }}>
               <div className="flex-1 border-t-2 border-rose-500/80"></div>
               <span className="ml-2 text-rose-500 text-[9px] font-bold bg-[#0b1120] px-1 rounded">SL</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default TradePlanCard;