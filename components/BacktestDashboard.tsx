import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BacktestResult, BrokerState } from '../types';
import { runStrategyBacktest } from '../services/backtestEngine';
import { PlayCircle, Activity, Loader2, AlertTriangle, Lock, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { INDIAN_STOCKS } from '../services/stockData';

interface BacktestDashboardProps {
  brokerState?: BrokerState;
}

const BacktestDashboard: React.FC<BacktestDashboardProps> = ({ brokerState }) => {
  const [selectedStock, setSelectedStock] = useState(INDIAN_STOCKS[0].symbol);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('VCP Setup');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunBacktest = async () => {
    if (!brokerState?.angel) {
       setError("Angel One connection required to fetch historical data.");
       return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const data = await runStrategyBacktest(selectedStock, selectedStrategy, brokerState);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest Failed");
    } finally {
      setIsRunning(false);
    }
  };

  if (!brokerState?.angel) {
     return (
       <div className="max-w-7xl mx-auto mt-10 p-8 text-center glass-panel border border-amber-500/20 rounded-2xl">
          <Lock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Restricted Access</h2>
          <p className="text-slate-400 mb-6">Real-World Backtesting requires access to historical market data via Angel One.</p>
          <div className="inline-block bg-amber-500/10 text-amber-200 px-4 py-2 rounded-lg text-sm border border-amber-500/20">
             Please go to Settings and connect your Angel One account.
          </div>
       </div>
     );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Controls */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-700 bg-slate-800/40">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Activity className="text-purple-400" /> Strategy Backtester
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Simulate strategies on 200 Days of Real Market Data
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
             <select 
               value={selectedStock} 
               onChange={(e) => setSelectedStock(e.target.value)}
               className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 outline-none min-w-[150px]"
             >
                {INDIAN_STOCKS.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
             </select>

             <select 
               value={selectedStrategy} 
               onChange={(e) => setSelectedStrategy(e.target.value)}
               className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 outline-none"
             >
                <option value="VCP Setup">VCP (Volatility Contraction)</option>
                <option value="Trend Following (ADX)">Trend Following (ADX)</option>
                <option value="Golden Cross">Golden Cross</option>
                <option value="20-Day Breakout">20-Day Breakout</option>
                <option value="VWAP Reversion">VWAP Reversion</option>
                <option value="RSI Divergence">RSI Divergence</option>
                <option value="Bollinger Squeeze">Bollinger Squeeze</option>
                <option value="Volume Spread (VPA)">Volume Spread (VPA)</option>
                <option value="50 EMA Pullback">50 EMA Pullback</option>
                <option value="Inside Bar Breakout">Inside Bar Breakout</option>
                <option value="MA Trend Ride">MA Trend Ride</option>
             </select>

             <button 
               onClick={handleRunBacktest}
               disabled={isRunning}
               className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
             >
               {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
               Run Test
             </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-200">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {isRunning && (
        <div className="p-12 text-center text-slate-400 animate-pulse flex flex-col items-center gap-2">
           <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
           Running {selectedStrategy} simulation on {selectedStock}...
        </div>
      )}

      {result && (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
               <div className="text-xs text-slate-400 uppercase font-bold mb-1">Net Profit</div>
               <div className={`text-2xl font-mono font-bold ${result.metrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                 {result.metrics.netProfit >= 0 ? '+' : ''}₹{result.metrics.netProfit.toLocaleString()}
               </div>
            </div>
            
            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
               <div className="text-xs text-slate-400 uppercase font-bold mb-1">Win Rate</div>
               <div className="text-2xl font-mono font-bold text-amber-400">
                 {result.metrics.winRate.toFixed(1)}%
               </div>
               <div className="text-[10px] text-slate-500">{result.metrics.totalTrades} Trades Executed</div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
               <div className="text-xs text-slate-400 uppercase font-bold mb-1">Profit Factor</div>
               <div className="text-2xl font-mono font-bold text-blue-400">
                 {result.metrics.profitFactor.toFixed(2)}
               </div>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-800/50">
               <div className="text-xs text-slate-400 uppercase font-bold mb-1">Max Drawdown</div>
               <div className="text-2xl font-mono font-bold text-rose-400">
                 -{result.metrics.maxDrawdown.toFixed(1)}%
               </div>
            </div>
          </div>

          {/* Equity Curve Chart & Guide */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 glass-panel p-6 rounded-xl border border-slate-700 bg-slate-800/30">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                       <TrendingUp className="w-5 h-5 text-purple-400" /> 
                       Equity Curve (Account Growth)
                    </h3>
                    <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">Start: ₹1,00,000</span>
                 </div>
                 
                 <div className="h-[320px] w-full">
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={result.equityCurve}>
                        <defs>
                          <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis 
                           dataKey="date" 
                           stroke="#64748b" 
                           fontSize={10} 
                           tickFormatter={(str) => str.slice(5)} 
                           minTickGap={30}
                        />
                        <YAxis 
                           stroke="#64748b" 
                           fontSize={10} 
                           domain={['auto', 'auto']}
                           tickFormatter={(val) => `₹${(val/1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                          itemStyle={{ color: '#a855f7', fontWeight: 'bold' }}
                          formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Account Value']}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        {/* Breakeven Line */}
                        <ReferenceLine y={100000} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'insideBottomRight', value: 'Initial Capital', fill: '#64748b', fontSize: 10 }} />
                        
                        <Area 
                           type="monotone" 
                           dataKey="equity" 
                           stroke="#a855f7" 
                           fillOpacity={1} 
                           fill="url(#colorEquity)" 
                           strokeWidth={2} 
                        />
                     </AreaChart>
                   </ResponsiveContainer>
                 </div>
             </div>

             {/* How to Read This Chart */}
             <div className="glass-panel p-5 rounded-xl border border-slate-700 bg-slate-800/20">
                <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                   <Info className="w-4 h-4 text-blue-400" /> How to read this?
                </h4>
                <ul className="space-y-4 text-xs text-slate-400">
                   <li className="flex gap-3">
                      <div className="mt-0.5 p-1 bg-purple-500/20 rounded">
                         <TrendingUp className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                         <strong className="text-slate-200 block mb-0.5">Rising Line</strong>
                         Strategy is profitable. Your account balance is growing.
                      </div>
                   </li>
                   <li className="flex gap-3">
                      <div className="mt-0.5 p-1 bg-rose-500/20 rounded">
                         <TrendingDown className="w-4 h-4 text-rose-400" />
                      </div>
                      <div>
                         <strong className="text-slate-200 block mb-0.5">Falling Line (Drawdown)</strong>
                         Strategy is losing money. Deep drops indicate high risk.
                      </div>
                   </li>
                   <li className="flex gap-3">
                      <div className="mt-0.5 p-1 bg-slate-700/50 rounded">
                         <div className="w-4 h-0.5 bg-slate-400 mt-2"></div>
                      </div>
                      <div>
                         <strong className="text-slate-200 block mb-0.5">Flat Line</strong>
                         No trades active. The strategy is waiting for a setup.
                      </div>
                   </li>
                </ul>
             </div>
          </div>

          {/* Trade Table */}
          <div className="glass-panel rounded-xl overflow-hidden border border-slate-700 bg-slate-800/30">
             <div className="p-4 border-b border-slate-700 bg-slate-800/50">
               <h3 className="font-bold text-white">Trade History</h3>
             </div>
             <div className="overflow-x-auto max-h-[300px]">
               {result.trades.length === 0 ? (
                 <div className="p-8 text-center text-slate-500">No trades generated. Strategy conditions were not met in this period.</div>
               ) : (
                 <table className="w-full text-sm text-left">
                   <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 sticky top-0 backdrop-blur-sm">
                     <tr>
                       <th className="px-4 py-3">Entry Date</th>
                       <th className="px-4 py-3">Exit Date</th>
                       <th className="px-4 py-3">Type</th>
                       <th className="px-4 py-3 text-right">Entry</th>
                       <th className="px-4 py-3 text-right">Exit</th>
                       <th className="px-4 py-3 text-right">ROI</th>
                       <th className="px-4 py-3 text-right">P&L</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-700/50">
                     {result.trades.map((trade) => (
                       <tr key={trade.id} className="hover:bg-slate-700/20">
                         <td className="px-4 py-3 text-slate-400">{trade.entryDate}</td>
                         <td className="px-4 py-3 text-slate-400">{trade.exitDate}</td>
                         <td className="px-4 py-3">
                           <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold border border-emerald-500/20">
                             {trade.type}
                           </span>
                         </td>
                         <td className="px-4 py-3 text-right font-mono text-slate-300">₹{trade.entryPrice.toFixed(2)}</td>
                         <td className="px-4 py-3 text-right font-mono text-slate-300">₹{trade.exitPrice.toFixed(2)}</td>
                         <td className={`px-4 py-3 text-right font-bold ${trade.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                           {trade.roi.toFixed(2)}%
                         </td>
                         <td className={`px-4 py-3 text-right font-mono font-bold ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                           {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl.toFixed(0)}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               )}
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BacktestDashboard;