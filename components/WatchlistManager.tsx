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
    } catch (e) { alert("Could not delete watchlist. Please retry in a moment."); }
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
      <div className="flex items-center justify-between pb-0 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide pr-4">
          {listNames.filter(n => !pendingDeletions.includes(n)).map(name => (
            <div key={name} className="relative group">
              <button
                onClick={() => !isEditMode && setActiveList(name)}
                className="px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5"
                style={{
                  color: activeList === name && !isEditMode ? 'var(--accent-blue)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${activeList === name && !isEditMode ? 'var(--accent-blue)' : 'transparent'}`,
                  cursor: isEditMode ? 'default' : 'pointer',
                  opacity: isEditMode ? 0.6 : 1,
                }}
              >
                {name}
                {isEditMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markForDeletion(name); }}
                    className="p-0.5 rounded-full transition-all"
                    style={{ color: 'var(--accent-red)' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </button>
            </div>
          ))}
          {!isEditMode && (
            <button onClick={handleCreateNewList} className="p-2 ml-1 transition-colors" style={{ color: 'var(--text-muted)' }}>
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 md:gap-2 pb-2 shrink-0">
          {!isEditMode && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 text-white rounded-lg text-[10px] md:text-xs font-medium transition-all"
              style={{ background: 'var(--accent-blue)' }}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
          {isEditMode ? (
            <div className="flex items-center gap-1.5">
              {pendingDeletions.length > 0 && (
                <button onClick={handleUndo} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] md:text-xs font-medium" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  <RotateCcw className="w-3 h-3" /> Undo
                </button>
              )}
              <button onClick={handleDone} className="flex items-center gap-1 px-3 py-1.5 text-white rounded-lg text-[10px] md:text-xs font-medium" style={{ background: 'var(--accent-green)' }}>
                <Check className="w-3 h-3" /> Done
              </button>
            </div>
          ) : (
            <button onClick={() => setIsEditMode(true)} className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-medium transition-all" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <Edit3 className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* ━━━ SEARCH ━━━ */}
      {!isEditMode && (
        <div className="flex justify-end shrink-0">
          <div className="relative w-full md:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={`Search ${activeList}…`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg pl-8 pr-3 py-2 text-xs md:text-sm outline-none transition-all"
              style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        </div>
      )}

      {/* ━━━ TABLE ━━━ */}
      <div
        className={`rounded-xl overflow-hidden transition-all duration-300 flex-1 overflow-auto ${isEditMode ? 'opacity-30 blur-[2px] pointer-events-none' : 'opacity-100'}`}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <table className="w-full text-left">
          <thead className="text-[9px] md:text-[10px] uppercase font-medium tracking-wider sticky top-0 z-10" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            <tr>
              <th className="p-3 md:p-4">Instrument</th>
              <th className="p-3 md:p-4 text-center hidden md:table-cell">Trend</th>
              <th className="p-3 md:p-4 text-right">LTP</th>
              <th className="p-3 md:p-4 text-right">Change</th>
              <th className="p-3 md:p-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-16 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: 'var(--accent-blue)', opacity: 0.4 }} />
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-16 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  {pendingDeletions.length > 0 ? "Reviewing deletions…" : "Watchlist is empty. Tap + Add to begin."}
                </td>
              </tr>
            ) : filteredItems.map((item) => (
              <tr key={item.id} className="group transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Instrument */}
                <td className="p-3 md:p-4">
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <div
                      className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] md:text-xs font-semibold"
                      style={{
                        background: item.changePercent >= 0 ? 'var(--ring-green)' : 'var(--ring-red)',
                        color: item.changePercent >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                      }}
                    >
                      {cleanSymbol(item.symbol).substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs md:text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text)' }}>{cleanSymbol(item.symbol)}</div>
                      <div className="text-[9px] md:text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{item.name || "Equity"}</div>
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
                <td className={`p-3 md:p-4 text-right text-xs md:text-sm font-mono font-medium tabular-nums tracking-tight transition-all duration-700 ${item.lastChange === 'flash-up' ? 'flash-up'
                    : item.lastChange === 'flash-down' ? 'flash-down'
                      : ''
                  }`} style={{
                    color: item.lastChange === 'flash-up' ? 'var(--accent-green)'
                      : item.lastChange === 'flash-down' ? 'var(--accent-red)'
                        : 'var(--text)'
                  }}>
                  ₹{item.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>

                {/* Change % */}
                <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono font-medium tabular-nums" style={{
                  color: item.changePercent >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
                }}>
                  {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                </td>

                {/* Actions */}
                <td className="p-3 md:p-4">
                  <div className="flex justify-center gap-1 md:gap-1.5">
                    <button
                      onClick={() => openChartInNewTab(item.symbol, item.token)}
                      className="p-1.5 md:p-2 rounded-lg transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      title="Open Chart"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onAnalyze(item.symbol)}
                      className="p-1.5 md:p-2 rounded-lg transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      title="Analyze"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 md:p-2 rounded-lg transition-all"
                      style={{ color: 'var(--text-muted)' }}
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