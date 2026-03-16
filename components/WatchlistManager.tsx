import React, { useState, useEffect, useMemo } from 'react';
import { DB_SERVICE } from '../services/db';
import { BrokerState } from '../types';
import Sparkline from './Sparkline';
import AddStockModal from './AddStockModal';
import { 
  Search, Plus, Trash2, ChevronRight, Loader2, Edit3, Check, RotateCcw, X, 
  BarChart2
} from 'lucide-react';

interface Props {
  onAnalyze: (symbol: string) => void;
  brokerState: BrokerState;
}

/**
 * Watchlist item stored in DB. Does NOT extend SignalFeedItem —
 * watchlist items are simple stock references with price/change info.
 */
interface WatchlistItem {
  id: string;
  symbol: string;
  name: string;
  token: string;
  price: number;
  changePercent: number;
  strategy?: string;
  lastChange?: 'flash-up' | 'flash-down' | '';
}

const WatchlistManager: React.FC<Props> = ({ onAnalyze, brokerState }) => {
  const [listNames, setListNames] = useState<string[]>([]);
  const [activeList, setActiveList] = useState('Default');
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadListNames = async () => {
    try {
      const names: any = await DB_SERVICE.getWatchlistNames();
      if (names && names.length > 0) {
        setListNames(names);
        if (!names.includes(activeList)) setActiveList(names[0]);
      } else {
        await DB_SERVICE.saveWatchlist('Default', []);
        setListNames(['Default']);
        setActiveList('Default');
      }
    } catch (e) { console.error("Load names error", e); }
  };

  const loadItems = async () => {
    if (!activeList) { setLoading(false); return; }
    setLoading(true);
    try {
      const data: any = await DB_SERVICE.getWatchlist(activeList);
      const listItems = data?.items || [];
      const normalized = listItems.map((item: any) => ({
        id: item.id || `s-${item.token || item.symbol}-${Date.now()}`,
        symbol: item.symbol || '',
        name: item.name || item.symbol || '',
        token: item.token || '',
        price: item.price ?? 0,
        changePercent: item.changePercent ?? 0,
        strategy: item.strategy || 'Equity',
        lastChange: '' as const,
      }));
      setItems(normalized);
      if (normalized.length > 0) {
        fetchLivePrices(normalized);
      }
    } catch (e) {
      console.error("Load items error", e);
      setItems([]);
    } finally { setLoading(false); }
  };

  const fetchLivePrices = async (currentItems: WatchlistItem[]) => {
    try {
      const symbols = currentItems.map(i => i.symbol);
      const quotes: any = await DB_SERVICE.getQuotes(symbols);
      if (!quotes || typeof quotes !== 'object') return;

      setItems(prev => {
        const updated = prev.map(item => {
          const q = quotes[item.symbol];
          if (!q || !q.price) return item;
          const oldPrice = item.price || 0;
          const newPrice = q.price;
          return {
            ...item,
            price: newPrice,
            changePercent: q.changePercent ?? item.changePercent,
            lastChange: newPrice > oldPrice ? 'flash-up' as const : newPrice < oldPrice ? 'flash-down' as const : '' as const,
          };
        });
        DB_SERVICE.saveWatchlist(activeList, updated.map(({ lastChange, ...rest }) => rest));
        return updated;
      });

      setTimeout(() => {
        setItems(prev => prev.map(item => ({ ...item, lastChange: '' as const })));
      }, 1500);
    } catch (e) {
      console.error("Price fetch error", e);
    }
  };

  useEffect(() => { loadListNames(); }, []);
  useEffect(() => { if (activeList) loadItems(); }, [activeList]);

  const handleAddStock = async (stock: any) => {
    if (items.some(i => String(i.token) === String(stock.token))) {
      alert(`${stock.symbol.replace(/-EQ$/, '')} is already in this watchlist!`);
      setIsAddModalOpen(false);
      return;
    }
    try {
      const stockData = { ...stock, price: stock.price || 0, changePercent: stock.changePercent || 0, id: `s-${stock.token || stock.symbol}-${Date.now()}` };
      const updated = [...items, stockData];
      await DB_SERVICE.saveWatchlist(activeList, updated);
      setItems(updated);
    } catch (e) { console.error("Add stock error", e); } finally { setIsAddModalOpen(false); }
  };

  const handleDone = async () => {
    if (pendingDeletions.length === 0) { setIsEditMode(false); return; }
    try {
        await Promise.all(pendingDeletions.map(name => DB_SERVICE.deleteWatchlist(name)));
        const remaining = listNames.filter(n => !pendingDeletions.includes(n));
        setListNames(remaining);
        if (pendingDeletions.includes(activeList)) setActiveList(remaining[0] || 'Default');
        setPendingDeletions([]);
        setIsEditMode(false);
    } catch (e) { alert("Failed to delete watchlist."); }
  };

  const markForDeletion = (name: string) => { if (name === 'Default') return alert("Cannot delete Default list"); setPendingDeletions(prev => [...prev, name]); };
  const handleUndo = () => setPendingDeletions(prev => prev.slice(0, -1));
  const handleCreateNewList = async () => { const name = prompt("Enter new Watchlist name:"); if (name && !listNames.includes(name)) { await DB_SERVICE.saveWatchlist(name, []); await loadListNames(); setActiveList(name); } };
  const handleDeleteItem = async (id: string) => { const newItems = items.filter(i => i.id !== id); setItems(newItems); await DB_SERVICE.saveWatchlist(activeList, newItems); };

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(item => 
      item.symbol.toLowerCase().includes(term) || 
      (item.name || '').toLowerCase().includes(term)
    );
  }, [items, searchTerm]);

  const cleanSymbol = (symbol: string) => symbol.replace(/-EQ$/, '').replace(/-BE$/, '');

  const openChartInNewTab = (symbol: string, token: string) => {
    const url = `/?chartSymbol=${symbol}&chartToken=${token}`;
    window.open(url, '_blank', 'width=1200,height=800');
  };

  return (
    <div className="space-y-3 md:space-y-4 h-full flex flex-col">

      {/* ━━━ TAB BAR ━━━ */}
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-0 shrink-0">
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide pr-4">
          {listNames.filter(n => !pendingDeletions.includes(n)).map(name => (
            <div key={name} className="relative group">
              <button
                onClick={() => !isEditMode && setActiveList(name)}
                className={`px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold transition-all whitespace-nowrap border-b-2 flex items-center gap-1.5 ${
                  activeList === name && !isEditMode
                    ? 'text-blue-400 border-blue-400'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                } ${isEditMode ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
              >
                {name}
                {isEditMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markForDeletion(name); }}
                    className="p-0.5 hover:bg-rose-500/20 rounded-full text-rose-500 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </button>
            </div>
          ))}
          {!isEditMode && (
            <button onClick={handleCreateNewList} className="p-2 ml-1 text-slate-600 hover:text-emerald-400 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 md:gap-2 pb-2 shrink-0">
          {!isEditMode && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] md:text-xs font-semibold hover:bg-blue-500 transition-all"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
          {isEditMode ? (
            <div className="flex items-center gap-1.5">
              {pendingDeletions.length > 0 && (
                <button onClick={handleUndo} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800/80 text-slate-300 rounded-lg text-[10px] md:text-xs font-semibold hover:bg-slate-700 border border-white/[0.06]">
                  <RotateCcw className="w-3 h-3" /> Undo
                </button>
              )}
              <button onClick={handleDone} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] md:text-xs font-semibold hover:bg-emerald-500">
                <Check className="w-3 h-3" /> Done
              </button>
            </div>
          ) : (
            <button onClick={() => setIsEditMode(true)} className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 bg-transparent text-slate-500 rounded-lg text-[10px] md:text-xs font-semibold hover:text-white hover:bg-white/[0.04] transition-all border border-white/[0.06]">
              <Edit3 className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* ━━━ SEARCH ━━━ */}
      {!isEditMode && (
        <div className="flex justify-end shrink-0">
          <div className="relative w-full md:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <input
              type="text"
              placeholder={`Search ${activeList}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/20 border border-white/[0.06] rounded-lg pl-8 pr-3 py-2 text-xs md:text-sm text-white placeholder-slate-600 focus:border-blue-500/50 outline-none transition-all"
            />
          </div>
        </div>
      )}

      {/* ━━━ TABLE ━━━ */}
      <div className={`bg-[#0c1120] border border-white/[0.04] rounded-xl overflow-hidden transition-all duration-300 flex-1 overflow-auto ${isEditMode ? 'opacity-30 blur-[2px] pointer-events-none' : 'opacity-100'}`}>
        <table className="w-full text-left">
          <thead className="bg-black/30 text-slate-500 text-[9px] md:text-[10px] uppercase font-semibold tracking-wider border-b border-white/[0.04] sticky top-0 z-10">
            <tr>
              <th className="p-3 md:p-4">Instrument</th>
              <th className="p-3 md:p-4 text-center hidden md:table-cell">Trend</th>
              <th className="p-3 md:p-4 text-right">LTP</th>
              <th className="p-3 md:p-4 text-right">Change</th>
              <th className="p-3 md:p-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-16 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500/40" />
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-16 text-center text-slate-600 text-xs">
                  {pendingDeletions.length > 0 ? "Reviewing deletions..." : "Watchlist is empty. Tap + Add to begin."}
                </td>
              </tr>
            ) : filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-white/[0.015] transition-colors group">
                {/* Instrument */}
                <td className="p-3 md:p-4">
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] md:text-xs font-bold ${
                      item.changePercent >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {cleanSymbol(item.symbol).substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs md:text-sm font-bold text-white tracking-tight truncate">{cleanSymbol(item.symbol)}</div>
                      <div className="text-[9px] md:text-[10px] text-slate-600 truncate">{item.name || "Equity"}</div>
                    </div>
                  </div>
                </td>

                {/* Sparkline */}
                <td className="p-3 md:p-4 hidden md:table-cell">
                  <div className="h-5 w-16 mx-auto opacity-50 group-hover:opacity-80 transition-opacity">
                    <Sparkline isPositive={item.changePercent >= 0} color={item.changePercent >= 0 ? '#10b981' : '#f43f5e'} id={item.id} />
                  </div>
                </td>

                {/* LTP */}
                <td className={`p-3 md:p-4 text-right text-xs md:text-sm font-mono font-semibold tabular-nums tracking-tight transition-all duration-700 ${
                  item.lastChange === 'flash-up' ? 'text-emerald-400 flash-up'
                    : item.lastChange === 'flash-down' ? 'text-rose-400 flash-down'
                    : 'text-white'
                }`}>
                  ₹{item.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>

                {/* Change % */}
                <td className={`p-3 md:p-4 text-right text-[10px] md:text-xs font-mono font-semibold tabular-nums ${
                  item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                </td>

                {/* Actions */}
                <td className="p-3 md:p-4">
                  <div className="flex justify-center gap-1 md:gap-1.5">
                    <button
                      onClick={() => openChartInNewTab(item.symbol, item.token)}
                      className="p-1.5 md:p-2 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 rounded-lg transition-all"
                      title="Open Chart"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onAnalyze(item.symbol)}
                      className="p-1.5 md:p-2 hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 rounded-lg transition-all"
                      title="Analyze"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 md:p-2 hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 rounded-lg transition-all"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddStockModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdd={handleAddStock} />
    </div>
  );
};

export default WatchlistManager;