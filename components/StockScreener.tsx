import React, { useState, useEffect, useCallback } from 'react';
import { Filter, Search, ChevronUp, ChevronDown, Loader2, ArrowUpDown, X, Gem, Rocket, Banknote, Shield, TrendingDown, TrendingUp, Crown, Zap, Sparkles, RefreshCw, ChevronLeft, ChevronRight, ExternalLink, PieChart, Activity, Target } from 'lucide-react';
import { secureGet, securePost } from '../services/api';

interface StockKPI {
  symbol: string; name: string; sector: string; industry: string;
  price: number; change_pct: number; volume: number; avg_volume: number;
  market_cap: number; pe_ratio: number; pb_ratio: number; ev_ebitda: number;
  roe: number; roce: number; profit_margin: number; operating_margin: number;
  revenue_growth: number; earnings_growth: number; eps: number;
  dividend_yield: number; book_value: number; debt_to_equity: number; current_ratio: number;
  week_52_high: number; week_52_low: number; from_52w_high_pct: number;
  promoter_holding: number; beta: number;
}

interface Preset { label: string; desc: string; filters: Record<string, any>; icon: string; }

const COLUMNS = [
  { key: 'symbol', label: 'Stock', w: 'min-w-[140px]', fixed: true },
  { key: 'sector', label: 'Sector', w: 'min-w-[90px]' },
  { key: 'price', label: 'Price', w: 'w-20' },
  { key: 'change_pct', label: 'Chg%', w: 'w-16' },
  { key: 'market_cap', label: 'MCap (Cr)', w: 'w-24' },
  { key: 'pe_ratio', label: 'P/E', w: 'w-16' },
  { key: 'pb_ratio', label: 'P/B', w: 'w-16' },
  { key: 'roe', label: 'ROE%', w: 'w-16' },
  { key: 'roce', label: 'ROCE%', w: 'w-16' },
  { key: 'debt_to_equity', label: 'D/E', w: 'w-16' },
  { key: 'revenue_growth', label: 'Rev G%', w: 'w-18' },
  { key: 'earnings_growth', label: 'Earn G%', w: 'w-18' },
  { key: 'dividend_yield', label: 'Div%', w: 'w-16' },
  { key: 'profit_margin', label: 'NPM%', w: 'w-16' },
  { key: 'volume', label: 'Volume', w: 'w-20' },
  { key: 'from_52w_high_pct', label: 'From 52H%', w: 'w-20' },
  { key: 'eps', label: 'EPS', w: 'w-16' },
  { key: 'beta', label: 'Beta', w: 'w-16' },
];

const PRESET_ICONS: Record<string, React.ReactNode> = {
  gem: <Gem className="w-4 h-4" />, rocket: <Rocket className="w-4 h-4" />,
  banknote: <Banknote className="w-4 h-4" />, shield: <Shield className="w-4 h-4" />,
  'arrow-down': <TrendingDown className="w-4 h-4" />, crown: <Crown className="w-4 h-4" />,
  zap: <Zap className="w-4 h-4" />, sparkles: <Sparkles className="w-4 h-4" />,
};

const fmt = (n: number) => n >= 100000 ? `${(n/100000).toFixed(1)}L` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : n.toLocaleString('en-IN');

