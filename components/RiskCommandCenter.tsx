import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield, AlertTriangle, Target, TrendingUp, TrendingDown,
  Calculator, BarChart3, Activity, Zap, DollarSign,
  ChevronRight, Info, RefreshCw, PieChart
} from 'lucide-react';
import { BrokerState, PaperTrade } from '../types';

interface RiskCommandCenterProps {
  brokerState: BrokerState;
}

/* ─── tiny sparkline ─── */
const MiniSparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 120, h = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return <svg width={w} height={h} className="opacity-60"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
};

/* ─── animated gauge ─── */
const RiskGauge: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped < 30 ? '#10b981' : clamped < 60 ? '#f59e0b' : clamped < 80 ? '#f97316' : '#ef4444';
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (clamped / 100) * circumference * 0.75;
  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="80" viewBox="0 0 100 90">
        <path d="M 10 70 A 40 40 0 1 1 90 70" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
        <path d="M 10 70 A 40 40 0 1 1 90 70" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference * 0.75} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s' }} />
        <text x="50" y="55" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">{clamped.toFixed(0)}%</text>
      </svg>
      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{label}</span>
    </div>
  );
};

const RiskCommandCenter: React.FC<RiskCommandCenterProps> = ({ brokerState }) => {
  /* ─── Position Sizing Calculator ─── */
  const [capital, setCapital] = useState(100000);
  const [riskPct, setRiskPct] = useState(2);
  const [entryPrice, setEntryPrice] = useState(0);
  const [stopLoss, setStopLoss] = useState(0);
  const [targetPrice, setTargetPrice] = useState(0);

  const calc = useMemo(() => {
    const riskAmt = capital * (riskPct / 100);
    const slDiff = entryPrice && stopLoss ? Math.abs(entryPrice - stopLoss) : 0;
    const qty = slDiff > 0 ? Math.floor(riskAmt / slDiff) : 0;
    const posSize = qty * entryPrice;
    const potentialLoss = qty * slDiff;
    const potentialGain = targetPrice && entryPrice ? qty * Math.abs(targetPrice - entryPrice) : 0;
    const rr = potentialLoss > 0 ? potentialGain / potentialLoss : 0;
    const capitalUsed = capital > 0 ? (posSize / capital) * 100 : 0;
    return { riskAmt, qty, posSize, potentialLoss, potentialGain, rr, capitalUsed };
  }, [capital, riskPct, entryPrice, stopLoss, targetPrice]);

  /* ─── Simulated portfolio risk data ─── */
  const portfolioRisk = useMemo(() => {
    const sectors = [
      { name: 'Banking', weight: 32, risk: 45, change: 1.2 },
      { name: 'IT', weight: 22, risk: 38, change: -0.8 },
      { name: 'Pharma', weight: 15, risk: 25, change: 2.1 },
      { name: 'Energy', weight: 18, risk: 55, change: -1.5 },
      { name: 'FMCG', weight: 8, risk: 15, change: 0.4 },
      { name: 'Auto', weight: 5, risk: 42, change: 1.8 },
    ];
    const overallRisk = sectors.reduce((acc, s) => acc + (s.weight / 100) * s.risk, 0);
    const diversification = 100 - (Math.max(...sectors.map(s => s.weight)) * 1.2);
    return { sectors, overallRisk, diversification };
  }, []);

  /* ─── Simulated drawdown data ─── */
  const drawdownData = useMemo(() => {
    const pts: number[] = [];
    let equity = 100000;
    for (let i = 0; i < 60; i++) {
      equity += equity * ((Math.random() - 0.48) * 0.02);
      pts.push(equity);
    }
    const peak = Math.max(...pts);
    const current = pts[pts.length - 1];
    const maxDD = ((peak - Math.min(...pts)) / peak) * 100;
    const currentDD = ((peak - current) / peak) * 100;
    return { pts, peak, current, maxDD, currentDD };
  }, []);

  /* ─── Risk rules / alerts ─── */
  const alerts = useMemo(() => {
    const list: { level: 'ok' | 'warn' | 'danger'; text: string }[] = [];
    if (calc.capitalUsed > 20) list.push({ level: 'danger', text: `Position size ${calc.capitalUsed.toFixed(0)}% of capital — exceeds 20% limit` });
    else if (calc.capitalUsed > 10) list.push({ level: 'warn', text: `Position size ${calc.capitalUsed.toFixed(0)}% of capital — approaching limit` });
    else if (calc.capitalUsed > 0) list.push({ level: 'ok', text: `Position size ${calc.capitalUsed.toFixed(0)}% of capital — within safe zone` });
    if (calc.rr > 0 && calc.rr < 1.5) list.push({ level: 'warn', text: `R:R ratio ${calc.rr.toFixed(1)} is below recommended 1.5:1` });
    else if (calc.rr >= 2) list.push({ level: 'ok', text: `R:R ratio ${calc.rr.toFixed(1)} — excellent setup` });
    if (riskPct > 3) list.push({ level: 'danger', text: `Risking ${riskPct}% per trade — max recommended is 2%` });
    if (drawdownData.currentDD > 10) list.push({ level: 'danger', text: `Current drawdown ${drawdownData.currentDD.toFixed(1)}% — consider reducing exposure` });
    else list.push({ level: 'ok', text: `Drawdown ${drawdownData.currentDD.toFixed(1)}% — within tolerance` });
    return list;
  }, [calc, riskPct, drawdownData]);

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-br from-rose-500 to-orange-500 rounded-xl shadow-lg shadow-rose-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            Risk Command Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">Position sizing, risk analytics & portfolio heat map</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Active
          </div>
        </div>
      </div>

      {/* Risk Alerts Banner */}
      {alerts.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Risk Alerts</div>
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2.5 text-sm py-1.5 px-3 rounded-lg ${a.level === 'danger' ? 'bg-rose-500/10 text-rose-300' : a.level === 'warn' ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
              {a.level === 'danger' ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : a.level === 'warn' ? <Info className="w-3.5 h-3.5 shrink-0" /> : <Zap className="w-3.5 h-3.5 shrink-0" />}
              {a.text}
            </div>
          ))}
        </div>
      )}

      {/* Top Row: Gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex flex-col items-center">
          <RiskGauge value={portfolioRisk.overallRisk} label="Portfolio Risk" />
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex flex-col items-center">
          <RiskGauge value={portfolioRisk.diversification} label="Diversification" />
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex flex-col items-center">
          <RiskGauge value={drawdownData.currentDD} label="Drawdown" />
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-4 flex flex-col items-center">
          <RiskGauge value={calc.capitalUsed} label="Exposure" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Position Sizing Calculator */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/10 p-4 border-b border-slate-800 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-white">Position Sizing Calculator</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Capital (₹)</label>
                <input type="number" value={capital} onChange={e => setCapital(+e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Risk Per Trade (%)</label>
                <input type="number" value={riskPct} step={0.5} min={0.5} max={10} onChange={e => setRiskPct(+e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Entry ₹</label>
                <input type="number" value={entryPrice || ''} placeholder="0" onChange={e => setEntryPrice(+e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-emerald-400 text-sm font-mono focus:border-emerald-500 outline-none transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Stop Loss ₹</label>
                <input type="number" value={stopLoss || ''} placeholder="0" onChange={e => setStopLoss(+e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-rose-400 text-sm font-mono focus:border-rose-500 outline-none transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Target ₹</label>
                <input type="number" value={targetPrice || ''} placeholder="0" onChange={e => setTargetPrice(+e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-cyan-400 text-sm font-mono focus:border-cyan-500 outline-none transition-all" />
              </div>
            </div>

            {/* Results */}
            <div className="mt-2 bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Max Risk Amount</span>
                <span className="text-amber-400 font-bold font-mono">{fmt(calc.riskAmt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Optimal Quantity</span>
                <span className="text-white font-bold font-mono text-lg">{calc.qty} shares</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Position Size</span>
                <span className="text-blue-400 font-bold font-mono">{fmt(calc.posSize)}</span>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm flex items-center gap-1"><TrendingDown className="w-3 h-3 text-rose-400" /> Max Loss</span>
                <span className="text-rose-400 font-bold font-mono">-{fmt(calc.potentialLoss)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-400" /> Max Gain</span>
                <span className="text-emerald-400 font-bold font-mono">+{fmt(calc.potentialGain)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm flex items-center gap-1"><Target className="w-3 h-3 text-cyan-400" /> Risk : Reward</span>
                <span className={`font-bold font-mono text-lg ${calc.rr >= 2 ? 'text-emerald-400' : calc.rr >= 1 ? 'text-amber-400' : 'text-rose-400'}`}>
                  1 : {calc.rr.toFixed(1)}
                </span>
              </div>
              {/* Visual R:R bar */}
              {calc.rr > 0 && (
                <div className="pt-2">
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-800">
                    <div className="bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-700"
                      style={{ width: `${(1 / (1 + calc.rr)) * 100}%` }} />
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                      style={{ width: `${(calc.rr / (1 + calc.rr)) * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] font-bold">
                    <span className="text-rose-400">RISK</span>
                    <span className="text-emerald-400">REWARD</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sector Heatmap */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10 p-4 border-b border-slate-800 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-violet-400" />
            <span className="font-bold text-white">Portfolio Risk Heatmap</span>
          </div>
          <div className="p-5 space-y-3">
            {portfolioRisk.sectors.map((s, i) => {
              const riskColor = s.risk < 30 ? 'from-emerald-500/30 to-emerald-500/10' : s.risk < 50 ? 'from-amber-500/30 to-amber-500/10' : 'from-rose-500/30 to-rose-500/10';
              const textColor = s.risk < 30 ? 'text-emerald-400' : s.risk < 50 ? 'text-amber-400' : 'text-rose-400';
              return (
                <div key={s.name} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{s.name}</span>
                      <span className="text-slate-500 text-xs">{s.weight}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono font-bold ${s.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.change >= 0 ? '+' : ''}{s.change}%
                      </span>
                      <span className={`text-xs font-bold ${textColor}`}>{s.risk}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${riskColor} rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: `${s.risk}%`, animationDelay: `${i * 100}ms` }} />
                  </div>
                </div>
              );
            })}
            <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-3 gap-3">
              <div className="bg-slate-900 rounded-lg p-3 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Corr. Risk</div>
                <div className="text-lg font-bold text-amber-400">0.62</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Beta</div>
                <div className="text-lg font-bold text-blue-400">1.15</div>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Sharpe</div>
                <div className="text-lg font-bold text-emerald-400">1.84</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drawdown & Equity Section */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-rose-600/20 to-orange-600/10 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-rose-400" />
            <span className="font-bold text-white">Drawdown Analysis</span>
          </div>
          <MiniSparkline data={drawdownData.pts} color="#f43f5e" />
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 rounded-xl p-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Peak Equity</div>
              <div className="text-xl font-bold text-white mt-1 font-mono">{fmt(drawdownData.peak)}</div>
            </div>
            <div className="bg-slate-900/80 rounded-xl p-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Equity</div>
              <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">{fmt(drawdownData.current)}</div>
            </div>
            <div className="bg-slate-900/80 rounded-xl p-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Max Drawdown</div>
              <div className="text-xl font-bold text-rose-400 mt-1 font-mono">-{drawdownData.maxDD.toFixed(1)}%</div>
            </div>
            <div className="bg-slate-900/80 rounded-xl p-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current DD</div>
              <div className={`text-xl font-bold mt-1 font-mono ${drawdownData.currentDD > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                -{drawdownData.currentDD.toFixed(1)}%
              </div>
            </div>
          </div>
          {/* Equity curve visualization */}
          <div className="mt-4 bg-slate-900/50 rounded-xl p-4 overflow-hidden">
            <svg viewBox="0 0 600 120" className="w-full h-24" preserveAspectRatio="none">
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              {(() => {
                const min = Math.min(...drawdownData.pts) * 0.999;
                const max = Math.max(...drawdownData.pts) * 1.001;
                const range = max - min;
                const points = drawdownData.pts.map((v, i) =>
                  `${(i / (drawdownData.pts.length - 1)) * 600},${120 - ((v - min) / range) * 110}`
                ).join(' ');
                const areaPoints = points + ` 600,120 0,120`;
                return (
                  <>
                    <polygon points={areaPoints} fill="url(#eqGrad)" />
                    <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2" />
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      </div>

      {/* Kelly Criterion & Money Management Rules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white">Kelly Criterion</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400 font-mono">
            {(riskPct * 0.6).toFixed(1)}%
          </div>
          <p className="text-xs text-slate-500 mt-2">Optimal bet fraction based on your win rate and edge</p>
          <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{ width: `${riskPct * 6}%` }} />
          </div>
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-bold text-white">Daily Limit</span>
          </div>
          <div className="text-3xl font-bold text-blue-400 font-mono">
            {fmt(capital * 0.03)}
          </div>
          <p className="text-xs text-slate-500 mt-2">Maximum daily loss limit (3% of capital)</p>
          <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full" style={{ width: '15%' }} />
          </div>
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-bold text-white">Max Open Trades</span>
          </div>
          <div className="text-3xl font-bold text-violet-400 font-mono">
            {Math.max(1, Math.floor(100 / (calc.capitalUsed || 10)))}
          </div>
          <p className="text-xs text-slate-500 mt-2">Based on current position sizing and risk limits</p>
          <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full" style={{ width: '40%' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskCommandCenter;
