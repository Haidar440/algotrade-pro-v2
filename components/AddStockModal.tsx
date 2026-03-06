import React, { useState, useEffect } from 'react';
import { Search, X, Plus, Loader2 } from 'lucide-react';
import { DB_SERVICE } from '../services/db';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (stock: any) => void;
}

const AddStockModal: React.FC<AddStockModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingToken, setAddingToken] = useState<string | null>(null);

  useEffect(() => {
    const searchStocks = async () => {
      if (query.length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const data: any = await DB_SERVICE.searchStocks(query);
        setResults(Array.isArray(data) ? data : []);
      } catch (e) { setResults([]); }
      finally { setLoading(false); }
    };

    const timeoutId = setTimeout(searchStocks, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) { setQuery(''); setResults([]); setAddingToken(null); }
  }, [isOpen]);

  const handleAdd = async (stock: any) => {
    setAddingToken(stock.token);
    try {
      // Fetch live price BEFORE adding to watchlist
      const quotes: any = await DB_SERVICE.getQuotes([stock.symbol]);
      const q = quotes?.[stock.symbol];
      const price = q?.price || 0;
      const changePercent = q?.changePercent || 0;

      onAdd({
        id: Math.random().toString(36).substr(2, 9),
        symbol: stock.symbol,
        name: stock.name || stock.symbol,
        token: stock.token,
        price,
        changePercent,
        strategy: 'Equity'
      });
    } catch (e) {
      // If price fetch fails, still add with 0
      onAdd({
        id: Math.random().toString(36).substr(2, 9),
        symbol: stock.symbol,
        name: stock.name || stock.symbol,
        token: stock.token,
        price: 0,
        changePercent: 0,
        strategy: 'Equity'
      });
    } finally {
      setAddingToken(null);
    }
  };

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
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="py-10 text-center text-slate-500 text-sm">No instruments found for "{query}"</div>
            ) : results.map((stock) => (
              <button 
                key={`${stock.exch_seg || 'NSE'}-${stock.token}`}
                disabled={addingToken === stock.token}
                onClick={() => handleAdd(stock)}
                className={`w-full flex items-center justify-between p-3 rounded-xl hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20 transition-all group ${addingToken === stock.token ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <div className="text-left">
                  <div className="text-white font-bold group-hover:text-blue-400">{stock.symbol.replace(/-EQ$/, '').replace(/-BE$/, '')}</div>
                  <div className="text-[10px] text-slate-500 uppercase">{stock.name || stock.symbol} &middot; {stock.exch_seg || 'NSE'}</div>
                </div>
                {addingToken === stock.token ? (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 text-slate-600 group-hover:text-blue-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddStockModal;