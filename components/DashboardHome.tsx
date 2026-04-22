import React, { useState, useRef, useEffect } from 'react';
import {
    TrendingUp, TrendingDown, Search, Zap, LayoutDashboard, Bot, Briefcase,
    FileText, Target, Brain, BarChart3, Clock, ArrowUpRight, ArrowDownRight,
    Activity, Sparkles, ChevronRight, Sun, Moon, Landmark, Cpu, Building2,
    FlaskConical, Fuel, ShoppingCart, Home, Banknote, LineChart, RefreshCw, Radio
} from 'lucide-react';
import { View, BrokerState, SignalFeedItem, Stock } from '../types';
import { INDIAN_STOCKS } from '../services/stockData';
import { DB_SERVICE } from '../services/db';
import { useRealtimeIndices } from '../hooks/useRealtimeIndices';
import NewsTicker from './NewsTicker';
import MarketMiniChart from './MarketMiniChart';

// ── Index metadata for display ──
const INDEX_META: Record<string, { label: string; icon: React.ReactNode; gradient: string; accentBg: string }> = {
    nifty: { label: 'NIFTY 50', icon: <Activity className="w-5 h-5" />, gradient: 'from-emerald-500 to-teal-600', accentBg: 'bg-emerald-500/10' },
    sensex: { label: 'SENSEX', icon: <Landmark className="w-5 h-5" />, gradient: 'from-blue-500 to-indigo-600', accentBg: 'bg-blue-500/10' },
    bankNifty: { label: 'BANK NIFTY', icon: <Banknote className="w-5 h-5" />, gradient: 'from-amber-500 to-orange-600', accentBg: 'bg-amber-500/10' },
    niftyIT: { label: 'NIFTY IT', icon: <Cpu className="w-5 h-5" />, gradient: 'from-cyan-500 to-blue-600', accentBg: 'bg-cyan-500/10' },
    niftyPharma: { label: 'NIFTY PHARMA', icon: <FlaskConical className="w-5 h-5" />, gradient: 'from-pink-500 to-rose-600', accentBg: 'bg-pink-500/10' },
    niftyMidcap50: { label: 'MIDCAP 50', icon: <BarChart3 className="w-5 h-5" />, gradient: 'from-violet-500 to-purple-600', accentBg: 'bg-violet-500/10' },
    niftyAuto: { label: 'NIFTY AUTO', icon: <Zap className="w-5 h-5" />, gradient: 'from-yellow-500 to-amber-600', accentBg: 'bg-yellow-500/10' },
    niftyMetal: { label: 'NIFTY METAL', icon: <Building2 className="w-5 h-5" />, gradient: 'from-slate-400 to-zinc-600', accentBg: 'bg-slate-500/10' },
    niftyEnergy: { label: 'NIFTY ENERGY', icon: <Fuel className="w-5 h-5" />, gradient: 'from-orange-500 to-red-600', accentBg: 'bg-orange-500/10' },
    niftyFMCG: { label: 'NIFTY FMCG', icon: <ShoppingCart className="w-5 h-5" />, gradient: 'from-lime-500 to-green-600', accentBg: 'bg-lime-500/10' },
    niftyRealty: { label: 'NIFTY REALTY', icon: <Home className="w-5 h-5" />, gradient: 'from-teal-500 to-emerald-600', accentBg: 'bg-teal-500/10' },
    niftyFinService: { label: 'FIN SERVICES', icon: <LineChart className="w-5 h-5" />, gradient: 'from-indigo-500 to-blue-600', accentBg: 'bg-indigo-500/10' },
    niftyPSEBank: { label: 'PSU BANK', icon: <Landmark className="w-5 h-5" />, gradient: 'from-rose-500 to-pink-600', accentBg: 'bg-rose-500/10' },
};

// Major indices shown as hero cards
const HERO_KEYS = ['nifty', 'sensex', 'bankNifty'];

