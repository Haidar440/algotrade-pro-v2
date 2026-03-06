/**
 * Real-time price streaming via native WebSocket.
 * Connects to FastAPI /ws/prices which proxies Angel One SmartWebSocketV2.
 *
 * Architecture:
 *   Browser WS ──→ FastAPI /ws/prices ──→ SmartWebSocketV2 (Angel One)
 */

const WS_URL = `ws://${window.location.hostname}:8000/ws/prices`;
const RECONNECT_MAX = 5;
const RECONNECT_DELAY_MS = 3000;

type PriceCallback = (price: number, data?: any) => void;

class StreamingService {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, Set<PriceCallback>> = new Map();
  private lastPrices: Map<string, number> = new Map();
  private lastTickData: Map<string, any> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private pendingSubscriptions: Map<string, string[]> = new Map(); // exchange → tokens

  /**
   * Connect to the backend WebSocket endpoint.
   * Call this after Angel One login succeeds.
   */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log("🟢 Streaming: Connected to backend WebSocket");

        // Re-subscribe any pending tokens
        for (const [exchange, tokens] of this.pendingSubscriptions.entries()) {
          this.sendSubscribe(tokens, exchange);
        }
        this.pendingSubscriptions.clear();

        // Also re-subscribe all currently tracked tokens
        const activeTokens = Array.from(this.subscribers.keys());
        if (activeTokens.length > 0) {
          this.sendSubscribe(activeTokens, "NSE");
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "tick" && msg.data) {
            const { token, ltp } = msg.data;
            if (token && ltp > 0) {
              this.lastPrices.set(token, ltp);
              this.lastTickData.set(token, msg.data);

              // Notify all subscribers for this token
              const callbacks = this.subscribers.get(token);
              if (callbacks) {
                callbacks.forEach(cb => cb(ltp, msg.data));
              }
            }
          } else if (msg.type === "snapshot" && msg.prices) {
            // Batch snapshot on connect
            for (const [token, data] of Object.entries(msg.prices as Record<string, any>)) {
              const ltp = (data as any).ltp;
              if (ltp > 0) {
                this.lastPrices.set(token, ltp);
                this.lastTickData.set(token, data);
                const callbacks = this.subscribers.get(token);
                if (callbacks) {
                  callbacks.forEach(cb => cb(ltp, data));
                }
              }
            }
          }
        } catch { /* ignore malformed messages */ }
      };

      this.ws.onclose = () => {
        this.connected = false;
        console.log("🔴 Streaming: Disconnected");
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        // Will trigger onclose
      };

    } catch (err) {
      console.warn("Streaming: Failed to create WebSocket:", err);
    }
  }

  /**
   * Subscribe to live price updates for a token.
   * Multiple callbacks can be registered per token.
   */
  subscribe(symbolToken: string, onPriceUpdate: PriceCallback): void {
    if (!symbolToken) return;

    if (!this.subscribers.has(symbolToken)) {
      this.subscribers.set(symbolToken, new Set());
    }
    this.subscribers.get(symbolToken)!.add(onPriceUpdate);

    // Fire cached price immediately
    const cached = this.lastPrices.get(symbolToken);
    if (cached && cached > 0) {
      onPriceUpdate(cached, this.lastTickData.get(symbolToken));
    }

    // Send subscribe to backend if connected
    if (this.connected) {
      this.sendSubscribe([symbolToken], "NSE");
    } else {
      // Queue for when connection opens
      const pending = this.pendingSubscriptions.get("NSE") || [];
      if (!pending.includes(symbolToken)) {
        pending.push(symbolToken);
        this.pendingSubscriptions.set("NSE", pending);
      }
      // Auto-connect if not connected
      this.connect();
    }

    console.log(`📡 Subscribed to token: ${symbolToken}`);
  }

  /**
   * Unsubscribe a specific callback for a token.
   * If no callbacks remain, unsubscribes from backend.
   */
  unsubscribe(symbolToken: string, callback?: PriceCallback): void {
    if (!symbolToken) return;

    if (callback && this.subscribers.has(symbolToken)) {
      this.subscribers.get(symbolToken)!.delete(callback);
      if (this.subscribers.get(symbolToken)!.size === 0) {
        this.subscribers.delete(symbolToken);
        this.sendUnsubscribe([symbolToken], "NSE");
      }
    } else {
      // Remove all callbacks for this token
      this.subscribers.delete(symbolToken);
      this.sendUnsubscribe([symbolToken], "NSE");
    }
  }

  /**
   * Get the last known price for a token.
   */
  getLastPrice(symbolToken: string): number {
    return this.lastPrices.get(symbolToken) || 0;
  }

  /**
   * Get full tick data for a token (ltp, open, high, low, close, volume).
   */
  getLastTick(symbolToken: string): any | null {
    return this.lastTickData.get(symbolToken) || null;
  }

  /**
   * Check if Indian stock market is open (IST 9:15 – 15:30, Mon–Fri).
   */
  isMarketOpen(): boolean {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utc + istOffset);
    const day = istDate.getDay();
    if (day === 0 || day === 6) return false;
    const currentTime = istDate.getHours() * 60 + istDate.getMinutes();
    return currentTime >= 9 * 60 + 15 && currentTime <= 15 * 60 + 30;
  }

  /**
   * Check if backend WebSocket is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from backend WebSocket.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = RECONNECT_MAX; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // ━━━━ Private ━━━━

  private sendSubscribe(tokens: string[], exchange: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "subscribe", tokens, exchange }));
  }

  private sendUnsubscribe(tokens: string[], exchange: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "unsubscribe", tokens, exchange }));
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= RECONNECT_MAX) {
      console.warn("Streaming: Max reconnect attempts reached.");
      return;
    }
    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;
    console.log(`Streaming: Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${RECONNECT_MAX})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

export const streamer = new StreamingService();