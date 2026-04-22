import React, { useState, useEffect, useRef } from 'react';
import {
    Newspaper, TrendingUp, TrendingDown, Minus, ExternalLink,
    RefreshCw, Clock, Rss
} from 'lucide-react';
import { secureGet } from '../services/api';

interface Headline {
    title: string;
    description: string;
    url: string;
    source: string;
    published: string;
    sentiment: string;
    image_url: string;
}

const REFRESH_INTERVAL = 90_000; // 90 seconds (matches backend cache)

const SOURCE_COLORS: Record<string, string> = {
    'Economic Times': 'text-orange-400',
    'Moneycontrol': 'text-cyan-400',
    'LiveMint': 'text-emerald-400',
};

const NewsTicker: React.FC = () => {
    const [headlines, setHeadlines] = useState<Headline[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchHeadlines = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data: any = await secureGet('/ai/news/headlines');
            if (Array.isArray(data)) {
                setHeadlines(data);
                setError(false);
            }
            setLastUpdated(new Date());
        } catch {
            if (!silent) setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHeadlines();
        intervalRef.current = setInterval(() => fetchHeadlines(true), REFRESH_INTERVAL);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const getSentimentStyle = (sentiment: string) => {
        const s = (sentiment || '').toUpperCase();
        if (s.includes('POSITIVE')) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <TrendingUp className="w-3 h-3" /> };
        if (s.includes('NEGATIVE')) return { color: 'text-rose-400', bg: 'bg-rose-500/10', icon: <TrendingDown className="w-3 h-3" /> };
        return { color: 'text-slate-400', bg: 'bg-slate-500/10', icon: <Minus className="w-3 h-3" /> };
    };

    // Skeleton loading
    if (loading && headlines.length === 0) {
        return (
            <div>
                <h3 className="text-base font-bold text-slate-300 mb-3 flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-cyan-400" /> Market News
                </h3>
                <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="rounded-xl border border-slate-800/80 bg-slate-800/30 p-3 animate-pulse">
                            <div className="h-4 w-3/4 bg-slate-700/40 rounded mb-2" />
                            <div className="h-3 w-full bg-slate-700/20 rounded mb-1.5" />
                            <div className="h-3 w-1/3 bg-slate-700/30 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error && headlines.length === 0) return null;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-300 flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-cyan-400" />
                    Market News
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-cyan-500/15 text-cyan-400 px-1.5 py-0.5 rounded-md">
                        <Rss className="w-2.5 h-2.5" /> LIVE
                    </span>
                </h3>
                <div className="flex items-center gap-2">
                    {lastUpdated && (
                        <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={() => fetchHeadlines()}
                        className="p-1.5 rounded-lg bg-slate-800/50 text-slate-500 hover:text-white hover:bg-slate-700/50 transition-all"
                        title="Refresh news"
                    >
                        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* News Feed */}
            <div className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 pr-1">
                {headlines.slice(0, 10).map((h, idx) => {
                    const sent = getSentimentStyle(h.sentiment);
                    const sourceColor = SOURCE_COLORS[h.source] || 'text-slate-400';

                    return (
                        <a
                            key={idx}
                            href={h.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-xl border border-slate-800/60 bg-slate-800/20 p-3 hover:bg-slate-800/50 hover:border-slate-700 transition-all group cursor-pointer"
                        >
                            <div className="flex items-start gap-3">
                                {/* Sentiment icon */}
                                <div className={`mt-0.5 shrink-0 p-1.5 rounded-lg ${sent.bg}`}>
                                    <span className={sent.color}>{sent.icon}</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-200 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
                                        {h.title}
                                    </p>
                                    {h.description && (
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{h.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                                        <span className={`font-bold ${sourceColor}`}>{h.source}</span>
                                        {h.published && (
                                            <>
                                                <span className="text-slate-700">•</span>
                                                <span className="text-slate-500">{h.published}</span>
                                            </>
                                        )}
                                        <span className={`ml-auto px-1.5 py-0.5 rounded ${sent.bg} ${sent.color} font-bold text-[9px] uppercase`}>
                                            {h.sentiment}
                                        </span>
                                    </div>
                                </div>

                                <ExternalLink className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors shrink-0 mt-1" />
                            </div>
                        </a>
                    );
                })}
            </div>

            {/* Source attribution */}
            <div className="flex items-center justify-center gap-3 mt-3 text-[9px] text-slate-600">
                <span>Sources:</span>
                <span className="text-orange-400/60">Economic Times</span>
                <span>•</span>
                <span className="text-cyan-400/60">Moneycontrol</span>
                <span>•</span>
                <span className="text-emerald-400/60">LiveMint</span>
            </div>
        </div>
    );
};

export default NewsTicker;
