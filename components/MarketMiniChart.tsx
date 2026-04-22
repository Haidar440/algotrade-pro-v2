import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    createChart,
    ColorType,
    IChartApi,
    AreaSeries,
    CandlestickSeries,
    Time,
} from 'lightweight-charts';
import { secureGet } from '../services/api';
import {
    BarChart3, Activity, Landmark, Banknote, Cpu,
    Loader2, ToggleLeft, ToggleRight, RefreshCw
} from 'lucide-react';

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

const INDEX_OPTIONS = [
    { key: 'nifty', label: 'NIFTY 50', icon: <Activity className="w-3.5 h-3.5" /> },
    { key: 'sensex', label: 'SENSEX', icon: <Landmark className="w-3.5 h-3.5" /> },
    { key: 'bankNifty', label: 'BANK NIFTY', icon: <Banknote className="w-3.5 h-3.5" /> },
    { key: 'niftyIT', label: 'NIFTY IT', icon: <Cpu className="w-3.5 h-3.5" /> },
];

const PERIOD_OPTIONS = [
    { value: '1d', label: '1D' },
    { value: '5d', label: '5D' },
    { value: '1mo', label: '1M' },
];

const MarketMiniChart: React.FC = () => {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartApi = useRef<IChartApi | null>(null);
    const seriesRef = useRef<any>(null);

    const [selectedIndex, setSelectedIndex] = useState('nifty');
    const [period, setPeriod] = useState('5d');
    const [chartType, setChartType] = useState<'area' | 'candle'>('area');
    const [loading, setLoading] = useState(true);
    const [candles, setCandles] = useState<Candle[]>([]);
    const [lastPrice, setLastPrice] = useState(0);
    const [priceChange, setPriceChange] = useState(0);

    const indexMeta = INDEX_OPTIONS.find(o => o.key === selectedIndex) || INDEX_OPTIONS[0];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const interval = period === '1mo' ? '1h' : '5m';
            const data = await secureGet(`/ai/market/chart?index=${selectedIndex}&period=${period}&interval=${interval}`);
            if (Array.isArray(data) && data.length > 0) {
                setCandles(data);
                const last = data[data.length - 1];
                const first = data[0];
                setLastPrice(last.close);
                if (first.open > 0) {
                    setPriceChange(((last.close - first.open) / first.open) * 100);
                }
            }
        } catch {
            // silent fail
        } finally {
            setLoading(false);
        }
    }, [selectedIndex, period]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Create & update chart
    useEffect(() => {
        if (!chartRef.current || candles.length === 0) return;

        // Destroy old chart
        if (chartApi.current) {
            chartApi.current.remove();
            chartApi.current = null;
            seriesRef.current = null;
        }

        const container = chartRef.current;
        const isUp = priceChange >= 0;
        const lineColor = isUp ? '#10b981' : '#f43f5e';
        const areaTopColor = isUp ? 'rgba(16,185,129,0.28)' : 'rgba(244,63,94,0.28)';
        const areaBottomColor = isUp ? 'rgba(16,185,129,0.02)' : 'rgba(244,63,94,0.02)';

        const chart = createChart(container, {
            width: container.clientWidth,
            height: 220,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#64748b',
                fontSize: 10,
            },
            grid: {
                vertLines: { color: 'rgba(51, 65, 85, 0.15)' },
                horzLines: { color: 'rgba(51, 65, 85, 0.15)' },
            },
            timeScale: {
                borderColor: 'rgba(51, 65, 85, 0.3)',
                timeVisible: true,
                rightOffset: 3,
            },
            rightPriceScale: {
                borderColor: 'rgba(51, 65, 85, 0.3)',
            },
            crosshair: {
                vertLine: { color: 'rgba(148,163,184,0.3)', width: 1, style: 2 },
                horzLine: { color: 'rgba(148,163,184,0.3)', width: 1, style: 2 },
            },
            handleScroll: { mouseWheel: false, pressedMouseMove: true },
            handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
        });

        chartApi.current = chart;

        const chartData = candles.map(c => ({
            time: c.time as Time,
            ...(chartType === 'area'
                ? { value: c.close }
                : { open: c.open, high: c.high, low: c.low, close: c.close }),
        }));

        if (chartType === 'area') {
            const series = chart.addSeries(AreaSeries, {
                lineColor,
                topColor: areaTopColor,
                bottomColor: areaBottomColor,
                lineWidth: 2,
                priceFormat: { type: 'price', minMove: 0.01, precision: 2 },
            });
            series.setData(chartData as any);
            seriesRef.current = series;
        } else {
            const series = chart.addSeries(CandlestickSeries, {
                upColor: '#10b981',
                downColor: '#f43f5e',
                borderUpColor: '#10b981',
                borderDownColor: '#f43f5e',
                wickUpColor: '#10b981',
                wickDownColor: '#f43f5e',
                priceFormat: { type: 'price', minMove: 0.01, precision: 2 },
            });
            series.setData(chartData as any);
            seriesRef.current = series;
        }

        chart.timeScale().fitContent();

        // Resize observer
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                chart.applyOptions({ width: entry.contentRect.width });
            }
        });
        ro.observe(container);

        return () => {
            ro.disconnect();
            chart.remove();
            chartApi.current = null;
            seriesRef.current = null;
        };
    }, [candles, chartType, priceChange]);

    const isUp = priceChange >= 0;

    return (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 backdrop-blur-sm overflow-hidden">
            {/* Chart Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-3">
                    {/* Index Selector */}
                    <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-0.5">
                        {INDEX_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setSelectedIndex(opt.key)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${selectedIndex === opt.key
                                        ? 'bg-slate-700 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                {opt.icon}
                                <span className="hidden sm:inline">{opt.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Period Selector */}
                    <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-lg p-0.5">
                        {PERIOD_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setPeriod(opt.value)}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${period === opt.value
                                        ? 'bg-slate-700 text-white'
                                        : 'text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Chart Type Toggle */}
                    <button
                        onClick={() => setChartType(t => t === 'area' ? 'candle' : 'area')}
                        className="p-1.5 rounded-lg bg-slate-800/60 text-slate-500 hover:text-white transition-all"
                        title={chartType === 'area' ? 'Switch to candlestick' : 'Switch to area'}
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={fetchData}
                        className="p-1.5 rounded-lg bg-slate-800/60 text-slate-500 hover:text-white transition-all"
                        title="Refresh chart"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Price Display */}
            <div className="px-4 pb-2 flex items-baseline gap-3">
                <span className="text-2xl font-bold text-white font-mono tracking-tight">
                    {lastPrice > 0 ? lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                </span>
                {candles.length > 0 && (
                    <span className={`text-sm font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                    </span>
                )}
                <span className="text-[10px] text-slate-600 ml-auto">
                    {candles.length} candles · {period === '1mo' ? '1H' : '5M'} interval
                </span>
            </div>

            {/* Chart Container */}
            <div className="relative" style={{ minHeight: 220 }}>
                {loading && candles.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
                        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                    </div>
                )}
                <div ref={chartRef} className="w-full" />
            </div>
        </div>
    );
};

export default MarketMiniChart;
