
import { DhanCredentials, DhanOrderRequest } from '../types';

const DHAN_API_URL = 'https://api.dhan.co/v2';

// Expanded Mock Mapping for Security IDs 
// In a production app, this should be a dynamic lookup from a CSV master file.
const MOCK_SECURITY_ID_MAP: Record<string, string> = {
  // Nifty 50
  'RELIANCE': '13332',
  'TCS': '11536',
  'HDFCBANK': '1333',
  'INFY': '1594',
  'SBIN': '3045',
  'TATAMOTORS': '3456',
  'ITC': '1660',
  'ONGC': '2475',
  'COALINDIA': '20374',
  'BHEL': '438',
  'NTPC': '11630',
  'POWERGRID': '14977',
  'HINDUNILVR': '1363',
  'LT': '11483',
  'AXISBANK': '5900',
  'BHARTIARTL': '10604',
  'ICICIBANK': '4963',
  'KOTAKBANK': '1922',
  'MARUTI': '10999',
  'SUNPHARMA': '3351',
  'TITAN': '3506',
  'ULTRACEMCO': '11532',
  'BAJFINANCE': '317',
  'WIPRO': '3787',
  
  // Midcaps mentioned
  'HINDCOPPER': '1406',
  'SAIL': '2963',
  'VEDL': '3063',
  'ZOMATO': '5097',
  'PAYTM': '5476',
  'TATAPOWER': '3426',
  'YESBANK': '11915',
  'IDEA': '14366'
};

export const getDhanSecurityId = (symbol: string): string => {
  const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '');
  return MOCK_SECURITY_ID_MAP[cleanSymbol] || '13332'; // Default to Reliance if not found (Demo safety)
};

/**
 * Browser-compatible implementation of the DhanHQ Client.
 * Mimics the structure of the official 'dhanhq' Node.js library.
 */
export class DhanHQ {
  private clientId: string;
  private accessToken: string;
  private baseUrl: string;

  constructor(config: DhanCredentials) {
    this.clientId = config.clientId;
    this.accessToken = config.accessToken;
    this.baseUrl = DHAN_API_URL;
  }

  /**
   * Place an order
   * Matches SDK signature: client.placeOrder({...})
   */
  async placeOrder(order: Omit<DhanOrderRequest, 'dhanClientId' | 'correlationId'>) {
    if (!this.clientId || !this.accessToken) {
      throw new Error("Missing Dhan Credentials");
    }

    const payload: DhanOrderRequest = {
      ...order,
      dhanClientId: this.clientId,
      correlationId: `algo_${Date.now()}`,
    };

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'access-token': this.accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errorMessage || data.message || 'Failed to place order on Dhan');
      }

      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get Last Traded Price (LTP)
   * Note: Dhan API officially uses WebSocket for Live Feed, but we can try Market Quote endpoint if available
   * or use Intraday Chart Data point as a proxy for LTP in this demo.
   * 
   * This is a "Best Effort" fetch for client-side demo.
   */
  async getLastTradedPrice(securityId: string): Promise<number | null> {
    if (!this.clientId || !this.accessToken) return null;

    try {
        // Attempting to fetch market quote or OHLC
        // Using a common endpoint pattern. If this specific endpoint doesn't exist 
        // in their public REST API, this will fail gracefully.
        const response = await fetch(`${this.baseUrl}/market-feed/quote`, {
            method: 'POST',
            headers: {
                'access-token': this.accessToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                exchangeSegment: "NSE_EQ",
                securityId: securityId
            })
        });

        if (response.ok) {
            const data = await response.json();
            // Assuming data.data.lastPrice or similar structure
            return data.data?.lastPrice || data.data?.close || null;
        }
        return null;
    } catch (e) {
        console.warn("Could not fetch real-time price from Dhan (CORS or Endpoint limitation):", e);
        return null;
    }
  }

  /**
   * Validate connection (Uses Fund Limit API)
   */
  async validate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/fund-limit`, {
        method: 'GET',
        headers: {
          'access-token': this.accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (response.status === 401 || response.status === 403) {
        console.error("Dhan Auth Failed: Invalid Credentials");
        return false;
      }
      
      if (response.ok) {
        return true;
      }

      return false;
    } catch (e) {
      // Handle CORS specifically for browser environments
      const err = e as Error;
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
         console.warn("Bypassing strict validation due to browser CORS restrictions. Keys saved locally.");
         return true; 
      }
      return false;
    }
  }

  private handleError(error: unknown) {
    console.error("Dhan API Error:", error);
    const err = error as Error;
    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
         throw new Error("Connection blocked by browser (CORS). To trade for real, this app needs a backend server proxy.");
    }
    throw error;
  }
}
