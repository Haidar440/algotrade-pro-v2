import { api, secureGet, securePost, securePut, secureDelete } from './api';

// Types (Keep existing types or import them if shared)
export interface AngelOrderParams {
    variety: string;
    tradingsymbol: string;
    symboltoken: string;
    transactiontype: 'BUY' | 'SELL';
    exchange: string;
    ordertype: 'MARKET' | 'LIMIT' | 'STOPLOSS_LIMIT' | 'STOPLOSS_MARKET';
    producttype: 'INTRADAY' | 'DELIVERY' | 'CARRYFORWARD' | 'MARGIN';
    duration: 'DAY' | 'IOC';
    price: string;
    quantity: string;
    triggerprice?: string;
    squareoff?: string;
    stoploss?: string;
}

export interface ModifyOrderParams {
    orderid: string;
    variety: string;
    tradingsymbol: string;
    symboltoken: string;
    exchange: string;
    ordertype: string;
    producttype: string;
    duration: string;
    price: string;
    quantity: string;
    triggerprice?: string;
}

export interface AngelOrder {
    orderid: string;
    tradingsymbol: string;
    symboltoken: string;
    transactiontype: string;
    exchange: string;
    ordertype: string;
    producttype: string;
    price: number;
    quantity: number;
    status: string;
    averageprice: number;
    ltp: number;
}

export interface AngelPosition {
    tradingsymbol: string;
    symboltoken: string;
    exchange: string;
    producttype: string;
    netqty: string;
    pnl: string;
    ltp: string;
    buyavgprice: string;
    sellavgprice: string;
}

export interface AngelHolding {
    tradingsymbol: string;
    quantity: number;
    averageprice: number;
    ltp: number;
    pnl: number;
    symboltoken: string;
    exchange: string;
}

export interface AngelFundDetails {
    net: string;
    availablecash: string;
    marginused: string;
}


// ✅ NEW Impl: Thin Client Wrapper around FastAPI
export class AngelOne {
    private sessionCallback?: (session: any) => void;
    private apiKey?: string;

    constructor(sessionData?: any, onSessionUpdate?: (session: any) => void) {
        this.sessionCallback = onSessionUpdate;
        this.apiKey = sessionData?.apiKey;
    }

    // ✅ Login -> Connect Broker (sends credentials to backend)
    async login(clientCode: string, pin: string, totpSecret: string): Promise<any> {
        try {
            const res = await securePost('/broker/connect', {
                broker: 'angel',
                api_key: this.apiKey || undefined,
                client_id: clientCode || undefined,
                password: pin || undefined,
                totp_secret: totpSecret || undefined,
            });

            if (readResponse(res).connected) {
                // Return a session object with the right keys so SettingsModal can store them
                const session = {
                    jwtToken: 'backend_managed',
                    refreshToken: 'backend_managed',
                    feedToken: 'backend_managed',
                    connected: true,
                    broker: readResponse(res).broker,
                };
                if (this.sessionCallback) this.sessionCallback(session);
                return session;
            }
            return null; // Failed
        } catch (error) {
            console.error("Login failed", error);
            throw error;
        }
    }

    // ✅ Renew Access Token -> Not needed, backend handles it
    async renewAccessToken(): Promise<void> {
        console.log("Session managed by backend.");
    }

    // ✅ Search (Token Lookup)
    async searchSymbolToken(symbol: string): Promise<string> {
        try {
            const res: any = await secureGet(`/broker/token?symbol=${symbol}`);
            return res || ""; // API returns just the string token in data
        } catch (e) {
            return "";
        }
    }

    // ✅ Historical Data
    async getHistoricalData(symbol: string, interval: string = "ONE_DAY", days: number = 100): Promise<any[]> {
        try {
            const params = `symbol=${encodeURIComponent(symbol)}&interval=${interval}&days=${days}`;
            const res: any = await secureGet(`/broker/historical?${params}`);
            return Array.isArray(res) ? res.map((c: any) => ({
                date: c.timestamp,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            })) : [];
        } catch (e) {
            console.error("History fetch error", e);
            return [];
        }
    }

    // ✅ Place Order
    async placeOrder(params: AngelOrderParams): Promise<{ status: boolean; message: string; orderid?: string }> {
        try {
            // Map Frontend Params -> Backend OrderCreateRequest
            const body = {
                symbol: params.tradingsymbol, // or params.symboltoken? Backend expects symbol.
                exchange: params.exchange,
                side: params.transactiontype,
                order_type: params.ordertype === 'STOPLOSS_LIMIT' ? 'SL' : params.ordertype,
                quantity: parseInt(params.quantity),
                price: parseFloat(params.price),
                trigger_price: params.triggerprice ? parseFloat(params.triggerprice) : 0,
                product: params.producttype
            };

            const res: any = await securePost('/broker/order', body);
            return {
                status: true,
                message: res.message,
                orderid: res.order_id
            };
        } catch (e: any) {
            return { status: false, message: e.response?.data?.message || "Order failed" };
        }
    }

