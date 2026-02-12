import React, { useState, useEffect, useRef } from 'react';
import { AnalysisResult, LoadingStep, PaperTrade, View, BrokerState, SignalFeedItem, MarketIndices, Stock } from './types';
import { INDIAN_STOCKS } from './services/stockData';
import { streamer } from './services/streaming';
import { AngelOne } from './services/angel';
import { TechnicalAnalysisEngine } from './services/technicalAnalysis';
import { analyzeStockTicker, fetchMarketIndices } from './services/gemini';
import { AutoTrader, AutoTraderConfig } from './services/autoTrader';

// COMPONENTS
import PaperTradingDashboard from './components/PaperTradingDashboard';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import StrategyGuide from './components/StrategyGuide';
import SettingsModal from './components/SettingsModal';
import PythonLab from './components/PythonLab';
import BacktestDashboard from './components/BacktestDashboard';
import MarketStatusTicker from './components/MarketStatusTicker';
import SignalFeedCard from './components/SignalFeedCard';
import BottomNav from './components/BottomNav';
import StockDetailView from './components/StockDetailView';
import WatchlistRow from './components/WatchlistRow';
import NewsAnalysisDashboard from './components/NewsAnalysisDashboard';
import RealPortfolio from './components/RealPortfolio';
import AutoTraderDashboard from './components/AutoTraderDashboard';
import { checkMarketStatus } from './utils/marketTime';
import TradeHistory from './components/TradeHistory';
import WatchlistManager from './components/WatchlistManager';
import TradingChart from './components/TradingChart'; // ✅ Import Chart
import TradingViewTicker from './components/TradingViewTicker';
import { 
  Activity, Search, AlertTriangle, Filter, RefreshCw, Lock, Zap, Briefcase, Bot
} from 'lucide-react';

