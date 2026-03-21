import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  ISeriesApi,
  IChartApi,
  CandlestickSeries,
  CandlestickData,
  Time
} from 'lightweight-charts';
import axios from 'axios';
import { streamer } from '../services/streaming';
import { Clock, AlertTriangle, Loader2, Wifi, Activity, Zap } from 'lucide-react';
import OrderEntryPanel from './OrderEntryPanel';

interface Props {
  symbol: string;
  token: string;
}

const TIMEFRAMES = [
  { label: '1m', value: 'ONE_MINUTE', seconds: 60 },
  { label: '5m', value: 'FIVE_MINUTE', seconds: 300 },
  { label: '15m', value: 'FIFTEEN_MINUTE', seconds: 900 },
  { label: '30m', value: 'THIRTY_MINUTE', seconds: 1800 },
  { label: '1H', value: 'ONE_HOUR', seconds: 3600 },
  { label: '1D', value: 'ONE_DAY', seconds: 86400 },
];

/** Read a CSS variable from :root or current theme */
const cssVar = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

const TradingChart: React.FC<Props> = ({ symbol, token }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState("FIVE_MINUTE");
  const [livePrice, setLivePrice] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);

  // ✅ New State for Order Panel
  const [showOrderPanel, setShowOrderPanel] = useState(false);

  // Helper: Clean Token
  const cleanToken = (t: string) => t.replace(/['\"]+/g, '');

  // 1. Initialize Chart — reads theme from CSS variables
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const container = chartContainerRef.current;
    if (container.clientWidth === 0) return;

    const chartBg = cssVar('--chart-bg', '#0c1120');
    const chartGrid = cssVar('--chart-grid', '#1e293b');
    const chartText = cssVar('--chart-text', '#94a3b8');

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: chartBg },
        textColor: chartText,
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: chartGrid, style: 2 } },
      width: container.clientWidth,
      height: container.clientHeight || 500,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: chartGrid },
      rightPriceScale: { borderColor: chartGrid },
      crosshair: { mode: 1 },
    });

    const upColor = cssVar('--accent-green', '#10b981');
    const downColor = cssVar('--accent-red', '#ef4444');

    const newSeries = chart.addSeries(CandlestickSeries, {
      upColor, downColor,
      borderVisible: false, wickUpColor: upColor, wickDownColor: downColor,
    });

    chartRef.current = chart;
    candleSeriesRef.current = newSeries;

    // ResizeObserver for container-aware sizing (better than window resize)
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    resizeObserver.observe(container);

    return () => { resizeObserver.disconnect(); chart.remove(); };
  }, []);

  // 2. Fetch History — uses backend API (yfinance fallback, no Angel One required)
  useEffect(() => {
    if (!token && !symbol) return;

    const fetchHistory = async () => {
      setLoading(true); setError(null); lastCandleRef.current = null;
      try {
        const jwtToken = localStorage.getItem('algoTradePro_jwt');
        if (!jwtToken) { setError("Login Required"); return; }

        const daysToFetch = interval === 'ONE_DAY' ? 365 : 10;
        const cleanSymbol = symbol.replace('.NS', '').replace(/-EQ$|-BE$|-BL$/, '');

        const response = await axios.get('http://localhost:8000/api/broker/historical', {
          params: { symbol: cleanSymbol, interval: interval, days: daysToFetch },
          headers: { 'Authorization': `Bearer ${jwtToken}` }
        });

        const apiData = response.data?.data;
        const rawData = Array.isArray(apiData) ? apiData : [];
        if (rawData.length > 0) {
          let formattedData: CandlestickData<Time>[] = rawData.map((d: any) => ({
            time: (new Date(d.timestamp || d.date).getTime() / 1000 + 19800) as Time,
            open: d.open, high: d.high, low: d.low, close: d.close
          })).sort((a, b) => (a.time as number) - (b.time as number));

          formattedData = formattedData.filter((item, index, self) => index === self.findIndex((t) => (t.time === item.time)));

          if (candleSeriesRef.current && formattedData.length > 0) {
            candleSeriesRef.current.setData(formattedData);
            chartRef.current?.timeScale().fitContent();
            const last = formattedData[formattedData.length - 1];
            lastCandleRef.current = last;
            setLivePrice(last.close);
            setIsConnected(true);
          }
        } else {
          setError("No chart data available");
        }
      } catch (err) { setError("Data Load Failed"); } finally { setLoading(false); }
    };
    fetchHistory();
  }, [token, symbol, interval]);

  // 3. Live Updates
  useEffect(() => {
    if (!token) return;
    const finalToken = cleanToken(token);

    const handlePriceUpdate = (price: number) => {
      setLivePrice(price);
      setIsConnected(true);
      if (!candleSeriesRef.current || !lastCandleRef.current) return;

      const lastBar = lastCandleRef.current;
      const nowSeconds = Math.floor(Date.now() / 1000) + 19800;
      const intervalSecs = TIMEFRAMES.find(t => t.value === interval)?.seconds || 300;
      const currentBarTime = (nowSeconds - (nowSeconds % intervalSecs)) as Time;

      if (currentBarTime === lastBar.time) {
        const updated = { ...lastBar, high: Math.max(lastBar.high, price), low: Math.min(lastBar.low, price), close: price };
        candleSeriesRef.current.update(updated);
        lastCandleRef.current = updated;
      } else if ((currentBarTime as number) > (lastBar.time as number)) {
        const newCandle = { time: currentBarTime, open: price, high: price, low: price, close: price };
        candleSeriesRef.current.update(newCandle);
        lastCandleRef.current = newCandle;
      }
    };
    streamer.subscribe(finalToken, handlePriceUpdate);
    return () => { streamer.unsubscribe(finalToken); };
  }, [token, interval]);

  return (
    <div className="h-full flex flex-col relative" style={{ background: 'var(--chart-bg)' }}>

      {/* Chart Toolbar */}
      <div
        className="absolute top-3 left-3 z-10 flex items-center gap-2 md:gap-3 px-3 py-2 rounded-lg"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-2 md:gap-3 pr-3" style={{ borderRight: '1px solid var(--border)' }}>
          <h2 className="text-xs md:text-sm font-semibold tracking-wide" style={{ color: 'var(--text)' }}>{symbol}</h2>
          <div className="flex items-center gap-1.5 font-mono font-semibold text-xs md:text-sm tabular-nums transition-colors duration-300" style={{
            color: livePrice > (lastCandleRef.current?.open || 0) ? 'var(--accent-green)' : 'var(--accent-red)'
          }}>
            {livePrice > 0 ? livePrice.toFixed(2) : '---'}
            <Activity className={`w-3 h-3 ${isConnected ? 'animate-pulse' : ''}`} style={{ color: isConnected ? 'var(--accent-green)' : 'var(--text-muted)' }} />
          </div>
        </div>

        <div className="flex items-center gap-0.5 md:gap-1">
          <Clock className="w-3 h-3 mr-0.5 md:mr-1" style={{ color: 'var(--text-muted)' }} />
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setInterval(tf.value)}
              className="text-[10px] font-semibold px-1.5 md:px-2 py-1 rounded transition-all"
              style={{
                background: interval === tf.value ? 'var(--accent-blue)' : 'transparent',
                color: interval === tf.value ? '#fff' : 'var(--text-muted)',
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="pl-2 flex items-center gap-2" style={{ borderLeft: '1px solid var(--border)' }}>
          {isConnected
            ? <Wifi className="w-3 h-3" style={{ color: 'var(--accent-green)' }} />
            : <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--text-muted)' }} />
          }
        </div>
      </div>

      {/* ✅ ORDER BUTTON */}
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={() => setShowOrderPanel(!showOrderPanel)}
          className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg font-semibold text-xs transition-all"
          style={{
            background: showOrderPanel ? 'var(--accent-amber)' : 'var(--bg-card)',
            color: showOrderPanel ? '#1a1d23' : 'var(--text)',
            border: `1px solid ${showOrderPanel ? 'var(--accent-amber)' : 'var(--border)'}`,
            boxShadow: 'var(--shadow)',
          }}
        >
          <Zap className="w-3.5 h-3.5" style={{ fill: 'currentColor' }} /> TRADE
        </button>
      </div>

      {/* ✅ RENDER ORDER PANEL IF OPEN */}
      {showOrderPanel && (
        <OrderEntryPanel
          symbol={symbol}
          token={cleanToken(token)}
          ltp={livePrice}
          onClose={() => setShowOrderPanel(false)}
        />
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <p className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)' }}>{error}</p>
        </div>
      )}
      {loading && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2" style={{ background: 'var(--ring-blue)', color: 'var(--accent-blue)', backdropFilter: 'blur(8px)' }}>
          <Loader2 className="w-3 h-3 animate-spin" /> Loading History…
        </div>
      )}

      {/* Chart container — aspect ratio maintains regularity */}
      <div ref={chartContainerRef} className="w-full flex-1 min-h-0" style={{ minHeight: '300px' }} />
    </div>
  );
};

export default TradingChart;