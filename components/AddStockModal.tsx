import React, { useState, useEffect } from 'react';
import { Search, X, Plus, Loader2 } from 'lucide-react';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (stock: any) => void;
}

const AddStockModal: React.FC<AddStockModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const searchStocks = async () => {
      if (query.length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:5000/api/search?q=${query}`);
        const data = await res.json();
        setResults(data);
      } finally { setLoading(false); }
    };

    const timeoutId = setTimeout(searchStocks, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-400" /> Add to Watchlist
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              autoFocus
              type="text" 
              placeholder="Search symbol (e.g. SBIN, TCS)..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-blue-500 transition-all"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 custom-scrollbar">
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-600" /></div>
            ) : results.map((stock) => (
              <button 
                key={stock.token}
                onClick={() => onAdd({
                    id: Math.random().toString(36).substr(2, 9),
                    symbol: stock.symbol,
                    name: stock.name,
                    token: stock.token, // ✅ CRITICAL FIX: Add this line to save the numeric ID
                    price: 0,
                    changePercent: 0,
                    strategy: 'MANUAL'
                })}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20 transition-all group"
              >
                <div className="text-left">
                  <div className="text-white font-bold group-hover:text-blue-400">{stock.symbol}</div>
                  <div className="text-[10px] text-slate-500 uppercase">{stock.name}</div>
                </div>
                <Plus className="w-4 h-4 text-slate-600 group-hover:text-blue-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddStockModal;