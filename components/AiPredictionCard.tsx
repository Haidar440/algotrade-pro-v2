import React from 'react';
import { AIPrediction } from '../services/gemini';
import { Bot, TrendingUp, TrendingDown, AlertCircle, Target, BrainCircuit, RefreshCw } from 'lucide-react';

interface AiPredictionCardProps {
  prediction: AIPrediction | null;
  loading: boolean;
  onGenerate: () => void;
}

const AiPredictionCard: React.FC<AiPredictionCardProps> = ({ prediction, loading, onGenerate }) => {
  if (!prediction && !loading) {
    return (
      <div className="glass-panel p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-900/10 to-slate-900 flex flex-col items-center justify-center text-center">
         <Bot className="w-10 h-10 text-purple-400 mb-3" />
         <h3 className="text-white font-bold text-lg">AI Price Prediction</h3>
         <p className="text-slate-400 text-xs mb-4 max-w-[250px]">
           Use Gemini Pro to analyze real-time candle data and forecast price targets.
         </p>
         <button 
           onClick={onGenerate}
           className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20"
         >
           <BrainCircuit className="w-4 h-4" /> Generate Forecast
         </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center animate-pulse">
         <div className="w-12 h-12 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mb-4"></div>
         <p className="text-purple-300 font-mono text-sm">Gemini is analyzing market structure...</p>
      </div>
    );
  }

  // Render Result
  const isBullish = prediction?.signal === 'BUY';
  const colorClass = isBullish ? 'text-emerald-400' : prediction?.signal === 'SELL' ? 'text-rose-400' : 'text-amber-400';
  const trendIcon = isBullish ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />;

  return (
    <div className="glass-panel p-6 rounded-2xl border border-purple-500/30 bg-[#0f172a] relative overflow-hidden">
       {/* Background Glow */}
       <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 blur-3xl rounded-full -mr-10 -mt-10"></div>

       <div className="flex justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-2">
             <Bot className="w-5 h-5 text-purple-400" />
             <span className="text-xs font-bold text-purple-300 uppercase tracking-widest">Gemini Forecast</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 bg-slate-900 border border-slate-700 ${colorClass}`}>
             {trendIcon} {prediction?.signal}
          </div>
       </div>

       <div className="flex items-end gap-2 mb-4">
          <span className="text-4xl font-mono font-bold text-white">₹{prediction?.predictedPrice.toFixed(2)}</span>
          <span className="text-xs text-slate-500 mb-1.5 font-bold">TARGET</span>
       </div>

       <div className="space-y-3 mb-5">
          <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
             <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold mb-1">
                <span>Reasoning</span>
                <span>{prediction?.confidence}% Conf.</span>
             </div>
             <p className="text-xs text-slate-300 leading-relaxed">
                {prediction?.reasoning}
             </p>
          </div>

          <div className="flex gap-2">
             <div className="flex-1 bg-slate-900 rounded p-2 text-center border border-slate-800">
                <span className="text-[9px] text-slate-500 block uppercase">Support</span>
                <span className="text-sm font-mono font-bold text-emerald-400">₹{prediction?.keyLevels.support}</span>
             </div>
             <div className="flex-1 bg-slate-900 rounded p-2 text-center border border-slate-800">
                <span className="text-[9px] text-slate-500 block uppercase">Resistance</span>
                <span className="text-sm font-mono font-bold text-rose-400">₹{prediction?.keyLevels.resistance}</span>
             </div>
          </div>
       </div>

       <button 
         onClick={onGenerate}
         className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
       >
         <RefreshCw className="w-3 h-3" /> Update Analysis
       </button>
    </div>
  );
};

export default AiPredictionCard;