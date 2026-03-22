import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BacktestResult, BrokerState } from '../types';
import { secureGet, securePost } from '../services/api';
import { getUserErrorMessage } from '../services/errorMessages';
import { PlayCircle, Activity, Loader2, AlertTriangle, Lock, Info, TrendingUp, TrendingDown, Wifi, WifiOff, Database } from 'lucide-react';
import { INDIAN_STOCKS } from '../services/stockData';

/** Map frontend display names to backend registry keys */
const STRATEGY_MAP: Record<string, string> = {
  'Supertrend + RSI': 'supertrend_rsi',
  'VWAP ORB': 'vwap_orb',
  'EMA + ADX': 'ema_adx',
  'RSI + MACD': 'rsi_macd',
  'VCP Breakout': 'vcp_breakout',
  'Volume Breakout': 'volume_breakout',
};

interface BacktestDashboardProps {
  brokerState?: BrokerState;
}

const BacktestDashboard: React.FC<BacktestDashboardProps> = ({ brokerState }) => {
  const [selectedStock, setSelectedStock] = useState(INDIAN_STOCKS[0].symbol);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('Supertrend + RSI');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendStrategies, setBackendStrategies] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState<'auto' | 'angel_one' | 'yfinance'>('auto');
  const [backendBrokerConnected, setBackendBrokerConnected] = useState(false);
  const [backendBrokerName, setBackendBrokerName] = useState<string | null>(null);

  // Check both: localStorage brokerState AND backend broker status
  const isAngelConnected = backendBrokerConnected || !!(brokerState?.angel?.jwtToken);

  // Fetch available strategies + broker status from backend on mount
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const data: any = await secureGet('/backtest/strategies');
        if (Array.isArray(data)) setBackendStrategies(data);
      } catch (e) { console.warn("Could not load strategies from backend"); }
    };
    const checkBrokerStatus = async () => {
      try {
        const data: any = await secureGet('/broker/status');
        setBackendBrokerConnected(!!data?.connected);
        setBackendBrokerName(data?.broker || null);
      } catch (e) { console.warn("Could not check broker status"); }
    };
    loadStrategies();
    checkBrokerStatus();
  }, [brokerState]);

  const handleRunBacktest = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      // Use backend API with selected data source
      const backendStrategyName = STRATEGY_MAP[selectedStrategy] || selectedStrategy;
      // Strip .NS suffix — backend handles it internally
      const cleanSymbol = selectedStock.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');
      const res: any = await securePost('/backtest/run', {
        strategy_name: backendStrategyName,
        symbol: cleanSymbol,
        cash: 100000,
        commission: 0.002,
        days: 365,
        data_source: dataSource === 'auto' ? null : dataSource,
      });

      if (!res?.success && res?.error) {
        setError(res.error);
        return;
      }

      // Map backend response to frontend BacktestResult type
      const stats = res.stats || {};
      const mappedResult: BacktestResult = {
        symbol: selectedStock,
        strategy: selectedStrategy,
        trades: (res.trades || []).map((t: any, i: number) => ({
          id: `tr_${i}`,
          type: 'BUY',
          entryDate: t.entry_date || '',
          exitDate: t.exit_date || '',
          entryPrice: t.entry_price || 0,
          exitPrice: t.exit_price || 0,
          quantity: t.size || 1,
          pnl: t.pnl || 0,
          roi: t.return_pct || 0,
          holdingPeriod: t.duration || 1,
        })),
        equityCurve: (res.equity_curve || []).map((p: any) => ({
          date: p.date || '',
          equity: p.equity || 100000,
        })),
        metrics: {
          totalTrades: stats.total_trades || 0,
          winRate: stats.win_rate_pct || 0,
          profitFactor: stats.profit_factor || 0,
          netProfit: stats.return_pct ? (stats.return_pct / 100) * 100000 : 0,
          maxDrawdown: stats.max_drawdown_pct || 0,
          avgWin: stats.avg_trade_pct || 0,
          avgLoss: stats.avg_trade_pct || 0,
          expectancy: stats.expectancy || 0,
        },
      };

      setResult(mappedResult);
    } catch (err: unknown) {
      setError(getUserErrorMessage(err, 'backtest'));
    } finally {
      setIsRunning(false);
    }
  };

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
              Simulate strategies on Real Market Data
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
                {Object.keys(STRATEGY_MAP).map(s => <option key={s} value={s}>{s}</option>)}
             </select>

             {/* Data Source Toggle */}
             <select
               value={dataSource}
               onChange={(e) => setDataSource(e.target.value as 'auto' | 'angel_one' | 'yfinance')}
               className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5 outline-none"
             >
               <option value="auto">📡 Auto (Best Available)</option>
               <option value="angel_one">🔴 Angel One (Live Data)</option>
               <option value="yfinance">🟢 Yahoo Finance (Free)</option>
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

        {/* Data Source Status Bar */}
        <div className="mt-4 flex items-center gap-3 text-xs">
          {isAngelConnected ? (
            <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <Wifi className="w-3 h-3" /> Angel One Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <WifiOff className="w-3 h-3" /> Angel One Not Connected
            </span>
          )}
          <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">
            <Database className="w-3 h-3" /> Yahoo Finance Available
          </span>
          {dataSource === 'angel_one' && !isAngelConnected && (
            <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
              <AlertTriangle className="w-3 h-3" /> Connect Angel One in Settings to use live data
            </span>
          )}
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