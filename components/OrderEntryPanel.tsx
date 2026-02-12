import React, { useState, useEffect } from 'react';
import { AngelOne } from '../services/angel';
import { CheckCircle2, AlertTriangle, Loader2, X, AlertOctagon } from 'lucide-react';

interface Props {
  symbol: string;
  token: string;
  ltp: number;
  onClose: () => void;
}

const OrderEntryPanel: React.FC<Props> = ({ symbol, token, ltp, onClose }) => {
  const [transactionType, setTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [productType, setProductType] = useState<'INTRADAY' | 'DELIVERY'>('INTRADAY');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(ltp.toString());
  
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [msg, setMsg] = useState('');
  
  // ✅ New Validation States
  const [validationError, setValidationError] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  // Update Limit Price when LTP changes (only if Market Order)
  useEffect(() => {
    if (orderType === 'MARKET') {
        setPrice(ltp.toFixed(2));
    }
  }, [ltp, orderType]);

  // ✅ CONSTANT VALIDATION LOGIC
  useEffect(() => {
    validateInputs();
  }, [quantity, price, orderType, transactionType, ltp]);

  const validateInputs = () => {
      setValidationError(null);
      setWarningMsg(null);

      // 1. Quantity Check
      if (quantity < 1) return setValidationError("Qty must be > 0");
      if (quantity > 5000) return setValidationError("Max Qty is 5000 per order");

      // 2. Limit Price Checks
      if (orderType === 'LIMIT') {
          const p = parseFloat(price);
          
          if (isNaN(p) || p <= 0) return setValidationError("Invalid Price");
          
          // Tick Size (0.05)
          // We use a small epsilon for float comparison logic
          const remainder = (p * 100) % 5;
          if (remainder > 0.1 && remainder < 4.9) { 
              return setValidationError("Price must be multiple of 0.05"); 
          }

          // 3. Fat Finger Warning (> 5% Deviation)
          const diffPercent = Math.abs((p - ltp) / ltp) * 100;
          if (diffPercent > 5) {
              setWarningMsg(`⚠️ Price is ${diffPercent.toFixed(1)}% away from LTP`);
          }
      }
  };

  const handleExecute = async () => {
    if (validationError) return; // Stop if invalid

    setStatus('PROCESSING');
    try {
        const savedState = localStorage.getItem('algoTradePro_brokerState');
        const brokerState = savedState ? JSON.parse(savedState) : {};
        
        if (!brokerState.angel?.jwtToken) throw new Error("Please Login to Angel One");

        const angel = new AngelOne(brokerState.angel);

        const res = await angel.placeOrder({
            variety: "NORMAL",
            tradingsymbol: symbol,
            symboltoken: token,
            transactiontype: transactionType,
            exchange: "NSE",
            ordertype: orderType,
            producttype: productType === 'INTRADAY' ? 'INTRADAY' : 'DELIVERY',
            duration: "DAY",
            price: orderType === 'LIMIT' ? parseFloat(price) : 0,
            quantity: quantity
        });

        if (res.status) {
            setStatus('SUCCESS');
            setMsg(`Order Placed: ${res.orderid}`);
            setTimeout(() => { setStatus('IDLE'); setMsg(''); onClose(); }, 2000); // Close after success
        } else {
            throw new Error(res.message);
        }

    } catch (e: any) {
        setStatus('ERROR');
        const errorMsg = e.message || "Order Failed";
        
        // Handle blocked scrips gracefully
        if (errorMsg.includes("cautionary listings") || errorMsg.includes("GSM") || errorMsg.includes("ASM")) {
             setMsg("⚠️ Blocked: Stock is under ASM/GSM Surveillance.");
        } else {
             setMsg(errorMsg);
        }
    }
  };

  return (
    <div className="absolute top-16 right-4 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-right-5">
      
      {/* Header */}
      <div className={`p-3 flex justify-between items-center border-b border-slate-700 ${transactionType === 'BUY' ? 'bg-emerald-600/20' : 'bg-rose-600/20'}`}>
        <div className="flex gap-2 bg-slate-900 rounded-lg p-0.5 border border-slate-700">
            <button 
                onClick={() => setTransactionType('BUY')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${transactionType === 'BUY' ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                BUY
            </button>
            <button 
                onClick={() => setTransactionType('SELL')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${transactionType === 'SELL' ? 'bg-rose-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                SELL
            </button>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        
        {/* Product & Type */}
        <div className="flex gap-2">
             <select 
                value={productType} onChange={e => setProductType(e.target.value as any)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded text-xs text-white p-2 outline-none focus:border-blue-500"
             >
                <option value="INTRADAY">MIS (Intraday)</option>
                <option value="DELIVERY">CNC (Delivery)</option>
             </select>
             <select 
                value={orderType} onChange={e => setOrderType(e.target.value as any)}
                className="w-20 bg-slate-800 border border-slate-700 rounded text-xs text-white p-2 outline-none focus:border-blue-500"
             >
                <option value="MARKET">MKT</option>
                <option value="LIMIT">LMT</option>
             </select>
        </div>

        {/* Quantity & Price */}
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Qty</label>
                <input 
                    type="number" min="1" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                    className={`w-full bg-slate-800 border rounded p-2 text-sm font-bold text-white outline-none focus:border-blue-500 ${validationError?.includes("Qty") ? 'border-rose-500' : 'border-slate-700'}`}
                />
            </div>
            <div>
                <label className="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Price</label>
                <input 
                    type="number" step="0.05" value={price} onChange={e => setPrice(e.target.value)} disabled={orderType === 'MARKET'}
                    className={`w-full bg-slate-800 border rounded p-2 text-sm font-bold text-white outline-none focus:border-blue-500 ${validationError?.includes("Price") ? 'border-rose-500' : 'border-slate-700'} ${orderType === 'MARKET' ? 'opacity-50' : ''}`}
                />
            </div>
        </div>

        {/* ✅ Validation / Warning Alerts */}
        {validationError && (
             <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-400 font-bold flex items-center gap-2">
                 <AlertTriangle className="w-3 h-3 shrink-0" /> {validationError}
             </div>
        )}
        
        {!validationError && warningMsg && (
             <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400 font-bold flex items-center gap-2">
                 <AlertOctagon className="w-3 h-3 shrink-0" /> {warningMsg}
             </div>
        )}

        {/* Status Message (API Response) */}
        {msg && (
            <div className={`p-2 rounded text-[10px] font-bold flex items-center gap-1.5 ${status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                {status === 'SUCCESS' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                <span className="truncate">{msg}</span>
            </div>
        )}

        {/* Action Button */}
        <button 
            onClick={handleExecute}
            disabled={status === 'PROCESSING' || !!validationError}
            className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
                status === 'PROCESSING' ? 'bg-slate-700 text-slate-400 cursor-wait' :
                validationError ? 'bg-slate-700 text-slate-500 cursor-not-allowed' :
                transactionType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20' : 
                'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20'
            }`}
        >
            {status === 'PROCESSING' ? <Loader2 className="w-4 h-4 animate-spin" /> : `${transactionType} ${symbol}`}
        </button>

        {/* Margin & LTP Footer */}
        <div className="flex justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800">
             <span>Est. Margin: ₹{((parseFloat(price)||0) * quantity / (productType === 'INTRADAY' ? 5 : 1)).toFixed(0)}</span>
             <span>LTP: {ltp}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderEntryPanel;