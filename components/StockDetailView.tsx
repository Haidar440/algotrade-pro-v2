import React, { useState, useEffect, useRef } from 'react';
import { AnalysisResult, BrokerState } from '../types';
import InteractiveChart from './InteractiveChart';
import TechnicalPanel from './TechnicalPanel';
import TradePlanCard from './TradePlanCard';
import StrategyCard from './StrategyCard';
import AiPredictionCard from './AiPredictionCard'; 
import { getGeminiPrediction, AIPrediction } from '../services/gemini'; 
import { AngelOne } from '../services/angel';
import { DB_SERVICE } from '../services/db'; // ✅ Keep DB Connection
import { 
  RefreshCw, Bell, Share2, Briefcase, AlertTriangle, Moon, ArrowLeft, Edit2, 
  CheckCircle2, TrendingUp, TrendingDown, Clock, Zap 
} from 'lucide-react';
import TradeModal from './TradeModal'; 

interface StockDetailViewProps {
  result: AnalysisResult;
  livePrice: number;
  isMarketOpen: boolean;
  onRefresh: () => void;
  onBack: () => void;
  brokerState: BrokerState;
  onPaperTrade: (qty: number) => void;
  onPriceEdit?: (newPrice: number) => void;
  isInWatchlist: boolean;
  onToggleWatchlist: () => void;
}

