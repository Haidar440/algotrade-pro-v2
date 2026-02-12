import React, { useEffect, useRef } from 'react';
import Datafeed from '../services/tvDatafeed';
import { BrokerState } from '../types';

// This declares the global 'TradingView' variable that the script loads
declare global {
  interface Window { TradingView: any; }
}

interface Props {
  symbol: string;
  brokerState: BrokerState; // To ensure we have login
}

const TVChartContainer: React.FC<Props> = ({ symbol, brokerState }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!brokerState.angel?.jwtToken) return; // Wait for login

    // 1. Check if Library is Loaded
    // You MUST have <script src="/charting_library/charting_library.js"></script> in your index.html
    // OR dynamic load:
    const script = document.createElement('script');
    script.src = '/charting_library/charting_library.js';
    script.async = true;
    script.onload = initWidget;
    document.head.appendChild(script);

    function initWidget() {
        if (!window.TradingView) return;

        // 2. Configure Widget
        const widgetOptions = {
            symbol: symbol,
            datafeed: Datafeed, // Our custom adapter
            interval: '5',
            container: chartContainerRef.current,
            library_path: '/charting_library/',
            locale: 'en',
            disabled_features: ['use_localstorage_for_settings'],
            enabled_features: ['study_templates'],
            charts_storage_url: 'https://saveload.tradingview.com',
            charts_storage_api_version: '1.1',
            client_id: 'tradingview.com',
            user_id: 'public_user_id',
            fullscreen: false,
            autosize: true,
            theme: 'Dark',
        };

        // 3. Create Widget
        const tvWidget = new window.TradingView.widget(widgetOptions);
        widgetRef.current = tvWidget;

        tvWidget.onChartReady(() => {
            console.log("✅ TV Advanced Chart Ready");
        });
    }

    // Cleanup
    return () => {
        if (widgetRef.current) {
            widgetRef.current.remove();
            widgetRef.current = null;
        }
    };
  }, [symbol, brokerState]);

  if (!brokerState.angel?.jwtToken) {
      return <div className="p-10 text-center text-slate-500">Please Login to Angel One to load Advanced Charts.</div>;
  }

  return (
    <div 
        ref={chartContainerRef} 
        className="h-full w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden" 
        style={{ minHeight: '600px' }} // Give it explicit height
    />
  );
};

export default TVChartContainer;