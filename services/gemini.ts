import { AnalysisResult, MarketIndices, NewsAnalysisResult } from "../types";
import { api, secureGet } from './api';

// Types from original file
export interface AIPrediction {
  symbol: string;
  currentPrice: number;
  predictedPrice: number;
  timeframe: string;
  confidence: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  keyLevels: {
    support: number;
    resistance: number;
  };
}

const INDICES_CACHE_KEY = 'algoTradePro_indices_cache';
const INDICES_CACHE_DURATION = 60 * 60 * 1000;

// ✅ 1. PREDICTION (Uses Backend /api/ai/predict)
export const getGeminiPrediction = async (
  symbol: string,
  currentPrice: number,
  analysis: AnalysisResult,
  historyString: string
): Promise<AIPrediction> => {
  try {
    const res: any = await secureGet(`/ai/predict/${symbol}`);

    // Use backend values, fall back to frontend analysis data for support/resistance
    const support = res.stop_loss || analysis?.technicals?.support || currentPrice * 0.97;
    const resistance = res.target_price || analysis?.technicals?.resistance || currentPrice * 1.03;

    return {
      symbol: res.symbol || symbol,
      currentPrice: currentPrice,
      predictedPrice: res.target_price || resistance,
      timeframe: res.time_horizon || '5-10 days',
      confidence: res.confidence || 0,
      signal: (res.signal === 'HOLD' ? 'HOLD' : res.signal === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL' | 'HOLD',
      reasoning: res.reasoning?.includes('unavailable')
        ? `Technical analysis: ${res.signal} signal with ${res.confidence}% confidence. Target: ₹${res.target_price?.toFixed(2)}, SL: ₹${res.stop_loss?.toFixed(2)}. Risk: ${res.risk_level || 'MEDIUM'}.`
        : res.reasoning,
      keyLevels: {
        support: support,
        resistance: resistance
      }
    };
  } catch (error) {
    console.error("AI Prediction Error:", error);
    throw new Error("AI Prediction Failed.");
  }
};

// ✅ 2. STOCK ANALYSIS — Backend is SINGLE SOURCE OF TRUTH
// All strategy evaluation, entry/target calculation, and trade classification
// is done in Python. This function only calls the API and maps the response.
export const analyzeStockTicker = async (ticker: string): Promise<AnalysisResult> => {
  try {
    // Call the new backend-driven analysis endpoint
    const res: any = await secureGet(`/analysis/${ticker}`);

    // Map strategies from backend format to frontend StrategyEvaluation
    const strategies = (res.strategies || []).map((s: any) => ({
      strategy_name: s.strategy_name,
      is_valid: s.is_valid,
      signal: s.signal,
      ideal_entry_range: s.entry_range || [res.current_price, res.current_price],
      entry_range: s.entry_range,
      stop_loss: s.stop_loss || res.stop_loss || 0,
      target_prices: s.target_prices || [],
      risk_reward_ratio: s.risk_reward || 0,
      risk_reward: s.risk_reward,
      quality_score: s.is_valid ? s.confidence : 0.3,
      confidence: s.confidence || 0,
      notes: s.notes || '',
      trade_type: s.trade_type || res.trade_type || 'SWING',
    }));

    // Build primary recommendation from backend's computed signal
    const primary = {
      strategy_name: res.primary_strategy || 'No Trade Setup',
      signal: res.signal || 'NO-TRADE',
      ideal_entry_range: res.entry_range || [res.current_price * 0.99, res.current_price * 1.01],
      stop_loss: res.stop_loss || 0,
      target_prices: (res.targets || []).map((t: any) => t.price),
      target_price: res.targets?.[0]?.price || 0,
      risk_reward_ratio: res.risk_reward_ratio || 0,
      confidence: res.confidence || 0,
      reason: res.reason || 'Insufficient data for analysis.',
    };

    return {
      symbol: res.symbol || ticker,
      current_price: res.current_price || 0,
      previous_close: res.previous_close || res.current_price || 0,
      market_condition: res.market_condition || 'RANGE-BOUND',
      timeframe: res.timeframe || 'Daily',
      data_timestamp: res.data_timestamp || new Date().toISOString(),
      technicals: res.technicals || {
        rsi: 50, adx: 15, macd: 'BEARISH', ema_20: 0, ema_50: 0,
        ema_200: 0, support: 0, resistance: 0, volume_status: 'AVERAGE', atr14: 0,
      },
      strategies_evaluated: strategies,
      primary_recommendation: primary,
      disclaimer: res.disclaimer || 'Algorithmic analysis. Not financial advice.',

      // Backend-driven fields (new)
      trade_type: res.trade_type,
      trade_type_reason: res.trade_type_reason,
      expected_holding: res.expected_holding,
      exact_entry: res.exact_entry,
      entry_range: res.entry_range,
      entry_logic: res.entry_logic,
      stop_loss: res.stop_loss,
      stop_loss_reason: res.stop_loss_reason,
      risk_percent: res.risk_percent,
      targets: res.targets,
      risk_reward_ratio: res.risk_reward_ratio,
      volume: res.volume,
      sr_levels: res.sr_levels,
      signal: res.signal,
      confidence: res.confidence,
      reason: res.reason,
      candles: res.candles,
    };
  } catch (error: any) {
    console.error("Analysis Error:", error);
    throw error;
  }
};

// ✅ 3. NEWS ANALYSIS (Uses Backend /api/ai/news — Gemini + Google Search)
export const analyzeStockNews = async (query: string): Promise<NewsAnalysisResult> => {
  try {
    const symbol = query.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
    const res: any = await secureGet(`/ai/news/${symbol}?with_sentiment=true`);

    // Backend now returns sentiment directly from Gemini (always -100..100)
    const score = res.sentiment_score ?? 0;
    const sentimentLabel = res.sentiment || (score > 10 ? 'BULLISH' : score < -10 ? 'BEARISH' : 'NEUTRAL');
    const outlookLabel = sentimentLabel === 'POSITIVE' || sentimentLabel === 'BULLISH' ? 'Bullish'
      : sentimentLabel === 'NEGATIVE' || sentimentLabel === 'BEARISH' ? 'Bearish' : 'Neutral';

    // Map backend sentiment labels to frontend format
    const mapSentiment = (s: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
      if (s === 'POSITIVE' || s === 'BULLISH') return 'BULLISH';
      if (s === 'NEGATIVE' || s === 'BEARISH') return 'BEARISH';
      return 'NEUTRAL';
    };

    // Extract domain from URL for source name
    const extractSource = (url: string, backendSource?: string): string => {
      if (backendSource) return backendSource;
      try {
        const domain = new URL(url).hostname.replace('www.', '');
        if (domain.includes('moneycontrol')) return 'Moneycontrol';
        if (domain.includes('economictimes')) return 'Economic Times';
        if (domain.includes('livemint')) return 'Livemint';
        if (domain.includes('reuters')) return 'Reuters';
        if (domain.includes('bloomberg')) return 'Bloomberg';
        if (domain.includes('ndtv')) return 'NDTV';
        if (domain.includes('business-standard')) return 'Business Standard';
        if (domain.includes('cnbctv18')) return 'CNBC TV18';
        if (domain.includes('screener')) return 'Screener.in';
        if (domain.includes('tickertape')) return 'Tickertape';
        if (domain.includes('trendlyne')) return 'Trendlyne';
        if (domain.includes('yahoo')) return 'Yahoo Finance';
        return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      } catch { return 'Web'; }
    };

    // Derive per-article sentiment from title/content keywords
    const deriveArticleSentiment = (title: string, content: string): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' => {
      const text = (title + ' ' + content).toLowerCase();
      const bullishWords = [
        'surge', 'surges', 'rally', 'gain', 'gains', 'rise', 'rises', 'high',
        'profit', 'growth', 'bullish', 'buy', 'upgrade', 'positive', 'strong',
        'breakout', 'recovery', 'beat', 'beats', 'dividend', 'record',
      ];
      const bearishWords = [
        'fall', 'falls', 'drop', 'drops', 'plunge', 'loss', 'losses',
        'decline', 'crash', 'bearish', 'sell', 'downgrade', 'negative', 'weak',
        'concern', 'risk', 'pressure', 'debt', 'slump', 'correction',
      ];
      const bullCount = bullishWords.filter(w => text.includes(w)).length;
      const bearCount = bearishWords.filter(w => text.includes(w)).length;
      if (bullCount > bearCount) return 'POSITIVE';
      if (bearCount > bullCount) return 'NEGATIVE';
      return 'NEUTRAL';
    };

    // Use backend key_drivers and risk_factors directly (Gemini-powered)
    const keyDrivers: string[] = res.key_drivers || [];
    const riskFactors: string[] = res.risk_factors || [];

    return {
      symbol: res.symbol,
      overall_sentiment: mapSentiment(res.sentiment || sentimentLabel),
      sentiment_score: score !== 0 ? ((score + 100) / 2) : 50, // Normalize -100..100 → 0..100
      impact_summary: res.sentiment_summary && !res.sentiment_summary.includes('unavailable')
        ? res.sentiment_summary
        : `${res.article_count || 0} news articles found for ${symbol}. Sentiment: ${sentimentLabel}.`,
      sector_context: res.sentiment_summary
        ? res.sentiment_summary.substring(0, 200) + (res.sentiment_summary.length > 200 ? '...' : '')
        : score > 20
          ? `Overall positive market sentiment for ${symbol} based on recent news coverage.`
          : score < -20
            ? `Caution advised -- negative sentiment detected in ${symbol} news coverage.`
            : `Mixed/neutral sentiment across ${res.article_count || 0} recent articles for ${symbol}.`,
      price_prediction: {
        short_term_outlook: outlookLabel,
        key_drivers: keyDrivers.length > 0 ? keyDrivers : ['No strong bullish signals in recent news'],
        risk_factors: riskFactors.length > 0 ? riskFactors : ['No significant risk factors in recent news']
      },
      news_items: (res.articles || []).map((a: any) => ({
        title: a.title,
        source: extractSource(a.url, a.source),
        published: a.published_date || "Recent",
        summary: a.content?.substring(0, 150) + "..." || "No content available",
        sentiment: deriveArticleSentiment(a.title, a.content || ''),
        url: a.url,
        relevance_score: a.score || 0.8,
        source_reliability: a.score > 0.7 ? "High" as const : a.score > 0.4 ? "Medium" as const : "Low" as const
      }))
    };
  } catch (error) {
    console.error("News Error:", error);
    throw new Error("Failed to analyze news.");
  }
};

