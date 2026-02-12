import React, { useState, useEffect } from 'react';
import { BrokerState } from '../types';
import { AngelOne } from '../services/angel';
import { X, Zap, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  ltp: number;
  brokerState: BrokerState;
}

const TradeModal: React.FC<TradeModalProps> = ({ isOpen, onClose, symbol, ltp, brokerState }) => {
  const [quantity, setQuantity] = useState(1);
  const [transactionType, setTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  
  // ✅ Store price as string to allow typing decimals (e.g. "100.50")
  const [price, setPrice] = useState<string>(ltp.toString());
  
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [message, setMessage] = useState('');

  // ✅ FIX: Only update price when modal OPENS. 
  // We removed 'ltp' from the dependency array so it doesn't overwrite your typing.
  useEffect(() => {
    if (isOpen) {
        setPrice(ltp.toString());
        setStatus('IDLE');
        setMessage('');
    }
  }, [isOpen]); 

  if (!isOpen) return null;

  const handleExecute = async () => {
      if (!brokerState.angel) {
          setMessage("Angel One is not connected.");
          setStatus('ERROR');
          return;
      }

      setStatus('PROCESSING');
      setMessage('Fetching Stock Token...');

      try {
          const angel = new AngelOne(brokerState.angel);
          const token = await angel.searchSymbolToken(symbol);

          if (!token) {
              throw new Error(`Could not find token for ${symbol}`);
          }

          setMessage('Placing Order...');
          
          const finalPrice = parseFloat(price) || 0;

          const orderResponse = await angel.placeOrder({
              variety: "NORMAL",
              tradingsymbol: symbol,
              symboltoken: token,
              transactiontype: transactionType,
              exchange: "NSE",
              ordertype: orderType,
              producttype: "INTRADAY", 
              duration: "DAY",
              price: orderType === 'LIMIT' ? finalPrice : 0,
              quantity: quantity
          });

          if (orderResponse && orderResponse.status && orderResponse.orderid) {
              setStatus('SUCCESS');
              setMessage(`Order Placed! ID: ${orderResponse.orderid}`);
              setTimeout(onClose, 2000); 
          } else {
             throw new Error(orderResponse?.message || "Order Execution Failed");
          }

      } catch (e: any) {
          console.error(e);
          setStatus('ERROR');
          
          // Friendly Error Handling
          const errorMsg = e.message || "Order Failed";
          if (errorMsg.includes("cautionary listings") || errorMsg.includes("GSM") || errorMsg.includes("ASM")) {
             setMessage("⚠️ Trade Blocked: Stock is under Exchange Surveillance (ASM/GSM).");
          } else {
             setMessage(errorMsg);
          }
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 fill-current" /> Execute Trade
            </h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
            
            <div className="flex justify-between items-end">
                <div>
                    <div className="text-xs text-slate-500 font-bold uppercase">Symbol</div>
                    <div className="text-2xl font-black text-white">{symbol}</div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-slate-500 font-bold uppercase">LTP</div>
                    <div className="text-xl font-mono text-emerald-400">₹{ltp.toFixed(2)}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Action</label>
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <button onClick={() => setTransactionType('BUY')} className={`flex-1 py-2 rounded font-bold text-xs transition-all ${transactionType === 'BUY' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>BUY</button>
                        <button onClick={() => setTransactionType('SELL')} className={`flex-1 py-2 rounded font-bold text-xs transition-all ${transactionType === 'SELL' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>SELL</button>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Order Type</label>
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <button onClick={() => setOrderType('MARKET')} className={`flex-1 py-2 rounded font-bold text-xs transition-all ${orderType === 'MARKET' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>MKT</button>
                        <button onClick={() => setOrderType('LIMIT')} className={`flex-1 py-2 rounded font-bold text-xs transition-all ${orderType === 'LIMIT' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>LMT</button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Quantity</label>
                    <input 
                        type="number" 
                        value={quantity} 
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:border-blue-500 outline-none"
                    />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Limit Price</label>
                    <input 
                        type="number" 
                        step="0.05"
                        value={price} 
                        disabled={orderType === 'MARKET'}
                        // ✅ Update state as string to avoid cursor jumping
                        onChange={(e) => setPrice(e.target.value)}
                        className={`w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:border-blue-500 outline-none ${orderType === 'MARKET' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                 </div>
            </div>

            <div className="bg-slate-800/50 p-3 rounded-lg flex justify-between items-center border border-slate-700">
                <span className="text-xs text-slate-400 font-bold uppercase">Estimated Value</span>
                <span className="text-lg font-mono font-bold text-white">
                    ₹{((parseFloat(price) || 0) * quantity).toFixed(2)}
                </span>
            </div>

            {/* Messages */}
            {status === 'ERROR' && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-300 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {message}
                </div>
            )}
            {status === 'SUCCESS' && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> {message}
                </div>
            )}

            {/* Execute Button */}
            <button 
                onClick={handleExecute}
                disabled={status === 'PROCESSING' || status === 'SUCCESS'}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
                    status === 'PROCESSING' ? 'bg-slate-700 text-slate-400 cursor-wait' :
                    transactionType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20' :
                    'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20'
                }`}
            >
                {status === 'PROCESSING' ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : (
                    <>{transactionType} {symbol}</>
                )}
            </button>

        </div>
      </div>
    </div>
  );
};

export default TradeModal;