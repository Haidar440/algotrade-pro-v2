import { Trade } from '../types'; 

const API_URL = 'http://localhost:5000/api';

export const DB_SERVICE = {
  
  // 1. Save a Trade
  saveTrade: async (trade: any) => {
    try {
      const response = await fetch(`${API_URL}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade)
      });
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to save trade:", error);
    }
  },

  // 2. Get History
  getTrades: async () => {
    try {
      const response = await fetch(`${API_URL}/trades`);
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to fetch trades:", error);
      return [];
    }
  },

  // ✅ NEW: Get ONLY Open Trades (For Resuming Session)
  getOpenTrades: async () => {
    try {
        const trades = await DB_SERVICE.getTrades();
        // Filter for OPEN trades on the client side
        return trades.filter((t: any) => t.status === 'OPEN' || t.status === 'EXITING');
    } catch (error) {
        console.error("❌ Failed to fetch open trades:", error);
        return [];
    }
  },

  // 3. Update Trade
  updateTrade: async (id: string, updates: any) => {
    try {
      const response = await fetch(`${API_URL}/trades/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to update trade:", error);
    }
  },

  // 4. Search Stocks
  searchStocks: async (query: string) => {
    try {
      const response = await fetch(`${API_URL}/search?q=${query}`);
      return await response.json();
    } catch (error) {
      console.error("❌ Search failed:", error);
      return [];
    }
  },
  deleteTrade: async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/trades/${id}`, {
        method: 'DELETE',
      });
      return await response.json();
    } catch (error) {
      console.error("❌ Failed to delete trade:", error);
      return { success: false };
    }
  },
  getWatchlistNames: async () => {
    const response = await fetch(`${API_URL}/watchlists/names`);
    return await response.json(); // Returns ['My Stocks', 'Crypto', 'Long Term']
  },

  // ✅ Get a specific watchlist by name
  getWatchlist: async (name: string) => {
    const response = await fetch(`${API_URL}/watchlists/${encodeURIComponent(name)}`);
    return await response.json();
  },

  // ✅ Save or Update a watchlist
  saveWatchlist: async (name: string, items: any[]) => {
    const response = await fetch(`${API_URL}/watchlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items })
    });
    return await response.json();
  },
  deleteWatchlist: async (name: string) => {
    const response = await fetch(`${API_URL}/watchlists/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete watchlist');
    return await response.json();
  },
  addStockToWatchlist: async (watchlistName: string, stock: any) => {
    // First, get the current list
    const response = await fetch(`${API_URL}/watchlists/${encodeURIComponent(watchlistName)}`);
    const data = await response.json();
    const currentItems = data.items || [];

    // Add the new stock if it doesn't already exist
    if (!currentItems.find((i: any) => i.symbol === stock.symbol)) {
        const updatedItems = [...currentItems, stock];
        return await DB_SERVICE.saveWatchlist(watchlistName, updatedItems);
    }
    return data;
  }
};

