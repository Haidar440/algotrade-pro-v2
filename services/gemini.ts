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

// ✅ 2. STOCK ANALYSIS (Uses Backend /api/ai/analyze)
export const analyzeStockTicker = async (ticker: string): Promise<AnalysisResult> => {
  try {
    // Backend returns TechnicalAnalysisSchema
    const res: any = await secureGet(`/ai/analyze/${ticker}`);

    // Derive previous close from current price and day change %
    const dayChangePct = res.indicators.day_change_pct || 0;
    const currentPrice = res.indicators.current_price;
    const previousClose = dayChangePct !== 0 ? currentPrice / (1 + dayChangePct / 100) : currentPrice;

    // Map volume signal to volume status
    const volumeStatus = res.signals?.volume_signal === 'HIGH_VOLUME' ? 'HIGH'
      : res.signals?.volume_signal === 'LOW_VOLUME' ? 'LOW' : 'AVERAGE';

    // ── Generate Strategy Evaluations from Backend Indicators ──
    const rsi = res.indicators.rsi || 50;
    const adx = res.indicators.adx || 15;
    const ema9 = res.indicators.ema_9 || currentPrice;
    const ema21 = res.indicators.ema_21 || currentPrice;
    const ema50 = res.indicators.ema_50 || currentPrice;
    const ema200 = res.indicators.ema_200 || currentPrice;
    const bbUpper = res.indicators.bb_upper || currentPrice * 1.02;
    const bbMiddle = res.indicators.bb_middle || currentPrice;
    const bbLower = res.indicators.bb_lower || currentPrice * 0.98;
    const atr = res.indicators.atr || currentPrice * 0.02;
    const volRatio = res.indicators.volume_ratio || 1.0;
    const macdBullish = res.signals?.macd_signal === 'BULLISH';
    const supertrendBull = res.indicators?.supertrend_direction === 'UP';
    const support = res.support || currentPrice * 0.97;
    const resistance = res.resistance || currentPrice * 1.03;
    const stochK = res.indicators?.stoch_k || 50;
    const mfi = res.indicators?.mfi || 50;

    // Market condition
    const condition = currentPrice > ema50 && ema50 > ema200 ? 'UPTREND'
      : currentPrice < ema50 && ema50 < ema200 ? 'DOWNTREND' : 'RANGE-BOUND';

    const isUptrend = condition === 'UPTREND';
    const volSpike = volRatio > 1.5;
    const bandwidth = bbUpper > 0 && bbMiddle > 0 ? (bbUpper - bbLower) / bbMiddle : 0.1;

    const strategies: any[] = [];
    const addStrat = (name: string, isValid: boolean, rr: number, conf: number, notes: string,
      targets: number[], sl: number, sig: 'BUY' | 'SELL' | 'NO-TRADE' = isValid ? 'BUY' : 'NO-TRADE') => {
      strategies.push({
        strategy_name: name, is_valid: isValid, signal: sig,
        ideal_entry_range: [currentPrice, currentPrice * (sig === 'SELL' ? 0.99 : 1.01)],
        stop_loss: Number(sl.toFixed(2)),
        target_prices: targets.map(t => Number(t.toFixed(2))),
        risk_reward_ratio: rr, quality_score: isValid ? conf : 0.3,
        confidence: isValid ? conf : 0, notes
      });
    };

    // 1. Trend Following (ADX)
    const isTrendBuy = currentPrice > ema50 && adx > 20 && ema21 > ema50;
    addStrat("Trend Following (ADX)", isTrendBuy, 2.5, 0.85,
      isTrendBuy ? `Strong Trend (ADX ${adx.toFixed(0)}).` : `Trend weak (ADX ${adx.toFixed(0)}).`,
      [currentPrice * 1.15], ema50);

    // 2. Golden Cross
    const isGoldenZone = ema50 > ema200 && currentPrice > ema21;
    addStrat("Golden Cross", isGoldenZone, 3, 0.8,
      isGoldenZone ? "Golden Cross Zone." : "No Golden Cross.",
      [currentPrice * 1.25], ema200);

    // 3. RSI Divergence
    const isDivergence = rsi >= 25 && rsi < 45 && macdBullish;
    addStrat("RSI Divergence", isDivergence, 3, 0.85,
      isDivergence ? "Bullish RSI + MACD alignment." : "No divergence pattern.",
      [currentPrice * 1.08], support);

    // 4. 20-Day Breakout
    const isBreakout = currentPrice > resistance * 0.99 && volSpike;
    addStrat("20-Day Breakout", isBreakout, 2, 0.92,
      isBreakout ? "Breaking resistance + Volume." : "Inside range.",
      [currentPrice * 1.10], currentPrice * 0.97);

    // 5. VWAP Reversion
    const isVWAPBounce = currentPrice > ema21 && currentPrice < ema21 * 1.02 && (isUptrend || condition === 'RANGE-BOUND');
    addStrat("VWAP Reversion", isVWAPBounce, 2.5, 0.88,
      isVWAPBounce ? "Near VWAP support." : "No VWAP interaction.",
      [resistance], ema21 * 0.98);

    // 6. 50 EMA Pullback
    const distTo50 = Math.abs(currentPrice - ema50) / currentPrice;
    const isPullback = isUptrend && distTo50 < 0.03 && currentPrice >= ema50;
    addStrat("50 EMA Pullback", isPullback, 3, 0.9,
      isPullback ? "Perfect pullback to 50 EMA." : "Not near 50 EMA.",
      [currentPrice * 1.1], ema50 * 0.97);

    // 7. Bollinger Squeeze
    const isSqueeze = bandwidth < 0.15;
    const isBBBreakout = isSqueeze && currentPrice > bbUpper;
    addStrat("Bollinger Squeeze", isBBBreakout, 2.5, 0.95,
      isBBBreakout ? "Breakout from Squeeze!" : isSqueeze ? "Market Squeezing." : "No squeeze.",
      [currentPrice * 1.15], bbMiddle);

    // 8. MACD Histogram Reversal
    addStrat("MACD Histogram Reversal", macdBullish && rsi > 40, 2.8, 0.84,
      macdBullish ? "MACD bullish crossover." : "MACD bearish.",
      [currentPrice * 1.12], support);

    // 9. Stochastic Oversold Bounce
    const stochOversold = stochK < 25 && macdBullish;
    addStrat("Stochastic Oversold Bounce", stochOversold, 2.5, stochOversold && isUptrend ? 0.85 : 0.75,
      stochOversold ? `Stochastic ${stochK.toFixed(0)} oversold, turning up.` : "Not oversold.",
      [currentPrice * 1.08], support);

    // 10. RSI Swing Re-entry
    const rsiSwing = rsi > 40 && rsi < 60 && isUptrend && ema21 > ema50;
    addStrat("RSI Swing Re-entry", rsiSwing, 2.4, 0.8,
      rsiSwing ? "RSI mid-zone pullback." : "RSI out of zone.",
      [currentPrice * 1.07], ema50);

    // 11. RSI Oversold Bounce
    const rsiOversold = rsi < 35;
    addStrat("RSI Oversold Bounce", rsiOversold, 2.5, rsi < 25 ? 0.88 : 0.78,
      rsiOversold ? `RSI ${rsi.toFixed(1)} oversold — reversal likely.` : `RSI ${rsi.toFixed(1)} not oversold.`,
      [ema21, ema50], support * 0.98);

    // 12. BB Lower Band Bounce
    const nearLowerBB = currentPrice <= bbLower * 1.02;
    addStrat("BB Lower Band Bounce", nearLowerBB, 2.8, nearLowerBB ? 0.85 : 0.72,
      nearLowerBB ? `Near Bollinger Lower Band (₹${bbLower.toFixed(0)}).` : "Within Bollinger Bands.",
      [bbMiddle, bbUpper], bbLower * 0.98);

    // 13. Supertrend Bullish
    addStrat("Supertrend Signal", supertrendBull && adx > 20, 2.5, 0.82,
      supertrendBull ? "Supertrend is bullish." : "Supertrend is bearish.",
      [currentPrice * 1.10], currentPrice - atr * 2, supertrendBull && adx > 20 ? 'BUY' : 'NO-TRADE');

    // 14. EMA Stack (NEW)
    const emaStack = ema9 > ema21 && ema21 > ema50 && ema50 > ema200;
    addStrat("EMA Stack Alignment", emaStack, 3, 0.9,
      emaStack ? "Perfect EMA stack (9>21>50>200) — strong trend." : "EMAs not aligned.",
      [currentPrice * 1.15], ema50);

    // 15. Volume Accumulation
    const isAccum = volRatio > 1.3 && currentPrice > ema21 && macdBullish;
    addStrat("Volume Accumulation", isAccum, 2, 0.85,
      isAccum ? `Volume ${volRatio.toFixed(1)}x above avg — institutional buying.` : "Normal volume.",
      [resistance], support);

    // 16. MFI Oversold (NEW)
    const mfiOversold = mfi < 30;
    addStrat("MFI Oversold Signal", mfiOversold, 2.5, 0.82,
      mfiOversold ? `MFI ${mfi.toFixed(0)} — money flowing out, reversal expected.` : `MFI ${mfi.toFixed(0)} normal.`,
      [ema21, bbMiddle], support);

    // 17. Bearish Breakdown
    const isBearish = condition === 'DOWNTREND' && currentPrice < ema21 && ema21 < ema50 && adx > 25 && rsi > 35;
    addStrat("Bearish Breakdown", isBearish, 2.5, isBearish ? 0.85 : 0.75,
      isBearish ? `Downtrend confirmed (ADX ${adx.toFixed(0)}).` : "No bearish breakdown.",
      [ema50 * 0.95, support], ema21 * 1.02, isBearish ? 'SELL' : 'NO-TRADE');

    // ── Pick best strategy ──
    const activeBuys = strategies.filter((s: any) => s.signal === 'BUY');
    const activeSells = strategies.filter((s: any) => s.signal === 'SELL');
    const activeSignals = [...activeBuys, ...activeSells];
    const best = activeSignals.length
      ? activeSignals.sort((a: any, b: any) => b.quality_score - a.quality_score)[0]
      : strategies.sort((a: any, b: any) => b.quality_score - a.quality_score)[0];

    const hasSignal = activeSignals.length > 0;

    return {
      symbol: ticker,
      current_price: currentPrice,
      market_condition: condition as any,
      timeframe: "1D",
      previous_close: Math.round(previousClose * 100) / 100,
      data_timestamp: new Date().toISOString(),
      strategies_evaluated: strategies,
      disclaimer: "AI analysis is for informational purposes only.",
      technicals: {
        rsi: res.indicators.rsi,
        adx: res.indicators.adx,
        macd: macdBullish ? 'BULLISH' : 'BEARISH',
        ema_20: res.indicators.ema_21,
        ema_50: res.indicators.ema_50,
        ema_200: res.indicators.ema_200,
        support: res.support,
        resistance: res.resistance,
        volume_status: volumeStatus as any,
        atr14: res.indicators.atr
      },
      primary_recommendation: {
        strategy_name: hasSignal ? best.strategy_name : "No Trade Setup",
        signal: (hasSignal ? best.signal : res.overall_signal) as any,
        ideal_entry_range: best?.ideal_entry_range || [currentPrice * 0.99, currentPrice * 1.01],
        stop_loss: best?.stop_loss || res.support,
        target_prices: best?.target_prices || [res.resistance],
        risk_reward_ratio: best?.risk_reward_ratio || (res.support > 0 ? Math.round(((res.resistance - currentPrice) / (currentPrice - res.support)) * 10) / 10 : 2),
        confidence: best?.confidence || res.signal_strength / 100,
        reason: hasSignal
          ? `${best.signal} Signal: ${best.strategy_name}. ${best.notes}`
          : res.summary
      }
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