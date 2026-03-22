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
  isVisible?: boolean;
}

const TradeHistory: React.FC<Props> = ({ brokerState, isVisible = true }) => {
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
    if (isVisible) fetchHistory();
  }, [isVisible]);

  // --- Calculate P&L Stats (Realized + Unrealized) ---
  useEffect(() => {
    if (!isVisible) return; // Don't run expensive API calls when hidden
    const calculatePnL = async () => {
        setCalculatingStats(true);
        
        // 1. Filter trades by current tab
        const currentTrades = trades.filter(t => 
            activeTab === 'PAPER' ? t.source === 'PAPER' : t.source !== 'PAPER'
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
                const symbols: string[] = Array.from(new Set<string>(openTrades.map((t: any) => t.symbol)));
                
                for (const sym of symbols) {
                    try {
                        const token: string = await angel.searchSymbolToken(sym);
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
          const matchesTab = activeTab === 'PAPER' ? t.source === 'PAPER' : t.source !== 'PAPER';
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
      if (sortConfig?.key !== column) return <ArrowUpDown className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />;
      return sortConfig.direction === 'asc'
        ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--accent-blue)' }} />
        : <ArrowDown className="w-3 h-3" style={{ color: 'var(--accent-blue)' }} />;
  };

  const formatPnL = (value: number) => {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ━━━ HEADER & TABS ━━━ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center gap-2 tracking-tight" style={{ color: 'var(--text)' }}>
            <Calendar className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} /> Trade Ledger
          </h2>
          <p className="text-[10px] md:text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Complete history of your executions</p>
        </div>

        <div className="flex p-0.5 rounded-lg" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => { setActiveTab('PAPER'); setCurrentPage(1); }}
            className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-md text-[10px] md:text-xs font-semibold transition-all"
            style={{
              background: activeTab === 'PAPER' ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === 'PAPER' ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            <FileText className="w-3.5 h-3.5" /> Paper
          </button>
          <button
            onClick={() => { setActiveTab('REAL'); setCurrentPage(1); }}
            className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-md text-[10px] md:text-xs font-semibold transition-all"
            style={{
              background: activeTab === 'REAL' ? 'var(--accent-green)' : 'transparent',
              color: activeTab === 'REAL' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <Zap className="w-3.5 h-3.5" /> Real
          </button>
        </div>
      </div>

      {/* ━━━ P&L SUMMARY CARDS ━━━ */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="p-3 md:p-4 rounded-xl relative overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[9px] md:text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Realized</div>
          <div className="text-sm md:text-xl font-mono font-bold tabular-nums tracking-tight" style={{ color: stats.realized >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {formatPnL(stats.realized)}
          </div>
          <DollarSign className="absolute right-3 top-3 w-8 h-8 md:w-10 md:h-10 opacity-[0.06]" style={{ color: 'var(--text)' }} />
        </div>

        <div className="p-3 md:p-4 rounded-xl relative overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-[9px] md:text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Unrealized</div>
          <div className="text-sm md:text-xl font-mono font-bold tabular-nums tracking-tight" style={{ color: stats.unrealized >= 0 ? 'var(--accent-blue)' : 'var(--accent-amber)' }}>
            {calculatingStats ? (
              <span className="text-[10px] md:text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Calculating…</span>
            ) : (
              formatPnL(stats.unrealized)
            )}
          </div>
          <TrendingUp className="absolute right-3 top-3 w-8 h-8 md:w-10 md:h-10 opacity-[0.06]" style={{ color: 'var(--text)' }} />
        </div>

        <div className="p-3 md:p-4 rounded-xl relative overflow-hidden" style={{
          background: stats.total >= 0 ? 'var(--ring-green)' : 'var(--ring-red)',
          border: `1px solid ${stats.total >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
        }}>
          <div className="text-[9px] md:text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: stats.total >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', opacity: 0.7 }}>Total Net</div>
          <div className="text-sm md:text-xl font-mono font-bold tabular-nums tracking-tight" style={{ color: stats.total >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {formatPnL(stats.total)}
          </div>
          <Zap className="absolute right-3 top-3 w-8 h-8 md:w-10 md:h-10 opacity-[0.1]" style={{ color: stats.total >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }} />
        </div>
      </div>

      {/* ━━━ TOOLBAR ━━━ */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 md:gap-4">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search symbol or strategy…" 
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full rounded-lg pl-8 pr-3 py-2 text-xs md:text-sm outline-none transition-all"
            style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <div className="flex gap-1.5 self-end">
          <button onClick={fetchHistory} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={downloadCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] md:text-xs font-semibold rounded-lg transition-colors" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>
      </div>

      {/* ━━━ TABLE ━━━ */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[9px] md:text-[10px] uppercase font-semibold tracking-wider" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th onClick={() => handleSort('entryDate')} className="p-3 md:p-4 cursor-pointer transition-colors hover:opacity-80">
                  <div className="flex items-center gap-1">Date <SortIcon column="entryDate"/></div>
                </th>
                <th onClick={() => handleSort('symbol')} className="p-3 md:p-4 cursor-pointer transition-colors hover:opacity-80">
                  <div className="flex items-center gap-1">Symbol <SortIcon column="symbol"/></div>
                </th>
                <th className="p-3 md:p-4 text-center hidden sm:table-cell">Strategy</th>
                <th onClick={() => handleSort('quantity')} className="p-3 md:p-4 text-right cursor-pointer transition-colors hover:opacity-80 hidden sm:table-cell">
                  <div className="flex items-center justify-end gap-1">Qty <SortIcon column="quantity"/></div>
                </th>
                <th onClick={() => handleSort('entryPrice')} className="p-3 md:p-4 text-right cursor-pointer transition-colors hover:opacity-80">
                  <div className="flex items-center justify-end gap-1">Entry <SortIcon column="entryPrice"/></div>
                </th>
                <th onClick={() => handleSort('exitPrice')} className="p-3 md:p-4 text-right cursor-pointer transition-colors hover:opacity-80 hidden md:table-cell">
                  <div className="flex items-center justify-end gap-1">Exit <SortIcon column="exitPrice"/></div>
                </th>
                <th onClick={() => handleSort('pnl')} className="p-3 md:p-4 text-right cursor-pointer transition-colors hover:opacity-80">
                  <div className="flex items-center justify-end gap-1">P&amp;L <SortIcon column="pnl"/></div>
                </th>
                <th className="p-3 md:p-4 text-center">Status</th>
                <th className="p-3 md:p-4 text-center w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: 'var(--accent-blue)', opacity: 0.4 }} />
                  </td>
                </tr>
              ) : paginatedTrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <AlertCircle className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No trades match your search.</p>
                  </td>
                </tr>
              ) : paginatedTrades.map((t) => (
                <tr key={t._id} className="group transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Date */}
                  <td className="p-3 md:p-4">
                    <div className="text-[10px] md:text-xs font-medium" style={{ color: 'var(--text)' }}>{new Date(t.entryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                    <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{new Date(t.entryDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>

                  {/* Symbol */}
                  <td className="p-3 md:p-4">
                    <span className="text-xs md:text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>{t.symbol}</span>
                  </td>

                  {/* Strategy */}
                  <td className="p-3 md:p-4 text-center hidden sm:table-cell">
                    <span className="px-2 py-0.5 rounded text-[9px] md:text-[10px] font-medium" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                      {t.strategy || 'MANUAL'}
                    </span>
                  </td>

                  {/* Qty */}
                  <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>{t.quantity}</td>

                  {/* Entry */}
                  <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight" style={{ color: 'var(--text-secondary)' }}>₹{t.entryPrice.toFixed(2)}</td>

                  {/* Exit */}
                  <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>
                    {t.exitPrice ? `₹${t.exitPrice.toFixed(2)}` : '—'}
                  </td>

                  {/* P&L */}
                  <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono font-semibold tabular-nums tracking-tight" style={{
                    color: (t.pnl || 0) > 0 ? 'var(--accent-green)' : (t.pnl || 0) < 0 ? 'var(--accent-red)' : 'var(--text-muted)'
                  }}>
                    {t.pnl ? formatPnL(t.pnl) : '—'}
                  </td>

                  {/* Status */}
                  <td className="p-3 md:p-4 text-center">
                    <span className="px-1.5 md:px-2 py-0.5 rounded-full text-[8px] md:text-[9px] font-semibold tracking-wider uppercase" style={{
                      background: t.status === 'CLOSED' ? 'var(--bg-elevated)' : 'var(--ring-blue)',
                      color: t.status === 'CLOSED' ? 'var(--text-muted)' : 'var(--accent-blue)',
                    }}>
                      {t.status}
                    </span>
                  </td>

                  {/* Delete */}
                  <td className="p-3 md:p-4 text-center">
                    <button 
                      onClick={() => handleDelete(t._id, t.symbol)}
                      className="p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ━━━ PAGINATION ━━━ */}
        {totalPages > 1 && (
          <div className="p-2.5 md:p-3 flex justify-between items-center" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-[10px] md:text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                style={{ color: 'var(--text-muted)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                style={{ color: 'var(--text-muted)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeHistory;