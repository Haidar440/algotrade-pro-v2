import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AutoTraderEngine, BotSnapshot, BotConfig, DEFAULT_BOT_CONFIG, LogEntry, ScanCandidate, ManagedTrade, BotPhase } from '../services/autoTraderEngine';
import { AngelOne } from '../services/angel';
import { BrokerState } from '../types';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Play, Square, Settings, Activity, Terminal, Shield, Search, RefreshCw, Zap, X,
  TrendingUp, TrendingDown, Target, BarChart3, Clock, AlertTriangle, ChevronDown,
  ChevronUp, Eye, Crosshair, Radio, Gauge, CircleDot, Bot, Cpu, Layers,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';

interface Props { brokerState: BrokerState; engine: AutoTraderEngine | null; }

const PHASE_META: Record<BotPhase, { label: string; color: string; icon: React.ReactNode }> = {
  IDLE: { label: 'Idle', color: '#64748b', icon: <CircleDot className="w-4 h-4" /> },
  SCANNING: { label: 'Scanning', color: '#3b82f6', icon: <Search className="w-4 h-4" /> },
  ANALYZING: { label: 'Analyzing', color: '#a855f7', icon: <Cpu className="w-4 h-4" /> },
  TRADING: { label: 'Trading', color: '#f59e0b', icon: <Zap className="w-4 h-4" /> },
  MONITORING: { label: 'Monitoring', color: '#10b981', icon: <Eye className="w-4 h-4" /> },
  COOLDOWN: { label: 'Cooldown', color: '#6366f1', icon: <Clock className="w-4 h-4" /> },
};

const STRAT_COLORS: Record<string, string> = {
  MOMENTUM: '#f59e0b', BREAKOUT: '#ef4444', MEAN_REVERSION: '#8b5cf6', TREND_FOLLOW: '#10b981',
};

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};

const AutoBotCommand: React.FC<Props> = ({ brokerState, engine }) => {
  const [snap, setSnap] = useState<BotSnapshot | null>(null);
  const [config, setConfig] = useState<BotConfig>({ ...DEFAULT_BOT_CONFIG });
  const [showConfig, setShowConfig] = useState(false);
  const [logFilter, setLogFilter] = useState<string>('ALL');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to the persistent engine from Dashboard
  useEffect(() => {
    if (!engine) return;
    // Re-attach callbacks so this component receives updates
    engine.setCallbacks(
      (s) => setSnap({ ...s }),
      (_) => {}
    );
    // Get current state immediately (engine may already be running)
    setSnap(engine.getSnapshot());

    // Also poll snapshot every 2s as a safety net (engine keeps running when this unmounts)
    const poll = setInterval(() => {
      if (engine) setSnap(engine.getSnapshot());
    }, 2000);

    return () => clearInterval(poll);
  }, [engine]);

  const prevLogCount = useRef(0);
  useEffect(() => {
    const count = snap?.logs?.length ?? 0;
    if (count > prevLogCount.current) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevLogCount.current = count;
  }, [snap?.logs?.length]);

  const handleStart = () => { engine?.updateConfig(config); engine?.start(); };
  const handleStop = () => engine?.stop();
  const handleScan = () => engine?.runDynamicScan();
  const handleExit = (sym: string) => engine?.manualExit(sym);
  const handleDismiss = (sym: string) => engine?.dismissStaleTrade(sym);

  const isRunning = snap?.isRunning ?? false;
  const phase = snap?.phase ?? 'IDLE';
  const pm = PHASE_META[phase];
  const trades = snap?.activeTrades ?? [];
  const candidates = snap?.candidates ?? [];
  const stats = snap?.stats ?? { totalTrades: 0, winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0, expectancy: 0, streak: 0, todayTrades: 0, todayPnL: 0 };
  const logs = snap?.logs ?? [];
  const dailyPnL = snap?.dailyPnL ?? 0;
  const equity = snap?.equityCurve ?? [];

  const filteredLogs = logFilter === 'ALL' ? logs : logs.filter(l => l.level === logFilter);

  if (!engine) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Bot className="w-16 h-16 text-slate-600 mb-4" />
      <h2 className="text-xl font-bold text-white mb-2">Connect Broker First</h2>
      <p className="text-slate-400 text-sm">Angel One connection required to run the Auto-Bot engine.</p>
    </div>
  );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ═══ COMMAND BAR ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full" style={{ background: `radial-gradient(circle, ${pm.color}40, transparent 70%)`, animation: isRunning ? 'pulse 3s ease-in-out infinite' : 'none' }} />
        </div>
        <div className="relative p-5 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {/* Phase Indicator */}
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${pm.color}20`, border: `2px solid ${pm.color}60` }}>
                <div style={{ color: pm.color }}>{pm.icon}</div>
              </div>
              {isRunning && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900 animate-pulse" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">Auto-Bot Engine</h2>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: `${pm.color}20`, color: pm.color }}>{pm.label}</span>
                {config.isPaperTrading && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">PAPER</span>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                {isRunning && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtTime((snap?.uptimeSeconds ?? 0) * 1000)}</span>}
                <span>{trades.length} active · {stats.totalTrades} total</span>
                {snap?.scannedCount ? <span>· {snap.scannedCount} scanned</span> : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleScan} disabled={phase === 'SCANNING'} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl flex items-center gap-2 transition-all disabled:opacity-50 border border-slate-700">
              <Search className={`w-4 h-4 ${phase === 'SCANNING' ? 'animate-spin' : ''}`} /> {phase === 'SCANNING' ? 'Scanning...' : 'Scan Stocks'}
            </button>
            <button onClick={() => setShowConfig(!showConfig)} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all border border-slate-700">
              <Settings className="w-4 h-4" />
            </button>
            {isRunning ? (
              <button onClick={handleStop} className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-rose-900/30 transition-all">
                <Square className="w-4 h-4 fill-current" /> STOP
              </button>
            ) : (
              <button onClick={handleStart} className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all">
                <Play className="w-4 h-4 fill-current" /> START
              </button>
            )}
          </div>
        </div>

        {/* P&L Strip */}
        <div className="border-t border-slate-700/50 px-5 py-3 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase font-bold text-[10px]">Session P&L</span>
            <span className={`text-lg font-black font-mono ${dailyPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {dailyPnL >= 0 ? '+' : ''}₹{dailyPnL.toFixed(0)}
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Win: <b className="text-white">{stats.winRate.toFixed(0)}%</b></span>
            <span>PF: <b className="text-white">{stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(1)}</b></span>
            <span>DD: <b className="text-white">{stats.maxDrawdown.toFixed(1)}%</b></span>
            <span>Streak: <b className={stats.streak > 0 ? 'text-emerald-400' : stats.streak < 0 ? 'text-rose-400' : 'text-white'}>{stats.streak > 0 ? '+' : ''}{stats.streak}</b></span>
          </div>
        </div>
      </div>

      {/* ═══ CONFIG PANEL (Collapsible) ═══ */}
      {showConfig && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 duration-300">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Settings className="w-4 h-4 text-blue-400" /> Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Capital (₹)', key: 'capital', type: 'number' },
              { label: 'Risk/Trade %', key: 'riskPerTrade', type: 'number' },
              { label: 'Max Daily Loss ₹', key: 'maxDailyLoss', type: 'number' },
              { label: 'Max Positions', key: 'maxOpenPositions', type: 'number' },
              { label: 'Scan Interval (min)', key: 'scanInterval', type: 'number' },
              { label: 'Min Confidence', key: 'minConfidence', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">{f.label}</label>
                <input type={f.type} value={(config as any)[f.key]} onChange={e => setConfig({ ...config, [f.key]: parseFloat(e.target.value) || 0 })} disabled={isRunning}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-blue-500 outline-none disabled:opacity-50" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <label className="text-[9px] text-slate-500 uppercase font-bold">Strategies</label>
            {(['MOMENTUM', 'BREAKOUT', 'MEAN_REVERSION', 'TREND_FOLLOW'] as const).map(s => (
              <button key={s} disabled={isRunning} onClick={() => {
                const has = config.strategies.includes(s);
                setConfig({ ...config, strategies: has ? config.strategies.filter(x => x !== s) : [...config.strategies, s] });
              }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${config.strategies.includes(s) ? 'text-white border-transparent' : 'text-slate-500 border-slate-700 bg-slate-800'}`}
                style={config.strategies.includes(s) ? { background: `${STRAT_COLORS[s]}30`, borderColor: `${STRAT_COLORS[s]}60`, color: STRAT_COLORS[s] } : {}}>
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.isPaperTrading} onChange={e => setConfig({ ...config, isPaperTrading: e.target.checked })} disabled={isRunning} className="rounded" />
              <span className="text-xs text-slate-300">Paper Trading Mode</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.enableTrailingSL} onChange={e => setConfig({ ...config, enableTrailingSL: e.target.checked })} disabled={isRunning} className="rounded" />
              <span className="text-xs text-slate-300">Trailing Stop Loss</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.enableDynamicStocks} onChange={e => setConfig({ ...config, enableDynamicStocks: e.target.checked })} disabled={isRunning} className="rounded" />
              <span className="text-xs text-slate-300">Dynamic Stock Discovery</span>
            </label>
          </div>
        </div>
      )}

      {/* ═══ MAIN GRID ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── LEFT: Candidates Radar ── */}
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Crosshair className="w-4 h-4 text-orange-400" /> Stock Radar</h3>
              <span className="text-[10px] text-slate-500">{candidates.length} candidates</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {candidates.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <Radio className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  Click "Scan Stocks" to discover candidates
                </div>
              ) : candidates.map((c, i) => (
                <div key={c.symbol} className="px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-white font-bold text-sm">{c.symbol}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-2" style={{ background: `${STRAT_COLORS[c.strategy] || '#64748b'}20`, color: STRAT_COLORS[c.strategy] || '#64748b' }}>
                        {c.strategy.replace('_', ' ')}
                      </span>
                    </div>
                    <div className={`text-lg font-black ${c.score >= 60 ? 'text-emerald-400' : c.score >= 40 ? 'text-amber-400' : 'text-slate-500'}`}>{c.score}</div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>₹{c.price?.toLocaleString('en-IN')}</span>
                    <span className={c.changePct > 0 ? 'text-emerald-400' : c.changePct < 0 ? 'text-rose-400' : ''}>{c.changePct > 0 ? '+' : ''}{c.changePct?.toFixed(1)}%</span>
                    <span>RSI: {c.rsi}</span>
                    {c.volRatio > 1.3 && <span className="text-orange-400">Vol: {c.volRatio}x</span>}
                  </div>
                  {/* Score bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                    <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${c.score}%`, background: c.score >= 60 ? '#10b981' : c.score >= 40 ? '#f59e0b' : '#64748b' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Watchlist */}
          {(snap?.watchlist?.length ?? 0) > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Active Watchlist</h3>
              <div className="flex flex-wrap gap-1.5">
                {snap?.watchlist?.map(s => (
                  <span key={s} className="px-2 py-1 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER: Equity + Positions ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Equity Curve */}
          {equity.length > 2 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4 text-blue-400" /> Equity Curve</h3>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={equity.map(e => ({ time: new Date(e.time).toLocaleTimeString(), equity: e.equity }))}>
                  <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} domain={['dataMin - 500', 'dataMax + 500']} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} fill="url(#eqGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Active Positions */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /> Active Positions</h3>
              <span className="text-[10px] text-slate-500 font-mono">{trades.length} open</span>
            </div>
            {trades.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No active trades. Start the engine and scan for stocks.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">Current</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">P&L</th>
                    <th className="px-3 py-2 text-center">Target</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr></thead>
                  <tbody>{trades.map(t => {
                    const pnlPct = t.pnlPercent || 0;
                    const targetProg = t.targets.length > 0 ? (t.currentTarget / t.targets.length) * 100 : 0;
                    const todayStr = new Date().toDateString();
                    const entryDay = new Date(t.entryTime).toDateString();
                    const isStale = entryDay !== todayStr;
                    const entryLabel = isStale
                      ? new Date(t.entryTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                      : null;
                    return (
                      <tr key={t.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${isStale ? 'opacity-70' : ''}`}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold">{t.symbol}</span>
                            {isStale && (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wide">
                                STALE {entryLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${STRAT_COLORS[t.strategy] || '#64748b'}20`, color: STRAT_COLORS[t.strategy] || '#64748b' }}>{t.strategy.replace('_', ' ')}</span>
                            <span className="text-[9px] text-slate-600">{t.state}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-300 font-mono">₹{t.entryPrice.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right text-white font-mono font-bold">
                          {isStale
                            ? <span className="text-amber-400 text-[10px]">Fetching...</span>
                            : `₹${t.currentPrice?.toFixed(1) || '...'}`
                          }
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-300">{t.quantity}</td>
                        <td className={`px-3 py-2.5 text-right font-bold font-mono ${isStale ? 'text-slate-500' : t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          <div>{isStale ? '—' : `${t.pnl >= 0 ? '+' : ''}₹${t.pnl.toFixed(0)}`}</div>
                          {!isStale && <div className="text-[9px] opacity-70">{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 justify-center">
                            {[0, 1, 2].map(i => (
                              <div key={i} className={`w-2 h-2 rounded-full ${i < t.currentTarget ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                            ))}
                          </div>
                          <div className="text-[9px] text-slate-500 text-center mt-0.5">T{t.currentTarget}/{t.targets.length}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isStale ? (
                            <button
                              onClick={() => handleDismiss(t.symbol)}
                              title="Remove this stale position from the panel. Go to Trade History to close it in the DB."
                              className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold transition-all"
                            >DISMISS</button>
                          ) : (
                            <button onClick={() => handleExit(t.symbol)} className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold transition-all">EXIT</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* System Logs */}
          <div className="bg-[#0b1120] rounded-xl border border-slate-800 overflow-hidden flex flex-col h-[250px]">
            <div className="bg-slate-900/50 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase"><Terminal className="w-3.5 h-3.5" /> Logs</div>
              <div className="flex gap-1">
                {['ALL', 'TRADE', 'SIGNAL', 'ERROR'].map(f => (
                  <button key={f} onClick={() => setLogFilter(f)} className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${logFilter === f ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5">
              {filteredLogs.length === 0 && <div className="text-slate-600 text-center py-8">No logs yet. Start the engine to see activity.</div>}
              {filteredLogs.map((log, i) => (
                <div key={i} className={`py-0.5 flex items-start gap-2 ${
                  log.level === 'ERROR' ? 'text-rose-400' :
                  log.level === 'TRADE' ? 'text-emerald-400' :
                  log.level === 'SIGNAL' ? 'text-blue-400' :
                  log.level === 'WARN' ? 'text-amber-400' :
                  'text-slate-400'
                }`}>
                  <span className="text-slate-600 shrink-0">{new Date(log.time).toLocaleTimeString()}</span>
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-800/50 shrink-0">{log.level}</span>
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoBotCommand;
