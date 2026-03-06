import { Trade } from '../types';
import { api, secureGet, securePost, securePut, secureDelete } from './api';

export const DB_SERVICE = {

  // 1. Save a Trade (maps camelCase frontend fields → snake_case backend)
  saveTrade: async (trade: any) => {
    try {
      const payload = {
        symbol: trade.symbol,
        entry_price: trade.entryPrice ?? trade.entry_price,
        quantity: trade.quantity,
        type: trade.type || 'SWING',
        entry_date: trade.entryDate ?? trade.entry_date ?? new Date().toISOString(),
        strategy: trade.strategy || null,
        notes: trade.notes || null,
        source: trade.source || (trade.type === 'PAPER' ? 'PAPER' : 'MANUAL'),
      };
      return await securePost('/trades', payload);
    } catch (error) {
      console.error("❌ Failed to save trade:", error);
    }
  },

  // 2. Get History (maps snake_case backend → camelCase frontend)
  getTrades: async () => {
    try {
      const raw = await secureGet('/trades');
      if (!Array.isArray(raw)) return [];
      return raw.map((t: any) => ({
        id: t.id,
        _id: String(t.id),
        symbol: t.symbol,
        entryPrice: t.entry_price,
        quantity: t.quantity,
        type: t.type,
        status: t.status,
        entryDate: t.entry_date,
        exitDate: t.exit_date || null,
        exitPrice: t.exit_price || null,
        pnl: t.pnl || null,
        strategy: t.strategy || null,
        notes: t.notes || null,
        source: t.source,
      }));
    } catch (error) {
      console.error("❌ Failed to fetch trades:", error);
      return [];
    }
  },

  // ✅ NEW: Get ONLY Open Trades (For Resuming Session)
  getOpenTrades: async () => {
    try {
      const trades: any = await DB_SERVICE.getTrades();
      // Filter for OPEN trades on the client side
      return Array.isArray(trades) ? trades.filter((t: any) => t.status === 'OPEN' || t.status === 'EXITING') : [];
    } catch (error) {
      console.error("❌ Failed to fetch open trades:", error);
      return [];
    }
  },

  // 3. Update Trade (maps camelCase frontend → snake_case backend)
  updateTrade: async (id: string, updates: any) => {
    try {
      const payload: any = {};
      if (updates.exitPrice !== undefined || updates.exit_price !== undefined)
        payload.exit_price = updates.exitPrice ?? updates.exit_price;
      if (updates.exitDate !== undefined || updates.exit_date !== undefined)
        payload.exit_date = updates.exitDate ?? updates.exit_date;
      if (updates.pnl !== undefined) payload.pnl = updates.pnl;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.notes !== undefined) payload.notes = updates.notes;
      return await securePut(`/trades/${id}`, payload);
    } catch (error) {
      console.error("❌ Failed to update trade:", error);
    }
  },

  // 4. Search Stocks (Standalone Instrument DB — no broker connection needed)
  searchStocks: async (query: string) => {
    try {
      return await secureGet(`/watchlists/search?q=${encodeURIComponent(query)}`);
    } catch (error) {
      console.error("❌ Search failed:", error);
      return [];
    }
  },

  deleteTrade: async (id: string) => {
    try {
      return await secureDelete(`/trades/${id}`);
    } catch (error) {
      console.error("❌ Failed to delete trade:", error);
      return { success: false };
    }
  },

  getWatchlistNames: async () => {
    return await secureGet('/watchlists/names'); // Warning: Check if this endpoint exists in FastAPI
  },

  // ✅ Get a specific watchlist by name
  getWatchlist: async (name: string) => {
    return await secureGet(`/watchlists/${encodeURIComponent(name)}`);
  },

  // ✅ Save or Update a watchlist
  saveWatchlist: async (name: string, items: any[]) => {
    return await securePost('/watchlists', { name, items });
  },

  deleteWatchlist: async (name: string) => {
    return await secureDelete(`/watchlists/${encodeURIComponent(name)}`);
  },

  // Get live price quotes for symbols (no broker needed — uses yfinance)
  getQuotes: async (symbols: string[]) => {
    try {
      if (!symbols.length) return {};
      return await securePost('/watchlists/quotes', { symbols });
    } catch (error) {
      console.error("❌ Failed to fetch quotes:", error);
      return {};
    }
  },

  addStockToWatchlist: async (watchlistName: string, stock: any) => {
    // First, get the current list
    const data: any = await secureGet(`/watchlists/${encodeURIComponent(watchlistName)}`);
    const currentItems = data.items || [];

    // Add the new stock if it doesn't already exist
    if (!currentItems.find((i: any) => i.symbol === stock.symbol)) {
      const updatedItems = [...currentItems, stock];
      return await DB_SERVICE.saveWatchlist(watchlistName, updatedItems);
    }
    return data;
  }
};

