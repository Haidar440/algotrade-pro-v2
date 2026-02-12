import axios from 'axios';
import * as OTPAuth from "otpauth"; 
import { 
  AngelCredentials, 
  AngelOrderParams, 
  AngelOrder, 
  AngelPosition, 
  AngelHolding, 
  AngelFundDetails,
  ModifyOrderParams 
} from '../types';

// ✅ POINT TO YOUR LOCAL BACKEND
const BACKEND_URL = 'http://localhost:5000';

const MAX_REQUESTS_PER_SECOND = 3;
const DELAY_BETWEEN_REQUESTS = 1000 / MAX_REQUESTS_PER_SECOND;

export class AngelOne {
  private apiKey: string;
  private jwtToken: string | null = null;
  private refreshToken: string | null = null;
  private feedToken: string | null = null;
  private clientCode: string | null = null;
  
  private onSessionUpdate?: (tokens: any) => void;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  private tokenCache: Map<string, string> = new Map();

  constructor(brokerState: any, onSessionUpdate?: (tokens: any) => void) {
    this.apiKey = brokerState?.apiKey || "";
    this.jwtToken = brokerState?.jwtToken || null;
    this.refreshToken = brokerState?.refreshToken || null;
    this.feedToken = brokerState?.feedToken || null;
    this.clientCode = brokerState?.clientCode || null;
    this.onSessionUpdate = onSessionUpdate;
  }

  // --- 1. PROXY HELPER ---
  private async callProxy(endpoint: string, data: any) {
      return axios.post(`${BACKEND_URL}/api/angel-proxy`, { endpoint, data }, {
          headers: {
              'X-PrivateKey': this.apiKey,
              'Authorization': this.jwtToken ? `Bearer ${this.jwtToken}` : ''
          }
      });
  }

  // --- 2. QUEUE SYSTEM ---
  private async enqueueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error: any) {
          const errorCode = error.response?.data?.errorcode;
          if (errorCode === 'AG8002' || error.response?.status === 401 || error.response?.status === 403) {
              console.log("⚠️ Token Expired. Refreshing...");
              try {
                await this.renewAccessToken();
                const retryResult = await requestFn();
                resolve(retryResult);
              } catch (refreshError) { reject(refreshError); }
          } else { reject(error); }
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    this.isProcessingQueue = true;
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        await request();
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
      }
    }
    this.isProcessingQueue = false;
  }

  // --- 3. AUTHENTICATION ---
  async login(clientCode: string, pin: string, totpSecret: string): Promise<any> {
    let validTotp = totpSecret;
    if (totpSecret.length > 10) {
        try {
            const totp = new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(totpSecret) });
            validTotp = totp.generate();
        } catch (e) {}
    }
    const response = await this.callProxy('loginByPassword', { clientcode: clientCode, password: pin, totp: validTotp });
    if (response.data.status) {
        this.updateSession(response.data.data);
        return response.data.data;
    }
    throw new Error(response.data.message || "Login Failed");
  }

  // Inside algotrade-pro1/services/angel.ts