// Quick action tiles
const QUICK_ACTIONS: { view: View; label: string; desc: string; icon: React.ReactNode; gradient: string }[] = [
    { view: 'SCANNER', label: 'Market Scanner', desc: 'Scan for signals', icon: <Search className="w-6 h-6" />, gradient: 'from-emerald-600 to-teal-700' },
    { view: 'AUTO_TRADER', label: 'Auto-Bot', desc: 'Algorithmic trading', icon: <Bot className="w-6 h-6" />, gradient: 'from-amber-600 to-orange-700' },
    { view: 'REAL_PORTFOLIO', label: 'Portfolio', desc: 'Your holdings', icon: <Briefcase className="w-6 h-6" />, gradient: 'from-blue-600 to-indigo-700' },
    { view: 'AI_PICKS', label: 'AI Picks', desc: 'Smart stock picks', icon: <Target className="w-6 h-6" />, gradient: 'from-cyan-600 to-blue-700' },
    { view: 'INTELLIGENCE', label: 'Intelligence', desc: 'Multi-LLM analysis', icon: <Brain className="w-6 h-6" />, gradient: 'from-violet-600 to-purple-700' },
    { view: 'PAPER_TRADING', label: 'Paper Trade', desc: 'Practice risk-free', icon: <FileText className="w-6 h-6" />, gradient: 'from-purple-600 to-pink-700' },
];

interface DashboardHomeProps {
    marketIndices: Record<string, { price: number; changePercent: number }> | null;
    isMarketOpen: boolean;
    brokerState: BrokerState;
    signals: SignalFeedItem[];
    onNavigate: (view: View) => void;
    onRunAnalysis: (symbol: string) => void;
    ticker: string;
    onTickerChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    suggestions: Stock[];
    showSuggestions: boolean;
    onSearch: (e: React.FormEvent) => void;
    loading: boolean;
    onRefreshIndices?: () => void;
}

