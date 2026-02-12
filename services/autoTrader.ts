import { AngelOne } from './angel';
import { TechnicalAnalysisEngine } from './technicalAnalysis';
import { DB_SERVICE } from './db'; 
import { StockSelector } from './stockSelection';
export interface AutoTraderConfig {
  capital: number;
  riskPerTrade: number;
  maxDailyLoss: number;
  targetMultiplier: number;
  enableTrailingSL: boolean;
  symbols: string[];
  maxOpenPositions: number;
  isPaperTrading?: boolean;
}

interface ActiveTrade {
  symbol: string;
  entryPrice: number;
  currentPrice: number; // ✅ 1. ADD THIS FIELD
  quantity: number;
  stopLoss: number;
  target: number;
  entryOrderId: string;
  slOrderId?: string;
  highestPrice: number;
  status: 'OPEN' | 'EXITING' | 'CLOSED';
  pnl: number;
  dbId?: string;
}

export class AutoTrader {
  private angel: AngelOne;
  public config: AutoTraderConfig;
  public isScanning: boolean = false; 
  private isRunning: boolean = false;
  private activeTrades: Map<string, ActiveTrade> = new Map();
  private dailyLoss: number = 0;
  private tradeHistory: ActiveTrade[] = [];
  private logs: string[] = []; 
  
  private lastAnalysisTime: Map<string, number> = new Map();
  private ANALYSIS_COOLDOWN = 300 * 1000; 

  private onUpdate?: (status: any) => void;
  private onLog?: (msg: string) => void;

  constructor(angel: AngelOne, config: AutoTraderConfig) {
    this.angel = angel;
    this.config = { 
        ...config, 
        maxOpenPositions: config.maxOpenPositions || 3,
        isPaperTrading: config.isPaperTrading ?? true
    };
  }

  public setCallbacks(onUpdate: (status: any) => void, onLog: (msg: string) => void) {
      this.onUpdate = onUpdate;
      this.onLog = onLog;
      this.broadcastStatus(); 
  }

  public getSnapshot() {
      return {
          isRunning: this.isRunning,
          isScanning: this.isScanning, 
          activeTrades: Array.from(this.activeTrades.values()),
          dailyPnL: this.dailyLoss,
          logs: this.logs,
          config: this.config
      };
  }

  public async start() {
    this.isRunning = true;
    const mode = this.config.isPaperTrading ? "📝 PAPER TRADING" : "💸 REAL MONEY";
    this.log(`🚀 Swing-Bot STARTED (${mode})`);
    
    await this.restoreSession();

    this.log(`🎯 Config: Max ${this.config.maxOpenPositions} Positions | Capital ₹${this.config.capital}`);
    this.broadcastStatus();
  }

  public stop() {
    this.isRunning = false;
    this.log("🛑 Swing-Bot STOPPED");
    this.broadcastStatus();
  }

  // ... inside AutoTrader class ...

  // ✅ NEW: Manual Exit Function
  public async manualExit(symbol: string) {
      const trade = this.activeTrades.get(symbol);
      if (trade) {
          this.log(`⚠️ Manual Exit Requested for ${symbol}`);
          // Use current market price for exit
          await this.exitPosition(trade, "MANUAL EXIT", trade.currentPrice);
      } else {
          this.log(`❌ Cannot Exit: No active trade for ${symbol}`);
      }
  }
 // ✅ NEW: Background Scanner
public async runScanner() {
    if (this.isScanning) return;

    this.isScanning = true;
    this.log(`[Scanner] 🚀 Starting Background Scan...`);
    this.broadcastStatus(); // Update UI

    try {
        // Use 'this.angel' which is already connected
        const candidates = await StockSelector.scanUniverse(this.angel, (msg) => {
             this.log(`[Scanner] ${msg}`);
             // We don't broadcast every single log to save performance, 
             // the UI will pick it up via the logs array next update.
        });

        if (candidates.length > 0) {
            const bestPicks = candidates.slice(0, 5).map(c => c.symbol);
            this.config.symbols = bestPicks; // Update Watchlist
            this.log(`[Scanner] ✅ Watchlist Updated: ${bestPicks.join(', ')}`);
        } else {
             this.log(`[Scanner] ⚠️ No valid Swing Candidates found.`);
        }
    } catch (e: any) {
        this.log(`[Scanner] ❌ Error: ${e.message}`);
    } finally {
        this.isScanning = false;
        this.broadcastStatus(); // Final Update
    }
}

 private async restoreSession() {
      this.log("🔄 Restoring Open Swing Trades from Database...");
      const openTrades = await DB_SERVICE.getOpenTrades();
      
      if (openTrades && openTrades.length > 0) {
          openTrades.forEach((t: any) => {
              // ✅ NEW FILTER: Skip Manual Trades
              if (t.strategy === 'MANUAL' || t.notes?.includes('Manual')) {
                  return; // Don't let the Bot manage/display this trade
              }

              // Normal Restoration Logic for Bot Trades
              const sl = t.stopLoss || (t.entryPrice * 0.95);
              const target = t.target || (t.entryPrice * 1.10);

              const trade: ActiveTrade = {
                  symbol: t.symbol,
                  entryPrice: t.entryPrice,
                  currentPrice: t.entryPrice, 
                  quantity: t.quantity,
                  stopLoss: sl,
                  target: target,
                  entryOrderId: "RESTORED",
                  slOrderId: "RESTORED", 
                  highestPrice: t.entryPrice, 
                  status: 'OPEN',
                  pnl: 0, 
                  dbId: t._id
              };
              this.activeTrades.set(t.symbol, trade);
              this.log(`📥 Restored Bot Trade: ${t.symbol} @ ${t.entryPrice}`);
          });
      } else {
          this.log("ℹ️ No Open Bot Trades found to restore.");
      }
  }


  public updateConfig(newConfig: AutoTraderConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log("⚙️ Config Updated");
    this.broadcastStatus();
  }

  public async processTick(symbol: string, ltp: number) {
    if (!this.isRunning) return;

    if (this.dailyLoss <= -this.config.maxDailyLoss) {
      this.log(`⛔ Max Loss Hit (₹${this.dailyLoss}). Stopping.`);
      this.stop();
      return;
    }

    if (this.activeTrades.has(symbol)) {
      await this.managePosition(symbol, ltp);
      return;
    }

    if (this.activeTrades.size >= this.config.maxOpenPositions) return; 

    if (this.config.symbols.includes(symbol)) {
       const lastRun = this.lastAnalysisTime.get(symbol) || 0;
       const now = Date.now();
       
       if (now - lastRun > this.ANALYSIS_COOLDOWN) {
          this.lastAnalysisTime.set(symbol, now);
          this.log(`🔍 Scanning ${symbol}...`); 
          
          try {
             const history = await this.angel.getHistoricalData(symbol.replace('.NS', ''), "ONE_DAY", 100);
             if (history && history.length > 50) {
                 await this.evaluateEntry(symbol, ltp, history);
             }
          } catch(e) {}
       }
    }
  }

  private async evaluateEntry(symbol: string, ltp: number, candles: any[]) {
    try {
      const analysis = TechnicalAnalysisEngine.analyze(symbol, candles);
      const rec = analysis.primary_recommendation;

      if (rec.signal !== 'STRONG BUY' && rec.signal !== 'BUY') return;
      if (rec.confidence < 0.80) return;

      const sl = rec.stop_loss;
      if (!sl || sl >= ltp) return; 

      const riskPerShare = ltp - sl;
      const riskAmount = this.config.capital * (this.config.riskPerTrade / 100);
      let quantity = Math.floor(riskAmount / riskPerShare);

      const maxQty = Math.floor((this.config.capital * 0.25) / ltp);
      quantity = Math.min(quantity, maxQty);

      if (quantity < 1) return;

      this.log(`⚡ Swing Signal: ${symbol} @ ${ltp}. Buy ${quantity} Qty`);
      await this.executeEntry(symbol, ltp, sl, quantity, rec.strategy_name);

    } catch (e) { console.error(e); }
  }

