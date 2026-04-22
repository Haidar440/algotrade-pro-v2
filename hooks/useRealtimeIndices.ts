import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchMarketIndices } from '../services/gemini';

const WS_URL = `ws://${window.location.hostname}:8000/ws/indices`;
const RECONNECT_MAX = 5;
const RECONNECT_DELAY_MS = 3000;

export interface IndicesData {
    [key: string]: { price: number; changePercent: number };
}

export function useRealtimeIndices() {
    const [indices, setIndices] = useState<IndicesData | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttempts = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMounted = useRef(true);

    // REST fallback
    const fetchViaRest = useCallback(async () => {
        try {
            const data = await fetchMarketIndices();
            if (isMounted.current && data) {
                setIndices(data as any);
                setIsLoading(false);
            }
        } catch {
            console.warn('useRealtimeIndices: REST fallback failed');
        }
    }, []);

    const connect = useCallback(() => {
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!isMounted.current) return;
                setIsLive(true);
                reconnectAttempts.current = 0;
                console.log('🟢 Indices WS: Connected');
            };

            ws.onmessage = (event: MessageEvent) => {
                if (!isMounted.current) return;
                try {
                    const msg = JSON.parse(event.data);
                    if ((msg.type === 'indices_snapshot' || msg.type === 'indices_update') && msg.data) {
                        setIndices(msg.data);
                        setIsLoading(false);
                    }
                } catch { /* ignore */ }
            };

            ws.onclose = () => {
                if (!isMounted.current) return;
                setIsLive(false);
                console.log('🔴 Indices WS: Disconnected');
                attemptReconnect();
            };

            ws.onerror = () => {
                // onclose will fire
            };
        } catch {
            console.warn('useRealtimeIndices: WS connection failed, using REST');
            fetchViaRest();
        }
    }, [fetchViaRest]);

    const attemptReconnect = useCallback(() => {
        if (reconnectAttempts.current >= RECONNECT_MAX) {
            console.warn('Indices WS: Max reconnects, falling back to REST');
            fetchViaRest();
            return;
        }
        reconnectAttempts.current++;
        const delay = RECONNECT_DELAY_MS * reconnectAttempts.current;
        reconnectTimer.current = setTimeout(() => {
            if (isMounted.current) connect();
        }, delay);
    }, [connect, fetchViaRest]);

    useEffect(() => {
        isMounted.current = true;

        // Try WebSocket first
        connect();

        // Also fetch REST as immediate backup while WS connects
        fetchViaRest();

        return () => {
            isMounted.current = false;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect, fetchViaRest]);

    return { indices, isLive, isLoading };
}
