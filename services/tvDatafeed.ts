import { AngelOne } from './angel';
import { streamer } from './streaming';
import { INDIAN_STOCKS } from './stockData'; // Use your static list for search

// Configuration for the Datafeed
const configurationData = {
    supported_resolutions: ["1", "5", "15", "30", "60", "D", "W", "M"],
    exchanges: [{ value: 'NSE', name: 'NSE', desc: 'National Stock Exchange' }],
    symbols_types: [{ name: 'All', value: 'stock' }],
};

// Helper to access Broker State (API Keys)
const getAngelClient = () => {
    const savedState = localStorage.getItem('algoTradePro_brokerState');
    const brokerState = savedState ? JSON.parse(savedState) : {};
    if (!brokerState.angel?.jwtToken) return null;
    return new AngelOne(brokerState.angel);
};

export default {
    // 1. On Ready
    onReady: (callback: any) => {
        setTimeout(() => callback(configurationData), 0);
    },

    // 2. Search Symbols (Uses your local list to save API calls)
    searchSymbols: async (userInput: string, exchange: string, symbolType: string, onResultReadyCallback: any) => {
        const query = userInput.toLowerCase();
        const results = INDIAN_STOCKS
            .filter(stock => 
                stock.symbol.toLowerCase().includes(query) || 
                stock.name.toLowerCase().includes(query)
            )
            .map(stock => ({
                symbol: stock.symbol,
                full_name: stock.symbol,
                description: stock.name,
                exchange: 'NSE',
                ticker: stock.symbol,
                type: 'stock',
            }));
        onResultReadyCallback(results);
    },

    // 3. Resolve Symbol (Get details like Token, Min Movement, etc.)
    resolveSymbol: async (symbolName: string, onSymbolResolvedCallback: any, onResolveErrorCallback: any) => {
        const angel = getAngelClient();
        if (!angel) return onResolveErrorCallback("Login Required");

        try {
            // We need the token to fetch data later. We'll store it in the symbol info.
            const token = await angel.searchSymbolToken(symbolName);
            if (!token) throw new Error("Token not found");

            const symbolInfo = {
                ticker: symbolName,
                name: symbolName,
                description: symbolName,
                type: 'stock',
                session: '0915-1530',
                timezone: 'Asia/Kolkata',
                exchange: 'NSE',
                minmov: 5,  // 0.05 price steps
                pricescale: 100,
                has_intraday: true,
                has_no_volume: false,
                has_weekly_and_monthly: true,
                supported_resolutions: configurationData.supported_resolutions,
                volume_precision: 2,
                data_status: 'streaming',
                // Custom field to pass Angel One Token around
                token: token 
            };

            onSymbolResolvedCallback(symbolInfo);
        } catch (err) {
            onResolveErrorCallback("Symbol not found");
        }
    },

    // 4. Get Historical Data (Bars)
    getBars: async (symbolInfo: any, resolution: string, periodParams: any, onHistoryCallback: any, onErrorCallback: any) => {
        const angel = getAngelClient();
        if (!angel || !symbolInfo.token) return onErrorCallback("API Error");

        const { from, to, firstDataRequest } = periodParams;
        
        // Map TV resolution to Angel Resolution
        const intervalMap: any = {
            "1": "ONE_MINUTE", "5": "FIVE_MINUTE", "15": "FIFTEEN_MINUTE", 
            "30": "THIRTY_MINUTE", "60": "ONE_HOUR", "D": "ONE_DAY"
        };
        const angelInterval = intervalMap[resolution] || "ONE_DAY";

        // Convert timestamps to format YYYY-MM-DD HH:mm
        const formatDate = (ts: number) => {
            const date = new Date(ts * 1000);
            return date.getFullYear() + '-' + 
                   String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(date.getDate()).padStart(2, '0') + ' ' + 
                   String(date.getHours()).padStart(2, '0') + ':' + 
                   String(date.getMinutes()).padStart(2, '0');
        };

        try {
            console.log(`📡 TV Fetch: ${symbolInfo.name} (${resolution})`);
            const history = await angel.getHistoricalData(
                symbolInfo.token, // Use token we saved in resolveSymbol
                angelInterval,
                // Passing raw dates isn't enough for Angel sometimes, but let's try standard range
                100, // Limit doesn't matter much if using date range in backend proxy
                formatDate(from),
                formatDate(to)
            );

            if (!history || history.length === 0) {
                onHistoryCallback([], { noData: true });
                return;
            }

            // Convert Angel format to TV format
            const bars = history.map((bar: any) => ({
                time: new Date(bar.date).getTime(), // Ensure milliseconds
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume
            }));

            onHistoryCallback(bars, { noData: false });

        } catch (err) {
            console.error(err);
            onErrorCallback("Network Error");
        }
    },

    // 5. Subscribe to Live Ticks
    subscribeBars: (symbolInfo: any, resolution: string, onRealtimeCallback: any, subscriberUID: string, onResetCacheNeededCallback: any) => {
        if (!symbolInfo.token) return;

        console.log(`🔌 TV Subscribe: ${symbolInfo.name} [${symbolInfo.token}]`);
        
        // Use your existing Streamer service
        streamer.subscribe(symbolInfo.token, (price) => {
             // Create a "Bar" update (TradingView builds the candle itself from these ticks)
             onRealtimeCallback({
                 time: Date.now(), // TV handles aligning this to the candle open time
                 open: price, // TV updates OHLC automatically if we send just one price? 
                              // Actually TV expects a full bar object or just a price update.
                              // Usually for advanced lib, we send the last known bar updated.
                 high: price,
                 low: price,
                 close: price,
                 volume: 0 // We don't have live volume usually
             });
        });
    },

    // 6. Unsubscribe
    unsubscribeBars: (subscriberUID: string) => {
        // We can't easily unsubscribe from streamer here without the token, 
        // but it's fine since streamer handles multi-subscribers.
        console.log("Unsubscribe", subscriberUID);
    }
};  