const App: React.FC = () => {
  // ✅ 1. POPUP MODE CHECK: If URL has params, render ONLY the chart
  const queryParams = new URLSearchParams(window.location.search);
  const chartSymbol = queryParams.get('chartSymbol');
  const chartToken = queryParams.get('chartToken');

  if (chartSymbol && chartToken) {
    return (
      <div className="h-screen w-screen bg-slate-950 overflow-hidden">
        <TradingChart symbol={chartSymbol} token={chartToken} />
      </div>
    );
  }

  // --- STANDARD APP LOGIC BELOW ---
  const [currentView, setCurrentView] = useState<View>('SCANNER');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [autoTraderInstance, setAutoTraderInstance] = useState<AutoTrader | null>(null);
  
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>(() => {
    try { return JSON.parse(localStorage.getItem('algoTradePro_portfolio') || '[]'); } catch { return []; }
  });

  const [brokerState, setBrokerState] = useState<BrokerState>(() => {
    try { return JSON.parse(localStorage.getItem('algoTradePro_brokerState') || '{}'); } catch { return {}; }
  });
  
  const [watchlist, setWatchlist] = useState<SignalFeedItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('algoTradePro_watchlist') || '[]'); } catch { return []; }
  });

  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [livePrice, setLivePrice] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [marketIndices, setMarketIndices] = useState<MarketIndices | null>(null);

  // Initialize Global AutoTrader
  useEffect(() => {
    if (brokerState.angel && !autoTraderInstance) {
      console.log("🤖 Initializing Global Auto-Trader...");
      const angel = new AngelOne(brokerState.angel);
      const defaultConfig: AutoTraderConfig = {
         capital: 50000, riskPerTrade: 1, maxDailyLoss: 2000,
         targetMultiplier: 2, enableTrailingSL: true,
         symbols: ['SBIN', 'RELIANCE'], maxOpenPositions: 3,
         isPaperTrading: true
      };
      const trader = new AutoTrader(angel, defaultConfig);
      setAutoTraderInstance(trader);
    }
  }, [brokerState]);

  useEffect(() => {
    setIsMarketOpen(checkMarketStatus());
    const interval = setInterval(() => { setIsMarketOpen(checkMarketStatus()); }, 60000);
    return () => clearInterval(interval);
  }, []);

  const [signals, setSignals] = useState<SignalFeedItem[]>([]);
  const [filterType, setFilterType] = useState<string>('All');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [suggestions, setSuggestions] = useState<Stock[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const steps: LoadingStep[] = [
    { id: 1, text: 'Connecting to Angel One API...', status: 'pending' },
    { id: 2, text: 'Fetching Historical Candles (OHLC)...', status: 'pending' },
    { id: 3, text: 'Calculating Technical Indicators...', status: 'pending' },
    { id: 4, text: 'Running Algorithmic Strategies...', status: 'pending' },
    { id: 5, text: 'Generating Trade Signal...', status: 'pending' },
  ];

   const handleSessionUpdate = (newTokens: any) => {
    setBrokerState(prev => {
       const newState = { ...prev, angel: { ...prev.angel, ...newTokens } };
       localStorage.setItem('algoTradePro_brokerState', JSON.stringify(newState));
       return newState;
    });
  };

  const scanFeaturedStocks = async () => {
    if (!brokerState.angel) return; 
    setScanning(true);
    const angel = new AngelOne(brokerState.angel, handleSessionUpdate);
    const stocksToScan = INDIAN_STOCKS.slice(0, 8); 
    const newSignals: SignalFeedItem[] = [];

    try {
      for (const stock of stocksToScan) {
        try {
          const history = await angel.getHistoricalData(stock.symbol.replace('.NS',''), "ONE_DAY", 100);
          if (history && history.length > 50) {
             const analysis = TechnicalAnalysisEngine.analyze(stock.symbol, history);
             const rec = analysis.primary_recommendation;
             let finalSignal: 'STRONG BUY' | 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
             if (rec.signal === 'BUY') finalSignal = rec.confidence > 0.8 ? 'STRONG BUY' : 'BUY';
             else if (rec.signal === 'SELL') finalSignal = 'SELL';
             else if (rec.signal === 'STRONG BUY') finalSignal = 'STRONG BUY';

             newSignals.push({
               id: `sig_${stock.symbol}_${Date.now()}`,
               symbol: stock.symbol.replace('.NS', ''),
               name: stock.name,
               price: analysis.current_price,
               changePercent: 0,
               signal: finalSignal,
               confidence: rec.confidence,
               strategy: rec.strategy_name,
               entry: rec.ideal_entry_range?.[0] || 0,
               stopLoss: rec.stop_loss || 0,
               target: rec.target_prices?.[0] || 0,
               timeframe: 'Swing',
               sector: 'Nifty 50',
               timestamp: new Date().toISOString()
             });
          }
        } catch (e) { console.warn(`Skipping ${stock.symbol}`, e); }
        await new Promise(r => setTimeout(r, 300));
      }
      setSignals(newSignals.sort((a,b) => b.confidence - a.confidence));
    } catch (e) { console.error("Scan failed", e); } 
    finally { setScanning(false); }
  };

  useEffect(() => {
    if (!result || !brokerState.angel) return;
    let activeToken: string | null = null;
    const startLiveFeed = async () => {
       try {
          const angel = new AngelOne(brokerState.angel);
          const token = await angel.searchSymbolToken(result.symbol);
          activeToken = token;
          try {
             const ltpResponse = await angel.getLtpValue("NSE", token, result.symbol); 
             if (ltpResponse && ltpResponse.price > 0) {
                 setLivePrice(ltpResponse.price);
                 setResult(prev => prev ? { ...prev, current_price: ltpResponse.price } : null);
             }
          } catch (err) {}
          streamer.subscribe(token, (newPrice) => {
             setLivePrice(newPrice);
             setResult(prev => prev ? { ...prev, current_price: newPrice } : null);
          });
       } catch (e) { console.error("Live Stream Error:", e); }
    };
    startLiveFeed();
    return () => { if (activeToken) streamer.unsubscribe(activeToken); };
  }, [result, brokerState.angel]);

  useEffect(() => { localStorage.setItem('algoTradePro_portfolio', JSON.stringify(paperTrades)); }, [paperTrades]);
  useEffect(() => { localStorage.setItem('algoTradePro_brokerState', JSON.stringify(brokerState)); }, [brokerState]);
  useEffect(() => { localStorage.setItem('algoTradePro_watchlist', JSON.stringify(watchlist)); }, [watchlist]);

  useEffect(() => {
    const initIndices = async () => {
       if (brokerState.angel) {
         try {
           const angel = new AngelOne(brokerState.angel);
           const data = await angel.getMarketIndices();
           if(data) setMarketIndices(data);
         } catch (e) {}
       } else {
           const data = await fetchMarketIndices();
           setMarketIndices(data);
       }
    };
    initIndices();
  }, [brokerState.angel]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [wrapperRef]);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTicker(value);
    if (value.length >= 2) {
      try {
        if (brokerState.angel) {
           const angel = new AngelOne(brokerState.angel);
           const dbResults = await angel.searchScrips(value);
           if (dbResults.length > 0) { setSuggestions(dbResults); setShowSuggestions(true); return; }
        }
      } catch (err) {}
      const filtered = INDIAN_STOCKS.filter(stock => 
        stock.symbol.toLowerCase().includes(value.toLowerCase()) || 
        stock.name.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 10);
      setSuggestions(filtered); setShowSuggestions(true);
    } else { setSuggestions([]); setShowSuggestions(false); }
  };

  const runAnalysis = async (symbol: string) => {
    setLoading(true); setError(null); setResult(null); setLoadingStep(0);
    const interval = setInterval(() => { setLoadingStep(prev => (prev < steps.length - 1 ? prev + 1 : prev)); }, 800);
    try {
      if (!brokerState.angel) {
          const aiAnalysis = await analyzeStockTicker(symbol);
          setResult(aiAnalysis); setLivePrice(aiAnalysis.current_price);
      } else {
          const angel = new AngelOne(brokerState.angel, handleSessionUpdate);
          const history = await angel.getHistoricalData(symbol, "ONE_DAY", 120);
          if (!history || history.length < 50) throw new Error(`Insufficient data for ${symbol}.`);
          const analysis = TechnicalAnalysisEngine.analyze(symbol, history);
          setResult(analysis); setLivePrice(analysis.current_price);
      }
      setCurrentView('SCANNER');
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis Failed'); } 
    finally { clearInterval(interval); setLoading(false); }
  };

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); if (!ticker.trim()) return; setShowSuggestions(false); runAnalysis(ticker.toUpperCase()); };
  const handleRefresh = () => { if (result) runAnalysis(result.symbol); else if (ticker) runAnalysis(ticker.toUpperCase()); };
  const handleManualPriceUpdate = (newPrice: number) => { setLivePrice(newPrice); if (result) setResult({ ...result, current_price: newPrice }); };

  const executePaperTrade = (qty: number) => {
    if (!result || result.primary_recommendation.signal === 'NO-TRADE') return;
    const newTrade: PaperTrade = {
      id: Date.now().toString(),
      symbol: result.symbol,
      strategyName: result.primary_recommendation.strategy_name,
      entryPrice: livePrice,
      stopLoss: result.primary_recommendation.stop_loss || 0,
      targetPrice: result.primary_recommendation.target_prices[0] || 0,
      quantity: qty,
      status: 'OPEN',
      entryDate: new Date().toISOString()
    };
    setPaperTrades(prev => [newTrade, ...prev]);
  };

  const closePaperTrade = (id: string, exitPrice: number) => {
    setPaperTrades(prev => prev.map(t => {
      if (t.id !== id) return t;
      const pnl = (exitPrice - t.entryPrice) * t.quantity;
      return { ...t, status: 'CLOSED', exitPrice, exitDate: new Date().toISOString(), pnl };
    }));
  };

  const deletePaperTrade = (id: string) => { setPaperTrades(prev => prev.filter(t => t.id !== id)); };
  const addToWatchlist = (signal: SignalFeedItem) => { if (!watchlist.find(i => i.id === signal.id)) setWatchlist(prev => [signal, ...prev]); };

  const renderDashboardFeed = () => {
    const filteredSignals = signals.filter(s => {
      if (filterType === 'All') return true;
      if (filterType === 'Buy' && (s.signal === 'BUY' || s.signal === 'STRONG BUY')) return true;
      if (filterType === 'Sell' && s.signal === 'SELL') return true;
      if (filterType === 'Strong Buy' && s.signal === 'STRONG BUY') return true;
      return false;
    });

    return (
       <div className="space-y-6 mt-6">
         <div className="flex flex-col gap-3">
            <div className="flex justify-between items-end">
               <div className="flex items-center gap-2 text-slate-400 text-sm font-bold uppercase tracking-wider"><Filter className="w-4 h-4" /> Market Scanner</div>
               {brokerState.angel && (
                 <button onClick={scanFeaturedStocks} disabled={scanning} className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors">
                    <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} /> {scanning ? 'Scanning...' : 'Refresh Scan'}
                 </button>
               )}
            </div>
            <div className="flex flex-wrap gap-2">
               {['All', 'Buy', 'Sell', 'Strong Buy'].map(t => (
                  <button key={t} onClick={() => setFilterType(t)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${filterType === t ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-white'}`}>{t}</button>
               ))}
               
            </div>
         </div>
         <div>
            <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-400" /> Featured Signals</h3>
            {!brokerState.angel && (
               <div className="p-8 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/50">
                  <Lock className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">Connect Angel One to see Live Signals</p>
                  <button onClick={() => setShowSettingsModal(true)} className="mt-3 text-emerald-400 text-sm font-bold hover:underline">Connect Now</button>
               </div>
            )}
            {brokerState.angel && filteredSignals.length === 0 && !scanning && <div className="p-8 text-center text-slate-500">No signals found matching "{filterType}". Try refreshing.</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSignals.map(sig => <SignalFeedCard key={sig.id} signal={sig} onAnalyze={runAnalysis} onAddToWatchlist={addToWatchlist} isInWatchlist={watchlist.some(w => w.id === sig.id)} />)}
            </div>
         </div>
       </div>
    );
  };

  return (
    <div className="flex h-[100dvh] bg-[#0f172a] text-slate-200 font-sans selection:bg-emerald-500/30 overflow-hidden w-full">
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} brokerState={brokerState} onSaveBrokerState={setBrokerState} />
      <Sidebar activeView={currentView} onSelectView={setCurrentView} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        <Navbar onMenuClick={() => setIsSidebarOpen(true)} activeView={currentView} onConnectClick={() => setShowSettingsModal(true)} isConnected={!!brokerState.angel} />
        
        {currentView === 'SCANNER' && !result && <TradingViewTicker />}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-900/50 p-4 md:p-8 scroll-smooth w-full">
          <div className="max-w-7xl mx-auto min-h-full pb-20">
            {currentView === 'SCANNER' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {!result && (
                  <div className="mb-6 relative max-w-full group z-20">
                      <form onSubmit={handleSearch} className="relative">
                        <div className="relative flex items-center bg-[#1e293b] rounded-xl p-2 border border-slate-700 focus-within:border-emerald-500/50 transition-colors shadow-lg">
                          <Search className="w-5 h-5 text-slate-400 ml-3 shrink-0" />
                          <input type="text" value={ticker} onChange={handleInputChange} onFocus={() => { if(ticker.length > 0) setShowSuggestions(true); }} placeholder="Search NSE/BSE Stock (e.g. RELIANCE)..." className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 text-base px-4 uppercase font-mono outline-none" autoComplete="off" />
                          <button type="submit" disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0">{loading ? '...' : 'Go'}</button>
                        </div>
                      </form>
                      {showSuggestions && suggestions.length > 0 && (
                        <div ref={wrapperRef} className="absolute top-full left-0 right-0 mt-2 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto z-50">
                          {suggestions.map((stock) => (
                            <div key={stock.symbol} onMouseDown={() => { setTicker(stock.symbol); setSuggestions([]); runAnalysis(stock.symbol); }} className="px-4 py-3 hover:bg-slate-700/50 cursor-pointer flex justify-between items-center border-b border-slate-800/50 last:border-0">
                              <div className="flex flex-col text-left"><span className="font-bold text-emerald-400 font-mono text-sm">{stock.symbol}</span><span className="text-slate-400 text-xs truncate max-w-[200px]">{stock.name}</span></div><Zap className="w-3 h-3 text-slate-600" />
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )}
                {loading && <div className="max-w-lg mx-auto mt-12 space-y-4">{steps.map((step, idx) => (<div key={step.id} className={`flex items-center gap-3 transition-opacity duration-500 ${idx <= loadingStep ? 'opacity-100' : 'opacity-30'}`}>{idx === loadingStep ? <div className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" /> : <div className="w-5 h-5 rounded-full border-2 border-slate-700" />}<span className={`font-mono text-sm ${idx === loadingStep ? 'text-emerald-400' : 'text-slate-400'}`}>{step.text}</span></div>))}</div>}
                {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-200 mb-8"><AlertTriangle className="w-6 h-6 shrink-0" /><p>{error}</p><button onClick={() => setShowSettingsModal(true)} className="ml-auto bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1 rounded text-xs font-bold">Settings</button></div>}
                {!result && !loading && renderDashboardFeed()}
                {result && !loading && (
                  <StockDetailView 
                    result={result} livePrice={livePrice} isMarketOpen={isMarketOpen} onRefresh={handleRefresh} onBack={() => setResult(null)} brokerState={brokerState} onPaperTrade={executePaperTrade} onPriceEdit={handleManualPriceUpdate} isInWatchlist={watchlist.some(w => w.symbol === result.symbol)}
                    onToggleWatchlist={() => {
                        if (watchlist.some(w => w.symbol === result.symbol)) setWatchlist(prev => prev.filter(w => w.symbol !== result.symbol));
                        else setWatchlist(prev => [{ id: `man_${result.symbol}_${Date.now()}`, symbol: result.symbol, name: INDIAN_STOCKS.find(s => s.symbol === result.symbol)?.name || result.symbol, price: livePrice, changePercent: 0, signal: result.primary_recommendation.signal as any, confidence: result.primary_recommendation.confidence, strategy: result.primary_recommendation.strategy_name, entry: result.primary_recommendation.ideal_entry_range?.[0] || result.current_price, stopLoss: result.primary_recommendation.stop_loss || 0, target: result.primary_recommendation.target_prices?.[0] || 0, timeframe: 'Swing', sector: 'Unknown', timestamp: new Date().toISOString() }, ...prev]);
                    }}
                  />
                )}
              </div>
            )}
            
            {/* ✅ UPDATED WATCHLIST VIEW (Standard full width, no chart here) */}
            {currentView === 'WATCHLIST' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <WatchlistManager 
                      onAnalyze={runAnalysis} 
                      brokerState={brokerState} 
                  />
              </div>
            )}

            {currentView === 'REAL_PORTFOLIO' && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2"><Briefcase className="w-6 h-6 text-blue-400" /> Angel One Portfolio</h2><RealPortfolio brokerState={brokerState} /></div>}
            {currentView === 'PAPER_TRADING' && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2"><Activity className="w-6 h-6 text-purple-400" /> Paper Trading Simulator</h2><PaperTradingDashboard trades={paperTrades} onCloseTrade={closePaperTrade} onDeleteTrade={deletePaperTrade} brokerState={brokerState} /></div>}
            {currentView === 'AUTO_TRADER' && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2"><Bot className="w-6 h-6 text-amber-500" /> Algorithmic Trading Engine</h2><AutoTraderDashboard brokerState={brokerState} existingTrader={autoTraderInstance} /></div>}
            {currentView === 'TRADE_HISTORY' && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><TradeHistory brokerState={brokerState} /></div>}
            {currentView === 'NEWS' && <div className="h-full"><NewsAnalysisDashboard /></div>}
            {currentView === 'BACKTEST' && <BacktestDashboard brokerState={brokerState} />}
            {currentView === 'STRATEGIES' && <StrategyGuide />}
            {currentView === 'PYTHON_LAB' && <div className="h-full"><PythonLab data={result} brokerState={brokerState} /></div>}
          </div>
        </main>
        
        <BottomNav activeView={currentView} onNavigate={setCurrentView} onOpenSettings={() => setShowSettingsModal(true)} />
      </div>
    </div>
  );
};

export default App;