// ✅ 4. MARKET INDICES (Uses Backend /api/ai/market/indices)
export const fetchMarketIndices = async (): Promise<MarketIndices> => {
  try {
    const cached = localStorage.getItem(INDICES_CACHE_KEY);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < INDICES_CACHE_DURATION) return data;
    }

    const data: any = await secureGet('/ai/market/indices');
    localStorage.setItem(INDICES_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    return data;
  } catch (error) {
    // Return defaults if backend fails
    return {
      nifty: { price: 22450.30, changePercent: 0.45 },
      sensex: { price: 73980.15, changePercent: -0.12 },
      bankNifty: { price: 47850.00, changePercent: 1.20 }
    };
  }
};

// ✅ 5. AI STOCK PICKS (Uses Backend /api/ai/picks)
export interface StockPick {
  symbol: string;
  score: number;
  rating: string;
  price: number;
  entry_range: string;
  stop_loss: number;
  target: number;
  risk_reward: string;
  shares: number;
  investment: number;
  risk_amount: number;
  reasons: string[];
}

export interface StockPicksResult {
  capital: number;
  total_scanned: number;
  picks_found: number;
  top_picks: StockPick[];
}

export const fetchAIStockPicks = async (capital: number = 100000): Promise<StockPicksResult> => {
  try {
    const res: any = await secureGet(`/ai/picks?capital=${capital}`);
    return {
      capital: res.capital || capital,
      total_scanned: res.total_scanned || 0,
      picks_found: res.picks_found || 0,
      top_picks: (res.top_picks || []).map((p: any) => ({
        symbol: p.symbol,
        score: p.score,
        rating: p.rating,
        price: p.price,
        entry_range: p.entry_range,
        stop_loss: p.stop_loss,
        target: p.target,
        risk_reward: p.risk_reward,
        shares: p.shares,
        investment: p.investment,
        risk_amount: p.risk_amount,
        reasons: p.reasons || []
      }))
    };
  } catch (error) {
    console.error("AI Picks Error:", error);
    throw new Error("Failed to fetch AI stock picks.");
  }
};

