import React, { useState, useEffect } from 'react';
import { analyzeStockNews } from '../services/gemini';
import { NewsAnalysisResult } from '../types';
import { 
  Search, TrendingUp, TrendingDown, ExternalLink, Loader2, Newspaper, 
  AlertTriangle, Zap, BarChart2, CheckCircle2, Globe, ShieldCheck, ArrowRight
} from 'lucide-react';

interface NewsAnalysisDashboardProps {
  initialSymbol?: string;
}

const NewsAnalysisDashboard: React.FC<NewsAnalysisDashboardProps> = ({ initialSymbol }) => {
  const [query, setQuery] = useState(initialSymbol || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NewsAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>('ALL');

  // Logic to execute search
  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await analyzeStockNews(searchTerm);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch news analysis.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger search when initialSymbol changes
  useEffect(() => {
    if (initialSymbol) {
      setQuery(initialSymbol);
      performSearch(initialSymbol);
    }
  }, [initialSymbol]);

  // Handle form submission
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

  // Filter Logic
  const filteredNews = result?.news_items.filter(item => {
    if (filter === 'ALL') return true;
    return item.sentiment === filter;
  }) || [];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* Search Header */}
      <div className="glass-panel p-8 rounded-2xl border border-slate-700 bg-slate-800/40 text-center relative overflow-hidden">
         {/* Background Decoration */}
         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500"></div>
         
         <h1 className="text-3xl font-bold text-white mb-4 flex items-center justify-center gap-3">
           <Newspaper className="text-cyan-400 w-8 h-8" /> News Intelligence
         </h1>
         <p className="text-slate-400 text-lg mb-8 max-w-2xl mx-auto">
           AI-powered sentiment analysis, sector impact assessment, and price forecasting based on real-time news.
         </p>

         <form onSubmit={handleSearch} className="max-w-xl mx-auto relative z-10">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter symbol (e.g. TATAMOTORS) or topic..."
              className="w-full bg-slate-900 border border-slate-600 rounded-xl py-4 pl-12 pr-4 text-white text-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all shadow-xl placeholder-slate-500"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-6 h-6" />
            <button 
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 top-2 bottom-2 bg-cyan-600 hover:bg-cyan-500 text-white px-6 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Analyze'}
            </button>
         </form>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-3 text-rose-200">
           <AlertTriangle className="w-6 h-6 shrink-0" />
           <p>{error}</p>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="lg:col-span-1 space-y-6">
            <div className="h-64 bg-slate-800/50 rounded-xl border border-slate-700"></div>
            <div className="h-64 bg-slate-800/50 rounded-xl border border-slate-700"></div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 bg-slate-800/50 rounded-xl border border-slate-700"></div>
            ))}
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           {/* Left Column: Analytics */}
           <div className="lg:col-span-1 space-y-6">
              
              {/* 1. Sentiment Gauge Card */}
              <div className="glass-panel p-6 rounded-xl border border-slate-700 bg-slate-900/50">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                       <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Overall Sentiment</h3>
                       <div className={`text-3xl font-black mt-1 ${getSentimentColor(result.sentiment_score)}`}>
                         {result.overall_sentiment}
                       </div>
                    </div>
                    <div className="text-right">
                       <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Score</h3>
                       <div className="text-3xl font-mono font-bold text-white mt-1">{result.sentiment_score}/100</div>
                    </div>
                 </div>

                 {/* Gauge Bar */}
                 <div className="relative h-6 bg-slate-700 rounded-full overflow-hidden mb-6 shadow-inner">
                    <div 
                      className={`h-full transition-all duration-1000 ease-out ${getSentimentBg(result.sentiment_score)}`}
                      style={{ width: `${result.sentiment_score}%` }}
                    >
                      <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/30"></div>
                    </div>
                 </div>

                 <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" /> Impact Summary
                    </h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {result.impact_summary}
                    </p>
                 </div>
              </div>

              {/* 2. Sector Context Card */}
              {result.sector_context && (
                <div className="glass-panel p-5 rounded-xl border border-slate-700 bg-slate-800/30">
                  <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-indigo-400" /> Sector Context
                  </h4>
                  <p className="text-slate-300 text-sm leading-relaxed italic border-l-2 border-indigo-500 pl-3">
                      {result.sector_context}
                  </p>
                </div>
              )}

              {/* 3. Prediction Card */}
              <div className="glass-panel p-6 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800">
                 <h3 className="text-lg font-bold text-white mb-4">Price Forecast</h3>
                 <p className="text-cyan-300 font-medium text-lg mb-6 leading-snug">
                   "{result.price_prediction.short_term_outlook}"
                 </p>
                 
                 <div className="space-y-5">
                    <div>
                       <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider block mb-2">Key Drivers</span>
                       <ul className="space-y-2">
                          {result.price_prediction.key_drivers.map((d, i) => (
                             <li key={i} className="text-sm text-slate-300 flex items-start gap-2 bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                               <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" /> {d}
                             </li>
                          ))}
                       </ul>
                    </div>
                    <div>
                       <span className="text-xs text-rose-400 font-bold uppercase tracking-wider block mb-2">Risk Factors</span>
                       <ul className="space-y-2">
                          {result.price_prediction.risk_factors.map((r, i) => (
                             <li key={i} className="text-sm text-slate-300 flex items-start gap-2 bg-rose-500/5 p-2 rounded border border-rose-500/10">
                               <TrendingDown className="w-4 h-4 text-rose-500 shrink-0" /> {r}
                             </li>
                          ))}
                       </ul>
                    </div>
                 </div>
              </div>
           </div>

           {/* Right Column: News Feed */}
           <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between mb-2">
                 <h3 className="text-xl font-bold text-white">Market News Feed</h3>
                 
                 {/* Filters */}
                 <div className="flex gap-2">
                    <button 
                      onClick={() => setFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${filter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      All
                    </button>
                    <button 
                      onClick={() => setFilter('POSITIVE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${filter === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'}`}
                    >
                      <TrendingUp className="w-3 h-3" /> Bullish
                    </button>
                    <button 
                      onClick={() => setFilter('NEGATIVE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${filter === 'NEGATIVE' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-rose-400'}`}
                    >
                      <TrendingDown className="w-3 h-3" /> Bearish
                    </button>
                 </div>
              </div>

              {filteredNews.length === 0 ? (
                 <div className="text-center py-12 border border-dashed border-slate-700 rounded-xl text-slate-500">
                    No news items found for this filter.
                 </div>
              ) : (
                filteredNews.map((news, idx) => (
                   <div key={idx} className="glass-panel p-5 rounded-xl border border-slate-700 bg-slate-800/30 hover:bg-slate-800/50 transition-all duration-300 group relative overflow-hidden">
                      {/* Sentiment Strip */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                         news.sentiment === 'POSITIVE' ? 'bg-emerald-500' :
                         news.sentiment === 'NEGATIVE' ? 'bg-rose-500' : 'bg-slate-500'
                      }`}></div>

                      <div className="flex flex-col gap-4 pl-3">
                         <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                               <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-bold text-slate-400">{news.source}</span>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-xs text-slate-500">{news.published}</span>
                                  
                                  {/* Reliability Badge */}
                                  {news.source_reliability === 'High' && (
                                     <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> Trusted Source
                                     </span>
                                  )}
                               </div>
                               <h4 className="text-lg font-bold text-slate-100 mb-2 group-hover:text-cyan-400 transition-colors leading-tight">
                                  <a href={news.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                     {news.title}
                                     <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </a>
                               </h4>
                            </div>
                            
                            <div className={`px-3 py-1 rounded text-xs font-bold uppercase shrink-0 ${
                               news.sentiment === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                               news.sentiment === 'NEGATIVE' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                               'bg-slate-700 text-slate-300 border border-slate-600'
                            }`}>
                               {news.sentiment}
                            </div>
                         </div>
                         
                         <p className="text-slate-400 text-sm leading-relaxed">{news.summary}</p>
                         
                         {/* Footer: Relevance & Tags */}
                         <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-700/50">
                            {news.relevance_score && (
                              <div className="flex items-center gap-2" title={`Relevance Score: ${news.relevance_score}/10`}>
                                 <span className="text-[10px] text-slate-500 font-bold uppercase">Relevance</span>
                                 <div className="flex gap-0.5">
                                    {[...Array(10)].map((_, i) => (
                                       <div key={i} className={`w-1 h-2 rounded-sm ${i < (news.relevance_score || 0) ? 'bg-cyan-500' : 'bg-slate-700'}`}></div>
                                    ))}
                                 </div>
                              </div>
                            )}
                            
                            <a href={news.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
                               Read Full Story <ArrowRight className="w-3 h-3" />
                            </a>
                         </div>
                      </div>
                   </div>
                ))
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export default NewsAnalysisDashboard;