  private async executeEntry(symbol: string, price: number, sl: number, qty: number, strategy: string) {
    try {
      if (this.config.isPaperTrading) {
          this.log(`📝 [PAPER] Simulating BUY: ${symbol} @ ₹${price}`);
          
          let dbId = undefined;
          try {
             const dbTrade = {
                symbol, entryPrice: price, quantity: qty,
                type: 'PAPER', 
                status: 'OPEN', strategy, entryDate: new Date(),
                notes: `Paper Trade | Target: ${(price * 1.1).toFixed(1)}`
             };
             const saved = await DB_SERVICE.saveTrade(dbTrade);
             if (saved) dbId = saved._id;
          } catch(e) {}

          const target = price + (price - sl) * this.config.targetMultiplier;
          const newTrade: ActiveTrade = {
             symbol, entryPrice: price, currentPrice: price, // ✅ 2. Initialize with Price
             quantity: qty, stopLoss: sl, target,
             entryOrderId: `SIM_${Date.now()}`, slOrderId: `SIM_SL_${Date.now()}`,
             highestPrice: price, status: 'OPEN', pnl: 0, dbId
          };
          
          this.activeTrades.set(symbol, newTrade);
          this.broadcastStatus();
          return;
      }

      const token = await this.angel.searchSymbolToken(symbol);
      const entryRes = await this.angel.placeOrder({
        variety: 'NORMAL', tradingsymbol: `${symbol}-EQ`, symboltoken: token,
        transactiontype: 'BUY', exchange: 'NSE', ordertype: 'MARKET',
        producttype: 'DELIVERY', duration: 'DAY', price: '0', quantity: qty.toString()
      });

      if (entryRes.status && entryRes.orderid) {
        this.log(`✅ BUY Success: ${symbol}`);
        
        let dbId = undefined;
        try {
            const dbTrade = {
                symbol, entryPrice: price, quantity: qty, type: 'SWING',
                status: 'OPEN', strategy, entryDate: new Date(),
                notes: `Bot Entry | Target: ${(price * 1.1).toFixed(1)}`
            };
            const saved = await DB_SERVICE.saveTrade(dbTrade);
            if(saved) dbId = saved._id;
        } catch(e) {}

        const slRes = await this.angel.placeOrder({
          variety: 'STOPLOSS', tradingsymbol: `${symbol}-EQ`, symboltoken: token,
          transactiontype: 'SELL', exchange: 'NSE', ordertype: 'STOPLOSS_LIMIT',
          producttype: 'DELIVERY', duration: 'DAY', price: (sl - 0.5).toString(),
          triggerprice: sl.toString(), quantity: qty.toString()
        });

        const target = price + (price - sl) * this.config.targetMultiplier;
        const newTrade: ActiveTrade = {
          symbol, entryPrice: price, currentPrice: price, // ✅ 2. Initialize with Price
          quantity: qty, stopLoss: sl, target,
          entryOrderId: entryRes.orderid!, slOrderId: slRes.orderid,
          highestPrice: price, status: 'OPEN', pnl: 0, dbId
        };

        this.activeTrades.set(symbol, newTrade);
        this.broadcastStatus();
      }
    } catch (e: any) { this.log(`❌ Execution Error: ${e.message}`); }
  }

  private async managePosition(symbol: string, ltp: number) {
    const trade = this.activeTrades.get(symbol);
    if (!trade || trade.status !== 'OPEN') return;

    // ✅ 3. CRITICAL: Store the new price here!
    trade.currentPrice = ltp; 
    trade.pnl = (ltp - trade.entryPrice) * trade.quantity;
    
    if (this.config.enableTrailingSL) {
       if (ltp > trade.highestPrice) {
         trade.highestPrice = ltp;
         await this.checkTrailingSL(trade, ltp);
       }
    }

    if (ltp >= trade.target) {
      this.log(`🎯 Target Hit: ${symbol} @ ${ltp}`);
      await this.exitPosition(trade, "TARGET", ltp);
    } else if (ltp <= trade.stopLoss) {
        this.log(`🛑 SL Triggered: ${symbol}`);
        await this.exitPosition(trade, "SL HIT", ltp);
    }
    
    this.broadcastStatus();
  }

