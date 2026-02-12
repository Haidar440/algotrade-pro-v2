import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, MarketIndices, NewsAnalysisResult } from "../types";

// ==========================================
// 🔑 JUGAAD: MULTI-KEY ROTATION SYSTEM
// ==========================================
const API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY || "YOUR_PRIMARY_KEY", // Key 1
  "PASTE_YOUR_SECOND_KEY_HERE",                               // Key 2
  "PASTE_YOUR_THIRD_KEY_HERE"                                 // Key 3 (Optional)
];

// Helper to pick a random key for every request
const getClient = () => {
  // Filter out placeholders if the user hasn't replaced them yet
  const validKeys = API_KEYS.filter(k => k && !k.includes("PASTE_YOUR"));
  const activeKey = validKeys.length > 0 
    ? validKeys[Math.floor(Math.random() * validKeys.length)] 
    : API_KEYS[0];
    
  return new GoogleGenAI({ apiKey: activeKey });
};

const INDICES_CACHE_KEY = 'algoTradePro_indices_cache';
const INDICES_CACHE_DURATION = 60 * 60 * 1000;

// ✅ HELPER: Bulletproof Text Extractor
const extractText = (response: any): string => {
  if (typeof response.text === 'function') {
    return response.text();
  } else if (typeof response.text === 'string') {
    return response.text;
  } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
    return response.candidates[0].content.parts[0].text;
  }
  return "";
};

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

// ✅ 2. PREDICTION (Using gemini-2.0-flash-exp)
export const getGeminiPrediction = async (
  symbol: string, 
  currentPrice: number, 
  analysis: AnalysisResult,
  historyString: string 
): Promise<AIPrediction> => {
  
  // 🔄 ROTATE KEY
  const genAI = getClient(); 

  const prompt = `
    Act as a professional algorithmic trader. Analyze ${symbol}.
    Current Price: ${currentPrice}
    Trend Condition: ${analysis.market_condition}
    Primary Signal: ${analysis.primary_recommendation.signal}
    Technical Indicators: RSI ${analysis.technicals.rsi.toFixed(2)}, ADX ${analysis.technicals.adx.toFixed(2)}

    Recent Price History (OHLCV):
    ${historyString}

    Task:
    Predict the price direction for the next 5-10 trading days.
    
    Return ONLY a JSON object with this exact structure (no markdown):
    {
      "predictedPrice": number,
      "signal": "BUY" | "SELL" | "HOLD",
      "confidence": number (0-100),
      "reasoning": "string (max 2 sentences)",
      "support": number,
      "resistance": number
    }
  `;

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview", // ✅ Powerful Model
      contents: prompt
    });

    let jsonText = extractText(response);
    if (!jsonText) throw new Error("No text response from AI");

    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonText);

    return {
      symbol,
      currentPrice,
      predictedPrice: data.predictedPrice,
      timeframe: '1-2 Weeks',
      confidence: data.confidence,
      signal: data.signal,
      reasoning: data.reasoning,
      keyLevels: {
        support: data.support,
        resistance: data.resistance
      }
    };
  } catch (error) {
    console.error("Gemini Prediction Error:", error);
    throw new Error("AI Prediction Failed.");
  }
};

// ✅ 3. STOCK ANALYSIS
export const analyzeStockTicker = async (ticker: string): Promise<AnalysisResult> => {
  
  // 🔄 ROTATE KEY
  const genAI = getClient();

  const systemInstruction = `
    You are an expert swing trading assistant.
    Analyze technical indicators for ${ticker}.
    Evaluate swing-trading strategies.
    Return a STRICT JSON object matching the AnalysisResult interface.
  `;

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview", // ✅ Powerful Model
      contents: `
        Analyze ${ticker} (Daily Timeframe).
        Find EMA (9,20,50,200), RSI, MACD, Bollinger Bands.
        Evaluate 11 Strategies.
        Return JSON.
      `,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: systemInstruction,
      },
    });

    let jsonText = extractText(response);
    if (!jsonText) throw new Error("No data returned");

    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIndex = jsonText.indexOf('{');
    const endIndex = jsonText.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      jsonText = jsonText.substring(startIndex, endIndex + 1);
    }

    return JSON.parse(jsonText) as AnalysisResult;

  } catch (error: any) {
    console.error("Analysis Error:", error);
    throw error;
  }
};