// ✅ 6. PERFORMANCE ANALYTICS (Uses Backend /api/ai/analytics)
export interface PerformanceAnalytics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  average_profit: number;
  average_loss: number;
  largest_win: number;
  largest_loss: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown: number;
  avg_holding_period: string;
  best_strategy: string;
  total_fees: number;
  net_pnl: number;
  roi_percent: number;
  current_streak: number;
}

export const fetchPerformanceAnalytics = async (): Promise<PerformanceAnalytics> => {
  try {
    const res: any = await secureGet('/ai/analytics');
    return {
      total_trades: res.total_trades || 0,
      winning_trades: res.winning_trades || 0,
      losing_trades: res.losing_trades || 0,
      win_rate: res.win_rate || 0,
      total_pnl: res.total_pnl || 0,
      average_profit: res.average_profit || 0,
      average_loss: res.average_loss || 0,
      largest_win: res.largest_win || 0,
      largest_loss: res.largest_loss || 0,
      profit_factor: res.profit_factor || 0,
      sharpe_ratio: res.sharpe_ratio || 0,
      max_drawdown: res.max_drawdown || 0,
      avg_holding_period: res.avg_holding_period || 'N/A',
      best_strategy: res.best_strategy || 'N/A',
      total_fees: res.total_fees || 0,
      net_pnl: res.net_pnl || 0,
      roi_percent: res.roi_percent || 0,
      current_streak: res.current_streak || 0
    };
  } catch (error) {
    console.error("Analytics Error:", error);
    throw new Error("Failed to fetch performance analytics.");
  }
};