const StockDetailView: React.FC<StockDetailViewProps> = ({ 
  result, livePrice, isMarketOpen, onRefresh, onBack, brokerState, onPaperTrade, onPriceEdit,
  isInWatchlist, onToggleWatchlist
}) => {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [editPriceVal, setEditPriceVal] = useState(livePrice.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  
  // AI State
  const [aiPrediction, setAiPrediction] = useState<AIPrediction | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Trade Modal State
  const [showTradeModal, setShowTradeModal] = useState(false);

  useEffect(() => { if (!isEditingPrice) setEditPriceVal(livePrice.toString()); }, [livePrice, isEditingPrice]);
  useEffect(() => { if (isEditingPrice && inputRef.current) inputRef.current.focus(); }, [isEditingPrice]);

  const previousClose = result.previous_close || result.current_price;
  const change = livePrice - previousClose;
  const changePercent = (change / previousClose) * 100;
  const isPositive = change >= 0;

  const handlePriceSubmit = () => {
      const val = parseFloat(editPriceVal);
      if (!isNaN(val) && val > 0 && onPriceEdit) onPriceEdit(val);
      setIsEditingPrice(false);
  };

  // ✅ LOGIC FIX: Intercept the trade and save to DB
  const handlePaperTradeWrapper = async (qty: number) => {
      try {
          // 1. Save to Database
          await DB_SERVICE.saveTrade({
              symbol: result.symbol,
              entryPrice: livePrice,
              quantity: qty,
              type: 'PAPER', 
              status: 'OPEN',
              strategy: result.primary_recommendation.strategy_name || 'MANUAL',
              target: result.primary_recommendation.target_price,
              stopLoss: result.primary_recommendation.stop_loss,
              entryDate: new Date(),
              notes: `Manual Paper Trade via StockView`
          });

          // 2. Alert User
          alert(`✅ Paper Trade Executed: Bought ${qty} ${result.symbol}`);

          // 3. Update Parent (if needed)
          if(onPaperTrade) onPaperTrade(qty);

      } catch(e) {
          console.error(e);
          alert("❌ Failed to save paper trade to database.");
      }
  };

  const handleGenerateAI = async () => {
    setAiLoading(true);
    try {
      let historyStr = "";
      if (brokerState.angel) {
         try {
            const angel = new AngelOne(brokerState.angel);
            const history = await angel.getHistoricalData(result.symbol.replace('.NS',''), "ONE_DAY", 30);
            historyStr = history.map(c => `${c.date},${c.open},${c.high},${c.low},${c.close},${c.volume}`).join('\n');
         } catch(e) { console.warn("Failed to fetch history for AI, using generic prompt"); }
      }

      const prediction = await getGeminiPrediction(result.symbol, livePrice, result, historyStr);
      setAiPrediction(prediction);
    } catch (e) {
      console.error(e);
      alert("AI Generation failed. Check API Key or Network.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
         <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
               <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
               <h1 className="text-3xl font-black text-white leading-none">{result.symbol}</h1>
               <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono mr-2">
                     <Clock className="w-3 h-3" />
                     <span>{result.data_timestamp?.split(' ')[0]}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    result.market_condition === 'UPTREND' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                    result.market_condition === 'DOWNTREND' ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' :
                    'text-slate-400 border-slate-600 bg-slate-800'
                  }`}>
                    {result.market_condition}
                  </span>
                  {isMarketOpen ? (
                     <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                        LIVE
                     </span>
                  ) : (
                     <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <Moon className="w-3 h-3" /> CLOSED
                     </span>
                  )}
               </div>
            </div>
         </div>

         <div className="flex items-center gap-6">
            <div className="text-right">
                <div className="text-3xl font-mono font-bold text-white cursor-pointer" onClick={() => setIsEditingPrice(true)}>
                   {isEditingPrice ? (
                      <input ref={inputRef} type="number" value={editPriceVal} onChange={e => setEditPriceVal(e.target.value)} onBlur={handlePriceSubmit} onKeyDown={e => e.key === 'Enter' && handlePriceSubmit()} className="bg-transparent border-b border-emerald-500 w-32 text-right outline-none"/>
                   ) : (
                      <>₹{livePrice.toFixed(2)} <Edit2 className="w-4 h-4 text-slate-700 opacity-0 group-hover:opacity-100" /></>
                   )}
                </div>
               <div className={`text-sm font-bold flex items-center justify-end gap-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
               </div>
            </div>
            
            <button onClick={onRefresh} className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Re-Analyze">
               <RefreshCw className="w-5 h-5" />
            </button>
         </div>
      </div>

      {/* 2. Interactive Chart & Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2">
            <InteractiveChart data={result} livePrice={livePrice} />
         </div>
         
         <div className="space-y-6">
            <div className={`glass-panel p-6 rounded-xl border flex flex-col items-center justify-center text-center ${
               result.primary_recommendation.signal === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/20' : 
               result.primary_recommendation.signal === 'SELL' ? 'bg-rose-500/10 border-rose-500/20' : 
               'bg-slate-800/50 border-slate-700'
            }`}>
               <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-2">Algorithm Verdict</div>
               <div className={`text-3xl font-black mb-2 ${
                  result.primary_recommendation.signal === 'BUY' ? 'text-emerald-400' : 
                  result.primary_recommendation.signal === 'SELL' ? 'text-rose-400' : 'text-slate-400'
               }`}>
                  {result.primary_recommendation.signal}
               </div>
               <div className="flex items-center gap-2 mb-4">
                  <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
                     <div className={`h-full rounded-full ${result.primary_recommendation.signal === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${result.primary_recommendation.confidence * 100}%` }}></div>
                  </div>
                  <span className="text-xs font-bold text-slate-300">{Math.round(result.primary_recommendation.confidence * 100)}% Confidence</span>
               </div>
               <p className="text-sm text-slate-400 leading-tight">
                  {result.primary_recommendation.reason}
               </p>
            </div>

            <AiPredictionCard prediction={aiPrediction} loading={aiLoading} onGenerate={handleGenerateAI} />

            <div className="grid grid-cols-2 gap-3">
               <button className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors text-slate-300 hover:text-white">
                  <Bell className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">Set Alert</span>
               </button>
               
               <button onClick={onToggleWatchlist} className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border transition-colors ${isInWatchlist ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white'}`}>
                  {isInWatchlist ? <CheckCircle2 className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                  <span className="text-[10px] font-bold uppercase">{isInWatchlist ? 'Watching' : 'Watchlist'}</span>
               </button>

               <button className="col-span-2 flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-colors">
                  <Share2 className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">Share Signal</span>
               </button>
            </div>
         </div>
      </div>

      {/* 3. Execution Plan */}
      <div className="space-y-4">
          {/* ✅ Passed Wrapper Logic Here */}
          <TradePlanCard 
            plan={result.primary_recommendation} 
            currentPrice={livePrice} 
            symbol={result.symbol} 
            onPaperTrade={handlePaperTradeWrapper} 
          />
          
          <div className="grid grid-cols-1">
              {/* REAL TRADE BUTTON (No Simulate button anymore) */}
              {brokerState.angel?.jwtToken ? (
                <button 
                  onClick={() => setShowTradeModal(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-900/30 text-lg border border-emerald-500/50"
                >
                  <Zap className="w-6 h-6 fill-current" /> 
                  EXECUTE REAL TRADE
                </button>
              ) : (
                <div className="text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-center">
                   <span className="text-xs text-slate-500">Connect Angel One for Real Trading</span>
                </div>
              )}
          </div>
      </div>

      {/* 4. Technical Panel */}
      <TechnicalPanel technicals={result.technicals} />

      {/* 5. Strategy Breakdown */}
      <div>
         <h3 className="text-xl font-bold text-white mb-4">Strategy Matrix</h3>
         {result.strategies_evaluated.length === 0 ? (
           <div className="p-8 rounded-xl border border-rose-500/30 bg-rose-500/10 text-center">
              <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <h4 className="text-lg font-bold text-rose-200">Analysis Blocked</h4>
              <p className="text-rose-400 mt-1">{result.primary_recommendation.reason}</p>
           </div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.strategies_evaluated.map((strat, idx) => (
                 <StrategyCard key={idx} strategy={strat} />
              ))}
           </div>
         )}
      </div>

      <div className="flex items-start gap-2 p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p>{result.disclaimer}</p>
      </div>

      <TradeModal 
          isOpen={showTradeModal} 
          onClose={() => setShowTradeModal(false)}
          symbol={result.symbol}
          ltp={livePrice}
          brokerState={brokerState}
      />
    </div>
  );
};

export default StockDetailView;