const DashboardHome: React.FC<DashboardHomeProps> = ({
    marketIndices, isMarketOpen, brokerState, signals,
    onNavigate, onRunAnalysis, ticker, onTickerChange,
    suggestions, showSuggestions, onSearch, loading, onRefreshIndices
}) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [animatedCards, setAnimatedCards] = useState<Set<string>>(new Set());

    // Real-time WebSocket indices (prefers WS over REST prop)
    const { indices: wsIndices, isLive, isLoading: wsLoading } = useRealtimeIndices();
    const liveIndices = wsIndices || marketIndices;

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Stagger card animations on mount
    useEffect(() => {
        const allKeys = Object.keys(INDEX_META);
        allKeys.forEach((key, idx) => {
            setTimeout(() => setAnimatedCards(prev => new Set([...prev, key])), idx * 60);
        });
    }, []);

    const formatPrice = (price: number) => {
        if (price >= 100000) return price.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        return price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const getMarketTimeInfo = () => {
        const now = currentTime;
        const hours = now.getHours();
        const minutes = now.getMinutes();
        if (isMarketOpen) {
            const closeH = 15, closeM = 30;
            const remaining = (closeH * 60 + closeM) - (hours * 60 + minutes);
            if (remaining > 0) {
                const h = Math.floor(remaining / 60);
                const m = remaining % 60;
                return `Closes in ${h}h ${m}m`;
            }
        }
        // Next open
        const day = now.getDay();
        if (day === 0) return 'Opens Monday 9:15 AM';
        if (day === 6) return 'Opens Monday 9:15 AM';
        if (hours >= 15 || (hours === 15 && minutes >= 30)) return 'Opens tomorrow 9:15 AM';
        if (hours < 9 || (hours === 9 && minutes < 15)) return 'Opens at 9:15 AM';
        return '';
    };

    // Sector index cards (excluding hero cards)
    const sectorKeys = Object.keys(INDEX_META).filter(k => !HERO_KEYS.includes(k));
    const isLoadingIndices = !liveIndices;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-6">

            {/* ━━ HEADER: Greeting + Market Status + Time ━━ */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        Dashboard
                    </h1>
                    <p className="text-slate-400 mt-1 text-sm">Welcome back, Trader. Here's your market overview.</p>
                </div>
                <div className="flex items-center gap-3">
                    {isLive && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Live</span>
                        </div>
                    )}
                    {onRefreshIndices && (
                        <button onClick={onRefreshIndices} className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all" title="Refresh indices">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    )}
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border ${isMarketOpen
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800/50 text-slate-400 border-slate-700'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${isMarketOpen ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-600'}`} />
                        {isMarketOpen ? 'Market Open' : 'Market Closed'}
                        {getMarketTimeInfo() && (
                            <span className="text-xs opacity-70 ml-1">· {getMarketTimeInfo()}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ━━ SEARCH BAR ━━ */}
            <div className="relative z-20" ref={wrapperRef}>
                <form onSubmit={onSearch} className="relative">
                    <div className="relative flex items-center bg-[#1e293b] rounded-2xl p-2 border border-slate-700 focus-within:border-emerald-500/50 transition-all shadow-lg hover:shadow-xl hover:shadow-emerald-500/5">
                        <Search className="w-5 h-5 text-slate-400 ml-3 shrink-0" />
                        <input
                            type="text" value={ticker} onChange={onTickerChange}
                            onFocus={() => { if (ticker.length > 0) { } }}
                            placeholder="Search any NSE / BSE stock..."
                            className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 text-base px-4 uppercase font-mono outline-none"
                            autoComplete="off"
                        />
                        <button type="submit" disabled={loading} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 shrink-0 shadow-lg shadow-emerald-500/20">
                            {loading ? '...' : 'Analyze'}
                        </button>
                    </div>
                </form>
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto z-50">
                        {suggestions.map((stock) => (
                            <div key={stock.symbol} onMouseDown={() => onRunAnalysis(stock.symbol)} className="px-4 py-3 hover:bg-slate-700/50 cursor-pointer flex justify-between items-center border-b border-slate-800/50 last:border-0">
                                <div className="flex flex-col text-left">
                                    <span className="font-bold text-emerald-400 font-mono text-sm">{stock.symbol}</span>
                                    <span className="text-slate-400 text-xs truncate max-w-[250px]">{stock.name}</span>
                                </div>
                                <Zap className="w-3 h-3 text-slate-600" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ━━ All content below search — hidden smoothly when suggestions are open ━━ */}
            <div className={`transition-all duration-300 space-y-6 ${showSuggestions && suggestions.length > 0 ? 'opacity-0 max-h-0 overflow-hidden pointer-events-none' : 'opacity-100 max-h-[5000px]'}`}>

                {/* ━━ HERO INDEX CARDS (NIFTY, SENSEX, BANK NIFTY) ━━ */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {HERO_KEYS.map((key) => {
                        const meta = INDEX_META[key];
                        const data = liveIndices?.[key];
                        const price = data?.price || 0;
                        const change = data?.changePercent || 0;
                        const isUp = change >= 0;
                        const isVisible = animatedCards.has(key);

                        return (
                            <div
                                key={key}
                                className={`relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm p-5 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl group cursor-default ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                            >
                                {/* Gradient bg accent */}
                                <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${meta.gradient} opacity-10 group-hover:opacity-20 transition-opacity blur-2xl`} />

                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-lg`}>
                                                <span className="text-white">{meta.icon}</span>
                                            </div>
                                            <span className="text-sm font-bold text-slate-300 tracking-wide">{meta.label}</span>
                                        </div>
                                        {isLoadingIndices ? (
                                            <div className="w-16 h-6 rounded-lg bg-slate-700/50 animate-pulse" />
                                        ) : (
                                            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                            </div>
                                        )}
                                    </div>
                                    {isLoadingIndices ? (
                                        <>
                                            <div className="h-9 w-40 rounded-lg bg-slate-700/40 animate-pulse" />
                                            <div className="mt-3 h-1 rounded-full bg-slate-800 overflow-hidden">
                                                <div className="h-full w-1/3 rounded-full bg-slate-700/60 animate-pulse" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-3xl font-black text-white font-mono tracking-tight tabular-nums">
                                                {price > 0 ? formatPrice(price) : '—'}
                                            </div>
                                            <div className="mt-3 h-1 rounded-full overflow-hidden bg-slate-800">
                                                <div className={`h-full rounded-full bg-gradient-to-r ${meta.gradient} transition-all duration-1000`} style={{ width: `${Math.min(Math.abs(change) * 20 + 30, 100)}%` }} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ━━ MARKET CHART ━━ */}
                <MarketMiniChart />

                {/* ━━ SECTOR INDICES GRID ━━ */}
                <div>
                    <h3 className="text-base font-bold text-slate-300 mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-slate-500" /> Sector Indices
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {sectorKeys.map((key) => {
                            const meta = INDEX_META[key];
                            const data = liveIndices?.[key];
                            const price = data?.price || 0;
                            const change = data?.changePercent || 0;
                            const isUp = change >= 0;
                            const isVisible = animatedCards.has(key);

                            return (
                                <div
                                    key={key}
                                    className={`relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-800/30 backdrop-blur-sm p-3 transition-all duration-500 hover:border-slate-600 hover:bg-slate-800/60 hover:shadow-lg group cursor-default ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                >
                                    {/* Tiny gradient accent */}
                                    <div className={`absolute -top-6 -right-6 w-16 h-16 rounded-full bg-gradient-to-br ${meta.gradient} opacity-[0.07] group-hover:opacity-[0.15] transition-opacity blur-xl`} />

                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                                                <span className="text-white scale-[0.8]">{meta.icon}</span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-400 truncate">{meta.label}</span>
                                        </div>
                                        {isLoadingIndices ? (
                                            <>
                                                <div className="h-6 w-24 rounded-md bg-slate-700/40 animate-pulse" />
                                                <div className="h-4 w-16 rounded-md bg-slate-700/30 animate-pulse mt-1" />
                                            </>
                                        ) : (
                                            <>
                                                <div className="text-lg font-bold text-white font-mono tabular-nums">
                                                    {price > 0 ? formatPrice(price) : '—'}
                                                </div>
                                                <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                    {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ━━ MARKET NEWS TICKER ━━ */}
                <NewsTicker />

                {/* ━━ QUICK ACTIONS ━━ */}
                <div>
                    <h3 className="text-base font-bold text-slate-300 mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" /> Quick Actions
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {QUICK_ACTIONS.map((action) => (
                            <button
                                key={action.view}
                                onClick={() => onNavigate(action.view)}
                                className="group relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-800/20 p-4 text-left transition-all duration-300 hover:border-slate-600 hover:bg-slate-800/50 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                            >
                                {/* Background gradient on hover */}
                                <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />

                                <div className="relative z-10">
                                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-3 shadow-lg group-hover:shadow-xl transition-shadow`}>
                                        <span className="text-white">{action.icon}</span>
                                    </div>
                                    <div className="text-sm font-bold text-white">{action.label}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{action.desc}</div>
                                </div>

                                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* ━━ RECENT SIGNALS (if any) ━━ */}
                {signals.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-bold text-slate-300 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-emerald-400" /> Latest Signals
                            </h3>
                            <button onClick={() => onNavigate('SCANNER')} className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition-colors">
                                View All <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {signals.slice(0, 3).map((sig) => {
                                const isBuy = sig.signal === 'BUY' || sig.signal === 'STRONG BUY';
                                return (
                                    <div
                                        key={sig.id}
                                        onClick={() => onRunAnalysis(sig.symbol)}
                                        className="rounded-xl border border-slate-800/80 bg-slate-800/30 p-4 cursor-pointer hover:border-slate-600 hover:bg-slate-800/50 transition-all group"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <span className="font-bold text-white font-mono text-sm">{sig.symbol}</span>
                                                <span className="text-slate-500 text-xs ml-2">{sig.name}</span>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-md ${isBuy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                {sig.signal}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <span>₹{sig.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            <span>{sig.strategy}</span>
                                            <span className="font-mono">{Math.round(sig.confidence * 100)}% conf</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ━━ BROKER STATUS BANNER ━━ */}
                {!brokerState.angel && (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-gradient-to-r from-slate-800/30 to-slate-900/30 p-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center shrink-0">
                            <Zap className="w-6 h-6 text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <div className="text-white font-bold text-sm">Connect Angel One for live data</div>
                            <div className="text-slate-500 text-xs mt-0.5">Get live prices, real-time signals, and execute trades directly from the dashboard.</div>
                        </div>
                        <button onClick={() => onNavigate('SCANNER')} className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-amber-500/20 transition-all shrink-0">
                            Connect
                        </button>
                    </div>
                )}

            </div>{/* ━━ end: dynamic visibility wrapper ━━ */}

            {/* ━━ FOOTER CLOCK ━━ */}
            <div className="flex items-center justify-center gap-2 text-slate-600 text-xs pb-4">
                <Clock className="w-3 h-3" />
                <span className="font-mono tabular-nums">
                    {currentTime.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                </span>
            </div>
        </div>
    );
};

export default DashboardHome;