// ✅ 4. NEWS ANALYSIS
export const analyzeStockNews = async (query: string): Promise<NewsAnalysisResult> => {
  
  // 🔄 ROTATE KEY
  const genAI = getClient();

  const systemPrompt = `
    You are a professional financial news analyst for the Indian Stock Market.
    
    Your task:
    1. Search for the latest, most relevant news related to the user's query (stock symbol or event).
    2. Analyze the sentiment (Bullish/Bearish) and importance of each news item.
    3. Predict the likely short-term price impact.
    4. Provide context on how this news affects the broader sector.

    OUTPUT FORMAT:
    Return a STRICT JSON object. Do not include markdown formatting (like \`\`\`json).
    {
      "symbol": string,
      "overall_sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
      "sentiment_score": number, // 0 (Extreme Bearish) to 100 (Extreme Bullish)
      "impact_summary": string, // 2-3 sentences summarizing the net impact
      "sector_context": string, // 1-2 sentences on sector effect
      "price_prediction": {
        "short_term_outlook": string, // e.g., "Likely to rise by 2-3% this week"
        "key_drivers": string[], // List of 3 specific key factors
        "risk_factors": string[] // List of 3 specific risks
      },
      "news_items": [
        {
          "title": string,
          "source": string,
          "published": string,
          "summary": string,
          "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
          "url": string,
          "relevance_score": number,
          "source_reliability": "High" | "Medium" | "Low"
        }
      ]
    }
  `;

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash", // ✅ Powerful Model
      contents: `Find and analyze the latest news for: "${query}". Focus on Indian Market impact.`,
      config: { 
        tools: [{ googleSearch: {} }], 
        systemInstruction: systemPrompt 
      },
    });

    let jsonText = extractText(response);
    if (!jsonText) throw new Error("No news returned");

    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIndex = jsonText.indexOf('{');
    const endIndex = jsonText.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      jsonText = jsonText.substring(startIndex, endIndex + 1);
    }

    return JSON.parse(jsonText) as NewsAnalysisResult;
  } catch (error) {
    console.error("News Error:", error);
    throw new Error("Failed to analyze news.");
  }
};

// ✅ 5. MARKET INDICES
export const fetchMarketIndices = async (): Promise<MarketIndices> => {
  try {
    const cached = localStorage.getItem(INDICES_CACHE_KEY);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < INDICES_CACHE_DURATION) return data;
    }
  } catch (e) { console.warn("Cache error", e); }

  const defaults = {
    nifty: { price: 22450.30, changePercent: 0.45 },
    sensex: { price: 73980.15, changePercent: -0.12 },
    bankNifty: { price: 47850.00, changePercent: 1.20 }
  };

  // 🔄 ROTATE KEY
  const genAI = getClient();

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview", // ✅ Powerful Model
      contents: "Return JSON: { nifty: {price, changePercent}, sensex: {price, changePercent}, bankNifty: {price, changePercent} } for latest live Indian market values.",
      config: { tools: [{ googleSearch: {} }] },
    });

    let jsonText = extractText(response);
    if (!jsonText) return defaults;
    
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIndex = jsonText.indexOf('{');
    const endIndex = jsonText.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
        jsonText = jsonText.substring(startIndex, endIndex + 1);
    }

    const data = JSON.parse(jsonText) as MarketIndices;
    localStorage.setItem(INDICES_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    return data;
  } catch (error) {
    return defaults;
  }
};