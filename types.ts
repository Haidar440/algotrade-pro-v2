// --- DOMAIN ENTITIES ---
export interface Trade {
  _id?: string;        // MongoDB ID (optional because new trades won't have it yet)
  symbol: string;
  entryPrice: number;
  quantity: number;
  type: 'SWING' | 'INTRADAY';
  status: 'OPEN' | 'CLOSED';
  entryDate: string;   // Dates usually come as strings from API
  exitDate?: string;
  exitPrice?: number;
  pnl?: number;
  strategy?: string;
  notes?: string;
}
// Split PORTFOLIO into REAL_PORTFOLIO and PAPER_TRADING
export type View = 
  | 'SCANNER' 
  | 'WATCHLIST' 
  | 'REAL_PORTFOLIO' 
  | 'PAPER_TRADING' 
  | 'AUTO_TRADER'  // ✅ NEW
  | 'BACKTEST' 
  | 'STRATEGIES' 
  | 'PYTHON_LAB' 
  | 'NEWS';
export interface Stock {
  symbol: string;
  name: string;
  sector: string;
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// --- ANALYSIS ENGINE TYPES (Updated for New Engine) ---

export interface StrategyEvaluation {
  strategy_name: string;
  is_valid: boolean;
  signal: 'BUY' | 'SELL' | 'NO-TRADE';
  ideal_entry_range: number[]; // Changed from tuple to array for flexibility
  stop_loss: number;
  target_prices: number[];
  risk_reward_ratio: number;
  quality_score: number;
  confidence: number;
  notes: string;
}

export interface Technicals {
  rsi: number;
  adx: number;
  macd: 'BULLISH' | 'BEARISH'; // Simplified to match Engine
  ema_20: number;
  ema_50: number;
  ema_200: number;
  support: number;
  resistance: number;
  volume_status: 'HIGH' | 'AVERAGE';
  atr14: number; // ✅ REQUIRED for Position Sizing
}

export interface PrimaryRecommendation {
  strategy_name: string;
  signal: 'BUY' | 'SELL' | 'NO-TRADE' | 'STRONG BUY';
  ideal_entry_range: number[];
  stop_loss: number;
  target_prices: number[];
  risk_reward_ratio: number;
  confidence: number;
  reason: string;
}

export interface AnalysisResult {
  symbol: string;
  timeframe: string;
  market_condition: 'UPTREND' | 'DOWNTREND' | 'RANGE-BOUND';
  current_price: number;
  previous_close: number; // ✅ NEW FIELD
  data_timestamp: string;
  technicals: Technicals;
  strategies_evaluated: StrategyEvaluation[];
  primary_recommendation: PrimaryRecommendation;
  disclaimer: string;
  groundingUrls?: string[];
}
export interface AngelCredentials {
  clientCode: string;   // ✅ Required
  jwtToken: string;
  refreshToken: string; // ✅ Required
  feedToken: string;    // ✅ Required
  apiKey: string;
  pin?: string;
  totp?: string;
}

export interface ZerodhaCredentials {
  apiKey: string;
  accessToken: string;
}

export interface DhanCredentials {
  clientId: string;
  accessToken: string;
}

export interface BrokerState {
  zerodha?: ZerodhaCredentials;
  angel?: AngelCredentials;
  dhan?: DhanCredentials;
}

// --- UI & FEED TYPES ---

export interface LoadingStep {
  id: number;
  text: string;
  status: 'pending' | 'loading' | 'complete' | 'error';
}

export interface SignalFeedItem {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  signal: 'STRONG BUY' | 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  strategy: string;
  entry: number;
  stopLoss: number;
  target: number;
  timeframe: string;
  sector: string;
  timestamp: string;
}

export interface MarketIndex {
  price: number;
  changePercent: number;
}

export interface MarketIndices {
  nifty: MarketIndex;
  sensex: MarketIndex;
  bankNifty: MarketIndex;
}

// --- TRADING & PORTFOLIO TYPES ---

export interface PaperTrade {
  id: string;
  symbol: string;
  strategyName: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  quantity: number;
  status: 'OPEN' | 'CLOSED';
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  pnl?: number;
}

// --- ANGEL ONE API TYPES ---

export interface AngelOrderParams {
  variety: 'NORMAL' | 'STOPLOSS' | 'AMO' | 'ROBO';
  tradingsymbol: string;
  symboltoken: string;
  transactiontype: 'BUY' | 'SELL';
  exchange: 'NSE' | 'BSE' | 'NFO'; // Added NFO
  ordertype: 'MARKET' | 'LIMIT' | 'STOPLOSS_LIMIT' | 'STOPLOSS_MARKET';
  producttype: 'INTRADAY' | 'CARRYFORWARD' | 'DELIVERY' | 'MARGIN' | 'BO';
  duration: 'DAY' | 'IOC';
  price: string;
  quantity: string;
  
  // SmartAPI Specific Fields
  triggerprice?: string; // Required for STOPLOSS
  squareoff?: string;    // Required for ROBO (Target)
  stoploss?: string;     // Required for ROBO (SL)
  trailingStopLoss?: string; // Optional for ROBO
  
  orderid?: string;      // Required for Modify/Cancel
}

export interface ModifyOrderParams {
  variety: 'NORMAL' | 'STOPLOSS' | 'AMO' | 'ROBO';
  orderid: string;
  ordertype: string;
  producttype: string;
  duration: string;
  price: string;
  quantity: string;
  tradingsymbol: string;
  symboltoken: string;
  exchange: string;
  triggerprice?: string; // Crucial for Trailing SL
}

export interface AngelOrder {
  orderid: string;
  uniqueorderid?: string;
  tradingsymbol: string;
  symboltoken: string;
  transactiontype: string;
  ordertype: string;
  quantity: number;
  price: number;
  status: string; // 'complete', 'rejected', 'open'
  text?: string;
  updatetime: string;
  filledshares?: number;
  unfilledshares?: number;
}

export interface AngelPosition {
  symboltoken: string;
  tradingsymbol: string;
  producttype: string;
  netqty: string;
  buyavgprice: string;
  sellavgprice: string;
  ltp: string;
  pnl: string;
  cfbuyqty?: string;
  cfsellqty?: string;
  buyqty?: string;
  sellqty?: string;
}

export interface AngelHolding {
  symboltoken: string;
  tradingsymbol: string;
  quantity: number; // Normalized to number for UI
  averageprice: number;
  ltp: number;
  pnl: number;
  product?: string;
  profitandloss?: string; // Legacy support
  pnlpercentage?: string; // Legacy support
}

export interface AngelFundDetails {
  net: string;
  availablecash: string;
  utilisedamount: string;
}

// --- NEWS INTELLIGENCE ---

export interface NewsItem {
  title: string;
  source: string;
  published: string;
  summary: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  url: string;
  relevance_score: number;
  source_reliability: 'High' | 'Medium' | 'Low';
}

export interface NewsAnalysisResult {
  symbol: string;
  overall_sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentiment_score: number;
  impact_summary: string;
  sector_context: string;
  price_prediction: {
    short_term_outlook: string;
    key_drivers: string[];
    risk_factors: string[];
  };
  news_items: NewsItem[];
}

// --- BACKTESTING TYPES ---

export interface BacktestTrade {
  id: string;
  entryDate: string;
  exitDate: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  roi: number;
  holdingPeriod: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
}

export interface EquityCurvePoint {
  date: string;
  equity: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: EquityCurvePoint[];
}