const StockScreener: React.FC = () => {
  // ── Stale-while-revalidate: load cached data instantly ──
  const loadCachedStocks = (): StockKPI[] => {
    try {
      const cached = localStorage.getItem('screener_stocks');
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 30 * 60 * 1000) return data; // 30 min TTL
      }
    } catch {}
    return [];
  };
  const loadCachedMeta = () => {
    try {
      const cached = localStorage.getItem('screener_meta');
      if (cached) return JSON.parse(cached);
    } catch {}
    return { total: 0, totalPages: 1 };
  };

  const cachedStocks = loadCachedStocks();
  const cachedMeta = loadCachedMeta();

  const [stocks, setStocks] = useState<StockKPI[]>(cachedStocks);
  const [loading, setLoading] = useState(cachedStocks.length === 0);  // Only show loading if no cache
  const [refreshing, setRefreshing] = useState(false);  // Background refresh indicator
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(cachedMeta.totalPages);
  const [total, setTotal] = useState(cachedMeta.total);
  const [sortBy, setSortBy] = useState('market_cap');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [search, setSearch] = useState('');
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [activePreset, setActivePreset] = useState<string|null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});
  const [error, setError] = useState<string|null>(null);
  const [selectedStock, setSelectedStock] = useState<string|null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<'screener'|'breakout'>('screener');
  const [breakouts, setBreakouts] = useState<any[]>([]);
  const [breakoutLoading, setBreakoutLoading] = useState(false);
  const [taData, setTaData] = useState<any>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(cachedStocks.length > 0);

  // Quick filters
  const [peMax, setPeMax] = useState('');
  const [roeMin, setRoeMin] = useState('');
  const [mcapMin, setMcapMin] = useState('');

  const fetchStocks = useCallback(async (filters?: Record<string, any>, isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      let res;
      if (filters && Object.keys(filters).length > 0) {
        res = await securePost('/screener/filter', { filters, sort_by: sortBy, sort_dir: sortDir });
        setStocks(res.stocks || []); setTotal(res.total || 0); setTotalPages(1);
      } else {
        res = await secureGet(`/screener/stocks?page=${page}&per_page=50&sort_by=${sortBy}&sort_dir=${sortDir}`);
        setStocks(res.stocks || []); setTotal(res.total || 0); setTotalPages(res.total_pages || 1);
        // Cache for next visit
        try {
          localStorage.setItem('screener_stocks', JSON.stringify({ data: res.stocks || [], ts: Date.now() }));
          localStorage.setItem('screener_meta', JSON.stringify({ total: res.total || 0, totalPages: res.total_pages || 1 }));
        } catch {}
      }
      setInitialLoadDone(true);
    } catch (e: any) { setError(e?.message || 'Failed to load'); }
    setLoading(false); setRefreshing(false);
  }, [page, sortBy, sortDir]);

  // On mount: if we have cached data, still refresh in background
  useEffect(() => {
    if (cachedStocks.length > 0) {
      fetchStocks(undefined, true); // Background refresh
    } else {
      fetchStocks(); // Full loading
    }
    secureGet('/screener/presets').then(r => setPresets(r.presets || {})).catch(() => {});
  }, []);

  // On sort/page change
  useEffect(() => {
    if (initialLoadDone) fetchStocks(Object.keys(activeFilters).length > 0 ? activeFilters : undefined);
  }, [page, sortBy, sortDir]);

  const handleSort = (key: string) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const applyQuickFilters = () => {
    const f: Record<string, any> = {};
    if (peMax) f.pe_ratio = { max: parseFloat(peMax) };
    if (roeMin) f.roe = { min: parseFloat(roeMin) };
    if (mcapMin) f.market_cap = { min: parseFloat(mcapMin) };
    setActiveFilters(f); setActivePreset(null); setPage(1);
    fetchStocks(Object.keys(f).length > 0 ? f : undefined);
  };

  const applyPreset = (key: string) => {
    const p = presets[key];
    if (!p) return;
    setActivePreset(key); setActiveFilters(p.filters); setPage(1);
    setPeMax(''); setRoeMin(''); setMcapMin('');
    fetchStocks(p.filters);
  };

  const clearFilters = () => {
    setActiveFilters({}); setActivePreset(null); setPeMax(''); setRoeMin(''); setMcapMin('');
    setPage(1); fetchStocks();
  };

  const openDetail = async (symbol: string) => {
    setSelectedStock(symbol); setDetail(null); setDetailLoading(true); setTaData(null);
    try {
      const [res, ta] = await Promise.all([
        secureGet(`/screener/stock/${symbol}`),
        secureGet(`/screener/ta/${symbol}`).catch(() => null),
      ]);
      setDetail(res);
      setTaData(ta);
    } catch (e: any) { setDetail({ error: e?.message || 'Failed to load' }); }
    setDetailLoading(false);
  };

  const fetchBreakouts = async (forceRefresh = false) => {
    // Load cached breakouts instantly
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem('screener_breakouts');
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < 10 * 60 * 1000) { // 10 min TTL
            setBreakouts(data);
            // Still refresh in background
            setBreakoutLoading(false);
            secureGet('/screener/breakout-scan').then(res => {
              const candidates = res.breakout_candidates || [];
              setBreakouts(candidates);
              try { localStorage.setItem('screener_breakouts', JSON.stringify({ data: candidates, ts: Date.now() })); } catch {}
            }).catch(() => {});
            return;
          }
        }
      } catch {}
    }

    setBreakoutLoading(true);
    try {
      const res = await secureGet('/screener/breakout-scan');
      const candidates = res.breakout_candidates || [];
      setBreakouts(candidates);
      try { localStorage.setItem('screener_breakouts', JSON.stringify({ data: candidates, ts: Date.now() })); } catch {}
    } catch (e: any) { setError(e?.message || 'Breakout scan failed'); }
    setBreakoutLoading(false);
  };

  const filtered = search
    ? stocks.filter(s => {
        const q = search.toLowerCase().replace(/\s+/g, '');
        const sym = s.symbol.toLowerCase();
        const name = (s.name || '').toLowerCase().replace(/\s+/g, '');
        const sector = (s.sector || '').toLowerCase();
        return sym.includes(q) || name.includes(q) || sector.includes(search.toLowerCase());
      })
    : stocks;

  const cellColor = (key: string, val: number) => {
    if (['change_pct','roe','roce','revenue_growth','earnings_growth','profit_margin','dividend_yield'].includes(key))
      return val > 0 ? 'text-emerald-400' : val < 0 ? 'text-rose-400' : 'text-slate-400';
    if (key === 'from_52w_high_pct') return val < 5 ? 'text-emerald-400' : val > 30 ? 'text-rose-400' : 'text-amber-400';
    if (key === 'debt_to_equity') return val < 0.5 ? 'text-emerald-400' : val > 1.5 ? 'text-rose-400' : 'text-amber-400';
    if (key === 'pe_ratio') return val > 0 && val < 15 ? 'text-emerald-400' : val > 40 ? 'text-rose-400' : 'text-white';
    return 'text-white';
  };

  const cellVal = (key: string, val: any) => {
    if (val === 0 || val === null || val === undefined) return '—';
    if (key === 'market_cap') return fmt(val);
    if (key === 'volume') return val >= 1e7 ? `${(val/1e7).toFixed(1)}Cr` : val >= 1e5 ? `${(val/1e5).toFixed(1)}L` : val >= 1000 ? `${(val/1000).toFixed(0)}K` : val.toString();
    if (key === 'price') return `₹${val.toLocaleString('en-IN')}`;
    if (key === 'change_pct') return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
    if (['roe','roce','profit_margin','revenue_growth','earnings_growth','dividend_yield','from_52w_high_pct','operating_margin'].includes(key)) return `${val.toFixed(1)}%`;
    if (typeof val === 'number') return val.toFixed(1);
    return val;
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Filter className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Stock Screener</h1>
            <p className="text-slate-400 text-xs flex items-center gap-1.5">
              {total} stocks • screener.in style KPIs
              {refreshing && (
                <span className="inline-flex items-center gap-1 text-blue-400 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[10px]">updating...</span>
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex bg-slate-800 rounded-xl p-0.5">
            <button onClick={() => setTab('screener')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'screener' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Filter className="w-3.5 h-3.5 inline mr-1" />Screener
            </button>
            <button onClick={() => { setTab('breakout'); if (breakouts.length === 0) fetchBreakouts(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'breakout' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Target className="w-3.5 h-3.5 inline mr-1" />Breakout Radar
            </button>
          </div>
          <button onClick={() => tab === 'breakout' ? fetchBreakouts(true) : fetchStocks(Object.keys(activeFilters).length > 0 ? activeFilters : undefined)} disabled={loading || breakoutLoading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${(loading || breakoutLoading) ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {tab === 'screener' && <>
      {/* Preset Screens */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {Object.entries(presets).map(([key, p]) => (
          <button key={key} onClick={() => applyPreset(key)}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
              activePreset === key ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:border-slate-600'
            }`}>
            {PRESET_ICONS[p.icon] || <Filter className="w-3.5 h-3.5" />} {p.label}
          </button>
        ))}
        {activePreset && (
          <button onClick={clearFilters} className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stock..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:border-blue-500 outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">PE Max</label>
          <input value={peMax} onChange={e => setPeMax(e.target.value)} placeholder="e.g. 25" type="number"
            className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">ROE Min %</label>
          <input value={roeMin} onChange={e => setRoeMin(e.target.value)} placeholder="e.g. 15" type="number"
            className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">MCap Min (Cr)</label>
          <input value={mcapMin} onChange={e => setMcapMin(e.target.value)} placeholder="e.g. 5000" type="number"
            className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none" />
        </div>
        <button onClick={applyQuickFilters}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-lg hover:from-blue-500 hover:to-indigo-500 transition-all">
          Apply
        </button>
        {Object.keys(activeFilters).length > 0 && !activePreset && (
          <button onClick={clearFilters} className="px-3 py-2 text-rose-400 text-sm hover:bg-rose-500/10 rounded-lg transition-colors">Clear</button>
        )}
      </div>

      {/* Error */}
      {error && <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-sm text-rose-300">{error}</div>}

      {/* Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {COLUMNS.map((col, ci) => (
                  <th key={col.key} className={`px-3 py-3 text-left ${col.w} ${ci === 0 ? 'sticky left-0 z-10 bg-slate-900' : ''}`}>
                    <button onClick={() => handleSort(col.key)} className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-slate-300 transition-colors">
                      {col.label}
                      {sortBy === col.key ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-blue-400" /> : <ChevronUp className="w-3 h-3 text-blue-400" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && stocks.length === 0 ? (
                /* ── Skeleton Shimmer Rows ── */
                Array.from({ length: 12 }).map((_, ri) => (
                  <tr key={ri} className="border-b border-slate-800/50 animate-pulse">
                    {COLUMNS.map((col, ci) => (
                      <td key={col.key} className={`px-3 py-3 ${ci === 0 ? 'sticky left-0 z-10 bg-slate-900' : ''}`}>
                        <div className={`h-4 rounded ${ci === 0 ? 'w-24' : 'w-16'} ${ri % 3 === 0 ? 'bg-slate-800' : ri % 3 === 1 ? 'bg-slate-800/70' : 'bg-slate-800/50'}`}
                          style={{ animationDelay: `${ri * 50 + ci * 30}ms` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="py-16 text-center text-slate-500">No stocks match your filters</td></tr>
              ) : (
                filtered.map((s, i) => (
                  <tr key={s.symbol} onClick={() => openDetail(s.symbol)} className={`border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-slate-900/30' : ''}`}>
                    {COLUMNS.map((col, ci) => (
                      <td key={col.key} className={`px-3 py-2.5 ${col.w} ${col.key === 'symbol' ? '' : 'font-mono text-xs'} ${ci === 0 ? 'sticky left-0 z-10 bg-slate-900' : ''}`}>
                        {col.key === 'symbol' ? (
                          <div>
                            <div className="text-white font-bold text-xs">{s.symbol}</div>
                            <div className="text-slate-500 text-[10px] truncate max-w-[120px]">{s.name}</div>
                          </div>
                        ) : col.key === 'sector' ? (
                          <span className="text-[10px] text-slate-400 truncate block max-w-[85px]">{(s as any).sector || '—'}</span>
                        ) : (
                          <span className={cellColor(col.key, (s as any)[col.key])}>{cellVal(col.key, (s as any)[col.key])}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <span className="text-xs text-slate-500">{total} stocks total</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 font-mono">Page {page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      </>}

      {/* ━━━ Breakout Radar Tab ━━━ */}
      {tab === 'breakout' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-5 h-5 text-orange-400" />
              <span className="text-sm font-bold text-orange-300">Breakout Radar</span>
            </div>
            <p className="text-xs text-slate-400">Scans 200+ NSE stocks via TradingView for breakout & reversal setups using RSI, SMA, MACD, ADX, Bollinger Bands, Pivot Points & 52W proximity.</p>
          </div>

          {breakoutLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 animate-pulse">
                  <div className="flex items-center justify-between mb-3">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="h-4 w-20 bg-slate-800 rounded" />
                        <div className="h-4 w-16 bg-orange-500/10 rounded" />
                      </div>
                      <div className="h-3 w-32 bg-slate-800/60 rounded" />
                      <div className="h-3 w-16 bg-slate-800/40 rounded" />
                    </div>
                    <div className="text-right space-y-1">
                      <div className="h-8 w-10 bg-slate-800 rounded ml-auto" />
                      <div className="h-2 w-8 bg-slate-800/50 rounded ml-auto" />
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full mb-3" />
                  <div className="flex gap-2 mb-2">
                    <div className="h-4 w-16 bg-emerald-500/5 rounded" />
                    <div className="h-4 w-12 bg-slate-800/50 rounded" />
                    <div className="h-4 w-14 bg-slate-800/50 rounded" />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <div className="h-4 w-24 bg-emerald-500/5 rounded" />
                    <div className="h-4 w-24 bg-rose-500/5 rounded" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-full bg-slate-800/40 rounded" />
                    <div className="h-3 w-4/5 bg-slate-800/30 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : breakouts.length === 0 ? (
            <div className="py-16 text-center">
              <Target className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500">Click Refresh to scan for breakouts</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {breakouts.map((b: any) => (
                <div key={b.symbol} onClick={() => openDetail(b.symbol)}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 hover:border-slate-600 transition-all cursor-pointer group">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{b.symbol}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          b.category === 'BREAKOUT' ? 'bg-orange-500/20 text-orange-400' :
                          b.category === 'REVERSAL' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>{b.category || 'BREAKOUT'}</span>
                      </div>
                      <div className="text-slate-500 text-[10px] truncate max-w-[180px]">{b.name || b.symbol}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-slate-300 text-xs font-mono">₹{b.price?.toLocaleString('en-IN')}</span>
                        {b.change_pct !== 0 && (
                          <span className={`text-[10px] font-bold ${b.change_pct > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {b.change_pct > 0 ? '+' : ''}{b.change_pct?.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-black ${b.breakout_score >= 60 ? 'text-emerald-400' : b.breakout_score >= 40 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {b.breakout_score}
                      </div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold">Score</div>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2">
                    <div className={`h-1.5 rounded-full transition-all ${b.breakout_score >= 60 ? 'bg-emerald-500' : b.breakout_score >= 40 ? 'bg-amber-500' : 'bg-slate-600'}`}
                      style={{ width: `${b.breakout_score}%` }} />
                  </div>

                  {/* Key indicators row */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      b.direction === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                      b.direction === 'BEARISH' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-400'
                    }`}>{b.direction}</span>
                    <span className="text-[10px] text-slate-500">RSI: {b.rsi}</span>
                    {b.vol_ratio > 0 && <span className={`text-[10px] ${b.vol_ratio > 1.5 ? 'text-orange-400' : 'text-slate-500'}`}>Vol: {b.vol_ratio}x</span>}
                    {b.adx > 0 && <span className="text-[10px] text-slate-500">ADX: {b.adx}</span>}
                    {b.perf_week !== 0 && <span className={`text-[10px] ${b.perf_week > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>1W: {b.perf_week > 0 ? '+' : ''}{b.perf_week}%</span>}
                  </div>

                  {/* Support/Resistance */}
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {b.support?.slice(0, 2).map((s: any, i: number) => (
                      <span key={i} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">{s.label}: ₹{s.price}</span>
                    ))}
                    {b.resistance?.slice(0, 2).map((r: any, i: number) => (
                      <span key={i} className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded">{r.label}: ₹{r.price}</span>
                    ))}
                  </div>

                  {/* Signals */}
                  <div className="space-y-0.5">
                    {b.signals?.slice(0, 4).map((sig: string, i: number) => (
                      <div key={i} className="text-[10px] text-slate-400 flex items-start gap-1">
                        <Activity className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />{sig}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ━━━ Company Detail Panel ━━━ */}
      {selectedStock && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedStock(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl bg-slate-950 border-l border-slate-800 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300"
            onClick={e => e.stopPropagation()}>
            {/* Close */}
            <button onClick={() => setSelectedStock(null)} className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
              <X className="w-5 h-5" />
            </button>

            {detailLoading ? (
              <div className="flex flex-col items-center justify-center h-full py-32">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-3" />
                <p className="text-slate-400">Loading {selectedStock} data...</p>
              </div>
            ) : detail?.error ? (
              <div className="p-8 text-rose-400">{detail.error}</div>
            ) : detail ? (
              <div className="p-6 space-y-6">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-black text-white">{detail.symbol}</h2>
                    <span className={`text-sm font-bold ${(detail.key_metrics?.change_pct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(detail.key_metrics?.change_pct || 0) >= 0 ? '+' : ''}{detail.key_metrics?.change_pct?.toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm">{detail.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span>{detail.sector}</span>
                    {detail.industry && <><span>•</span><span>{detail.industry}</span></>}
                    {detail.website && <a href={detail.website} target="_blank" rel="noreferrer" className="text-blue-400 flex items-center gap-1 hover:underline"><ExternalLink className="w-3 h-3" />Website</a>}
                  </div>
                  <div className="text-3xl font-black text-white mt-3">₹{detail.key_metrics?.price?.toLocaleString('en-IN')}</div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Market Cap', value: `${fmt(detail.key_metrics?.market_cap || 0)} Cr` },
                    { label: 'P/E', value: detail.key_metrics?.pe_ratio || '—' },
                    { label: 'P/B', value: detail.key_metrics?.pb_ratio || '—' },
                    { label: 'EPS', value: `₹${detail.key_metrics?.eps}` },
                    { label: 'ROE', value: `${detail.key_metrics?.roe}%`, color: (detail.key_metrics?.roe || 0) > 15 ? 'text-emerald-400' : '' },
                    { label: 'ROCE', value: `${detail.key_metrics?.roce}%`, color: (detail.key_metrics?.roce || 0) > 15 ? 'text-emerald-400' : '' },
                    { label: 'D/E', value: detail.key_metrics?.debt_to_equity, color: (detail.key_metrics?.debt_to_equity || 0) < 0.5 ? 'text-emerald-400' : (detail.key_metrics?.debt_to_equity || 0) > 1.5 ? 'text-rose-400' : '' },
                    { label: 'Div Yield', value: `${detail.key_metrics?.dividend_yield}%` },
                    { label: 'Book Val', value: `₹${detail.key_metrics?.book_value}` },
                    { label: '52W High', value: `₹${detail.key_metrics?.week_52_high?.toLocaleString('en-IN')}` },
                    { label: '52W Low', value: `₹${detail.key_metrics?.week_52_low?.toLocaleString('en-IN')}` },
                    { label: 'Beta', value: detail.key_metrics?.beta },
                  ].map(m => (
                    <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
                      <div className="text-[9px] text-slate-500 uppercase font-bold">{m.label}</div>
                      <div className={`text-sm font-bold ${(m as any).color || 'text-white'}`}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Description */}
                {detail.description && (
                  <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800">
                    <p className="text-xs text-slate-400 leading-relaxed">{detail.description}</p>
                  </div>
                )}

                {/* Technical Analysis */}
                {taData && !taData.error && (
                  <div className="bg-gradient-to-br from-orange-500/5 to-amber-500/5 border border-orange-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-orange-300 flex items-center gap-2">
                        <Target className="w-4 h-4" /> Breakout Analysis
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          taData.direction === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                          taData.direction === 'BEARISH' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-400'
                        }`}>{taData.direction}</span>
                        <div className={`text-xl font-black ${taData.breakout_score >= 60 ? 'text-emerald-400' : taData.breakout_score >= 40 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {taData.breakout_score}/100
                        </div>
                      </div>
                    </div>

                    {/* Indicators row */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase font-bold">RSI</div>
                        <div className={`text-sm font-bold ${taData.rsi > 70 ? 'text-rose-400' : taData.rsi < 30 ? 'text-emerald-400' : 'text-white'}`}>{taData.rsi}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase font-bold">SMA 20</div>
                        <div className="text-sm font-bold text-white">₹{taData.sma20}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase font-bold">SMA 50</div>
                        <div className="text-sm font-bold text-white">₹{taData.sma50}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase font-bold">SMA 200</div>
                        <div className="text-sm font-bold text-white">{taData.sma200 > 0 ? `₹${taData.sma200}` : '—'}</div>
                      </div>
                    </div>

                    {/* Support/Resistance */}
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <div className="text-[9px] text-emerald-400 uppercase font-bold mb-1">Support Levels</div>
                        {taData.support?.map((s: any, i: number) => (
                          <div key={i} className="text-xs text-slate-300 flex justify-between py-0.5 border-b border-slate-800/50">
                            <span className="text-emerald-400">{s.label}</span>
                            <span className="font-mono">₹{s.price}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-rose-400 uppercase font-bold mb-1">Resistance Levels</div>
                        {taData.resistance?.map((r: any, i: number) => (
                          <div key={i} className="text-xs text-slate-300 flex justify-between py-0.5 border-b border-slate-800/50">
                            <span className="text-rose-400">{r.label}</span>
                            <span className="font-mono">₹{r.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Signals */}
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Signals</div>
                      {taData.signals?.map((sig: string, i: number) => (
                        <div key={i} className="text-[10px] text-slate-400 flex items-start gap-1.5 py-0.5">
                          <Activity className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />{sig}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quarterly Results */}
                {detail.quarterly_results?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" /> Quarterly Results <span className="text-slate-500 text-[10px]">(₹ Cr)</span>
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-800">
                          <th className="text-left py-2 px-2 text-slate-500">Quarter</th>
                          <th className="text-right py-2 px-2 text-slate-500">Revenue</th>
                          <th className="text-right py-2 px-2 text-slate-500">Op. Profit</th>
                          <th className="text-right py-2 px-2 text-slate-500">OPM%</th>
                          <th className="text-right py-2 px-2 text-slate-500">Net Profit</th>
                        </tr></thead>
                        <tbody>{detail.quarterly_results.map((q: any) => (
                          <tr key={q.period} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="py-1.5 px-2 text-slate-300 font-medium">{q.period}</td>
                            <td className="py-1.5 px-2 text-right text-white font-mono">{q.revenue?.toLocaleString('en-IN')}</td>
                            <td className="py-1.5 px-2 text-right text-white font-mono">{q.operating_profit?.toLocaleString('en-IN')}</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${(q.opm_pct || 0) > 15 ? 'text-emerald-400' : 'text-amber-400'}`}>{q.opm_pct}%</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${(q.net_profit || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{q.net_profit?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Annual P&L */}
                {detail.annual_pl?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-white mb-2">📊 Annual P&L <span className="text-slate-500 text-[10px]">(₹ Cr)</span></h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-800">
                          <th className="text-left py-2 px-2 text-slate-500">Year</th>
                          <th className="text-right py-2 px-2 text-slate-500">Revenue</th>
                          <th className="text-right py-2 px-2 text-slate-500">Op. Profit</th>
                          <th className="text-right py-2 px-2 text-slate-500">OPM%</th>
                          <th className="text-right py-2 px-2 text-slate-500">Net Profit</th>
                        </tr></thead>
                        <tbody>{detail.annual_pl.map((a: any) => (
                          <tr key={a.year} className="border-b border-slate-800/50">
                            <td className="py-1.5 px-2 text-slate-300 font-medium">{a.year}</td>
                            <td className="py-1.5 px-2 text-right text-white font-mono">{a.revenue?.toLocaleString('en-IN')}</td>
                            <td className="py-1.5 px-2 text-right text-white font-mono">{a.operating_profit?.toLocaleString('en-IN')}</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${(a.opm_pct || 0) > 15 ? 'text-emerald-400' : 'text-amber-400'}`}>{a.opm_pct}%</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${(a.net_profit || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{a.net_profit?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Balance Sheet */}
                {detail.balance_sheet?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-white mb-2">🏦 Balance Sheet <span className="text-slate-500 text-[10px]">(₹ Cr)</span></h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-800">
                          <th className="text-left py-2 px-2 text-slate-500">Year</th>
                          <th className="text-right py-2 px-2 text-slate-500">Assets</th>
                          <th className="text-right py-2 px-2 text-slate-500">Equity</th>
                          <th className="text-right py-2 px-2 text-slate-500">Debt</th>
                          <th className="text-right py-2 px-2 text-slate-500">Cash</th>
                        </tr></thead>
                        <tbody>{detail.balance_sheet.map((b: any) => (
                          <tr key={b.year} className="border-b border-slate-800/50">
                            <td className="py-1.5 px-2 text-slate-300 font-medium">{b.year}</td>
                            <td className="py-1.5 px-2 text-right text-white font-mono">{b.total_assets?.toLocaleString('en-IN')}</td>
                            <td className="py-1.5 px-2 text-right text-emerald-400 font-mono">{b.equity?.toLocaleString('en-IN')}</td>
                            <td className="py-1.5 px-2 text-right text-rose-400 font-mono">{b.total_debt?.toLocaleString('en-IN')}</td>
                            <td className="py-1.5 px-2 text-right text-cyan-400 font-mono">{b.cash?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Cash Flow */}
                {detail.cashflow?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-white mb-2">💰 Cash Flow <span className="text-slate-500 text-[10px]">(₹ Cr)</span></h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-800">
                          <th className="text-left py-2 px-2 text-slate-500">Year</th>
                          <th className="text-right py-2 px-2 text-slate-500">Operating</th>
                          <th className="text-right py-2 px-2 text-slate-500">Investing</th>
                          <th className="text-right py-2 px-2 text-slate-500">Financing</th>
                        </tr></thead>
                        <tbody>{detail.cashflow.map((c: any) => (
                          <tr key={c.year} className="border-b border-slate-800/50">
                            <td className="py-1.5 px-2 text-slate-300 font-medium">{c.year}</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${(c.cfo || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{c.cfo?.toLocaleString('en-IN')}</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${(c.cfi || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{c.cfi?.toLocaleString('en-IN')}</td>
                            <td className={`py-1.5 px-2 text-right font-mono ${(c.cff || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{c.cff?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Shareholding */}
                {detail.shareholding && Object.keys(detail.shareholding).length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-violet-400" /> Shareholding Pattern
                    </h3>
                    <div className="flex gap-3">
                      {[
                        { label: 'Promoters', value: detail.shareholding.promoters, color: 'bg-blue-500' },
                        { label: 'Institutions', value: detail.shareholding.institutions, color: 'bg-violet-500' },
                        { label: 'Public', value: detail.shareholding.public, color: 'bg-slate-500' },
                      ].map(h => (
                        <div key={h.label} className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
                          <div className={`w-3 h-3 ${h.color} rounded-full mx-auto mb-1`} />
                          <div className="text-lg font-bold text-white">{h.value?.toFixed(1)}%</div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">{h.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Analyst */}
                {(detail.analyst_target > 0 || detail.recommendation) && (
                  <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Analyst Consensus</div>
                      <div className="text-sm font-bold text-white capitalize">{detail.recommendation || '—'}</div>
                    </div>
                    {detail.analyst_target > 0 && (
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Target Price</div>
                        <div className={`text-sm font-bold ${detail.analyst_target > (detail.key_metrics?.price || 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ₹{detail.analyst_target?.toLocaleString('en-IN')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default StockScreener;
