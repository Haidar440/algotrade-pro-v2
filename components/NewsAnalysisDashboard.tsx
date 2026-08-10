import React, { useState, useEffect } from 'react';
import { analyzeStockNews } from '../services/gemini';
import { NewsAnalysisResult } from '../types';
import { getUserErrorMessage } from '../services/errorMessages';
import { secureGet, SCAN_TIMEOUT_MS } from '../services/api';
import {
  Search, TrendingUp, TrendingDown, ExternalLink, Loader2, Newspaper,
  AlertTriangle, Zap, BarChart2, CheckCircle2, Globe, ShieldCheck, ArrowRight,
  Flame, Clock, RefreshCw, ChevronDown
} from 'lucide-react';

interface NewsAnalysisDashboardProps {
  initialSymbol?: string;
}

// ─── Trending tickers for quick one-click analysis ───
const TRENDING_TICKERS = [
  { symbol: 'RELIANCE', name: 'Reliance', sector: 'Energy' },
  { symbol: 'TCS', name: 'TCS', sector: 'IT' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto' },
  { symbol: 'SBIN', name: 'SBI', sector: 'Banking' },
  { symbol: 'BHARTIARTL', name: 'Airtel', sector: 'Telecom' },
  { symbol: 'ADANIENT', name: 'Adani Ent', sector: 'Infra' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking' },
  { symbol: 'ITC', name: 'ITC', sector: 'FMCG' },
];

const NewsAnalysisDashboard: React.FC<NewsAnalysisDashboardProps> = ({ initialSymbol }) => {
  const [query, setQuery] = useState(initialSymbol || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NewsAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>('ALL');
  const [marketMood, setMarketMood] = useState<any>(null);
  const [moodLoading, setMoodLoading] = useState(false);

  // Fetch market mood on mount
  useEffect(() => {
    fetchMarketMood();
  }, []);

  const fetchMarketMood = async () => {
    setMoodLoading(true);
    try {
      const res = await secureGet('/ai/news/market-mood', SCAN_TIMEOUT_MS);
      setMarketMood(res);
    } catch (e) {
      console.warn('Market mood unavailable:', e);
    } finally {
      setMoodLoading(false);
    }
  };

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await analyzeStockNews(searchTerm);
      setResult(data);
    } catch (err: unknown) {
      setError(getUserErrorMessage(err, 'news'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialSymbol) {
      setQuery(initialSymbol);
      performSearch(initialSymbol);
    }
  }, [initialSymbol]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const getSentimentColor = (score: number) => {
    if (score >= 60) return 'text-emerald-400';
    if (score <= 40) return 'text-rose-400';
    return 'text-amber-400';
  };

  const getSentimentBg = (score: number) => {
    if (score >= 60) return 'bg-emerald-500';
    if (score <= 40) return 'bg-rose-500';
    return 'bg-amber-500';
  };

  const filteredNews = result?.news_items.filter(item => {
    if (filter === 'ALL') return true;
    return item.sentiment === filter;
  }) || [];

  // ─── Sentiment SVG Ring ───
  const SentimentRing = ({ score, size = 100 }: { score: number; size?: number }) => {
    const r = (size - 12) / 2;
    const circ = 2 * Math.PI * r;
    const pct = Math.min(100, Math.max(0, score));
    const dash = (pct / 100) * circ;
    const color = score >= 60 ? '#10b981' : score <= 40 ? '#f43f5e' : '#f59e0b';
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90" width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{score}</span>
          <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">/ 100</span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

      {/* ━━━ Market Mood Bar ━━━ */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${marketMood?.label === 'Bullish' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' :
                marketMood?.label === 'Bearish' ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]' :
                  'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
              }`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Market Mood</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${marketMood?.label === 'Bullish' ? 'bg-emerald-500/20 text-emerald-400' :
                    marketMood?.label === 'Bearish' ? 'bg-rose-500/20 text-rose-400' :
                      'bg-amber-500/20 text-amber-400'
                  }`}>
                  {moodLoading ? '...' : marketMood?.label || 'Loading'}
                </span>
                {marketMood?.score !== undefined && (
                  <span className="text-xs text-slate-500">{marketMood.score}/100</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate max-w-md">
                {marketMood?.top_headline || 'Fetching market sentiment...'}
              </p>
            </div>
          </div>
          <button onClick={fetchMarketMood} className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${moodLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ━━━ Search + Trending ━━━ */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Newspaper className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">News Intelligence</h2>
            <p className="text-xs text-slate-500">Multi-source AI sentiment analysis — yfinance • GNews • RSS</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stock (e.g. TATAMOTORS) or topic..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-10 pr-28 text-white text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all placeholder-slate-500"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1.5 bottom-1.5 bg-cyan-600 hover:bg-cyan-500 text-white px-5 rounded-lg font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-3.5 h-3.5" /> Analyze</>}
          </button>
        </form>

        {/* Trending Tickers */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="text-[10px] text-slate-500 uppercase font-bold shrink-0">Trending</span>
          {TRENDING_TICKERS.map(t => (
            <button
              key={t.symbol}
              onClick={() => { setQuery(t.symbol); performSearch(t.symbol); }}
              disabled={loading}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all shrink-0 disabled:opacity-50 ${query === t.symbol
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-cyan-500/30 hover:text-cyan-400'
                }`}
            >
              {t.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* ━━━ Error ━━━ */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-3 text-rose-200">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ━━━ Loading ━━━ */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
            <Newspaper className="absolute inset-0 m-auto w-6 h-6 text-cyan-400" />
          </div>
          <p className="text-sm text-slate-400">Scanning multiple news sources...</p>
          <div className="flex gap-2 text-[10px] text-slate-600">
            <span>yfinance</span><span>•</span><span>GNews</span><span>•</span><span>RSS</span><span>•</span><span>Gemini</span>
          </div>
        </div>
      )}

      {/* ━━━ Results ━━━ */}
      {result && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Analytics */}
          <div className="lg:col-span-1 space-y-4">

            {/* Sentiment Gauge */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Sentiment</h3>
                <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${result.overall_sentiment === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                    result.overall_sentiment === 'BEARISH' ? 'bg-rose-500/20 text-rose-400' :
                      'bg-amber-500/20 text-amber-400'
                  }`}>
                  {result.overall_sentiment}
                </span>
              </div>
              <div className="flex justify-center mb-4">
                <SentimentRing score={result.sentiment_score} size={120} />
              </div>
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                {result.impact_summary}
              </p>
            </div>

            {/* Sector Context */}
            {result.sector_context && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-indigo-400" /> Sector Context
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed border-l-2 border-indigo-500/50 pl-3">
                  {result.sector_context}
                </p>
              </div>
            )}

            {/* Key Drivers + Risk Factors */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-3">Price Forecast</h3>
              <p className={`text-sm font-medium mb-4 ${result.price_prediction.short_term_outlook === 'Bullish' ? 'text-emerald-400' :
                  result.price_prediction.short_term_outlook === 'Bearish' ? 'text-rose-400' :
                    'text-amber-400'
                }`}>
                {result.price_prediction.short_term_outlook} Outlook
              </p>

              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase block mb-1.5">Key Drivers</span>
                  {result.price_prediction.key_drivers.map((d, i) => (
                    <div key={i} className="text-xs text-slate-300 flex items-start gap-2 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10 mb-1.5">
                      <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" /> {d}
                    </div>
                  ))}
                </div>
                <div>
                  <span className="text-[10px] text-rose-400 font-bold uppercase block mb-1.5">Risk Factors</span>
                  {result.price_prediction.risk_factors.map((r, i) => (
                    <div key={i} className="text-xs text-slate-300 flex items-start gap-2 bg-rose-500/5 p-2 rounded-lg border border-rose-500/10 mb-1.5">
                      <TrendingDown className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" /> {r}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: News Feed */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                News Feed
                <span className="text-xs text-slate-500 font-normal">({filteredNews.length} articles)</span>
              </h3>
              <div className="flex gap-1.5">
                {(['ALL', 'POSITIVE', 'NEGATIVE'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 ${filter === f
                        ? f === 'ALL' ? 'bg-slate-700 text-white'
                          : f === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'text-slate-500 hover:text-slate-300'
                      }`}
                  >
                    {f === 'ALL' ? 'All' : f === 'POSITIVE' ? <><TrendingUp className="w-3 h-3" /> Bull</> : <><TrendingDown className="w-3 h-3" /> Bear</>}
                  </button>
                ))}
              </div>
            </div>

            {filteredNews.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-700 rounded-xl text-slate-500 text-sm">
                No news articles found for this filter.
              </div>
            ) : (
              filteredNews.map((news, idx) => (
                <div key={idx} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all group relative overflow-hidden">
                  {/* Sentiment Strip */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${news.sentiment === 'POSITIVE' ? 'bg-emerald-500' :
                      news.sentiment === 'NEGATIVE' ? 'bg-rose-500' : 'bg-slate-600'
                    }`} />

                  <div className="pl-3">
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px] font-bold text-slate-400">{news.source}</span>
                          <span className="text-slate-700">•</span>
                          <span className="text-[11px] text-slate-600 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> {news.published}
                          </span>
                          {news.source_reliability === 'High' && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-bold border border-blue-500/20 flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Trusted
                            </span>
                          )}
                        </div>
                        <a href={news.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-bold text-slate-200 hover:text-cyan-400 transition-colors leading-snug flex items-start gap-1.5">
                          {news.title}
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                        </a>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${news.sentiment === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                          news.sentiment === 'NEGATIVE' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-slate-800 text-slate-500'
                        }`}>
                        {news.sentiment === 'POSITIVE' ? '🟢' : news.sentiment === 'NEGATIVE' ? '🔴' : '⚪'} {news.sentiment}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed mb-2">{news.summary}</p>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                      {news.relevance_score && (
                        <div className="flex items-center gap-1.5" title={`Relevance: ${news.relevance_score}/10`}>
                          <span className="text-[9px] text-slate-600 font-bold uppercase">Relevance</span>
                          <div className="flex gap-0.5">
                            {[...Array(10)].map((_, i) => (
                              <div key={i} className={`w-1 h-1.5 rounded-sm ${i < (news.relevance_score || 0) ? 'bg-cyan-500' : 'bg-slate-800'}`} />
                            ))}
                          </div>
                        </div>
                      )}
                      <a href={news.url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] font-bold text-slate-600 hover:text-white flex items-center gap-1 transition-colors">
                        Read <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ━━━ Empty State ━━━ */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center mb-4">
            <Newspaper className="w-7 h-7 text-cyan-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Search for News Intelligence</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md">
            Type a stock symbol above or click a trending ticker to get instant AI-powered news analysis with sentiment scoring.
          </p>
          <div className="flex items-center gap-4 text-[11px] text-slate-600">
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Multi-source</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Sentiment AI</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Real-time</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsAnalysisDashboard;