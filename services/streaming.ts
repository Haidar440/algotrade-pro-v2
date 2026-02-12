import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

class StreamingService {
  private socket: Socket;
  private subscribers: Map<string, (price: number) => void> = new Map();
  // ✅ New Cache to store the last seen price for every token
  private lastPrices: Map<string, number> = new Map();

  constructor() {
    this.socket = io(SOCKET_URL);

    this.socket.on("connect", () => {
      console.log("🟢 Streaming Service: Connected to Backend");
    });

    this.socket.on("disconnect", () => {
      console.log("🔴 Streaming Service: Disconnected");
    });

    this.socket.on("price-update", (data: any) => {
      let token = data.token;
      if (typeof token === 'string') token = token.replace(/"/g, '');

      const rawPrice = data.last_traded_price || data.ltp;
      const price = parseFloat(rawPrice);

      if (token && !isNaN(price)) {
        // ✅ 1. Save to Cache
        this.lastPrices.set(token, price);

        // 2. Notify Subscriber
        if (this.subscribers.has(token)) {
          this.subscribers.get(token)!(price);
        }
      }
    });
  }

  subscribe(symbolToken: string, onPriceUpdate: (price: number) => void) {
    if (!symbolToken) return;
    this.subscribers.set(symbolToken, onPriceUpdate);
    // If we already have a price in cache, fire it immediately
    if (this.lastPrices.has(symbolToken)) {
        onPriceUpdate(this.lastPrices.get(symbolToken)!);
    }
    console.log(`📡 Requesting Live Stream for Token: ${symbolToken}`);
    this.socket.emit("subscribe", symbolToken);
  }

  unsubscribe(symbolToken: string) {
    if (this.subscribers.has(symbolToken)) {
      this.subscribers.delete(symbolToken);
    }
  }

  // ✅ ADDED BACK: Prevents the crash in PaperTradingDashboard
  getLastPrice(symbolToken: string): number {
      return this.lastPrices.get(symbolToken) || 0;
  }

  isMarketOpen(): boolean {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utc + istOffset);
    const day = istDate.getDay();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const currentTime = hours * 60 + minutes;
    if (day === 0 || day === 6) return false;
    const marketOpen = 9 * 60 + 15;
    const marketClose = 15 * 60 + 30;
    return currentTime >= marketOpen && currentTime <= marketClose;
  }
}

export const streamer = new StreamingService();