import React, { useState, useEffect, useMemo } from 'react';
import { BrokerState, AngelHolding, AngelPosition, AngelOrder, AngelFundDetails } from '../types';
import { AngelOne } from '../services/angel';
import { 
  RefreshCw, Briefcase, Activity, List, Wallet, 
  ArrowUpRight, ArrowDownRight, Search, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';

interface RealPortfolioProps {
  brokerState: BrokerState;
}

type Tab = 'HOLDINGS' | 'POSITIONS' | 'ORDERS' | 'FUNDS';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10; 

const RealPortfolio: React.FC<RealPortfolioProps> = ({ brokerState }) => {
  const [activeTab, setActiveTab] = useState<Tab>('HOLDINGS');
  
  // Data State
  const [holdings, setHoldings] = useState<AngelHolding[]>([]);
  const [positions, setPositions] = useState<AngelPosition[]>([]);
  const [orders, setOrders] = useState<AngelOrder[]>([]);
  const [funds, setFunds] = useState<AngelFundDetails | null>(null);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection } | null>(null);

  // --- Summary Metrics ---
  const [totalInvested, setTotalInvested] = useState(0);
  const [currentValue, setCurrentValue] = useState(0);
  const [totalPnL, setTotalPnL] = useState(0);

  const fetchData = async () => {
    if (!brokerState.angel) return;
    setLoading(true);
    setFetchError(null);
    
    try {
      const angel = new AngelOne(brokerState.angel);
      const [hData, pData, oData, fData] = await Promise.all([
        angel.getHoldings(),
        angel.getPositions(),
        angel.getOrderBook(),
        angel.getFunds()
      ]);

      setHoldings(hData || []);
      setPositions(pData || []);
      setOrders(oData || []);
      setFunds(fData);

      // Recalculate Totals
      let invested = 0;
      let curr = 0;
      (hData || []).forEach(h => {
         const qty = Number(h.quantity);
         const avg = Number(h.averageprice);
         const ltp = Number(h.ltp);
         invested += qty * avg;
         curr += qty * ltp;
      });

      setTotalInvested(invested);
      setCurrentValue(curr);
      setTotalPnL(curr - invested);

    } catch (err: any) {
      console.error("Failed to fetch broker data", err);
      setFetchError(err?.message || "Failed to fetch portfolio data. Make sure Angel One is connected.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on every mount (component remounts when navigating back)
  useEffect(() => { fetchData(); }, []);

  // --- SORTING HANDLER ---
  const handleSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // --- PROCESSING PIPELINE: FILTER -> SORT -> PAGINATE ---
  const processedData = useMemo(() => {
    const query = searchQuery.toLowerCase();
    
    let data: any[] = [];
    if (activeTab === 'HOLDINGS') data = holdings;
    else if (activeTab === 'POSITIONS') data = positions;
    else if (activeTab === 'ORDERS') data = orders;

    // 1. Filter
    let filtered = data.filter(item => 
        item.tradingsymbol?.toLowerCase().includes(query) || 
        item.symboltoken?.includes(query)
    );

    // 2. Sort
    if (sortConfig) {
      filtered.sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        // Extract values based on Tab & Key
        if (activeTab === 'HOLDINGS') {
           const hA = a as AngelHolding;
           const hB = b as AngelHolding;
           if (sortConfig.key === 'symbol') { valA = hA.tradingsymbol; valB = hB.tradingsymbol; }
           else if (sortConfig.key === 'qty') { valA = Number(hA.quantity); valB = Number(hB.quantity); }
           else if (sortConfig.key === 'avg') { valA = Number(hA.averageprice); valB = Number(hB.averageprice); }
           else if (sortConfig.key === 'ltp') { valA = Number(hA.ltp); valB = Number(hB.ltp); }
           else if (sortConfig.key === 'value') { valA = Number(hA.quantity) * Number(hA.ltp); valB = Number(hB.quantity) * Number(hB.ltp); }
           else if (sortConfig.key === 'pnl') { 
              valA = (Number(hA.ltp) - Number(hA.averageprice)) * Number(hA.quantity); 
              valB = (Number(hB.ltp) - Number(hB.averageprice)) * Number(hB.quantity); 
           }
        } 
        else if (activeTab === 'POSITIONS') {
           const pA = a as AngelPosition;
           const pB = b as AngelPosition;
           if (sortConfig.key === 'symbol') { valA = pA.tradingsymbol; valB = pB.tradingsymbol; }
           else if (sortConfig.key === 'product') { valA = pA.producttype; valB = pB.producttype; }
           else if (sortConfig.key === 'qty') { valA = Number(pA.netqty); valB = Number(pB.netqty); }
           else if (sortConfig.key === 'avg') { valA = Number(pA.buyavgprice); valB = Number(pB.buyavgprice); }
           else if (sortConfig.key === 'ltp') { valA = Number(pA.ltp); valB = Number(pB.ltp); }
           else if (sortConfig.key === 'pnl') { valA = Number(pA.pnl); valB = Number(pB.pnl); }
        }
        else if (activeTab === 'ORDERS') {
           const oA = a as AngelOrder;
           const oB = b as AngelOrder;
           if (sortConfig.key === 'time') { valA = oA.updatetime; valB = oB.updatetime; }
           else if (sortConfig.key === 'symbol') { valA = oA.tradingsymbol; valB = oB.tradingsymbol; }
           else if (sortConfig.key === 'type') { valA = oA.transactiontype; valB = oB.transactiontype; }
           else if (sortConfig.key === 'qty') { valA = Number(oA.quantity); valB = Number(oB.quantity); }
           else if (sortConfig.key === 'price') { valA = Number(oA.price); valB = Number(oB.price); }
           else if (sortConfig.key === 'status') { valA = oA.status; valB = oB.status; }
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [activeTab, holdings, positions, orders, searchQuery, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedData.slice(start, start + ITEMS_PER_PAGE);
  }, [processedData, currentPage]);

  const totalPages = Math.ceil(processedData.length / ITEMS_PER_PAGE);

  // --- COMPONENTS ---
  const SortableHeader = ({ label, sortKey, align = 'left' }: { label: string, sortKey: string, align?: 'left' | 'right' }) => (
    <th
      className="p-3 md:p-4 text-[9px] md:text-[10px] uppercase tracking-wider cursor-pointer transition-colors select-none group"
      style={{ color: 'var(--text-muted)', fontWeight: 600 }}
      onClick={() => handleSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {label}
        <span className="flex flex-col">
           {sortConfig?.key === sortKey ? (
              sortConfig.direction === 'asc'
                ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--accent-blue)' }} />
                : <ArrowDown className="w-3 h-3" style={{ color: 'var(--accent-blue)' }} />
           ) : (
              <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} />
           )}
        </span>
      </div>
    </th>
  );

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);

  const PnlBadge = ({ value }: { value: number }) => (
    <span className="font-mono font-semibold tabular-nums tracking-tight flex items-center justify-end gap-1 text-[10px] md:text-xs" style={{ color: value >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
      {value >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {formatCurrency(value)}
    </span>
  );

  if (!brokerState.angel) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]" style={{ color: 'var(--text-muted)' }}>
        <Briefcase className="w-12 h-12 mb-4 opacity-20" style={{ color: 'var(--text)' }} />
        <h2 className="text-base md:text-lg font-bold tracking-tight" style={{ color: 'var(--text-secondary)' }}>Real Portfolio Locked</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Connect your Angel One account in Settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">

      {/* ━━━ Error Banner ━━━ */}
      {fetchError && (
        <div className="p-3 md:p-4 rounded-xl flex items-center gap-3" style={{ background: 'var(--ring-red)', border: '1px solid rgba(239,68,68,0.15)', color: 'var(--accent-red)' }}>
          <Activity className="w-4 h-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-xs md:text-sm">Portfolio fetch failed</p>
            <p className="text-[10px] md:text-xs mt-0.5 opacity-60">{fetchError}</p>
          </div>
          <button onClick={fetchData} className="px-2.5 py-1.5 text-[10px] md:text-xs font-semibold rounded-lg transition-colors" style={{ background: 'var(--ring-red)', color: 'var(--accent-red)' }}>
            Retry
          </button>
        </div>
      )}

      {/* ━━━ SUMMARY HEADER ━━━ */}
      <div className="rounded-xl p-4 md:p-6 relative overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-6">
          <div>
            <div className="text-[9px] md:text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Invested</div>
            <div className="text-sm md:text-xl font-mono font-bold tabular-nums tracking-tight" style={{ color: 'var(--text)' }}>{formatCurrency(totalInvested)}</div>
          </div>
          <div>
            <div className="text-[9px] md:text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Current</div>
            <div className="text-sm md:text-xl font-mono font-bold tabular-nums tracking-tight" style={{ color: 'var(--text)' }}>{formatCurrency(currentValue)}</div>
          </div>
          <div>
            <div className="text-[9px] md:text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>P&amp;L</div>
            <div className="text-sm md:text-xl font-mono font-bold tabular-nums tracking-tight" style={{ color: totalPnL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {totalPnL > 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </div>
          </div>
          <div className="hidden md:flex items-center justify-end">
            <button onClick={fetchData} className="p-2.5 rounded-lg transition-all" style={{ color: loading ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ━━━ TABS & SEARCH ━━━ */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-2 md:gap-4">
        <div className="flex p-0.5 rounded-lg overflow-x-auto" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)' }}>
          {[
            { id: 'HOLDINGS', label: 'Holdings', icon: Briefcase },
            { id: 'POSITIONS', label: 'Positions', icon: Activity },
            { id: 'ORDERS', label: 'Orders', icon: List },
            { id: 'FUNDS', label: 'Funds', icon: Wallet },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as Tab); setSearchQuery(''); setCurrentPage(1); setSortConfig(null); }}
              className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-md text-[10px] md:text-xs font-semibold transition-all whitespace-nowrap"
              style={{
                background: activeTab === tab.id ? 'var(--bg-elevated)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'FUNDS' && (
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Filter symbol…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full rounded-lg pl-8 pr-3 py-2 text-xs md:text-sm outline-none transition-all"
              style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        )}

        {/* Mobile refresh */}
        <button onClick={fetchData} className="md:hidden p-2 self-end rounded-lg" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} style={{ color: loading ? 'var(--accent-blue)' : undefined }} />
        </button>
      </div>

      {/* ━━━ DATA TABLE ━━━ */}
      <div className="rounded-xl overflow-hidden flex flex-col min-h-[280px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

        {/* FUNDS VIEW */}
        {activeTab === 'FUNDS' ? (
          <div className="p-6 md:p-8 max-w-md mx-auto w-full">
            {funds ? (
              <div className="rounded-2xl p-5 md:p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-xl" style={{ background: 'var(--ring-blue)', color: 'var(--accent-blue)' }}><Wallet className="w-5 h-5" /></div>
                  <h3 className="text-sm md:text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>Available Margin</h3>
                </div>
                <div className="text-2xl md:text-3xl font-mono font-bold tabular-nums tracking-tight mb-6" style={{ color: 'var(--text)' }}>{formatCurrency(Number(funds.net))}</div>
                <div className="space-y-3 text-xs md:text-sm">
                  <div className="flex justify-between pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Cash</span>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(funds.availablecash))}</span>
                  </div>
                  <div className="flex justify-between pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Used</span>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(funds.utilisedamount))}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-xs" style={{ color: 'var(--text-muted)' }}>Loading Funds…</div>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left">
                <thead style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {activeTab === 'HOLDINGS' && (
                      <>
                        <SortableHeader label="Symbol" sortKey="symbol" />
                        <SortableHeader label="Qty" sortKey="qty" align="right" />
                        <SortableHeader label="Avg" sortKey="avg" align="right" />
                        <SortableHeader label="LTP" sortKey="ltp" align="right" />
                        <SortableHeader label="Value" sortKey="value" align="right" />
                        <SortableHeader label="P&amp;L" sortKey="pnl" align="right" />
                      </>
                    )}
                    {activeTab === 'POSITIONS' && (
                      <>
                        <SortableHeader label="Instrument" sortKey="symbol" />
                        <SortableHeader label="Product" sortKey="product" />
                        <SortableHeader label="Net Qty" sortKey="qty" align="right" />
                        <SortableHeader label="Avg Buy" sortKey="avg" align="right" />
                        <SortableHeader label="LTP" sortKey="ltp" align="right" />
                        <SortableHeader label="P&amp;L" sortKey="pnl" align="right" />
                      </>
                    )}
                    {activeTab === 'ORDERS' && (
                      <>
                        <SortableHeader label="Time" sortKey="time" />
                        <SortableHeader label="Symbol" sortKey="symbol" />
                        <SortableHeader label="Type" sortKey="type" />
                        <SortableHeader label="Qty" sortKey="qty" align="right" />
                        <SortableHeader label="Price" sortKey="price" align="right" />
                        <SortableHeader label="Status" sortKey="status" align="right" />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr><td colSpan={6} className="p-12 text-center text-xs" style={{ color: 'var(--text-muted)' }}>No records found{searchQuery ? ` matching "${searchQuery}"` : ''}</td></tr>
                  ) : (
                    paginatedData.map((item: any, i) => {
                      const symbol = item.tradingsymbol;
                      const qty = item.quantity || item.netqty;
                      const price = item.averageprice || item.buyavgprice || item.price;
                      const ltp = item.ltp || 0;

                      let pnl = item.pnl ? Number(item.pnl) : 0;
                      if (activeTab === 'HOLDINGS') {
                        pnl = (Number(ltp) * Number(qty)) - (Number(price) * Number(qty));
                      }
                      const val = Number(qty) * Number(ltp);

                      return (
                        <tr key={i} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                          {activeTab === 'HOLDINGS' && (
                            <>
                              <td className="p-3 md:p-4">
                                <span className="text-xs md:text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>{symbol}</span>
                                <span className="ml-1 text-[8px] md:text-[9px]" style={{ color: 'var(--text-muted)' }}>EQ</span>
                              </td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{qty}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight" style={{ color: 'var(--text-muted)' }}>{Number(price).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight" style={{ color: 'var(--text)' }}>{Number(ltp).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(val)}</td>
                              <td className="p-3 md:p-4 text-right"><PnlBadge value={pnl} /></td>
                            </>
                          )}
                          {activeTab === 'POSITIONS' && (
                            <>
                              <td className="p-3 md:p-4 text-xs md:text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>{symbol}</td>
                              <td className="p-3 md:p-4">
                                <span className="px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-medium uppercase" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{item.producttype}</span>
                              </td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono font-semibold tabular-nums" style={{ color: Number(qty) > 0 ? 'var(--accent-blue)' : Number(qty) < 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>{qty}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight" style={{ color: 'var(--text-muted)' }}>{Number(price).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight" style={{ color: 'var(--text)' }}>{Number(ltp).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right"><PnlBadge value={pnl} /></td>
                            </>
                          )}
                          {activeTab === 'ORDERS' && (
                            <>
                              <td className="p-3 md:p-4 text-[10px] md:text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{item.updatetime?.split(' ')[1]}</td>
                              <td className="p-3 md:p-4 text-xs md:text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>{symbol}</td>
                              <td className="p-3 md:p-4">
                                <span
                                  className="text-[8px] md:text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase"
                                  style={{
                                    background: item.transactiontype === 'BUY' ? 'var(--ring-green)' : 'var(--ring-red)',
                                    color: item.transactiontype === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)',
                                  }}
                                >{item.transactiontype}</span>
                              </td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{qty}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono tabular-nums tracking-tight" style={{ color: 'var(--text-secondary)' }}>{price === 0 ? 'MKT' : price}</td>
                              <td className="p-3 md:p-4 text-right">
                                <span
                                  className="text-[8px] md:text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                                  style={{
                                    background: item.status === 'complete' ? 'var(--ring-green)' : item.status === 'rejected' ? 'var(--ring-red)' : 'var(--ring-amber)',
                                    color: item.status === 'complete' ? 'var(--accent-green)' : item.status === 'rejected' ? 'var(--accent-red)' : 'var(--accent-amber)',
                                  }}
                                >{item.status}</span>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
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
          </>
        )}
      </div>
    </div>
  );
};

export default RealPortfolio;