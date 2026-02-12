import React, { useEffect, useRef, memo } from 'react';

const TradingViewTicker: React.FC = () => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Cleanup
    if (container.current) {
        container.current.innerHTML = ""; 
    }

    // 2. Create Script
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.type = "text/javascript";

    // 3. CONFIGURATION: 'en' Locale + Indian Symbols
    script.innerHTML = JSON.stringify({
      "symbols": [
        { "proName": "BSE:SENSEX", "title": "Sensex" },
        { "proName": "BSE:RELIANCE", "title": "Reliance" },
        { "proName": "BSE:TCS", "title": "TCS" },
        { "proName": "BSE:INFY", "title": "Infosys" },
        { "proName": "BSE:SBIN", "title": "SBI" },
        { "proName": "BSE:HDFCBANK", "title": "HDFC Bank" },
        { "proName": "BSE:TATAMOTORS", "title": "Tata Motors" },
        { "proName": "FX_IDC:USDINR", "title": "USD/INR" },
        { "proName": "MCX:GOLD1!", "title": "Gold Futures" }
      ],
      "showSymbolLogo": true,
      "colorTheme": "dark",
      "isTransparent": false,
      "displayMode": "adaptive",
      "locale": "en" // ✅ KEY FIX: Forces Global site (Bypasses 'in.' block)
    });

    // 4. Append
    if (container.current) {
        container.current.appendChild(script);
        
        const copyright = document.createElement("div");
        copyright.style.fontSize = "10px";
        copyright.style.textAlign = "center";
        copyright.style.marginTop = "5px";
        copyright.innerHTML = `<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank" style="color: #94a3b8; text-decoration: none;">Track all markets on TradingView</a>`;
        container.current.appendChild(copyright);
    }
  }, []);

  return (
    <div className="w-full mb-6 z-10" style={{ minHeight: '78px' }}>
       <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-md">
          <div className="tradingview-widget-container" ref={container}>
             <div className="tradingview-widget-container__widget"></div>
          </div>
       </div>
    </div>
  );
};

export default memo(TradingViewTicker);