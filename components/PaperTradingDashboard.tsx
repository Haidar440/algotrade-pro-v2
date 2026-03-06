import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrokerState } from '../types';
import { AngelOne } from '../services/angel';
import { DB_SERVICE } from '../services/db'; 
import { 
  Clock, Target, ArrowUpRight, ArrowDownRight, TrendingUp, Loader2, Zap, 
  Trophy, RefreshCw, AlertTriangle, Search, Plus, ShoppingCart, X
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PaperTradingDashboardProps {
  brokerState: BrokerState;
  isVisible?: boolean;
}

const PaperTradingDashboard: React.FC<PaperTradingDashboardProps> = ({ brokerState, isVisible = true }) => {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exitPriceInputs, setExitPriceInputs] = useState<{ [key: string]: string }>({});
  const [livePrices, setLivePrices] = useState<{ [key: string]: number }>({});
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);

  // --- Buy UI State ---
  const [showBuyForm, setShowBuyForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [buyQuantity, setBuyQuantity] = useState('1');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyTarget, setBuyTarget] = useState('');
  const [buyStopLoss, setBuyStopLoss] = useState('');
  const [submittingBuy, setSubmittingBuy] = useState(false);

  // --- Stock Search (debounced) ---
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await DB_SERVICE.searchStocks(q);
      setSearchResults(Array.isArray(results) ? results.slice(0, 8) : []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  const selectStock = async (stock: any) => {
    setSelectedStock(stock);
    setSearchQuery(stock.symbol || stock.tradingsymbol);
    setSearchResults([]);
    // Auto-fetch LTP if Angel One connected
    if (brokerState.angel) {
      try {
        const angel = new AngelOne(brokerState.angel);
        const token = stock.token || await angel.searchSymbolToken(stock.symbol || stock.tradingsymbol);
        if (token) {
          const ltpData = await angel.getLtpValue("NSE", token, stock.symbol || stock.tradingsymbol);
          if (ltpData && ltpData.price > 0) setBuyPrice(ltpData.price.toFixed(2));
        }
      } catch { }
    }
  };

  const handleBuySubmit = async () => {
    if (!selectedStock) return;
    const qty = parseInt(buyQuantity);
    const price = parseFloat(buyPrice);
    if (!qty || qty <= 0 || !price || price <= 0) {
      alert('❌ Please enter valid quantity and price.');
      return;
    }
    setSubmittingBuy(true);
    try {
      const sym = selectedStock.symbol || selectedStock.tradingsymbol;
      await DB_SERVICE.saveTrade({
        symbol: sym.replace(/-EQ$/, ''),
        entryPrice: price,
        quantity: qty,
        type: 'SWING',
        source: 'PAPER',
        status: 'OPEN',
        strategy: 'MANUAL',
        target: buyTarget ? parseFloat(buyTarget) : undefined,
        stopLoss: buyStopLoss ? parseFloat(buyStopLoss) : undefined,
        entryDate: new Date(),
        notes: 'Paper Trade via Quick Buy',
      });
      alert(`✅ Paper Trade: Bought ${qty} ${sym.replace(/-EQ$/, '')} @ ₹${price}`);
      // Reset form
      setShowBuyForm(false);
      setSelectedStock(null);
      setSearchQuery('');
      setBuyQuantity('1');
      setBuyPrice('');
      setBuyTarget('');
      setBuyStopLoss('');
      fetchPortfolio();
    } catch (e) {
      console.error(e);
      alert('❌ Failed to place paper trade.');
    }
    setSubmittingBuy(false);
  };

  // --- 1. Fetch Trades ---
  const fetchPortfolio = async () => {
    try {
        const allTrades = (await DB_SERVICE.getTrades() as any[]) || [];
        const paperTrades = allTrades.filter((t: any) => t.source === 'PAPER').reverse();
        setTrades(paperTrades);
    } catch (e) {
        console.error("Failed to load portfolio:", e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      if (!isVisible) return; // Don't poll when hidden (keep-alive view optimization)
      fetchPortfolio();
      const interval = setInterval(fetchPortfolio, 15000); // Poll every 15s (was 5s)
      return () => clearInterval(interval);
  }, [isVisible]);

  const activeTrades = trades.filter(t => t.status === 'OPEN' || t.status === 'EXITING');
  const closedTrades = trades.filter(t => t.status === 'CLOSED');

  // --- 2. Live Price Engine ---
  useEffect(() => {
    if (activeTrades.length === 0 || !brokerState.angel) return;

    const angel = new AngelOne(brokerState.angel);
    
    const fetchLivePrices = async () => {
        const uniqueSymbols: string[] = Array.from(new Set(activeTrades.map((t: any) => t.symbol as string)));

        for (const sym of uniqueSymbols) {
            try {
                const token: string = await angel.searchSymbolToken(sym);
                if (token) {
                    const ltpData = await angel.getLtpValue("NSE", token, sym);
                    if (ltpData && ltpData.price > 0) {
                        setLivePrices(prev => ({ ...prev, [sym]: ltpData.price }));
                    }
                }
            } catch (e) { }
        }
    };

    fetchLivePrices(); 
    const intervalId = setInterval(fetchLivePrices, 3000); 

    return () => clearInterval(intervalId);
  }, [activeTrades.length, brokerState.angel]); 

  // --- Calculations ---
  const totalRealizedPnL = closedTrades.reduce((acc, curr) => acc + (curr.pnl || 0), 0);
  
  const totalUnrealizedPnL = activeTrades.reduce((acc, t) => {
    const current = livePrices[t.symbol] || t.entryPrice; 
    return acc + ((current - t.entryPrice) * t.quantity);
  }, 0);

  const totalPnL = totalRealizedPnL + totalUnrealizedPnL;
  const winCount = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? Math.round((winCount / closedTrades.length) * 100) : 0;
  
  const bestTrade = closedTrades.reduce((max, t) => (t.pnl || 0) > max ? (t.pnl || 0) : max, 0);
  const worstTrade = closedTrades.reduce((min, t) => (t.pnl || 0) < min ? (t.pnl || 0) : min, 0);

  // --- Equity Curve ---
  const equityData = useMemo(() => {
    let balance = 100000; 
    const data = [{ name: 'Start', value: balance }];
    const sorted = [...closedTrades].sort((a,b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());
    
    sorted.forEach((t, idx) => {
        balance += (t.pnl || 0);
        data.push({ name: `${idx + 1}`, value: balance });
    });
    
    if (activeTrades.length > 0) {
        data.push({ name: 'Now', value: balance + totalUnrealizedPnL });
    }
    return data;
  }, [closedTrades.length, totalUnrealizedPnL]);


  const handleExitPriceChange = (id: string, val: string) => {
    setExitPriceInputs(prev => ({ ...prev, [id]: val }));
  };

  const handleCloseClick = async (trade: any) => {
    setClosingTradeId(trade._id);
    let finalPrice = livePrices[trade.symbol] || trade.entryPrice;
    
    if (brokerState.angel) {
      try {
        const angel = new AngelOne(brokerState.angel);
        const token = await angel.searchSymbolToken(trade.symbol);
        if(token) {
            const ltpData = await angel.getLtpValue("NSE", token, trade.symbol);
            if (ltpData && ltpData.price > 0) finalPrice = ltpData.price;
        }
      } catch (e) { }
    } else {
        const priceStr = exitPriceInputs[trade._id];
        if (priceStr) {
            const p = parseFloat(priceStr);
            if (!isNaN(p) && p > 0) finalPrice = p;
        }
    }

    const pnl = (finalPrice - trade.entryPrice) * trade.quantity;

    await DB_SERVICE.updateTrade(trade._id, {
        status: 'CLOSED',
        exitPrice: finalPrice,
        exitDate: new Date(),
        pnl: pnl,
        notes: "Manual Close via Portfolio"
    });

    setClosingTradeId(null);
    setExitPriceInputs(prev => { const c = {...prev}; delete c[trade._id]; return c; });
    fetchPortfolio(); 
  };

  const getProgress = (current: number, entry: number, target: number) => {
    if (!target || target === entry) return 0;
    const progress = ((current - entry) / (target - entry)) * 100;
    return Math.max(0, Math.min(100, progress));
  };

  if (loading && trades.length === 0) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader2 className="w-8 h-8 animate-spin text-blue-500"/><span className="text-slate-500 text-sm">Loading Portfolio...</span></div>;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
           <Trophy className="text-yellow-400 w-8 h-8" /> Paper Trading Portfolio
        </h1>
        <div className="flex gap-2 items-center">
            <button onClick={() => setShowBuyForm(!showBuyForm)} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${showBuyForm ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border-emerald-500/30'}`}>
                {showBuyForm ? <X className="w-3.5 h-3.5"/> : <ShoppingCart className="w-3.5 h-3.5"/>} {showBuyForm ? 'CLOSE' : 'BUY STOCK'}
            </button>
            {brokerState.angel ? (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-current" /> LIVE FEED
                </span>
            ) : (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> FEED OFFLINE
                </span>
            )}
            <button onClick={() => fetchPortfolio()} className="flex items-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold px-3 py-1.5 rounded-lg border border-slate-700 transition-colors">
                <RefreshCw className="w-3.5 h-3.5"/> REFRESH
            </button>
        </div>
      </div>

      {/* ━━━ Quick Buy Form ━━━ */}
      {showBuyForm && (
        <div className="glass-panel rounded-xl border border-emerald-500/30 bg-slate-800/80 p-5 animate-in slide-in-from-top duration-300">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> New Paper Trade
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            {/* Stock Search */}
            <div className="md:col-span-2 relative">
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Stock Symbol</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search RELIANCE, TCS..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 font-mono"
                />
                {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />}
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {searchResults.map((s, i) => (
                    <button key={i} onClick={() => selectStock(s)} className="w-full text-left px-3 py-2 hover:bg-slate-700 text-sm flex justify-between items-center border-b border-slate-800 last:border-b-0">
                      <span className="font-mono font-bold text-white">{s.symbol || s.tradingsymbol}</span>
                      <span className="text-[10px] text-slate-400 truncate ml-2">{s.name || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Price */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Price (₹)</label>
              <input type="number" step="0.05" placeholder="0.00" value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-emerald-500" />
            </div>

            {/* Quantity */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Quantity</label>
              <input type="number" min="1" value={buyQuantity}
                onChange={(e) => setBuyQuantity(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-emerald-500" />
            </div>

            {/* Target */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Target (₹)</label>
              <input type="number" step="0.05" placeholder="Optional" value={buyTarget}
                onChange={(e) => setBuyTarget(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-emerald-500" />
            </div>

            {/* Submit */}
            <div>
              <button onClick={handleBuySubmit} disabled={!selectedStock || submittingBuy}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2">
                {submittingBuy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                BUY
              </button>
            </div>
          </div>

          {/* Stop Loss row */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mt-3">
            <div className="md:col-start-5">
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Stop Loss (₹)</label>
              <input type="number" step="0.05" placeholder="Optional" value={buyStopLoss}
                onChange={(e) => setBuyStopLoss(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-emerald-500" />
            </div>
            {selectedStock && buyPrice && (
              <div className="md:col-span-1 flex items-end">
                <div className="text-xs text-slate-400 pb-2">
                  Total: <span className="text-white font-mono font-bold">₹{(parseFloat(buyPrice || '0') * parseInt(buyQuantity || '0')).toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 grid grid-cols-2 gap-4">
            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Net P&L</div>
                <div className={`text-2xl font-mono font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(0)}
                </div>
            </div>
            
            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Win Rate</div>
                <div className="text-2xl font-mono font-bold text-amber-400">{winRate}%</div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Best Trade</div>
                <div className="text-lg font-mono font-bold text-emerald-400">+₹{bestTrade.toFixed(0)}</div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col justify-center">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Worst Trade</div>
                <div className="text-lg font-mono font-bold text-rose-400">₹{worstTrade.toFixed(0)}</div>
            </div>
        </div>

        {/* 2. Equity Chart */}
        <div className="lg:col-span-2 glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/30">
             <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Account Growth Curve</h3>
             </div>
             <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={equityData}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" hide />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                        itemStyle={{ color: '#10b981' }}
                        formatter={(val: number) => [`₹${val.toFixed(0)}`, 'Equity']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorEquity)" strokeWidth={2} />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
        </div>
      </div>

      {/* 3. Active Positions (Table) */}
      <div className="glass-panel rounded-xl overflow-hidden border border-slate-700">
        <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" /> Active Positions
            <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full">{activeTrades.length}</span>
          </h3>
        </div>
        
        {activeTrades.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
             <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-slate-600" />
             </div>
             <p className="text-slate-400 font-medium">No active positions.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {activeTrades.map(trade => {
              const currentPrice = livePrices[trade.symbol] || trade.entryPrice;
              const pnl = (currentPrice - trade.entryPrice) * trade.quantity;
              const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
              const progress = getProgress(currentPrice, trade.entryPrice, trade.target);
              const isClosing = closingTradeId === trade._id;
              
              let suggestion = 'HOLD';
              let suggestionColor = 'bg-slate-700 text-slate-300';
              
              if (trade.target && currentPrice >= trade.target) {
                 suggestion = 'TAKE PROFIT';
                 suggestionColor = 'bg-emerald-500 text-white animate-pulse shadow-lg shadow-emerald-500/20';
              } else if (trade.stopLoss && currentPrice <= trade.stopLoss) {
                 suggestion = 'STOP LOSS';
                 suggestionColor = 'bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/20';
              }

              return (
                <div key={trade._id} className="p-4 hover:bg-slate-800/30 transition-colors group">
                   <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                      
                      <div className="w-full md:w-1/4">
                          <div className="flex items-center justify-between md:justify-start gap-3 mb-1">
                             <span className="font-black text-lg text-white">{trade.symbol}</span>
                             <span className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${suggestionColor}`}>
                                {suggestion}
                             </span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2">
                             <span className="bg-slate-800 px-1.5 py-0.5 rounded">{trade.strategy || 'MANUAL'}</span>
                             <span>{trade.quantity} Qty</span>
                          </div>
                      </div>

                      <div className="w-full md:flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 items-center">
                          <div>
                             <div className="text-[10px] text-slate-500 uppercase font-bold">Entry</div>
                             <div className="font-mono text-sm text-slate-300">₹{trade.entryPrice.toFixed(2)}</div>
                          </div>
                          <div>
                             <div className="text-[10px] text-slate-500 uppercase font-bold">Live Price</div>
                             <div className={`font-mono text-sm font-bold flex items-center gap-1 ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ₹{currentPrice.toFixed(2)}
                                {pnl >= 0 ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                             </div>
                          </div>
                          
                          <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
                             <div className="text-[10px] text-slate-500 uppercase font-bold">Unrealized P&L</div>
                             <div className={`font-mono text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(0)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                             </div>
                          </div>

                          <div className="w-full">
                             <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                                <span>Target</span>
                                <span className={progress >= 100 ? 'text-emerald-400 font-bold' : ''}>{progress.toFixed(0)}%</span>
                             </div>
                             <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-emerald-400' : pnl >= 0 ? 'bg-blue-500' : 'bg-slate-600'}`} 
                                  style={{ width: `${progress}%` }} 
                                />
                             </div>
                          </div>
                      </div>

                      <div className="w-full md:w-auto flex items-center justify-end gap-2 mt-2 md:mt-0">
                          {!brokerState.angel && (
                            <div className="relative group/edit">
                              <input 
                                type="number" 
                                placeholder={currentPrice.toFixed(2)}
                                className="w-24 bg-slate-900 border border-slate-600 rounded-l px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500 font-mono text-right"
                                value={exitPriceInputs[trade._id] || ''}
                                onChange={(e) => handleExitPriceChange(trade._id, e.target.value)}
                              />
                            </div>
                          )}
                          
                          <button 
                              onClick={() => handleCloseClick(trade)}
                              disabled={isClosing}
                              className={`bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-r text-xs font-bold transition-all border-l border-emerald-700 flex items-center gap-2 ${brokerState.angel ? 'rounded-l pl-4' : ''}`}
                            >
                              {isClosing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              {isClosing ? 'Closing...' : 'Exit Trade'}
                           </button>
                      </div>
                   </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ✅ REMOVED: Trade History Section (Now lives in TradeHistory.tsx) */}
    </div>
  );
};

export default PaperTradingDashboard;