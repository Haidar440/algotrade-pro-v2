import React, { useState, useEffect, useMemo } from 'react';
import { DB_SERVICE } from '../services/db';
import { BrokerState, SignalFeedItem } from '../types';
import Sparkline from './Sparkline';
import AddStockModal from './AddStockModal';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  Search, Plus, Trash2, ChevronRight, Loader2, Edit3, Check, RotateCcw, X, 
  BarChart2 // ✅ Imported Chart Icon
} from 'lucide-react';

const socket = io('http://localhost:5000');

interface Props {
  onAnalyze: (symbol: string) => void;
  brokerState: BrokerState;
}

interface WatchlistItem extends SignalFeedItem {
  token: string;
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
      const names = await DB_SERVICE.getWatchlistNames();
      if (names.length > 0) {
        setListNames(names);
        if (!activeList) setActiveList(names[0]);
      }
    } catch (e) { console.error("Load names error", e); }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await DB_SERVICE.getWatchlist(activeList);
      const listItems = data?.items || [];
      const updatedItems = await Promise.all(listItems.map(async (item: any) => {
        try {
          if (!item.token) return item;
          const response = await axios.post('http://localhost:5000/api/angel-proxy', {
             endpoint: 'getLtpData',
             data: { exchange: "NSE", symboltoken: item.token, tradingsymbol: item.symbol }
          });
          const ltp = response.data.data?.ltp || item.price;
          const close = response.data.data?.close || 0;
          return {
            ...item,
            price: ltp,
            changePercent: close > 0 ? ((ltp - close) / close * 100) : item.changePercent
          };
        } catch (e) { return item; }
      }));
      setItems(updatedItems);
      updatedItems.forEach((item: any) => {
        if (item.token) socket.emit('subscribe', item.token);
      });
    } catch (e) { console.error("Load items error", e); } finally { setLoading(false); }
  };

  useEffect(() => { loadListNames(); }, []);
  useEffect(() => { if (activeList) loadItems(); }, [activeList]);

  useEffect(() => {
    const onPriceUpdate = (data: any) => {
      setItems(prevItems => prevItems.map(item => {
        if (String(item.token) === String(data.token)) {
          const newPrice = parseFloat(data.lp) || item.price;
          const flash = newPrice > item.price ? 'flash-up' : newPrice < item.price ? 'flash-down' : '';
          return { ...item, price: newPrice, changePercent: parseFloat(data.pc) || item.changePercent, lastChange: flash };
        }
        return item;
      }));
    };
    socket.on('price-update', onPriceUpdate);
    return () => { socket.off('price-update', onPriceUpdate); };
  }, []);

  const handleAddStock = async (stock: any) => {
    if (items.some(i => String(i.token) === String(stock.token))) {
      alert(`⚠️ ${stock.symbol} is already in this watchlist!`);
      setIsAddModalOpen(false);
      return;
    }
    try {
      const res = await axios.post('http://localhost:5000/api/angel-proxy', {
        endpoint: 'getLtpData',
        data: { exchange: "NSE", symboltoken: stock.token, tradingsymbol: stock.symbol }
      });
      const ltp = res.data.data?.ltp || 0;
      const close = res.data.data?.close || 0;
      const stockData = { ...stock, price: ltp, changePercent: close > 0 ? ((ltp - close) / close * 100) : 0, id: `s-${stock.token}-${Date.now()}` };
      const updated = [...items, stockData];
      await DB_SERVICE.saveWatchlist(activeList, updated);
      setItems(updated);
      if (stockData.token) socket.emit('subscribe', stockData.token);
    } catch (e) { console.error("Add stock error", e); } finally { setIsAddModalOpen(false); }
  };

  const handleDone = async () => {
    if (pendingDeletions.length === 0) { setIsEditMode(false); return; }
    try {
        await Promise.all(pendingDeletions.map(name => axios.delete(`http://localhost:5000/api/watchlists/${encodeURIComponent(name)}`)));
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
    return items.filter(item => item.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [items, searchTerm]);

  // ✅ New Handler to Open Chart in New Tab
  const openChartInNewTab = (symbol: string, token: string) => {
    const url = `/?chartSymbol=${symbol}&chartToken=${token}`;
    window.open(url, '_blank', 'width=1200,height=800');
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 pb-0 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pr-4">
          {listNames.filter(n => !pendingDeletions.includes(n)).map(name => (
            <div key={name} className="relative group">
              <button onClick={() => !isEditMode && setActiveList(name)} className={`px-4 py-3 text-sm font-bold transition-all whitespace-nowrap border-b-2 flex items-center gap-2 ${activeList === name && !isEditMode ? 'text-blue-400 border-blue-400 bg-blue-400/5' : 'text-slate-500 border-transparent hover:text-slate-300'} ${isEditMode ? 'cursor-default opacity-70' : 'cursor-pointer'}`}>
                {name}
                {isEditMode && (<button onClick={(e) => { e.stopPropagation(); markForDeletion(name); }} className="p-1 hover:bg-rose-500/20 rounded-full text-rose-500 transition-all"><X className="w-3 h-3" /></button>)}
              </button>
            </div>
          ))}
          {!isEditMode && (<button onClick={handleCreateNewList} className="p-2 ml-2 text-slate-500 hover:text-emerald-400 transition-colors"><Plus className="w-4 h-4" /></button>)}
        </div>
        <div className="flex items-center gap-2 pb-2">
            {!isEditMode && (<button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all"><Plus className="w-3.5 h-3.5" /> Add</button>)}
            {isEditMode ? (
                <div className="flex items-center gap-2">
                    {pendingDeletions.length > 0 && (<button onClick={handleUndo} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-700 border border-slate-700"><RotateCcw className="w-3.5 h-3.5" /> Undo</button>)}
                    <button onClick={handleDone} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 shadow-lg"><Check className="w-3.5 h-3.5" /> Done</button>
                </div>
            ) : (<button onClick={() => setIsEditMode(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 text-slate-400 rounded-lg text-xs font-bold hover:text-white hover:bg-slate-800 transition-all border border-slate-700/50"><Edit3 className="w-3.5 h-3.5" /> Edit</button>)}
        </div>
      </div>

      {!isEditMode && (<div className="flex justify-end shrink-0"><div className="relative w-full md:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input type="text" placeholder={`Search ${activeList}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none transition-all" /></div></div>)}

      <div className={`bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm transition-all duration-300 flex-1 overflow-auto ${isEditMode ? 'opacity-30 blur-[2px] pointer-events-none' : 'opacity-100'}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/50 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800 sticky top-0 backdrop-blur-md z-10">
            <tr>
              <th className="p-4">Instrument</th>
              <th className="p-4 text-center hidden md:table-cell">Trend</th>
              <th className="p-4 text-right">LTP</th>
              <th className="p-4 text-right">Change</th>
              <th className="p-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (<tr><td colSpan={5} className="p-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-50"/></td></tr>) : filteredItems.length === 0 ? (<tr><td colSpan={5} className="p-20 text-center text-slate-500 italic">{pendingDeletions.length > 0 ? "Reviewing deletions..." : "Watchlist is empty."}</td></tr>) : filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-blue-400/[0.02] transition-colors group">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                     <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${item.changePercent >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{item.symbol.substring(0, 2)}</div>
                     <div><div className="font-bold text-white text-sm">{item.symbol}</div><div className="text-[10px] text-slate-500 font-bold uppercase">{item.strategy || "Equity"}</div></div>
                  </div>
                </td>
                <td className="p-4 hidden md:table-cell"><div className="h-6 w-20 mx-auto opacity-70 group-hover:opacity-100 transition-opacity"><Sparkline isPositive={item.changePercent >= 0} color={item.changePercent >= 0 ? '#10b981' : '#f43f5e'} id={item.id} /></div></td>
                <td className={`p-4 text-right font-mono font-bold transition-all duration-700 ${item.lastChange === 'flash-up' ? 'text-emerald-400 flash-up' : item.lastChange === 'flash-down' ? 'text-rose-400 flash-down' : 'text-slate-300'}`}>₹{item.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={`p-4 text-right font-mono font-bold text-xs ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%</td>
                <td className="p-4">
                  <div className="flex justify-center gap-2">
                     {/* ✅ NEW CHART BUTTON */}
                     <button 
                        onClick={() => openChartInNewTab(item.symbol, item.token)}
                        className="p-2 bg-slate-800/50 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all border border-slate-700/50"
                        title="Open Chart in New Tab"
                     >
                        <BarChart2 className="w-4 h-4" />
                     </button>

                     <button onClick={() => onAnalyze(item.symbol)} className="p-2 bg-slate-800/50 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all border border-slate-700/50" title="Analyze">
                        <ChevronRight className="w-4 h-4" />
                     </button>
                     <button onClick={() => handleDeleteItem(item.id)} className="p-2 bg-slate-800/50 hover:bg-rose-500/20 text-rose-500 rounded-lg transition-all border border-slate-700/50" title="Remove">
                        <Trash2 className="w-4 h-4" />
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