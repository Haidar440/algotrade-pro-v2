import React, { useState } from 'react';
import { Technicals } from '../types';
import { ChevronDown, ChevronUp, Gauge } from 'lucide-react';

interface TechnicalPanelProps {
  technicals: Technicals;
}

const TechnicalPanel: React.FC<TechnicalPanelProps> = ({ technicals }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!technicals) return null;

  const renderIndicator = (label: string, value: string | number, status?: 'bullish' | 'bearish' | 'neutral') => {
    // 1. Determine Colors
    const statusColor = 
      status === 'bullish' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
      status === 'bearish' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
      'text-slate-400 bg-slate-800 border-slate-700';

    // 2. Smart Sizing Logic
    // isTextValue = true if it's "BULLISH", "AVERAGE"
    // isTextValue = false if it's "37.58", "10.3"
    const isTextValue = typeof value === 'string' && isNaN(Number(value));
    
    return (
      <div className={`p-2 rounded-lg border flex flex-col items-center justify-center text-center min-h-[75px] transition-all hover:bg-slate-800/80 ${statusColor}`}>
         <span className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-1">{label}</span>
         
         <span 
            className={`font-mono font-bold leading-tight break-words w-full ${
                isTextValue ? 'text-[10px] sm:text-xs tracking-wide' : 'text-lg sm:text-xl'
            }`} 
         >
            {value}
         </span>
      </div>
    );
  };

  const getRsiStatus = (val: number) => {
    if (val > 70) return 'bearish';
    if (val < 30) return 'bullish';
    return 'neutral';
  };

  const getAdxStatus = (val: number) => val > 25 ? 'bullish' : 'neutral';

  return (
    <div className="glass-panel rounded-xl border border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-700">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2">
           <Gauge className="w-5 h-5 text-purple-400" />
           <h3 className="text-white font-bold text-sm uppercase tracking-wide">Technical Indicators</h3>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Row 1 */}
          {renderIndicator('RSI (14)', technicals.rsi?.toFixed(1) || 'N/A', getRsiStatus(technicals.rsi))}
          {renderIndicator('ADX (14)', technicals.adx?.toFixed(1) || 'N/A', getAdxStatus(technicals.adx))}
          {renderIndicator('MACD', technicals.macd || '-', technicals.macd === 'BULLISH' ? 'bullish' : technicals.macd === 'BEARISH' ? 'bearish' : 'neutral')}
          {renderIndicator('Volume', technicals.volume_status || '-', 'neutral')}
          
          {/* Row 2 */}
          {renderIndicator('EMA 20', technicals.ema_20?.toFixed(1) || '-', 'neutral')}
          {renderIndicator('EMA 50', technicals.ema_50?.toFixed(1) || '-', 'neutral')}
          {renderIndicator('Support', technicals.support?.toFixed(1) || '-', 'neutral')}
          {renderIndicator('Resist', technicals.resistance?.toFixed(1) || '-', 'neutral')}
        </div>
      )}
    </div>
  );
};

export default TechnicalPanel;  