  private async checkTrailingSL(trade: ActiveTrade, ltp: number) {
    const initialRisk = trade.entryPrice - trade.stopLoss;
    const newStopLoss = trade.highestPrice - initialRisk; 
    const threshold = trade.entryPrice * 0.02; 

    if (newStopLoss > (trade.stopLoss + threshold)) {
       this.log(`🔄 Trailing SL: ${trade.symbol} -> ${newStopLoss.toFixed(2)}`);
       trade.stopLoss = newStopLoss;

       if (!this.config.isPaperTrading && trade.slOrderId) {
           await this.angel.modifyOrder({
             variety: 'STOPLOSS', orderid: trade.slOrderId,
             ordertype: 'STOPLOSS_LIMIT', producttype: 'DELIVERY', duration: 'DAY',
             price: (newStopLoss - 0.5).toFixed(1), triggerprice: newStopLoss.toFixed(1),
             quantity: trade.quantity.toString(), tradingsymbol: `${trade.symbol}-EQ`,
             symboltoken: await this.angel.searchSymbolToken(trade.symbol), exchange: 'NSE'
           });
       }
    }
  }

  private async exitPosition(trade: ActiveTrade, reason: string, exitPrice: number) {
    trade.status = 'EXITING';
    
    if (this.config.isPaperTrading) {
        this.log(`📝 [PAPER] Simulating SELL: ${trade.symbol} @ ₹${exitPrice}`);
        this.finalizeExit(trade, reason, exitPrice);
        return;
    }

    try {
      const token = await this.angel.searchSymbolToken(trade.symbol);
      if (trade.slOrderId) await this.angel.cancelOrder(trade.slOrderId, 'STOPLOSS');

      await this.angel.placeOrder({
        variety: 'NORMAL', tradingsymbol: `${trade.symbol}-EQ`, symboltoken: token,
        transactiontype: 'SELL', exchange: 'NSE', ordertype: 'MARKET',
        producttype: 'DELIVERY', duration: 'DAY', price: '0', quantity: trade.quantity.toString()
      });

      this.finalizeExit(trade, reason, exitPrice);

    } catch (e: any) {
      this.log(`❌ Exit Failed: ${e.message}`);
      trade.status = 'OPEN';
    }
  }

  private async finalizeExit(trade: ActiveTrade, reason: string, exitPrice: number) {
      this.log(`🔒 Closed (${reason}) PnL: ₹${trade.pnl.toFixed(2)}`);
      
      if (trade.dbId) {
          try {
            await DB_SERVICE.updateTrade(trade.dbId, {
                status: 'CLOSED', exitDate: new Date(),
                exitPrice: exitPrice, pnl: trade.pnl,
                notes: `Closed by Bot: ${reason}`
            });
          } catch(e) {}
      }

      this.dailyLoss += trade.pnl;
      this.activeTrades.delete(trade.symbol);
      this.tradeHistory.push({ ...trade, status: 'CLOSED' });
      this.broadcastStatus();
  }

  private log(msg: string) {
    const time = new Date().toLocaleTimeString();
    const logEntry = `[AutoTrader ${time}] ${msg}`;
    console.log(logEntry);
    this.logs.push(logEntry); 
    if (this.logs.length > 50) this.logs.shift(); 
    if (this.onLog) this.onLog(logEntry);
  }

  private broadcastStatus() {
    if (this.onUpdate) {
        this.onUpdate({
            isRunning: this.isRunning,
            isScanning: this.isScanning,
            activeTrades: Array.from(this.activeTrades.values()),
            dailyPnL: this.dailyLoss, 
            history: this.tradeHistory
        });
    }
  }
  
}