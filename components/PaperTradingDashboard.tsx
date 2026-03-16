import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BrokerState } from '../types';
import { AngelOne } from '../services/angel';
import { DB_SERVICE } from '../services/db';
import {
  Clock, ArrowUpRight, ArrowDownRight, TrendingUp, Loader2, Zap,
  Trophy, RefreshCw, Search, Plus, ShoppingCart, X,
  Ban, BarChart3, CheckCircle2, XCircle, Minus
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ━━━━━━━━━━━━━━━ Constants ━━━━━━━━━━━━━━━
const DEFAULT_CAPITAL = 1000000; // ₹10,00,000

const formatINR = (amount: number, decimals = 0): string =>
  amount.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });

interface PaperTradingDashboardProps {
  brokerState: BrokerState;
  isVisible?: boolean;
}

const PaperTradingDashboard: React.FC<PaperTradingDashboardProps> = ({ brokerState, isVisible = true }) => {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [livePrices, setLivePrices] = useState<{ [key: string]: number }>({});
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  const [capital, setCapital] = useState<number>(DEFAULT_CAPITAL);

  // Buy UI
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
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [priceSource, setPriceSource] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // Cleanup
  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);

  // ━━━━━━━━━━━━━━━ SEARCH (debounced 300ms) ━━━━━━━━━━━━━━━
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (selectedStock) { setSelectedStock(null); setBuyPrice(''); setPriceSource(''); }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await DB_SERVICE.searchStocks(q);
        setSearchResults(Array.isArray(results) ? results.slice(0, 8) : []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
  }, [selectedStock]);

  // ━━━━━━━━━━━━━━━ SELECT STOCK: Fast price via yfinance then broker ━━━━━━━━━━━━━━━
  const selectStock = useCallback(async (stock: any) => {
    const sym = (stock.symbol || stock.tradingsymbol || '').replace(/-EQ$/, '');
    setSelectedStock(stock);
    setSearchQuery(sym);
    setSearchResults([]);
    setFetchingPrice(true);
    setPriceSource('');
    setBuyPrice('');

    // 1. FAST: yfinance quotes (no broker, ~500ms)
    try {
      const quotes: any = await DB_SERVICE.getQuotes([sym]);
      const q = quotes?.[sym] || quotes?.[`${sym}-EQ`] || quotes?.[`${sym}.NS`];
      if (q?.price && q.price > 0) {
        setBuyPrice(q.price.toFixed(2));
        setPriceSource('delayed');
        setFetchingPrice(false);
      }
    } catch { /* fallback to broker */ }

    // 2. UPGRADE: Angel One LTP (if connected)
    if (brokerState.angel) {
      try {
        const angel = new AngelOne(brokerState.angel);
        const ltpData = await angel.getLtpValue("NSE", '', sym);
        if (ltpData && ltpData.price > 0) {
          setBuyPrice(ltpData.price.toFixed(2));
          setPriceSource('live');
        }
      } catch { /* keep yfinance price */ }
    }

    setFetchingPrice(false);
  }, [brokerState.angel]);

  // ━━━━━━━━━━━━━━━ BUY SUBMIT ━━━━━━━━━━━━━━━
  const handleBuySubmit = async () => {
    if (!selectedStock) return;
    const qty = parseInt(buyQuantity);
    const price = parseFloat(buyPrice);
    if (!qty || qty <= 0 || !price || price <= 0) { showToast('error', 'Enter valid quantity and price'); return; }
    const orderValue = price * qty;
    if (orderValue > capital) { showToast('error', `Need ₹${formatINR(orderValue)} — only ₹${formatINR(capital)} available`); return; }

    setSubmittingBuy(true);
    try {
      const sym = (selectedStock.symbol || selectedStock.tradingsymbol || '').replace(/-EQ$/, '');
      await DB_SERVICE.saveTrade({
        symbol: sym, entryPrice: price, quantity: qty,
        type: 'SWING', source: 'PAPER', status: 'OPEN', strategy: 'MANUAL',
        target: buyTarget ? parseFloat(buyTarget) : undefined,
        stopLoss: buyStopLoss ? parseFloat(buyStopLoss) : undefined,
        entryDate: new Date(), notes: 'Paper Trade via Quick Buy',
      });
      showToast('success', `Bought ${qty} ${sym} @ ₹${price}`);
      setShowBuyForm(false); setSelectedStock(null); setSearchQuery('');
      setBuyQuantity('1'); setBuyPrice(''); setBuyTarget(''); setBuyStopLoss(''); setPriceSource('');
      fetchPortfolio();
    } catch (e) { console.error(e); showToast('error', 'Trade failed'); }
    setSubmittingBuy(false);
  };

  // ━━━━━━━━━━━━━━━ FETCH PORTFOLIO ━━━━━━━━━━━━━━━
  const fetchPortfolio = async () => {
    try {
      const allTrades = (await DB_SERVICE.getTrades() as any[]) || [];
      const paperTrades = allTrades.filter((t: any) => t.source === 'PAPER').reverse();
      setTrades(paperTrades);

      let computed = DEFAULT_CAPITAL;
      for (const t of paperTrades) {
        const ov = (t.entryPrice || 0) * (t.quantity || 0);
        if (t.status === 'OPEN' || t.status === 'EXITING') computed -= ov;
        else if (t.status === 'CLOSED') computed += (t.pnl || 0);
      }
      setCapital(computed);
    } catch (e) { console.error("Portfolio load failed:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isVisible) return;
    fetchPortfolio();
    const id = setInterval(fetchPortfolio, 15000);
    return () => clearInterval(id);
  }, [isVisible]);

  const activeTrades = trades.filter(t => t.status === 'OPEN' || t.status === 'EXITING');
  const closedTrades = trades.filter(t => t.status === 'CLOSED');

  // ━━━━━━━━━━━━━━━ LIVE PRICE ENGINE (broker + yfinance fallback) ━━━━━━━━━━━━━━━
  useEffect(() => {
    if (activeTrades.length === 0 || !isVisible) return;

    const fetchPrices = async () => {
      const symbols: string[] = Array.from(new Set<string>(activeTrades.map((t: any) => t.symbol)));

      if (brokerState.angel) {
        const angel = new AngelOne(brokerState.angel);
        const results = await Promise.allSettled(
          symbols.map(async sym => {
            const ltp = await angel.getLtpValue("NSE", '', sym);
            return (ltp?.price && ltp.price > 0) ? { sym, price: ltp.price } : null;
          })
        );
        const prices: Record<string, number> = {};
        results.forEach(r => { if (r.status === 'fulfilled' && r.value) prices[r.value.sym] = r.value.price; });
        if (Object.keys(prices).length > 0) { setLivePrices(prev => ({ ...prev, ...prices })); return; }
      }

      // Fallback: yfinance batch quotes
      try {
        const quotes: any = await DB_SERVICE.getQuotes(symbols);
        if (quotes && typeof quotes === 'object') {
          const prices: Record<string, number> = {};
          for (const sym of symbols) {
            const q = quotes[sym] || quotes[`${sym}-EQ`];
            if (q?.price && q.price > 0) prices[sym] = q.price;
          }
          if (Object.keys(prices).length > 0) setLivePrices(prev => ({ ...prev, ...prices }));
        }
      } catch { /* yfinance fallback failed */ }
    };

    fetchPrices();
    const id = setInterval(fetchPrices, brokerState.angel ? 5000 : 30000);
    return () => clearInterval(id);
  }, [activeTrades.length, brokerState.angel, isVisible]);

  // ━━━━━━━━━━━━━━━ CALCULATIONS ━━━━━━━━━━━━━━━
  const totalRealizedPnL = closedTrades.reduce((a, t) => a + (t.pnl || 0), 0);
  const totalUnrealizedPnL = activeTrades.reduce((a, t) => {
    const c = livePrices[t.symbol] || t.entryPrice;
    return a + ((c - t.entryPrice) * t.quantity);
  }, 0);
  const totalPnL = totalRealizedPnL + totalUnrealizedPnL;
  const winCount = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? Math.round((winCount / closedTrades.length) * 100) : 0;
  const bestTrade = closedTrades.reduce((m, t) => Math.max(m, t.pnl || 0), 0);
  const worstTrade = closedTrades.reduce((m, t) => Math.min(m, t.pnl || 0), 0);
  const deployedAmount = activeTrades.reduce((s, t) => s + (t.entryPrice * t.quantity), 0);
  const portfolioValue = DEFAULT_CAPITAL + totalRealizedPnL + totalUnrealizedPnL;
  const portfolioReturn = ((portfolioValue - DEFAULT_CAPITAL) / DEFAULT_CAPITAL) * 100;

  const equityData = useMemo(() => {
    let bal = DEFAULT_CAPITAL;
    const d = [{ name: 'Start', value: bal }];
    [...closedTrades].sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime())
      .forEach((t, i) => { bal += (t.pnl || 0); d.push({ name: `#${i + 1}`, value: bal }); });
    if (activeTrades.length > 0) d.push({ name: 'Now', value: bal + totalUnrealizedPnL });
    return d;
  }, [closedTrades.length, totalUnrealizedPnL]);

  // ━━━━━━━━━━━━━━━ EXIT: Instant (uses cached price) ━━━━━━━━━━━━━━━
  const handleExit = async (trade: any) => {
    const exitPrice = livePrices[trade.symbol] || trade.entryPrice;
    const pnl = (exitPrice - trade.entryPrice) * trade.quantity;

    if (!confirm(`Exit ${trade.symbol}?\n\nEntry: ₹${trade.entryPrice.toFixed(2)}\nExit: ₹${exitPrice.toFixed(2)}\nP&L: ${pnl >= 0 ? '+' : ''}₹${formatINR(pnl, 2)}\n\nConfirm?`)) return;

    setClosingTradeId(trade._id);
    try {
      await DB_SERVICE.updateTrade(trade._id, {
        status: 'CLOSED', exitPrice, exitDate: new Date(), pnl,
        notes: `Closed at ₹${exitPrice.toFixed(2)}`
      });
      showToast('success', `Exited ${trade.symbol} — P&L: ${pnl >= 0 ? '+' : ''}₹${formatINR(pnl, 2)}`);
      fetchPortfolio();
    } catch { showToast('error', 'Failed to close trade'); }
    setClosingTradeId(null);
  };

  const getProgress = (c: number, e: number, t: number) => (!t || t === e) ? 0 : Math.max(0, Math.min(100, ((c - e) / (t - e)) * 100));

  // ━━━━━━━━━━━━━━━ LOADING ━━━━━━━━━━━━━━━
  if (loading && trades.length === 0) return (
    <div className="p-20 text-center flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      <span className="text-slate-500 text-sm">Loading Portfolio...</span>
    </div>
  );

  // ━━━━━━━━━━━━━━━ RENDER ━━━━━━━━━━━━━━━
  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-500">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-right duration-300 ${
          toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200' : 'bg-rose-900/90 border-rose-500/50 text-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-rose-400" />}
          <span className="text-sm font-medium">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy className="text-yellow-400 w-6 h-6" /> Paper Trading
          </h1>
          <p className="text-[10px] text-slate-500 mt-0.5">Simulated portfolio &bull; &#8377;{formatINR(DEFAULT_CAPITAL)} capital</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowBuyForm(!showBuyForm)}
            className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg border transition-all ${
              showBuyForm ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'}`}>
            {showBuyForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showBuyForm ? 'CANCEL' : 'NEW TRADE'}
          </button>
          <span className={`text-[10px] px-2 py-1.5 rounded-lg flex items-center gap-1 border ${
            brokerState.angel ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
            {brokerState.angel ? <Zap className="w-3 h-3 fill-current" /> : <BarChart3 className="w-3 h-3" />}
            {brokerState.angel ? 'LIVE' : 'DELAYED'}
          </span>
          <button onClick={() => fetchPortfolio()} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg border border-slate-700">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* PORTFOLIO SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Portfolio Value" value={`₹${formatINR(portfolioValue)}`} sub={`${portfolioReturn >= 0 ? '▲' : '▼'} ${portfolioReturn.toFixed(2)}%`}
          color={portfolioValue >= DEFAULT_CAPITAL ? 'emerald' : 'rose'} />
        <SummaryCard label="Available Cash" value={`₹${formatINR(Math.max(0, capital))}`} sub={`${((capital / DEFAULT_CAPITAL) * 100).toFixed(0)}% free`}
          color={capital > DEFAULT_CAPITAL * 0.2 ? 'white' : capital > 0 ? 'amber' : 'rose'} />
        <SummaryCard label="Invested" value={`₹${formatINR(deployedAmount)}`} sub={`${activeTrades.length} position${activeTrades.length !== 1 ? 's' : ''}`} color="blue" />
        <SummaryCard label="Total P&L" value={`${totalPnL >= 0 ? '+' : ''}₹${formatINR(totalPnL)}`} sub={`Real: ${totalRealizedPnL >= 0 ? '+' : ''}₹${formatINR(totalRealizedPnL)}`}
          color={totalPnL >= 0 ? 'emerald' : 'rose'} highlight />
        <SummaryCard label="Win Rate" value={`${winRate}%`} sub={`${winCount}W / ${closedTrades.length - winCount}L`}
          color={winRate >= 50 ? 'emerald' : winRate > 0 ? 'amber' : 'slate'} />
      </div>

      {/* BUY FORM */}
      {showBuyForm && (
        <div className="glass-panel rounded-xl border border-emerald-500/30 bg-slate-800/90 p-4 animate-in slide-in-from-top duration-300 relative z-50">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Search */}
            <div className="md:col-span-3 relative">
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Stock Symbol</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input type="text" placeholder="RELIANCE, TCS, INFY..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} autoFocus
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-8 pr-8 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 font-mono" />
                {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-blue-400" />}
                {selectedStock && !searching && <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400" />}
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg shadow-2xl max-h-52 overflow-y-auto">
                  {searchResults.map((s, i) => (
                    <button key={i} onClick={() => selectStock(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-500/10 text-sm flex justify-between items-center border-b border-slate-800/50 last:border-b-0 transition-colors">
                      <span className="font-mono font-bold text-white">{(s.symbol || s.tradingsymbol || '').replace(/-EQ$/, '')}</span>
                      <span className="text-[10px] text-slate-500 truncate ml-2 max-w-[120px]">{s.name || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Price */}
            <div className="md:col-span-2">
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 flex items-center gap-1.5">
                Price (&#8377;)
                {priceSource && <span className={`text-[9px] px-1.5 py-0.5 rounded ${priceSource === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  &#9679; {priceSource.toUpperCase()}
                </span>}
              </label>
              <div className="relative">
                <input type="number" step="0.05" placeholder={fetchingPrice ? "Loading..." : "Enter price"} value={buyPrice}
                  onChange={(e) => { setBuyPrice(e.target.value); setPriceSource('manual'); }} disabled={fetchingPrice}
                  className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500 ${fetchingPrice ? 'border-blue-500/50' : buyPrice ? 'border-emerald-500/50' : 'border-slate-600'}`} />
                {fetchingPrice && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-blue-400" />}
              </div>
            </div>

            {/* Qty */}
            <div className="md:col-span-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Qty</label>
              <input type="number" min="1" value={buyQuantity} onChange={(e) => setBuyQuantity(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500" />
            </div>

            {/* Target */}
            <div className="md:col-span-2">
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Target (&#8377;)</label>
              <input type="number" step="0.05" placeholder="Optional" value={buyTarget} onChange={(e) => setBuyTarget(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500" />
            </div>

            {/* Stop Loss */}
            <div className="md:col-span-2">
              <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Stop Loss (&#8377;)</label>
              <input type="number" step="0.05" placeholder="Optional" value={buyStopLoss} onChange={(e) => setBuyStopLoss(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-emerald-500" />
            </div>

            {/* Submit */}
            <div className="md:col-span-2">
              {(() => {
                const ov = (parseFloat(buyPrice || '0') * parseInt(buyQuantity || '0'));
                const overBudget = ov > 0 && ov > capital;
                return (
                  <div className="space-y-1">
                    {ov > 0 && <div className={`text-[10px] font-mono text-right ${overBudget ? 'text-rose-400' : 'text-slate-400'}`}>
                      &#8377;{formatINR(ov)} {overBudget ? '⚠ exceeds funds' : `/ ₹${formatINR(capital)} avail`}
                    </div>}
                    <button onClick={handleBuySubmit} disabled={!selectedStock || submittingBuy || fetchingPrice || overBudget || !buyPrice}
                      className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                        overBudget ? 'bg-rose-700/50 text-rose-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white shadow-lg shadow-emerald-500/10'
                      }`}>
                      {submittingBuy ? <Loader2 className="w-4 h-4 animate-spin" /> : overBudget ? <Ban className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                      {overBudget ? 'NO FUNDS' : submittingBuy ? 'PLACING...' : 'BUY'}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* EQUITY CHART */}
      {equityData.length > 1 && (
        <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/30">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Equity Curve</h3>
            <span className={`text-[10px] font-mono ml-auto ${portfolioReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%
            </span>
          </div>
          <div className="h-[130px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={totalPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={totalPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: number) => [`₹${formatINR(val)}`, 'Value']} />
                <Area type="monotone" dataKey="value" stroke={totalPnL >= 0 ? '#10b981' : '#ef4444'} fillOpacity={1} fill="url(#eqG)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ACTIVE POSITIONS */}
      <div className="glass-panel rounded-xl overflow-hidden border border-slate-700">
        <div className="p-3 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" /> Open Positions
            {activeTrades.length > 0 && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full">{activeTrades.length}</span>}
          </h3>
          {totalUnrealizedPnL !== 0 && (
            <span className={`text-xs font-mono font-bold ${totalUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalUnrealizedPnL >= 0 ? '+' : ''}₹{formatINR(totalUnrealizedPnL)}
            </span>
          )}
        </div>

        {activeTrades.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center">
            <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center mb-3">
              <ShoppingCart className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm font-medium">No open positions</p>
            <p className="text-slate-600 text-xs mt-1">Click &quot;New Trade&quot; to start</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {activeTrades.map(trade => {
              const curPrice = livePrices[trade.symbol] || trade.entryPrice;
              const hasLive = !!livePrices[trade.symbol];
              const pnl = (curPrice - trade.entryPrice) * trade.quantity;
              const pnlPct = ((curPrice - trade.entryPrice) / trade.entryPrice) * 100;
              const prog = getProgress(curPrice, trade.entryPrice, trade.target);
              const isClosing = closingTradeId === trade._id;

              let signal = '';
              let signalCls = '';
              if (trade.target && curPrice >= trade.target) { signal = 'TARGET'; signalCls = 'bg-emerald-500 text-white'; }
              else if (trade.stopLoss && curPrice <= trade.stopLoss) { signal = 'SL HIT'; signalCls = 'bg-rose-500 text-white'; }

              return (
                <div key={trade._id} className="p-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex flex-col md:flex-row gap-3 items-center">
                    {/* Symbol */}
                    <div className="w-full md:w-[150px] flex-shrink-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-base text-white">{trade.symbol}</span>
                        {signal && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse ${signalCls}`}>{signal}</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                        <span>{trade.quantity} qty</span>
                        <Minus className="w-2 h-2" />
                        <span>{trade.strategy || 'MANUAL'}</span>
                      </div>
                    </div>

                    {/* Prices */}
                    <div className="w-full md:flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Entry</div>
                        <div className="font-mono text-sm text-slate-300">₹{trade.entryPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                          LTP {hasLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />}
                        </div>
                        <div className={`font-mono text-sm font-bold flex items-center gap-1 ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ₹{curPrice.toFixed(2)}
                          {pnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        </div>
                      </div>
                      <div className={`p-2 rounded-lg ${pnl >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">P&amp;L</div>
                        <div className={`font-mono text-sm font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pnl >= 0 ? '+' : ''}₹{formatINR(pnl)}
                          <span className="text-[10px] ml-1 opacity-70">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                        </div>
                      </div>
                    </div>

                    {/* Target + Exit */}
                    <div className="w-full md:w-[200px] flex items-center gap-3 flex-shrink-0">
                      {trade.target ? (
                        <div className="flex-1">
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>₹{trade.entryPrice.toFixed(0)}</span>
                            <span>₹{trade.target.toFixed(0)}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${prog >= 100 ? 'bg-emerald-400' : pnl >= 0 ? 'bg-blue-500' : 'bg-rose-500/60'}`}
                              style={{ width: `${prog}%` }} />
                          </div>
                        </div>
                      ) : <div className="flex-1 text-[10px] text-slate-600 italic">No target</div>}

                      <button onClick={() => handleExit(trade)} disabled={isClosing}
                        className="px-4 py-2 rounded-lg text-xs font-bold transition-all bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-600 hover:border-rose-500 flex items-center gap-1.5 flex-shrink-0">
                        {isClosing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        {isClosing ? 'CLOSING' : 'EXIT'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CLOSED TRADES */}
      {closedTrades.length > 0 && (
        <div className="glass-panel rounded-xl overflow-hidden border border-slate-700">
          <div className="p-3 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-slate-400" /> Closed Trades
              <span className="text-[10px] text-slate-500 px-2 py-0.5 bg-slate-800 rounded-full">{closedTrades.length}</span>
            </h3>
            <div className="flex items-center gap-4 text-[10px]">
              <span className="text-emerald-400 font-mono">Best: +₹{formatINR(bestTrade)}</span>
              <span className="text-rose-400 font-mono">Worst: ₹{formatINR(worstTrade)}</span>
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-slate-800/50">
            {closedTrades.slice(0, 20).map(trade => (
              <div key={trade._id} className="px-4 py-2.5 flex items-center justify-between text-sm hover:bg-slate-800/20 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${(trade.pnl || 0) >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span className="font-bold text-white w-[90px]">{trade.symbol}</span>
                  <span className="text-slate-500 font-mono text-xs">₹{trade.entryPrice?.toFixed(2)} &rarr; ₹{trade.exitPrice?.toFixed(2)}</span>
                  <span className="text-slate-600 text-[10px]">{trade.quantity}qty</span>
                </div>
                <span className={`font-mono font-bold ${(trade.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(trade.pnl || 0) >= 0 ? '+' : ''}₹{formatINR(trade.pnl || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable Summary Card
const colorMap: Record<string, string> = {
  emerald: 'text-emerald-400', rose: 'text-rose-400', blue: 'text-blue-400',
  amber: 'text-amber-400', white: 'text-white', slate: 'text-slate-400',
};

const SummaryCard: React.FC<{ label: string; value: string; sub: string; color: string; highlight?: boolean }> =
  ({ label, value, sub, color, highlight }) => (
  <div className={`glass-panel p-3 rounded-xl border ${highlight ? (color === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5') : 'border-slate-700 bg-slate-800/50'}`}>
    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">{label}</div>
    <div className={`text-lg font-mono font-bold ${colorMap[color] || 'text-white'}`}>{value}</div>
    <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
  </div>
);

export default PaperTradingDashboard;
