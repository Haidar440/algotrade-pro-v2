import { BacktestResult, BacktestTrade, EquityCurvePoint, BrokerState } from '../types';
import { AngelOne } from './angel';
import { TechnicalAnalysisEngine } from './technicalAnalysis';

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const runStrategyBacktest = async (
  symbol: string, 
  strategyName: string,
  brokerState: BrokerState,
  initialCapital: number = 100000
): Promise<BacktestResult> => {
  
  if (!brokerState.angel) {
      throw new Error("Angel One connection required for Backtesting.");
  }

  // 1. Fetch REAL Historical Data via Angel
  const angel = new AngelOne(brokerState.angel);
  const rawData = await angel.getHistoricalData(symbol.replace('.NS', ''), "ONE_DAY", 300);

  if (!rawData || rawData.length < 60) {
      throw new Error(`Insufficient historical data for ${symbol}. Needed 60+, got ${rawData?.length}.`);
  }

  const candles: Candle[] = rawData.map(d => ({
      date: d.date,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume) || 0
  })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const trades: BacktestTrade[] = [];
  let equity = initialCapital;
  let cash = initialCapital; // Track cash separately
  const equityCurve: EquityCurvePoint[] = [];
  
  let position: { entryPrice: number; quantity: number; entryDate: string; stopLoss: number; target: number } | null = null;

  // 2. Iterate Day-by-Day
  for (let i = 60; i < candles.length; i++) {
    const candle = candles[i];
    const marketSnapshot = candles.slice(0, i + 1);
    const analysis = TechnicalAnalysisEngine.analyze(symbol, marketSnapshot);
    
    // Strategy Logic
    const strategies = analysis.strategies_evaluated;
    const strategyResult = strategies.find(s => s.strategy_name === strategyName);
    const signal = strategyResult?.signal || 'NO-TRADE';
    const stopLoss = strategyResult?.stop_loss || candle.close * 0.95;
    const target = strategyResult?.target_prices?.[0] || candle.close * 1.1;

    // --- EXECUTION LOGIC ---

    // 1. Check Exit
    if (position) {
       const hitSL = candle.low <= position.stopLoss;
       const hitTarget = candle.high >= position.target;
       
       if (hitSL || hitTarget) {
          const exitPrice = hitSL ? position.stopLoss : position.target;
          
          // ✅ FIX: Revenue is the full amount we get back
          const revenue = position.quantity * exitPrice;
          cash += revenue; // Add cash back to wallet
          
          const pnl = revenue - (position.quantity * position.entryPrice);

          trades.push({
            id: `tr_${i}`,
            type: 'BUY',
            entryDate: position.entryDate,
            exitDate: candle.date,
            entryPrice: position.entryPrice,
            exitPrice: exitPrice,
            quantity: position.quantity,
            pnl: pnl,
            roi: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
            holdingPeriod: 1
          });
          position = null;
       }
    }

    // 2. Check Entry
    if (!position && signal === 'BUY') {
       // Risk Management: Risk 2% of current equity
       const currentEquity = cash + (position ? 0 : 0); 
       const riskAmount = currentEquity * 0.02; 
       const riskPerShare = candle.close - stopLoss;
       
       let quantity = Math.floor(riskAmount / riskPerShare);
       
       // Sanity check: Don't buy if risk is weird, but ensure min size
       if (quantity <= 0 || isNaN(quantity)) quantity = Math.floor((currentEquity * 0.1) / candle.close); // 10% of capital fallback
       
       // Cap quantity to available cash
       const maxQty = Math.floor(cash / candle.close);
       if (quantity > maxQty) quantity = maxQty;

       if (quantity > 0) {
           const cost = quantity * candle.close;
           cash -= cost; // Deduct cash
           position = { 
               entryPrice: candle.close, 
               quantity, 
               entryDate: candle.date,
               stopLoss: stopLoss,
               target: target
           };
       }
    }

    // 3. Update Equity Curve (Cash + Value of open holdings)
    const openPositionValue = position ? (position.quantity * candle.close) : 0;
    equity = cash + openPositionValue;
    equityCurve.push({ date: candle.date, equity: equity });
  }

  // --- METRICS ---
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  
  const grossProfit = wins.reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
  const netProfit = grossProfit - grossLoss;

  let maxEquity = 0;
  let drawdown = 0;
  let maxDrawdown = 0;
  
  equityCurve.forEach(p => {
    if (p.equity > maxEquity) maxEquity = p.equity;
    drawdown = (maxEquity - p.equity) / maxEquity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

  return {
    symbol,
    strategy: strategyName,
    trades: trades.reverse(),
    equityCurve,
    metrics: {
      totalTrades,
      winRate,
      profitFactor,
      netProfit,
      maxDrawdown: maxDrawdown * 100,
      avgWin,
      avgLoss,
      expectancy: (winRate/100 * avgWin) - ((1 - winRate/100) * avgLoss)
    }
  };
};