    // ✅ Modify Order
    async modifyOrder(params: ModifyOrderParams): Promise<{ status: boolean; message: string }> {
        try {
            const body = {
                price: parseFloat(params.price),
                quantity: parseInt(params.quantity),
                trigger_price: params.triggerprice ? parseFloat(params.triggerprice) : 0
            };
            const res: any = await securePut(`/broker/order/${params.orderid}`, body);
            return { status: true, message: res.message };
        } catch (e: any) {
            return { status: false, message: e.message || "Modify failed" };
        }
    }

    // ✅ Cancel Order
    async cancelOrder(orderId: string, variety: string = 'NORMAL'): Promise<{ status: boolean; message: string }> {
        try {
            const res: any = await secureDelete(`/broker/order/${orderId}`);
            return { status: true, message: res.message };
        } catch (e: any) {
            return { status: false, message: "Cancel failed" };
        }
    }

    // ✅ Order Book
    async getOrderBook(): Promise<AngelOrder[]> {
        try {
            const res: any = await secureGet('/broker/orders');
            // Map backend response -> AngelOrder format if needed
            return Array.isArray(res) ? res : [];
        } catch (e) { return []; }
    }

    // ✅ Holdings
    async getHoldings(): Promise<AngelHolding[]> {
        try {
            const res: any = await secureGet('/broker/holdings');
            // Map backend HoldingSchema -> AngelHolding
            return Array.isArray(res) ? res.map((h: any) => ({
                tradingsymbol: h.symbol,
                quantity: h.quantity,
                averageprice: h.average_price,
                ltp: h.ltp,
                pnl: h.pnl,
                symboltoken: "", // Backend might not send token, ok?
                exchange: "NSE"
            })) : [];
        } catch (e) { return []; }
    }

    // ✅ Positions
    async getPositions(): Promise<AngelPosition[]> {
        try {
            const res: any = await secureGet('/broker/positions');
            // Map backend PositionSchema -> AngelPosition
            return Array.isArray(res) ? res.map((p: any) => ({
                tradingsymbol: p.symbol,
                symboltoken: "",
                exchange: p.exchange,
                producttype: p.product,
                netqty: p.quantity.toString(),
                pnl: p.pnl.toString(),
                ltp: p.ltp.toString(),
                buyavgprice: p.average_price.toString(),
                sellavgprice: "0" // Not in schema, ignore
            })) : [];
        } catch (e) { return []; }
    }

    // ✅ Funds (Risk Status/Limits from backend)
    async getFunds(): Promise<AngelFundDetails | null> {
        try {
            const res: any = await secureGet('/broker/risk/status');
            const maxValue = res.max_order_value || 100000;
            const dailyLossUsed = maxValue - (res.daily_loss_remaining || maxValue);
            return {
                net: String(maxValue),
                availablecash: String(res.daily_loss_remaining || maxValue),
                marginused: String(dailyLossUsed)
            };
        } catch (e) { return null; }
    }

    // ✅ Market Indices (Uses Backend /api/ai/market/indices)
    async getMarketIndices() {
        try {
            const res: any = await secureGet('/ai/market/indices');
            return res;
        } catch (e) {
            // Fallback to reasonable defaults if backend is down
            return {
                nifty: { price: 0, changePercent: 0 },
                bankNifty: { price: 0, changePercent: 0 },
                sensex: { price: 0, changePercent: 0 }
            };
        }
    }

    async getLtpValue(exchange: string, token: string, symbol: string) {
        try {
            const res: any = await secureGet(`/broker/ltp?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}`);
            return { price: res?.ltp || res?.price || 0 };
        } catch (e) {
            return { price: 0 };
        }
    }

    async searchScrip(query: string) {
        try {
            const res: any = await secureGet(`/broker/search?q=${query}`);
            return Array.isArray(res) ? res.map((item: any) => ({
                symbol: item.tradingsymbol,
                name: item.desc || item.tradingsymbol,
                sector: 'N/A'
            })) : [];
        } catch (e) { return []; }
    }

    // Helper to match old usage
    async searchScrips(query: string) {
        return this.searchScrip(query);
    }
}

// Helper to handle ApiResponse wrapper unwrapping if not handled by api.ts
// But api.ts `secureGet` returns `data.data` so `res` is already the payload.
const readResponse = (res: any) => res;