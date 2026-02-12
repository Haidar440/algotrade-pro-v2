
import { SignalFeedItem } from '../types';
import { INDIAN_STOCKS } from './stockData';

const STRATEGIES = [
  'Trend Following',
  'VCP Breakout',
  'RSI Divergence',
  'Golden Cross',
  'Support Bounce'
];

const SECTORS = ['Auto', 'Banking', 'IT', 'Pharma', 'Energy', 'Metals', 'FMCG'];

export const generateMockSignals = (count: number = 10): SignalFeedItem[] => {
  // Shuffle stocks
  const shuffled = [...INDIAN_STOCKS].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, count);

  return selected.map((stock, idx) => {
    const basePrice = Math.random() * 2000 + 100;
    const change = (Math.random() - 0.45) * 3; // Slight positive bias
    const signalType = Math.random() > 0.7 ? 'STRONG BUY' : Math.random() > 0.4 ? 'BUY' : 'SELL';
    
    // Logic for entry/sl/target based on signal
    const entry = basePrice;
    const isBuy = signalType.includes('BUY');
    const stopLoss = isBuy ? basePrice * 0.95 : basePrice * 1.05;
    const target = isBuy ? basePrice * 1.1 : basePrice * 0.9;
    
    return {
      id: `sig_${idx}_${Date.now()}`,
      symbol: stock.symbol.replace('.NS', ''),
      name: stock.name,
      price: basePrice,
      changePercent: change,
      signal: signalType as any,
      confidence: Math.random() * 0.4 + 0.5, // 50-90%
      strategy: STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)],
      entry: entry,
      stopLoss: stopLoss,
      target: target,
      timeframe: Math.random() > 0.6 ? 'Swing' : 'Intraday',
      sector: SECTORS[Math.floor(Math.random() * SECTORS.length)],
      timestamp: new Date().toISOString()
    };
  });
};
