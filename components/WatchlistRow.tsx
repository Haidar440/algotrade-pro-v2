import React, { useState } from 'react';
import { SignalFeedItem } from '../types';
import Sparkline from './Sparkline';
import { Trash2, Target, ShieldAlert, ChevronRight } from 'lucide-react';

interface WatchlistRowProps {
  item: SignalFeedItem;
  onAnalyze: (symbol: string) => void;
  onDelete: (id: string) => void;
}

const WatchlistRow: React.FC<WatchlistRowProps> = ({ item, onAnalyze, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Determine styling based on signal
  const isBuy = item.signal.includes('BUY');
  const strokeColor = isBuy ? '#34d399' : '#fb7185'; // Emerald-400 or Rose-400
  
  // Calculate distances for visual context
  const distToEntry = ((item.entry - item.price) / item.price) * 100;
  const distToTarget = ((item.target - item.price) / item.price) * 100;
  
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
        setIsDeleting(true);
        setTimeout(() => onDelete(item.id), 300); // Wait for animation
    } else {
        setShowDeleteConfirm(true);
        setTimeout(() => setShowDeleteConfirm(false), 3000); // Reset after 3s
    }
  };

  return (
    <div 
      className={`relative overflow-hidden group mb-3 rounded-xl transition-all duration-500 ease-out ${
        isDeleting ? 'opacity-0 -translate-x-full h-0 mb-0' : 'opacity-100'
      }`}
    >
      {/* Main Card Content */}
      <div 
        onClick={() => onAnalyze(item.symbol)}
        className="relative z-10 p-4 border border-slate-700/50 bg-slate-800/40 backdrop-blur-md hover:bg-slate-800/60 transition-all cursor-pointer flex items-center justify-between shadow-sm group-hover:shadow-md"
      >
        {/* Left: Stock Info */}
        <div className="flex items-center gap-3 min-w-[30%]">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg shadow-inner ${
            isBuy ? 'bg-emerald-500/10 text-emerald-400 shadow-emerald-900/20' : 'bg-rose-500/10 text-rose-400 shadow-rose-900/20'
          }`}>
            {item.symbol[0]}
          </div>
          <div>
            <div className="font-bold text-white flex items-center gap-2">
               {item.symbol}
               <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${
                 isBuy ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
               }`}>
                 {item.signal}
               </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wide">
               {item.strategy}
            </div>
          </div>
        </div>

        {/* Middle: Sparkline Chart */}
        <div className="hidden sm:block w-24 h-10">
           <Sparkline 
              isPositive={item.changePercent >= 0} 
              color={strokeColor} 
              id={item.id}
           />
        </div>

        {/* Right: Price & Metrics */}
        <div className="text-right min-w-[25%]">
           <div className="font-mono font-bold text-white text-lg">₹{item.price.toFixed(2)}</div>
           <div className={`text-[10px] font-bold flex justify-end gap-1 ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
           </div>
           
           <div className="mt-1 flex justify-end items-center gap-2 text-[9px] font-medium text-slate-500">
              {isBuy ? (
                 <div className="flex items-center gap-1 text-blue-400/80">
                    <Target className="w-3 h-3" />
                    <span>Tgt: {distToTarget > 0 ? '+' : ''}{distToTarget.toFixed(1)}%</span>
                 </div>
              ) : (
                 <div className="flex items-center gap-1 text-amber-400/80">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Ent: {distToEntry.toFixed(1)}%</span>
                 </div>
              )}
           </div>
        </div>
        
        {/* Navigation Arrow */}
        <div className="pl-4 text-slate-600 group-hover:text-blue-400 transition-colors transform group-hover:translate-x-1 duration-300">
           <ChevronRight className="w-5 h-5" />
        </div>
      </div>

      {/* Slide-out Delete Button */}
      <button
        onClick={handleDeleteClick}
        className={`absolute top-0 bottom-0 right-0 z-20 flex items-center justify-center transition-all duration-300 ${
            showDeleteConfirm 
            ? 'w-full bg-rose-600/90 text-white backdrop-blur-sm' 
            : 'w-12 bg-transparent text-transparent group-hover:text-slate-600'
        }`}
      >
        {showDeleteConfirm ? (
            <span className="font-bold flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Confirm Delete
            </span>
        ) : (
            <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
        )}
      </button>
    </div>
  );
};

export default WatchlistRow;