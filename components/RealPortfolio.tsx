import React, { useState, useEffect, useMemo } from 'react';
import { BrokerState, AngelHolding, AngelPosition, AngelOrder, AngelFundDetails } from '../types';
import { AngelOne } from '../services/angel';
import { getUserErrorMessage } from '../services/errorMessages';
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

    } catch (err: unknown) {
      console.error("Failed to fetch broker data", err);
      setFetchError(getUserErrorMessage(err, 'generic'));
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
      className={`p-3 md:p-4 font-semibold text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors select-none group`}
      onClick={() => handleSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {label}
        <span className="flex flex-col">
           {sortConfig?.key === sortKey ? (
              sortConfig.direction === 'asc' 
                ? <ArrowUp className="w-3 h-3 text-blue-400" /> 
                : <ArrowDown className="w-3 h-3 text-blue-400" />
           ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
           )}
        </span>
      </div>
    </th>
  );

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);

  const PnlBadge = ({ value }: { value: number }) => (
    <span className={`font-mono font-semibold tabular-nums tracking-tight flex items-center justify-end gap-1 text-[10px] md:text-xs ${value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
      {value >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {formatCurrency(value)}
    </span>
  );

  if (!brokerState.angel) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-600">
        <Briefcase className="w-12 h-12 mb-4 text-slate-800" />
        <h2 className="text-base md:text-lg font-bold text-slate-400 tracking-tight">Real Portfolio Locked</h2>
        <p className="text-xs text-slate-600 mt-1">Connect your Angel One account in Settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      
      {/* ━━━ Error Banner ━━━ */}
      {fetchError && (
        <div className="p-3 md:p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl flex items-center gap-3 text-rose-300">
          <Activity className="w-4 h-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-xs md:text-sm">Portfolio fetch failed</p>
            <p className="text-[10px] md:text-xs text-rose-400/60 mt-0.5">{fetchError}</p>
          </div>
          <button onClick={fetchData} className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] md:text-xs font-semibold rounded-lg transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* ━━━ SUMMARY HEADER ━━━ */}
      <div className="bg-[#0c1120] border border-white/[0.04] rounded-xl p-4 md:p-6 relative overflow-hidden">
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-6">
          <div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">Invested</div>
            <div className="text-sm md:text-xl font-mono font-bold text-white tabular-nums tracking-tight">{formatCurrency(totalInvested)}</div>
          </div>
          <div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">Current</div>
            <div className="text-sm md:text-xl font-mono font-bold text-white tabular-nums tracking-tight">{formatCurrency(currentValue)}</div>
          </div>
          <div>
            <div className="text-[9px] md:text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">P&L</div>
            <div className={`text-sm md:text-xl font-mono font-bold tabular-nums tracking-tight ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalPnL > 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </div>
          </div>
          <div className="hidden md:flex items-center justify-end">
            <button onClick={fetchData} className="p-2.5 hover:bg-white/[0.04] rounded-lg text-slate-500 hover:text-white transition-all">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ━━━ TABS & SEARCH ━━━ */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-2 md:gap-4">
        <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/[0.06] overflow-x-auto">
          {[
            { id: 'HOLDINGS', label: 'Holdings', icon: Briefcase },
            { id: 'POSITIONS', label: 'Positions', icon: Activity },
            { id: 'ORDERS', label: 'Orders', icon: List },
            { id: 'FUNDS', label: 'Funds', icon: Wallet },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as Tab); setSearchQuery(''); setCurrentPage(1); setSortConfig(null); }}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-md text-[10px] md:text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-white/[0.08] text-white' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'FUNDS' && (
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <input 
              type="text" 
              placeholder="Filter symbol..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-black/20 border border-white/[0.06] rounded-lg pl-8 pr-3 py-2 text-xs md:text-sm text-white placeholder-slate-600 focus:border-blue-500/50 outline-none transition-all"
            />
          </div>
        )}

        {/* Mobile refresh */}
        <button onClick={fetchData} className="md:hidden p-2 self-end hover:bg-white/[0.04] rounded-lg text-slate-500">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* ━━━ DATA TABLE ━━━ */}
      <div className="bg-[#0c1120] border border-white/[0.04] rounded-xl overflow-hidden flex flex-col min-h-[280px]">
        
        {/* FUNDS VIEW */}
        {activeTab === 'FUNDS' ? (
          <div className="p-6 md:p-8 max-w-md mx-auto w-full">
            {funds ? (
              <div className="bg-black/30 border border-white/[0.06] rounded-2xl p-5 md:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400"><Wallet className="w-5 h-5" /></div>
                  <h3 className="text-sm md:text-base font-bold text-white tracking-tight">Available Margin</h3>
                </div>
                <div className="text-2xl md:text-3xl font-mono font-bold text-white tabular-nums tracking-tight mb-6">{formatCurrency(Number(funds.net))}</div>
                <div className="space-y-3 text-xs md:text-sm">
                  <div className="flex justify-between border-b border-white/[0.04] pb-3">
                    <span className="text-slate-500">Cash</span>
                    <span className="text-slate-300 font-mono tabular-nums">{formatCurrency(Number(funds.availablecash))}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/[0.04] pb-3">
                    <span className="text-slate-500">Used</span>
                    <span className="text-slate-300 font-mono tabular-nums">{formatCurrency(Number(funds.utilisedamount))}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-600 py-10 text-xs">Loading Funds...</div>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left">
                <thead className="bg-black/30">
                  <tr>
                    {activeTab === 'HOLDINGS' && (
                      <>
                        <SortableHeader label="Symbol" sortKey="symbol" />
                        <SortableHeader label="Qty" sortKey="qty" align="right" />
                        <SortableHeader label="Avg" sortKey="avg" align="right" />
                        <SortableHeader label="LTP" sortKey="ltp" align="right" />
                        <SortableHeader label="Value" sortKey="value" align="right" />
                        <SortableHeader label="P&L" sortKey="pnl" align="right" />
                      </>
                    )}
                    {activeTab === 'POSITIONS' && (
                      <>
                        <SortableHeader label="Instrument" sortKey="symbol" />
                        <SortableHeader label="Product" sortKey="product" />
                        <SortableHeader label="Net Qty" sortKey="qty" align="right" />
                        <SortableHeader label="Avg Buy" sortKey="avg" align="right" />
                        <SortableHeader label="LTP" sortKey="ltp" align="right" />
                        <SortableHeader label="P&L" sortKey="pnl" align="right" />
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
                <tbody className="divide-y divide-white/[0.03]">
                  {paginatedData.length === 0 ? (
                    <tr><td colSpan={6} className="p-12 text-center text-slate-600 text-xs">No records found{searchQuery ? ` matching "${searchQuery}"` : ''}</td></tr>
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
                        <tr key={i} className="hover:bg-white/[0.015] transition-colors">
                          {activeTab === 'HOLDINGS' && (
                            <>
                              <td className="p-3 md:p-4">
                                <span className="text-xs md:text-sm font-bold text-white tracking-tight">{symbol}</span>
                                <span className="ml-1 text-[8px] md:text-[9px] text-slate-600">EQ</span>
                              </td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-slate-400 tabular-nums">{qty}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-slate-500 tabular-nums tracking-tight">{Number(price).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-white tabular-nums tracking-tight">{Number(ltp).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-slate-300 tabular-nums tracking-tight hidden sm:table-cell">{formatCurrency(val)}</td>
                              <td className="p-3 md:p-4 text-right"><PnlBadge value={pnl} /></td>
                            </>
                          )}
                          {activeTab === 'POSITIONS' && (
                            <>
                              <td className="p-3 md:p-4 text-xs md:text-sm font-bold text-white tracking-tight">{symbol}</td>
                              <td className="p-3 md:p-4">
                                <span className="bg-white/[0.04] text-slate-400 px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-medium uppercase">{item.producttype}</span>
                              </td>
                              <td className={`p-3 md:p-4 text-right text-[10px] md:text-xs font-mono font-semibold tabular-nums ${Number(qty) > 0 ? 'text-blue-400' : Number(qty) < 0 ? 'text-rose-400' : 'text-slate-600'}`}>{qty}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-slate-500 tabular-nums tracking-tight">{Number(price).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-white tabular-nums tracking-tight">{Number(ltp).toFixed(2)}</td>
                              <td className="p-3 md:p-4 text-right"><PnlBadge value={pnl} /></td>
                            </>
                          )}
                          {activeTab === 'ORDERS' && (
                            <>
                              <td className="p-3 md:p-4 text-[10px] md:text-xs text-slate-500 font-mono tabular-nums">{item.updatetime?.split(' ')[1]}</td>
                              <td className="p-3 md:p-4 text-xs md:text-sm font-bold text-white tracking-tight">{symbol}</td>
                              <td className="p-3 md:p-4">
                                <span className={`text-[8px] md:text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase ${
                                  item.transactiontype === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                }`}>{item.transactiontype}</span>
                              </td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-slate-400 tabular-nums">{qty}</td>
                              <td className="p-3 md:p-4 text-right text-[10px] md:text-xs font-mono text-slate-300 tabular-nums tracking-tight">{price === 0 ? 'MKT' : price}</td>
                              <td className="p-3 md:p-4 text-right">
                                <span className={`text-[8px] md:text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                                  item.status === 'complete' ? 'bg-emerald-500/10 text-emerald-400' 
                                  : item.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' 
                                  : 'bg-amber-500/10 text-amber-400'
                                }`}>{item.status}</span>
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
              <div className="border-t border-white/[0.04] p-2.5 md:p-3 flex justify-between items-center">
                <span className="text-[10px] md:text-xs text-slate-600 tabular-nums">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg hover:bg-white/[0.04] disabled:opacity-30 text-slate-500"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg hover:bg-white/[0.04] disabled:opacity-30 text-slate-500"
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