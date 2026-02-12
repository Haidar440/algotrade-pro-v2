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
import moment from 'moment';
import { streamer } from '../services/streaming';
import { Clock, AlertTriangle, Loader2, Wifi, Activity, Zap } from 'lucide-react';
import OrderEntryPanel from './OrderEntryPanel'; // ✅ Import the new panel

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
  const cleanToken = (t: string) => t.replace(/['"]+/g, '');

  // 1. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const container = chartContainerRef.current;
    if (container.clientWidth === 0) return;

    const chart = createChart(container, {
      layout: { 
        background: { type: ColorType.Solid, color: '#0f172a' }, 
        textColor: '#94a3b8', 
        fontFamily: "'Inter', sans-serif",
      },
      grid: { vertLines: { visible: false }, horzLines: { color: '#1e293b', style: 2 } },
      width: container.clientWidth,
      height: container.clientHeight || 500,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#1e293b' },
      rightPriceScale: { borderColor: '#1e293b' },
      crosshair: { mode: 1 }, 
    });

    const newSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', 
      borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = newSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, []); 

  // 2. Fetch History (Unchanged)
  useEffect(() => {
    if (!token) return;
    const finalToken = cleanToken(token);

    const fetchHistory = async () => {
      setLoading(true); setError(null); lastCandleRef.current = null;
      try {
        const savedState = localStorage.getItem('algoTradePro_brokerState');
        const brokerState = savedState ? JSON.parse(savedState) : {};
        if (!brokerState.angel?.jwtToken) { setError("Login Required"); return; }

        const toDate = moment().format('YYYY-MM-DD HH:mm');
        const daysToSubtract = interval === 'ONE_DAY' ? 365 : 10;
        const fromDate = moment().subtract(daysToSubtract, 'days').format('YYYY-MM-DD HH:mm');

        const response = await axios.post('http://localhost:5000/api/angel-proxy', {
          endpoint: 'getCandleData',
          data: { exchange: "NSE", symboltoken: finalToken, interval: interval, fromdate: fromDate, todate: toDate }
        }, { headers: { 'Authorization': `Bearer ${brokerState.angel.jwtToken}`, 'X-PrivateKey': brokerState.angel.apiKey } });

        const rawData = response.data.data;
        if (rawData && Array.isArray(rawData)) {
          let formattedData: CandlestickData<Time>[] = rawData.map((d: any) => ({
            time: (new Date(d[0]).getTime() / 1000 + 19800) as Time, 
            open: d[1], high: d[2], low: d[3], close: d[4]
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
    <div className="bg-slate-950 h-full flex flex-col relative">
      
      {/* Chart Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-slate-900/90 backdrop-blur border border-slate-700 px-3 py-2 rounded-lg shadow-xl">
        <div className="flex items-center gap-3 px-2 border-r border-slate-700 pr-4">
            <h2 className="text-sm font-bold text-white tracking-wide">{symbol}</h2>
            <div className={`flex items-center gap-2 font-mono font-bold text-sm transition-colors duration-300 ${livePrice > (lastCandleRef.current?.open || 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
               {livePrice > 0 ? livePrice.toFixed(2) : '---'}
               <Activity className={`w-3 h-3 ${isConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-500'}`} />
            </div>
        </div>

        <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500 mr-1" />
            {TIMEFRAMES.map((tf) => (
                <button key={tf.value} onClick={() => setInterval(tf.value)} className={`text-[10px] font-bold px-2 py-1 rounded transition-all ${interval === tf.value ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>{tf.label}</button>
            ))}
        </div>

        <div className="pl-2 border-l border-slate-700 flex items-center gap-2">
           {isConnected ? <Wifi className="w-3 h-3 text-emerald-500" /> : <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
        </div>
      </div>

      {/* ✅ ORDER BUTTON */}
      <div className="absolute top-4 right-4 z-10">
         <button 
            onClick={() => setShowOrderPanel(!showOrderPanel)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs shadow-xl transition-all border ${showOrderPanel ? 'bg-amber-500 text-slate-900 border-amber-400' : 'bg-slate-800 text-white border-slate-600 hover:bg-slate-700'}`}
         >
            <Zap className="w-4 h-4 fill-current" /> TRADE
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

      {error && <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-20"><p className="bg-slate-900 px-4 py-2 rounded border border-rose-500 text-rose-400">{error}</p></div>}
      {loading && <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 backdrop-blur"><Loader2 className="w-3 h-3 animate-spin" /> Loading History...</div>}

      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

export default TradingChart;