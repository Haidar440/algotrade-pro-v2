import React, { useState, useEffect, useMemo } from 'react';
import { DB_SERVICE } from '../services/db';
import { BrokerState } from '../types';
import { AngelOne } from '../services/angel';
import { 
  FileText, Zap, Calendar, Filter, Download, RefreshCw, Loader2, AlertCircle, 
  Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Trash2,
  TrendingUp, TrendingDown, DollarSign
} from 'lucide-react';

interface Props {
  brokerState: BrokerState;
}

const TradeHistory: React.FC<Props> = ({ brokerState }) => {
  const [activeTab, setActiveTab] = useState<'PAPER' | 'REAL'>('PAPER');
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Stats State
  const [stats, setStats] = useState({ realized: 0, unrealized: 0, total: 0 });
  const [calculatingStats, setCalculatingStats] = useState(false);

  // DataTable State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'entryDate', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // --- Fetch Data ---
  const fetchHistory = async () => {
    setLoading(true);
    try {
        const dbTrades = await DB_SERVICE.getTrades();
        setTrades(dbTrades); 
    } catch (e) {
        console.error("History fetch error:", e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // --- Calculate P&L Stats (Realized + Unrealized) ---
  useEffect(() => {
    const calculatePnL = async () => {
        setCalculatingStats(true);
        
        // 1. Filter trades by current tab
        const currentTrades = trades.filter(t => 
            activeTab === 'PAPER' ? t.type === 'PAPER' : t.type !== 'PAPER'
        );

        // 2. Realized P&L (Sum of all CLOSED trades)
        const realized = currentTrades
            .filter(t => t.status === 'CLOSED')
            .reduce((acc, t) => acc + (t.pnl || 0), 0);

        let unrealized = 0;

        // 3. Unrealized P&L (Calculate live for OPEN trades)
        const openTrades = currentTrades.filter(t => t.status === 'OPEN' || t.status === 'EXITING');
        
        if (openTrades.length > 0 && brokerState.angel) {
            try {
                const angel = new AngelOne(brokerState.angel);
                // Get unique symbols to check prices
                const symbols = [...new Set(openTrades.map(t => t.symbol))];
                
                for (const sym of symbols) {
                    try {
                        const token = await angel.searchSymbolToken(sym);
                        if (token) {
                            const data = await angel.getLtpValue("NSE", token, sym);
                            if (data && data.price > 0) {
                                // Add P&L for all open trades of this symbol
                                openTrades.filter(t => t.symbol === sym).forEach(t => {
                                    unrealized += (data.price - t.entryPrice) * t.quantity;
                                });
                            }
                        }
                    } catch (e) {}
                }
            } catch (err) {
                console.warn("Could not fetch live prices for P&L");
            }
        }

        setStats({
            realized,
            unrealized,
            total: realized + unrealized
        });
        setCalculatingStats(false);
    };

    if (!loading) calculatePnL();
  }, [trades, activeTab, brokerState.angel, loading]);


  // --- Delete Logic ---
  const handleDelete = async (id: string, symbol: string) => {
      if (confirm(`🗑️ Are you sure you want to delete the record for ${symbol}?`)) {
          try {
              await DB_SERVICE.deleteTrade(id); 
              setTrades(prev => prev.filter(t => t._id !== id));
          } catch (e) {
              alert("❌ Failed to delete trade.");
          }
      }
  };

  // --- Filtering & Sorting ---
  const filteredTrades = useMemo(() => {
      let data = trades.filter(t => {
          const matchesTab = activeTab === 'PAPER' ? t.type === 'PAPER' : t.type !== 'PAPER';
          if (!matchesTab) return false;

          const searchLower = searchTerm.toLowerCase();
          return (
              t.symbol.toLowerCase().includes(searchLower) ||
              t.strategy?.toLowerCase().includes(searchLower) ||
              t.status.toLowerCase().includes(searchLower)
          );
      });

      if (sortConfig) {
          data.sort((a, b) => {
              const aValue = a[sortConfig.key];
              const bValue = b[sortConfig.key];
              if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
              if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return data;
  }, [trades, activeTab, searchTerm, sortConfig]);

  // --- Pagination ---
  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage);
  const paginatedTrades = filteredTrades.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
  );

  const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const downloadCSV = () => {
     const headers = "Date,Symbol,Type,Strategy,Entry Price,Exit Price,Qty,P&L,Status\n";
     const rows = filteredTrades.map(t => 
        `${new Date(t.entryDate).toLocaleDateString()},${t.symbol},${activeTab},${t.strategy},${t.entryPrice},${t.exitPrice || 0},${t.quantity},${t.pnl || 0},${t.status}`
     ).join("\n");
     const blob = new Blob([headers + rows], { type: 'text/csv' });
     const url = window.URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `trade_history_${activeTab.toLowerCase()}.csv`;
     a.click();
  };

  const SortIcon = ({ column }: { column: string }) => {
      if (sortConfig?.key !== column) return <ArrowUpDown className="w-3 h-3 text-slate-600" />;
      return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
         <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
               <Calendar className="w-6 h-6 text-blue-400" /> Trade Ledger
            </h2>
            <p className="text-slate-400 text-sm mt-1">Complete history of your executions.</p>
         </div>

         <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button onClick={() => { setActiveTab('PAPER'); setCurrentPage(1); }} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'PAPER' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                <FileText className="w-4 h-4" /> Paper
            </button>
            <button onClick={() => { setActiveTab('REAL'); setCurrentPage(1); }} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'REAL' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                <Zap className="w-4 h-4" /> Real
            </button>
         </div>
      </div>

      {/* ✅ P&L SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col relative overflow-hidden">
              <div className="text-xs text-slate-500 uppercase font-bold mb-1">Realized P&L</div>
              <div className={`text-2xl font-mono font-bold ${stats.realized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stats.realized >= 0 ? '+' : ''}₹{stats.realized.toFixed(2)}
              </div>
              <div className="absolute right-4 top-4 opacity-10">
                  <DollarSign className="w-12 h-12 text-slate-400" />
              </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col relative overflow-hidden">
              <div className="text-xs text-slate-500 uppercase font-bold mb-1">Unrealized P&L</div>
              <div className={`text-2xl font-mono font-bold ${stats.unrealized >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                  {calculatingStats ? (
                      <span className="text-sm text-slate-500 animate-pulse">Calculating...</span>
                  ) : (
                      <>
                        {stats.unrealized >= 0 ? '+' : ''}₹{stats.unrealized.toFixed(2)}
                      </>
                  )}
              </div>
              <div className="absolute right-4 top-4 opacity-10">
                  <TrendingUp className="w-12 h-12 text-blue-400" />
              </div>
          </div>

          <div className={`border p-4 rounded-xl flex flex-col relative overflow-hidden ${stats.total >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
              <div className={`text-xs uppercase font-bold mb-1 ${stats.total >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>Total Net P&L</div>
              <div className={`text-2xl font-mono font-bold ${stats.total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stats.total >= 0 ? '+' : ''}₹{stats.total.toFixed(2)}
              </div>
              <div className="absolute right-4 top-4 opacity-20">
                  <Zap className={`w-12 h-12 ${stats.total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
              </div>
          </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
                type="text" 
                placeholder="Search Symbol or Strategy..." 
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none transition-all"
            />
         </div>
         <div className="flex gap-2">
            <button onClick={fetchHistory} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
               <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={downloadCSV} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition-colors">
               <Download className="w-3 h-3" /> CSV
            </button>
         </div>
      </div>

      {/* TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
               <thead className="bg-slate-950 text-slate-500 text-xs uppercase font-bold tracking-wider">
                  <tr>
                     <th onClick={() => handleSort('entryDate')} className="p-4 cursor-pointer hover:bg-slate-800 transition-colors">
                        <div className="flex items-center gap-1">Date <SortIcon column="entryDate"/></div>
                     </th>
                     <th onClick={() => handleSort('symbol')} className="p-4 cursor-pointer hover:bg-slate-800">
                        <div className="flex items-center gap-1">Symbol <SortIcon column="symbol"/></div>
                     </th>
                     <th className="p-4 text-center">Strategy</th>
                     <th onClick={() => handleSort('quantity')} className="p-4 text-right cursor-pointer hover:bg-slate-800">
                        <div className="flex items-center justify-end gap-1">Qty <SortIcon column="quantity"/></div>
                     </th>
                     <th onClick={() => handleSort('entryPrice')} className="p-4 text-right cursor-pointer hover:bg-slate-800">
                        <div className="flex items-center justify-end gap-1">Entry <SortIcon column="entryPrice"/></div>
                     </th>
                     <th onClick={() => handleSort('exitPrice')} className="p-4 text-right cursor-pointer hover:bg-slate-800">
                        <div className="flex items-center justify-end gap-1">Exit <SortIcon column="exitPrice"/></div>
                     </th>
                     <th onClick={() => handleSort('pnl')} className="p-4 text-right cursor-pointer hover:bg-slate-800">
                        <div className="flex items-center justify-end gap-1">P&L <SortIcon column="pnl"/></div>
                     </th>
                     <th className="p-4 text-center">Status</th>
                     <th className="p-4 text-center">Action</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-800">
                  {loading ? (
                      <tr><td colSpan={9} className="p-10 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500"/></td></tr>
                  ) : paginatedTrades.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-10 text-center text-slate-500 flex flex-col items-center gap-2">
                           <AlertCircle className="w-6 h-6 opacity-50"/>
                           No trades match your search.
                        </td>
                      </tr>
                  ) : paginatedTrades.map((t) => (
                      <tr key={t._id} className="hover:bg-slate-800/30 transition-colors group">
                         <td className="p-4 text-slate-400 font-mono text-xs">
                             <div className="text-white font-bold">{new Date(t.entryDate).toLocaleDateString()}</div>
                             <div className="opacity-50">{new Date(t.entryDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                         </td>
                         <td className="p-4 font-black text-white">{t.symbol}</td>
                         <td className="p-4 text-center">
                            <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[10px] border border-slate-700">
                               {t.strategy || 'MANUAL'}
                            </span>
                         </td>
                         <td className="p-4 text-right font-mono text-slate-300">{t.quantity}</td>
                         <td className="p-4 text-right font-mono text-slate-300">₹{t.entryPrice.toFixed(2)}</td>
                         <td className="p-4 text-right font-mono text-slate-300">
                            {t.exitPrice ? `₹${t.exitPrice.toFixed(2)}` : '-'}
                         </td>
                         <td className={`p-4 text-right font-mono font-bold ${
                             (t.pnl || 0) > 0 ? 'text-emerald-400' : (t.pnl || 0) < 0 ? 'text-rose-400' : 'text-slate-500'
                         }`}>
                             {(t.pnl || 0) > 0 ? '+' : ''}{t.pnl ? `₹${t.pnl.toFixed(2)}` : '-'}
                         </td>
                         <td className="p-4 text-center">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                t.status === 'CLOSED' ? 'bg-slate-800 text-slate-400 border-slate-700' : 
                                'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse'
                            }`}>
                               {t.status}
                            </span>
                         </td>
                         <td className="p-4 text-center">
                            <button 
                                onClick={() => handleDelete(t._id, t.symbol)}
                                className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-all"
                                title="Delete Trade Record"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                         </td>
                      </tr>
                  ))}
               </tbody>
            </table>
         </div>

         {/* PAGINATION */}
         {totalPages > 1 && (
             <div className="bg-slate-900 border-t border-slate-800 p-3 flex justify-between items-center">
                 <span className="text-xs text-slate-500">
                    Page {currentPage} of {totalPages}
                 </span>
                 <div className="flex gap-2">
                    <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-400"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button 
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-400"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};

export default TradeHistory;