async renewAccessToken() {
    if (!this.refreshToken) throw new Error("No Refresh Token available");
    
    console.log("🔄 Attempting Token Refresh...");
    const response = await this.callProxy('generateTokens', { refreshToken: this.refreshToken });
    
    if (response.data.status && response.data.data) {
        console.log("✅ Token Refreshed!");
        this.updateSession(response.data.data);
    } else {
        throw new Error("Token Refresh Failed");
    }
}
  private updateSession(data: any) {
    this.jwtToken = data.jwtToken;
    this.refreshToken = data.refreshToken;
    this.feedToken = data.feedToken;
    if (this.onSessionUpdate) this.onSessionUpdate(data);
  }

  // --- 4. TOKEN LOOKUP ---
  async searchSymbolToken(symbol: string): Promise<string> {
    const cleanSymbol = symbol.toUpperCase().replace('.NS', '').replace('-EQ', '');
    if (this.tokenCache.has(cleanSymbol)) return this.tokenCache.get(cleanSymbol)!;

    return this.enqueueRequest(async () => {
        try {
            // Priority 1: Backend Search (Faster)
            const res = await axios.get(`${BACKEND_URL}/api/search?q=${cleanSymbol}`);
            if (res.data.length > 0) {
                const match = res.data.find((s: any) => s.symbol === cleanSymbol) || res.data[0];
                this.tokenCache.set(cleanSymbol, match.token);
                return match.token;
            }
        } catch (e) { }
        
        // Priority 2: Angel API Fallback
        try {
            const response = await this.callProxy('searchScrip', { exchange: "NSE", searchscrip: cleanSymbol });
            if (response.data.status && response.data.data) {
                const match = response.data.data.find((s: any) => s.tradingsymbol === `${cleanSymbol}-EQ`) || response.data.data[0];
                if (match) {
                    this.tokenCache.set(cleanSymbol, match.symboltoken);
                    return match.symboltoken;
                }
            }
        } catch(e) {}

        throw new Error(`Token not found for: ${symbol}`);
    });
  }


 // --- 5. MARKET DATA ---
  async getHistoricalData(symbol: string, interval: string = "ONE_DAY", days: number = 200): 
  Promise<any[]> {
    let token = "";
    try { 
        token = await this.searchSymbolToken(symbol); 
    } catch (e) { 
        console.warn(`⚠️ Token Lookup Failed for ${symbol}`);
        return []; 
    }
    
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - days);
    
    const formatDate = (date: Date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    };

    return this.enqueueRequest(async () => {
        try {
            const response = await this.callProxy('getCandleData', {
                exchange: "NSE", 
                symboltoken: token, 
                interval: interval, 
                fromdate: formatDate(fromDate), 
                todate: formatDate(toDate)
            });

            // ✅ LOG THE ERROR if status is false
            if (response.data.status === false) {
                console.error(`❌ API Error for ${symbol} (Token: ${token}):`, response.data.message);
                return [];
            }

            if (response.data.data) {
                return response.data.data.map((d: any) => ({ 
                    date: d[0], open: d[1], high: d[2], low: d[3], close: d[4], volume: d[5] 
                }));
            }
            return [];
        } catch (e: any) {
            console.error(`❌ Request Failed for ${symbol}:`, e.message);
            return [];
        }
    });
  }
  // --- 6. EXECUTION & PORTFOLIO (ENHANCED) ---

  // ✅ Place Order (Returns Detailed Status)
  async placeOrder(params: AngelOrderParams): Promise<{ status: boolean; message: string; orderid?: string }> {
      return this.enqueueRequest(async () => {
          try {
              const response = await this.callProxy('placeOrder', params);
              if (response.data.status) {
                  return { status: true, message: 'Success', orderid: response.data.data.uniqueorderid || response.data.data.orderid };
              }
              return { status: false, message: response.data.message || 'Order Failed' };
          } catch (e: any) {
              return { status: false, message: e.message || 'API Error' };
          }
      });
  }

  // ✅ Modify Order (New - For Trailing SL)
  async modifyOrder(params: ModifyOrderParams): Promise<{ status: boolean; message: string }> {
      return this.enqueueRequest(async () => {
          try {
              const response = await this.callProxy('modifyOrder', params);
              if (response.data.status) {
                  return { status: true, message: 'Modified' };
              }
              return { status: false, message: response.data.message };
          } catch (e: any) {
              return { status: false, message: e.message };
          }
      });
  }

  // ✅ Cancel Order (Enhanced)
  async cancelOrder(orderId: string, variety: string = 'NORMAL'): Promise<{ status: boolean; message: string }> {
      return this.enqueueRequest(async () => {
          try {
              const response = await this.callProxy('cancelOrder', { variety, orderid: orderId });
              if (response.data.status) return { status: true, message: 'Cancelled' };
              return { status: false, message: response.data.message };
          } catch (e: any) {
              return { status: false, message: e.message };
          }
      });
  }

  // Order Book
  async getOrderBook(): Promise<AngelOrder[]> {
      return this.enqueueRequest(async () => {
          const response = await this.callProxy('getOrderBook', {});
          if (response.data.status && response.data.data) return response.data.data;
          return [];
      });
  }

  // Holdings
  async getHoldings(): Promise<AngelHolding[]> {
      return this.enqueueRequest(async () => {
          const response = await this.callProxy('getHolding', {});
          if (response.data.status && response.data.data) return response.data.data;
          return [];
      });
  }

  // Positions
  async getPositions(): Promise<AngelPosition[]> {
      return this.enqueueRequest(async () => {
          const response = await this.callProxy('getPosition', {});
          if (response.data.status && response.data.data) return response.data.data;
          return [];
      });
  }

  // Funds
  async getFunds(): Promise<AngelFundDetails | null> {
      return this.enqueueRequest(async () => {
          const response = await this.callProxy('getRMS', {});
          if (response.data.status && response.data.data) return response.data.data;
          return null;
      });
  }
  
  // Market Indices
  async getMarketIndices() {
      try {
          const nifty = await this.getLtpValue("NSE", "99926000", "Nifty 50");
          const sensex = await this.getLtpValue("BSE", "99919000", "Sensex");
          const bankNifty = await this.getLtpValue("NSE", "99926009", "Bank Nifty");
          return { nifty, sensex, bankNifty };
      } catch (e) { return null; }
  }

  public async getLtpValue(exchange: string, token: string, symbol: string) {
      return this.enqueueRequest(async () => {
          const res = await this.callProxy('getLtpData', { exchange, symboltoken: token, tradingsymbol: symbol });
          if (res.data.status && res.data.data) {
              const ltp = res.data.data.ltp;
              const close = res.data.data.close;
              const percent = ((ltp - close) / close) * 100;
              return { price: ltp, changePercent: parseFloat(percent.toFixed(2)) };
          }
          return { price: 0, changePercent: 0 };
      });
  }

  // For Search Bar
  async searchScrips(query: string) {
      if (query.length < 2) return [];
      try {
          const res = await axios.get(`${BACKEND_URL}/api/search?q=${query}`);
          return res.data;
      } catch (e) { return []; }
  }
}