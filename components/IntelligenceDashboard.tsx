import React, { useState, useEffect, useCallback } from 'react';
import {
    Brain, Zap, TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
    Activity, Shield, ChevronDown, ChevronUp, ExternalLink, Clock,
    Cpu, ArrowUpRight, ArrowDownRight, Minus, BarChart3, Newspaper,
    Target, GitBranch, Sparkles, Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import { secureGet, securePost, SCAN_TIMEOUT_MS } from '../services/api';

// ━━━━━━━━━━━━━━━ Types ━━━━━━━━━━━━━━━

interface Provider {
    name: string;
    available: boolean;
    default_model: string;
    circuit_breaker: { is_open: boolean; failure_count: number; cooldown_remaining_s: number };
    usage: { total_calls: number; success_rate: number; avg_latency_ms: number; total_tokens: number };
}

interface ScoredStock {
    stock: string;
    signal: string;
    confidence: number;
    reason: string;
    entry: number;
    stop_loss: number;
    target: number;
    sector: string;
    impact_chain: string;
    sentiment: string;
    risk_level: string;
    score_breakdown?: {
        technical: number;
        fundamental: number;
        chain_alignment: number;
        sentiment: number;
        last_hour: number;
        total: number;
    };
}

interface ImpactChain {
    event: string;
    chain: string[];
    affected_sectors: string[];
    stock_opportunities: string[];
    order: number;
    confidence: string;
}

interface IntelligenceReport {
    news: any;
    market: any;
    reasoning: any;
    selections: any;
    summary: string;
    total_latency_ms: number;
    providers_used: string[];
}

interface BreakoutCandidate {
    stock: string;
    current_price: number;
    resistance: number;
    support: number;
    distance_pct: number;
    volume_signal: string;
    breakout_type: string;
    probability: string;
}

interface SectorFocus {
    sector: string;
    stance: string;
    reason: string;
    top_stock: string;
    momentum: number;
}

interface RiskWarning {
    event: string;
    impact: string;
    affected_sectors: string[];
    action: string;
}

// ━━━━━━━━━━━━━━━ Component ━━━━━━━━━━━━━━━

const IntelligenceDashboard: React.FC = () => {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [taskAssignments, setTaskAssignments] = useState<Record<string, string>>({});
    const [report, setReport] = useState<IntelligenceReport | null>(null);
    const [scanStatus, setScanStatus] = useState<string>('idle'); // idle, queued, running, completed, failed
    const [scanProgress, setScanProgress] = useState(0);
    const [scanStage, setScanStage] = useState('');
    const [taskId, setTaskId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedChain, setExpandedChain] = useState<number | null>(null);

    // Fetch providers on mount
    useEffect(() => {
        fetchProviders();
        fetchLatestReport();
    }, []);

    // Poll task status when scan is running
    useEffect(() => {
        if (!taskId || scanStatus === 'completed' || scanStatus === 'failed') return;
        const interval = setInterval(async () => {
            try {
                const res = await secureGet(`/intelligence/status/${taskId}`);
                if (res.status === 'completed') {
                    setScanStatus('completed');
                    setScanProgress(100);
                    setScanStage('Complete');
                    if (res.result) setReport(res.result);
                    clearInterval(interval);
                } else if (res.status === 'failed') {
                    setScanStatus('failed');
                    setError(res.error || 'Scan failed');
                    clearInterval(interval);
                } else {
                    setScanProgress(res.progress || 0);
                    setScanStage(res.stage || '');
                    setScanStatus(res.status);
                }
            } catch (e) { /* ignore polling errors */ }
        }, 2000);
        return () => clearInterval(interval);
    }, [taskId, scanStatus]);

    const fetchProviders = async () => {
        try {
            const res = await secureGet('/intelligence/providers', SCAN_TIMEOUT_MS);
            setProviders(res.providers || []);
            setTaskAssignments(res.task_assignments || {});
        } catch (e: any) {
            console.error('Failed to fetch providers:', e);
        }
    };

    const fetchLatestReport = async () => {
        try {
            const res = await secureGet('/intelligence/latest', SCAN_TIMEOUT_MS);
            if (res.status === 'cached' && res.report) {
                setReport(res.report);
                setScanStatus('completed');
            }
        } catch (e) { /* no cached report */ }
    };

    const triggerScan = async (scanType = 'full_scan') => {
        setLoading(true);
        setError(null);
        setScanStatus('queued');
        setScanProgress(0);
        setScanStage('Initializing...');
        try {
            const res = await securePost(`/intelligence/scan?scan_type=${scanType}&priority=0`);
            setTaskId(res.task_id);
            setScanStatus('queued');
        } catch (e: any) {
            setError(e?.message || 'Failed to trigger scan');
            setScanStatus('failed');
        } finally {
            setLoading(false);
        }
    };

    // Helper components
    const SignalBadge = ({ signal }: { signal: string }) => {
        const colors: Record<string, string> = {
            BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            SELL: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
            HOLD: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        };
        return (
            <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${colors[signal] || colors.HOLD}`}>
                {signal}
            </span>
        );
    };

    const ConfidenceBar = ({ value, max = 100 }: { value: number; max?: number }) => {
        const pct = Math.min(100, (value / max) * 100);
        const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
        return (
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
        );
    };

    const SentimentIcon = ({ sentiment }: { sentiment: string }) => {
        if (sentiment === 'BULLISH' || sentiment === 'POSITIVE') return <TrendingUp className="w-4 h-4 text-emerald-400" />;
        if (sentiment === 'BEARISH' || sentiment === 'NEGATIVE') return <TrendingDown className="w-4 h-4 text-rose-400" />;
        return <Minus className="w-4 h-4 text-slate-400" />;
    };

    return (
        <div className="space-y-6">
            {/* ━━━ Header ━━━ */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                        <Brain className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Multi-LLM Intelligence</h2>
                        <p className="text-xs text-slate-400">4-Agent AI Pipeline • Real-time Analysis</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => triggerScan('full_scan')}
                        disabled={loading || scanStatus === 'running'}
                        className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading || scanStatus === 'running' ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                        ) : (
                            <><Zap className="w-4 h-4" /> Run Full Scan</>
                        )}
                    </button>
                    <button onClick={fetchProviders} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ━━━ Scan Progress Bar ━━━ */}
            {(scanStatus === 'queued' || scanStatus === 'running') && (
                <div className="bg-slate-900/80 border border-violet-500/20 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-violet-300 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {scanStage || 'Initializing pipeline...'}
                        </span>
                        <span className="text-xs text-slate-400">{scanProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
                            style={{ width: `${scanProgress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ━━━ Error Banner ━━━ */}
            {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                    <p className="text-sm text-rose-300">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-300">
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* ━━━ LLM Provider Status ━━━ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {providers.map(p => (
                    <div key={p.name} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Cpu className="w-4 h-4 text-slate-400" />
                                <span className="text-sm font-bold text-white capitalize">{p.name}</span>
                            </div>
                            <div className={`w-2.5 h-2.5 rounded-full ${p.available && !p.circuit_breaker.is_open ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]'}`} />
                        </div>
                        <p className="text-[11px] text-slate-500 mb-2 font-mono truncate">{p.default_model}</p>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">{p.usage.total_calls} calls</span>
                            <span className="text-slate-500">{p.usage.avg_latency_ms}ms avg</span>
                            {p.usage.total_calls > 0 && (
                                <span className={p.usage.success_rate >= 90 ? 'text-emerald-400' : 'text-amber-400'}>
                                    {p.usage.success_rate}%
                                </span>
                            )}
                        </div>
                        {p.circuit_breaker.is_open && (
                            <div className="mt-2 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-1 rounded-lg">
                                ⚡ Circuit open — {p.circuit_breaker.cooldown_remaining_s}s remaining
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* ━━━ Market Overview ━━━ */}
            {report?.market?.indices?.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-400" /> Market Overview
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        {report.market.indices.map((idx: any) => (
                            <div key={idx.name} className="bg-slate-800/60 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-bold text-white">{idx.name}</span>
                                    <SentimentIcon sentiment={idx.change_pct >= 0 ? 'BULLISH' : 'BEARISH'} />
                                </div>
                                <div className="text-xl font-black text-white">{idx.value?.toLocaleString('en-IN')}</div>
                                <div className={`text-sm font-bold ${idx.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {idx.change_pct >= 0 ? '+' : ''}{idx.change_pct?.toFixed(2)}%
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                    Last hour: <span className={idx.last_hour_trend === 'rising' ? 'text-emerald-400' : idx.last_hour_trend === 'falling' ? 'text-rose-400' : 'text-slate-400'}>{idx.last_hour_trend}</span>
                                    {' '}({idx.last_hour_change_pct >= 0 ? '+' : ''}{idx.last_hour_change_pct?.toFixed(2)}%)
                                </div>
                            </div>
                        ))}
                    </div>
                    {report.market.next_day_prediction && (
                        <div className="bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 rounded-xl p-4 flex items-center gap-4">
                            <Sparkles className="w-6 h-6 text-violet-400 shrink-0" />
                            <div>
                                <div className="text-sm font-bold text-white">
                                    Next Day: <span className="capitalize">{report.market.next_day_prediction.replace('_', ' ')}</span>
                                    <span className="ml-2 text-xs text-violet-300">({report.market.prediction_confidence} confidence)</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">{report.market.prediction_reason}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ━━━ Impact Chains ━━━ */}
            {report?.reasoning?.impact_chains?.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-amber-400" /> Impact Chains
                        <span className="text-xs text-slate-500">({report.reasoning.impact_chains.length} chains)</span>
                    </h3>
                    <div className="space-y-3">
                        {report.reasoning.impact_chains.map((chain: ImpactChain, i: number) => (
                            <div key={i} className="bg-slate-800/60 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setExpandedChain(expandedChain === i ? null : i)}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800 transition-colors text-left"
                                >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${chain.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' : chain.confidence === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                        {chain.order}°
                                    </div>
                                    <span className="text-sm font-bold text-white flex-1 truncate">{chain.event}</span>
                                    <div className="flex items-center gap-1.5">
                                        {chain.affected_sectors?.slice(0, 3).map(s => (
                                            <span key={s} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{s}</span>
                                        ))}
                                    </div>
                                    {expandedChain === i ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </button>
                                {expandedChain === i && (
                                    <div className="px-4 pb-4 pt-1 border-t border-slate-700/50">
                                        <div className="flex flex-col gap-2 ml-3 border-l-2 border-violet-500/30 pl-4">
                                            {chain.chain?.map((step, j) => (
                                                <div key={j} className="flex items-start gap-2">
                                                    <ArrowUpRight className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
                                                    <span className="text-xs text-slate-300">{step}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {chain.stock_opportunities?.length > 0 && (
                                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] text-slate-500 uppercase font-bold">Stocks:</span>
                                                {chain.stock_opportunities.map(s => (
                                                    <span key={s} className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20 font-bold">{s}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ━━━ Top Stock Picks ━━━ */}
            {report?.selections?.top_picks?.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-emerald-400" /> Top Stock Picks
                        <span className="text-xs text-slate-500">({report.selections.total_analyzed} analyzed)</span>
                    </h3>
                    <div className="space-y-3">
                        {report.selections.top_picks.map((stock: ScoredStock, i: number) => (
                            <div key={stock.stock} className="bg-slate-800/60 rounded-xl p-4 hover:bg-slate-800 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500 font-mono w-6">#{i + 1}</span>
                                        <span className="text-base font-black text-white">{stock.stock}</span>
                                        <SignalBadge signal={stock.signal} />
                                        {stock.sector && <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{stock.sector}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white">{stock.confidence}%</span>
                                        <div className="w-16">
                                            <ConfidenceBar value={stock.confidence} />
                                        </div>
                                    </div>
                                </div>

                                {/* Price Levels */}
                                <div className="grid grid-cols-3 gap-3 mb-2">
                                    <div className="text-center">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Entry</div>
                                        <div className="text-sm font-bold text-blue-400">₹{stock.entry?.toLocaleString('en-IN')}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Stop Loss</div>
                                        <div className="text-sm font-bold text-rose-400">₹{stock.stop_loss?.toLocaleString('en-IN')}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Target</div>
                                        <div className="text-sm font-bold text-emerald-400">₹{stock.target?.toLocaleString('en-IN')}</div>
                                    </div>
                                </div>

                                {/* Reason */}
                                <p className="text-xs text-slate-400 mb-2">{stock.reason}</p>

                                {/* Impact Chain */}
                                {stock.impact_chain && (
                                    <div className="text-[11px] text-violet-300 bg-violet-500/10 px-3 py-1.5 rounded-lg border border-violet-500/20">
                                        <GitBranch className="w-3 h-3 inline mr-1" /> {stock.impact_chain}
                                    </div>
                                )}

                                {/* Score Breakdown */}
                                {stock.score_breakdown && (
                                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                        {Object.entries(stock.score_breakdown).filter(([k]) => k !== 'total').map(([key, val]) => (
                                            <span key={key} className="text-[10px] bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded">
                                                {key}: <span className="text-white font-bold">{val}</span>
                                            </span>
                                        ))}
                                        <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded font-bold">
                                            Total: {stock.score_breakdown.total}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ━━━ Hidden Gems ━━━ */}
            {report?.selections?.hidden_gems?.length > 0 && (
                <div className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" /> Hidden Gems
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded uppercase font-bold ml-2">3rd Order Effects</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {report.selections.hidden_gems.map((gem: ScoredStock) => (
                            <div key={gem.stock} className="bg-slate-900/80 rounded-xl p-4 border border-amber-500/10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-black text-white">{gem.stock}</span>
                                    <span className="text-xs text-amber-400 font-bold">{gem.confidence}%</span>
                                </div>
                                <p className="text-xs text-slate-400 mb-2">{gem.reason}</p>
                                <div className="flex items-center gap-2 text-[11px]">
                                    <span className="text-blue-400">₹{gem.entry}</span>
                                    <span className="text-slate-600">→</span>
                                    <span className="text-emerald-400">₹{gem.target}</span>
                                    <span className="text-slate-600">|</span>
                                    <span className="text-rose-400">SL: ₹{gem.stop_loss}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ━━━ Breakout Radar ━━━ */}
            {report?.selections?.breakout_candidates?.length > 0 && (
                <div className="bg-gradient-to-r from-cyan-500/5 to-blue-500/5 border border-cyan-500/20 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-cyan-400" /> Breakout Radar
                        <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded uppercase font-bold ml-2">Near Key Levels</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {report.selections.breakout_candidates.map((b: BreakoutCandidate) => (
                            <div key={b.stock} className="bg-slate-900/80 rounded-xl p-4 border border-cyan-500/10 hover:border-cyan-500/30 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-black text-white">{b.stock}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        b.probability === 'HIGH' ? 'bg-emerald-500/20 text-emerald-400' :
                                        b.probability === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-slate-700 text-slate-400'
                                    }`}>{b.probability}</span>
                                </div>
                                <div className="text-xl font-black text-white mb-2">₹{b.current_price?.toLocaleString('en-IN')}</div>
                                <div className="grid grid-cols-2 gap-2 mb-2 text-[11px]">
                                    <div className="bg-slate-800/80 rounded-lg p-1.5 text-center">
                                        <div className="text-slate-500 uppercase font-bold">Support</div>
                                        <div className="text-emerald-400 font-bold">₹{b.support?.toLocaleString('en-IN')}</div>
                                    </div>
                                    <div className="bg-slate-800/80 rounded-lg p-1.5 text-center">
                                        <div className="text-slate-500 uppercase font-bold">Resistance</div>
                                        <div className="text-rose-400 font-bold">₹{b.resistance?.toLocaleString('en-IN')}</div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className={`font-bold ${b.breakout_type === 'RESISTANCE' ? 'text-cyan-400' : 'text-amber-400'}`}>
                                        {b.distance_pct?.toFixed(1)}% to {b.breakout_type?.toLowerCase()}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1.5">{b.volume_signal}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ━━━ Sector Pulse ━━━ */}
            {report?.selections?.sector_focus?.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-violet-400" /> Sector Pulse
                        <span className="text-xs text-slate-500">Focus areas based on catalysts</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {report.selections.sector_focus.map((s: SectorFocus) => (
                            <div key={s.sector} className="bg-slate-800/60 rounded-xl p-4 hover:bg-slate-800 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-white">{s.sector}</span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                                        s.stance === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                        s.stance === 'BEARISH' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                                        'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    }`}>{s.stance}</span>
                                </div>
                                <p className="text-xs text-slate-400 mb-3">{s.reason}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-500">Top pick: <span className="text-white font-bold">{s.top_stock}</span></span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${s.momentum >= 70 ? 'bg-emerald-500' : s.momentum >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                style={{ width: `${s.momentum}%` }} />
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono">{s.momentum}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ━━━ Risk Warnings ━━━ */}
            {report?.selections?.risk_warnings?.length > 0 && (
                <div className="bg-gradient-to-r from-rose-500/5 to-orange-500/5 border border-rose-500/20 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-rose-400" /> Risk Warnings
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded uppercase font-bold ml-2">Must Know</span>
                    </h3>
                    <div className="space-y-3">
                        {report.selections.risk_warnings.map((w: RiskWarning, i: number) => (
                            <div key={i} className="bg-slate-900/80 rounded-xl p-4 border border-rose-500/10">
                                <div className="flex items-start gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${w.impact === 'HIGH' ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]' : 'bg-amber-400'}`} />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-white">{w.event}</p>
                                        <p className="text-xs text-amber-300 mt-1">⚡ Action: {w.action}</p>
                                        {w.affected_sectors?.length > 0 && (
                                            <div className="flex gap-1 mt-2">
                                                {w.affected_sectors.map((s: string) => (
                                                    <span key={s} className="text-[10px] bg-rose-500/10 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/20">{s}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${w.impact === 'HIGH' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>{w.impact}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ━━━ News Summary ━━━ */}
            {report?.news?.key_events?.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Newspaper className="w-5 h-5 text-cyan-400" /> News Intelligence
                        <div className="ml-auto flex items-center gap-2">
                            <SentimentIcon sentiment={report.news.global_sentiment} />
                            <span className="text-xs text-slate-400">{report.news.global_sentiment}</span>
                        </div>
                    </h3>
                    <div className="space-y-2">
                        {report.news.key_events.slice(0, 8).map((event: any, i: number) => (
                            <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-800/50 last:border-0">
                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${event.impact === 'HIGH' ? 'bg-rose-400' : event.impact === 'MEDIUM' ? 'bg-amber-400' : 'bg-slate-500'}`} />
                                <div className="flex-1">
                                    <p className="text-sm text-slate-300">{event.event}</p>
                                    {event.sectors_affected?.length > 0 && (
                                        <div className="flex gap-1 mt-1">
                                            {event.sectors_affected.map((s: string) => (
                                                <span key={s} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{s}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${event.impact === 'HIGH' ? 'bg-rose-500/20 text-rose-400' : event.impact === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                    {event.impact}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ━━━ Report Footer ━━━ */}
            {report && (
                <div className="flex items-center justify-between px-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {(report.total_latency_ms / 1000).toFixed(1)}s</span>
                        <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {report.providers_used?.join(', ')}</span>
                    </div>
                    <span>{report.summary}</span>
                </div>
            )}

            {/* ━━━ Empty State ━━━ */}
            {!report && scanStatus === 'idle' && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center mb-4">
                        <Brain className="w-8 h-8 text-violet-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">No Intelligence Report Yet</h3>
                    <p className="text-sm text-slate-400 mb-6 max-w-md">
                        Click "Run Full Scan" to activate the 4-agent AI pipeline. It will analyze news, markets,
                        build impact chains, and score stocks — all in one shot.
                    </p>
                    <button
                        onClick={() => triggerScan('full_scan')}
                        className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/25 transition-all flex items-center gap-2"
                    >
                        <Zap className="w-5 h-5" /> Launch Intelligence Scan
                    </button>
                </div>
            )}
        </div>
    );
};

export default IntelligenceDashboard;
