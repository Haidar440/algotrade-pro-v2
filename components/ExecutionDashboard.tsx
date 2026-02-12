import React, { useEffect, useState } from 'react';
import { BrokerState, AngelOrder, AngelPosition, AngelHolding } from '../types';
import { AngelOne } from '../services/angel';
import { RefreshCw, XCircle, Briefcase, Clock, CheckCircle2, AlertOctagon, Timer, Layers, PieChart, Activity } from 'lucide-react';

interface ExecutionDashboardProps {
  brokerState: BrokerState;
}

const ExecutionDashboard: React.FC<ExecutionDashboardProps> = ({ brokerState }) => {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY' | 'POSITIONS' | 'HOLDINGS'>('PENDING');
  const [orders, setOrders] = useState<AngelOrder[]>([]);
  const [positions, setPositions] = useState<AngelPosition[]>([]);
  const [holdings, setHoldings] = useState<AngelHolding[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!brokerState.angel) return;
    setLoading(true);
    try {
      const angel = new AngelOne(brokerState.angel);
      const [ordData, posData, holdData] = await Promise.all([
        angel.getOrderBook(),
        angel.getPositions(),
        angel.getHoldings()
      ]);
      setOrders(ordData || []);
      setPositions(posData || []);
      setHoldings(holdData || []);
    } catch (e) {
      console.error("Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [brokerState]);

  const handleCancelOrder = async (orderId: string) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    try {
      const angel = new AngelOne(brokerState.angel);
      await angel.cancelOrder(orderId);
      setTimeout(fetchData, 1000); 
    } catch (e) { alert("Failed to cancel order"); }
  };

  const pendingStatuses = ['open', 'trigger pending', 'validation pending', 'after market order req received'];
  const pendingOrders = orders.filter(o => pendingStatuses.includes(o.orderstatus?.toLowerCase()));
  const historyOrders = orders.filter(o => !pendingStatuses.includes(o.orderstatus?.toLowerCase()));

  if (!brokerState.angel) return <div className="p-10 text-center text-slate-500">Please connect Angel One.</div>;

  return (
    <div className="space-y-6">
      
      <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-700">
         <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-emerald-400" /> My Portfolio
         </h1>
         <button onClick={fetchData} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors group">
            <RefreshCw className={`w-5 h-5 text-emerald-400 group-hover:rotate-180 transition-transform duration-500 ${loading ? 'animate-spin' : ''}`} />
         </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
         {[
            { id: 'PENDING', label: 'Pending', count: pendingOrders.length, icon: <Clock className="w-4 h-4"/> },
            { id: 'HISTORY', label: 'History', count: historyOrders.length, icon: <Layers className="w-4 h-4"/> },
            { id: 'POSITIONS', label: 'Positions', count: positions.length, icon: <Activity className="w-4 h-4"/> },
            { id: 'HOLDINGS', label: 'Holdings', count: holdings.length, icon: <PieChart className="w-4 h-4"/> }
         ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap border ${
                 activeTab === tab.id 
                 ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/20' 
                 : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
              }`}
            >
               {tab.icon}
               {tab.label}
               {tab.count > 0 && <span className="ml-1 bg-black/40 px-2 py-0.5 rounded-full text-xs">{tab.count}</span>}
            </button>
         ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[400px]">
         
         {activeTab === 'PENDING' && (
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left text-slate-400">
                  <thead className="bg-slate-800/80 text-xs uppercase font-bold text-slate-300">
                     <tr>
                        <th className="px-6 py-3">Time</th>
                        <th className="px-6 py-3">Symbol</th>
                        <th className="px-6 py-3">Action</th>
                        <th className="px-6 py-3">Qty</th>
                        <th className="px-6 py-3">Price</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Action</th>
                     </tr>
                  </thead>
                  <tbody>
                     {pendingOrders.map((o, i) => (
                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                           <td className="px-6 py-4 font-mono text-xs">{o.updatetime?.split(' ')[1]}</td>
                           <td className="px-6 py-4 font-bold text-white">{o.tradingsymbol}</td>
                           <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${o.transactiontype === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                 {o.transactiontype}
                              </span>
                           </td>
                           <td className="px-6 py-4">{o.filledshares}/{o.quantity}</td>
                           <td className="px-6 py-4 font-mono text-white">₹{o.price}</td>
                           <td className="px-6 py-4">
                              <span className="flex items-center gap-1 text-amber-400 font-bold text-xs bg-amber-400/10 px-2 py-1 rounded w-fit">
                                 <Timer className="w-3 h-3" /> {o.orderstatus}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <button onClick={() => handleCancelOrder(o.orderid)} className="text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 px-3 py-1.5 rounded font-bold text-xs transition-colors flex items-center gap-1 ml-auto">
                                 <XCircle className="w-4 h-4" /> Cancel
                              </button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               {pendingOrders.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                     <Clock className="w-12 h-12 mb-3 opacity-20" />
                     <p>No Open Orders</p>
                  </div>
               )}
            </div>
         )}

         {activeTab === 'HISTORY' && (
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left text-slate-400">
                  <thead className="bg-slate-800/80 text-xs uppercase font-bold text-slate-300">
                     <tr>
                        <th className="px-6 py-3">Time</th>
                        <th className="px-6 py-3">Symbol</th>
                        <th className="px-6 py-3">Action</th>
                        <th className="px-6 py-3">Price</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Details</th>
                     </tr>
                  </thead>
                  <tbody>
                     {historyOrders.map((o, i) => (
                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                           <td className="px-6 py-4 font-mono text-xs">{o.updatetime?.split(' ')[1]}</td>
                           <td className="px-6 py-4 font-bold text-white">{o.tradingsymbol}</td>
                           <td className={`px-6 py-4 font-bold ${o.transactiontype === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {o.transactiontype}
                           </td>
                           <td className="px-6 py-4 font-mono">₹{o.averageprice || o.price}</td>
                           <td className="px-6 py-4">
                              {o.orderstatus?.toLowerCase() === 'complete' ? (
                                 <span className="flex items-center gap-1 text-emerald-400 font-bold text-xs"><CheckCircle2 className="w-3 h-3" /> Executed</span>
                              ) : o.orderstatus?.toLowerCase() === 'rejected' ? (
                                 <span className="flex items-center gap-1 text-rose-400 font-bold text-xs"><AlertOctagon className="w-3 h-3" /> Rejected</span>
                              ) : (
                                 <span className="text-slate-400 font-bold text-xs">{o.orderstatus}</span>
                              )}
                           </td>
                           <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate" title={o.text}>
                              {o.text}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               {historyOrders.length === 0 && <div className="p-10 text-center text-slate-500">No Order History</div>}
            </div>
         )}

         {activeTab === 'POSITIONS' && (
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left text-slate-400">
                  <thead className="bg-slate-800 text-xs uppercase font-bold text-slate-300">
                     <tr>
                        <th className="px-6 py-3">Symbol</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Net Qty</th>
                        <th className="px-6 py-3">Avg</th>
                        <th className="px-6 py-3">LTP</th>
                        <th className="px-6 py-3 text-right">P&L</th>
                     </tr>
                  </thead>
                  <tbody>
                     {positions.map((p, i) => {
                        const pnl = parseFloat(p.pnl);
                        return (
                           <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30">
                              <td className="px-6 py-4 font-bold text-white">{p.tradingsymbol}</td>
                              <td className="px-6 py-4 text-xs uppercase">{p.producttype}</td>
                              <td className={`px-6 py-4 font-mono font-bold ${parseInt(p.netqty) > 0 ? 'text-emerald-400' : parseInt(p.netqty) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{p.netqty}</td>
                              <td className="px-6 py-4 font-mono">₹{p.buyavgprice}</td>
                              <td className="px-6 py-4 font-mono text-white">₹{p.ltp}</td>
                              <td className={`px-6 py-4 font-bold font-mono text-right ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                 {pnl >= 0 ? '+' : ''}{pnl}
                              </td>
                           </tr>
                        );
                     })}
                  </tbody>
               </table>
               {positions.length === 0 && <div className="p-10 text-center text-slate-500">No Open Positions</div>}
            </div>
         )}

         {activeTab === 'HOLDINGS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
               {holdings.length === 0 ? (
                  <div className="col-span-3 text-center text-slate-500 py-10">No Holdings Found</div>
               ) : (
                  holdings.map((h, i) => {
                     const pnl = parseFloat(h.profitandloss);
                     return (
                        <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:bg-slate-800 transition-colors group relative overflow-hidden">
                           <div className={`absolute top-0 left-0 w-1 h-full ${pnl >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                           <div className="flex justify-between items-start mb-3 pl-2">
                              <div>
                                 <h3 className="font-bold text-white text-lg">{h.tradingsymbol}</h3>
                                 <span className="text-xs text-slate-500">Qty: {h.quantity}</span>
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded ${pnl >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                 {h.pnlpercentage}%
                              </span>
                           </div>
                           <div className="flex justify-between items-end border-t border-slate-700 pt-3 pl-2">
                              <div>
                                 <div className="text-[10px] text-slate-500 uppercase font-bold">Invested</div>
                                 <div className="text-sm font-mono text-slate-300">₹{h.averageprice}</div>
                              </div>
                              <div className="text-right">
                                 <div className="text-[10px] text-slate-500 uppercase font-bold">P&L</div>
                                 <div className={`text-sm font-mono font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    ₹{pnl}
                                 </div>
                              </div>
                           </div>
                        </div>
                     )
                  })
               )}
            </div>
         )}

      </div>
    </div>
  );
};

export default ExecutionDashboard;