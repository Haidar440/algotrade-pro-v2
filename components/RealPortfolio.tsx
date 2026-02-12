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

    } catch (err) {
      console.error("Failed to fetch broker data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [brokerState.angel]);

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
      className={`p-4 font-bold text-xs text-slate-400 uppercase cursor-pointer hover:text-white transition-colors select-none group text-${align}`}
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
    <span className={`font-mono font-bold flex items-center justify-end gap-1 ${value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
      {value >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {formatCurrency(value)}
    </span>
  );

  if (!brokerState.angel) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
        <Briefcase className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-bold text-slate-300">Real Portfolio Locked</h2>
        <p>Connect your Angel One account in Settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 1. SUMMARY HEADER */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
         <div className="relative z-10">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Invested</div>
            <div className="text-2xl font-mono text-white font-bold">{formatCurrency(totalInvested)}</div>
         </div>
         <div className="relative z-10">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Current Value</div>
            <div className="text-2xl font-mono text-white font-bold">{formatCurrency(currentValue)}</div>
         </div>
         <div className="relative z-10">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Overall P&L</div>
            <div className={`text-2xl font-mono font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
               {totalPnL > 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </div>
         </div>
         <div className="flex items-center justify-end relative z-10">
            <button onClick={fetchData} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all shadow-lg border border-slate-700">
               <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
         </div>
      </div>

      {/* 2. TABS & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-800 pb-1">
         <div className="flex gap-1 overflow-x-auto w-full md:w-auto">
            {[
              { id: 'HOLDINGS', label: 'Holdings', icon: Briefcase },
              { id: 'POSITIONS', label: 'Positions', icon: Activity },
              { id: 'ORDERS', label: 'Orders', icon: List },
              { id: 'FUNDS', label: 'Funds', icon: Wallet },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as Tab); setSearchQuery(''); setCurrentPage(1); setSortConfig(null); }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
         </div>

         {/* Search Filter */}
         {activeTab !== 'FUNDS' && (
             <div className="relative w-full md:w-64 mb-2">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Filter Symbol..." 
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                />
             </div>
         )}
      </div>

      {/* 3. DATA TABLE */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 min-h-[300px] overflow-hidden flex flex-col">
        
        {/* FUNDS VIEW */}
        {activeTab === 'FUNDS' ? (
           <div className="p-8 max-w-lg mx-auto w-full">
              {funds ? (
                  <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-6 shadow-2xl">
                     <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-blue-500/20 rounded-full text-blue-400"><Wallet className="w-6 h-6" /></div>
                        <div><h3 className="text-lg font-bold text-white">Available Margin</h3></div>
                     </div>
                     <div className="text-4xl font-mono font-bold text-white mb-8">{formatCurrency(Number(funds.net))}</div>
                     <div className="space-y-4 text-sm">
                        <div className="flex justify-between border-b border-slate-700/50 pb-3"><span className="text-slate-400">Cash</span><span className="text-slate-200 font-mono">{formatCurrency(Number(funds.availablecash))}</span></div>
                        <div className="flex justify-between border-b border-slate-700/50 pb-3"><span className="text-slate-400">Used</span><span className="text-slate-200 font-mono">{formatCurrency(Number(funds.utilisedamount))}</span></div>
                     </div>
                  </div>
              ) : <div className="text-center text-slate-500 py-10">Loading Funds...</div>}
           </div>
        ) : (
           <>
             {/* TABLE HEADER */}
             <div className="overflow-x-auto flex-1">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-800/50 border-b border-slate-700">
                     {activeTab === 'HOLDINGS' && (
                        <>
                           <SortableHeader label="Symbol" sortKey="symbol" />
                           <SortableHeader label="Qty" sortKey="qty" align="right" />
                           <SortableHeader label="Avg Price" sortKey="avg" align="right" />
                           <SortableHeader label="LTP" sortKey="ltp" align="right" />
                           <SortableHeader label="Cur. Value" sortKey="value" align="right" />
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
                 <tbody className="text-sm divide-y divide-slate-800">
                   {paginatedData.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-500">No records found matching "{searchQuery}"</td></tr>
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
                         <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                           {activeTab === 'HOLDINGS' && (
                              <>
                                <td className="p-4 font-bold text-white">{symbol} <span className="ml-1 text-[10px] text-slate-500">EQ</span></td>
                                <td className="p-4 text-right text-slate-300">{qty}</td>
                                <td className="p-4 text-right text-slate-400">{Number(price).toFixed(2)}</td>
                                <td className="p-4 text-right text-white font-mono">{Number(ltp).toFixed(2)}</td>
                                <td className="p-4 text-right text-slate-300">{formatCurrency(val)}</td>
                                <td className="p-4 text-right"><PnlBadge value={pnl} /></td>
                              </>
                           )}
                           {activeTab === 'POSITIONS' && (
                              <>
                                <td className="p-4 font-bold text-white">{symbol}</td>
                                <td className="p-4"><span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300 uppercase">{item.producttype}</span></td>
                                <td className={`p-4 text-right font-bold ${Number(qty) > 0 ? 'text-blue-400' : Number(qty) < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{qty}</td>
                                <td className="p-4 text-right text-slate-400">{Number(price).toFixed(2)}</td>
                                <td className="p-4 text-right text-white">{Number(ltp).toFixed(2)}</td>
                                <td className="p-4 text-right"><PnlBadge value={pnl} /></td>
                              </>
                           )}
                           {activeTab === 'ORDERS' && (
                              <>
                                <td className="p-4 text-slate-500 text-xs">{item.updatetime?.split(' ')[1]}</td>
                                <td className="p-4 font-bold text-white">{symbol}</td>
                                <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded ${item.transactiontype === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{item.transactiontype}</span></td>
                                <td className="p-4 text-right text-slate-300">{qty}</td>
                                <td className="p-4 text-right text-slate-300">{price === 0 ? 'MKT' : price}</td>
                                <td className="p-4 text-right"><span className={`text-xs font-bold uppercase ${item.status === 'complete' ? 'text-emerald-500' : item.status === 'rejected' ? 'text-rose-500' : 'text-amber-500'}`}>{item.status}</span></td>
                              </>
                           )}
                         </tr>
                       );
                     })
                   )}
                 </tbody>
               </table>
             </div>

             {/* PAGINATION FOOTER */}
             {totalPages > 1 && (
               <div className="flex justify-between items-center p-4 border-t border-slate-800 bg-slate-900/30">
                  <div className="text-xs text-slate-500">
                     Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                     <button 
                       disabled={currentPage === 1}
                       onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                       className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-400 hover:text-white"
                     >
                       <ChevronLeft className="w-4 h-4" />
                     </button>
                     <button 
                       disabled={currentPage === totalPages}
                       onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                       className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-400 hover:text-white"
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