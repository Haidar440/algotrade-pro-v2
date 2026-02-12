import React, { useMemo, useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine, ReferenceArea 
} from 'recharts';
import { AnalysisResult } from '../types';
import { Layers, Eye, EyeOff } from 'lucide-react';

interface InteractiveChartProps {
  data: AnalysisResult;
  livePrice: number;
}

const InteractiveChart: React.FC<InteractiveChartProps> = ({ data, livePrice }) => {
  const [showLevels, setShowLevels] = useState(true);

  // Generate synthetic chart data that respects the trend and levels
  // We backwards-calculate from the current livePrice to ensure the chart meets the current price dot
  const chartData = useMemo(() => {
    const points = [];
    const days = 30;
    const trendFactor = data.market_condition === 'UPTREND' ? 1.002 : data.market_condition === 'DOWNTREND' ? 0.998 : 1.0;
    const volatility = 0.015;
    
    // Use livePrice as the anchor for the most recent data point
    let currentSyntheticPrice = livePrice;
    
    // We generate points in reverse (today -> backwards) then reverse the array
    const reversePoints = [];
    
    // Add "Live" point first
    reversePoints.push({
      date: 'Live',
      price: livePrice
    });

    for (let i = 1; i <= days; i++) {
       const date = new Date();
       date.setDate(date.getDate() - i);
       
       // Reverse trend logic: if uptrend, price was lower before.
       // We add randomness.
       const change = currentSyntheticPrice * (Math.random() - 0.5) * 2 * volatility;
       
       // If uptrend, previous price = current / trendFactor
       const basePrice = currentSyntheticPrice / trendFactor;
       currentSyntheticPrice = basePrice - change;
       
       reversePoints.push({
         date: date.toISOString().split('T')[0].slice(5),
         price: currentSyntheticPrice
       });
    }

    return reversePoints.reverse();
  }, [data.market_condition, livePrice]);

  const rec = data.primary_recommendation;
  const isBuy = rec.signal === 'BUY';

  // Y-Axis Domain calculation
  const allValues = [
    ...chartData.map(d => d.price),
    rec.stop_loss || 0,
    rec.target_prices?.[0] || 0,
    rec.ideal_entry_range?.[0] || 0
  ].filter(v => v > 0);
  
  const minDomain = Math.min(...allValues) * 0.98;
  const maxDomain = Math.max(...allValues) * 1.02;

  return (
    <div className="glass-panel p-4 rounded-xl border border-slate-700 bg-slate-900/50">
       <div className="flex justify-between items-center mb-4">
         <h3 className="text-white font-bold flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" /> Price Action Analysis
         </h3>
         <button 
           onClick={() => setShowLevels(!showLevels)}
           className="text-xs flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors"
         >
           {showLevels ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
           {showLevels ? 'Hide Levels' : 'Show Levels'}
         </button>
       </div>

       <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
               <defs>
                 <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                   <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                   <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                 </linearGradient>
               </defs>
               <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
               <XAxis 
                 dataKey="date" 
                 stroke="#64748b" 
                 fontSize={10} 
                 tickMargin={10}
               />
               <YAxis 
                 stroke="#64748b" 
                 fontSize={10} 
                 domain={[minDomain, maxDomain]}
                 tickFormatter={(val) => `₹${val.toFixed(0)}`}
               />
               <Tooltip 
                 contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                 itemStyle={{ color: '#60a5fa' }}
                 formatter={(val: number) => [`₹${val.toFixed(2)}`, 'Price']}
               />
               
               <Area 
                 type="monotone" 
                 dataKey="price" 
                 stroke="#3b82f6" 
                 strokeWidth={2}
                 fillOpacity={1} 
                 fill="url(#colorPrice)" 
               />

               {/* Overlays */}
               {showLevels && rec.signal !== 'NO-TRADE' && (
                 <>
                    {/* Entry Zone */}
                    {rec.ideal_entry_range && (
                      <ReferenceArea 
                        y1={rec.ideal_entry_range[0]} 
                        y2={rec.ideal_entry_range[1]} 
                        strokeOpacity={0.3}
                        fill={isBuy ? "#10b981" : "#ef4444"}
                        fillOpacity={0.1}
                      />
                    )}
                    
                    {/* Stop Loss */}
                    {rec.stop_loss && (
                       <ReferenceLine 
                         y={rec.stop_loss} 
                         stroke="#ef4444" 
                         strokeDasharray="3 3"
                         label={{ position: 'right', value: 'SL', fill: '#ef4444', fontSize: 10 }} 
                       />
                    )}

                    {/* Targets */}
                    {rec.target_prices?.map((tp, idx) => (
                       <ReferenceLine 
                         key={idx}
                         y={tp} 
                         stroke="#10b981" 
                         strokeDasharray="3 3"
                         label={{ position: 'right', value: `TP${idx+1}`, fill: '#10b981', fontSize: 10 }} 
                       />
                    ))}
                 </>
               )}
            </AreaChart>
          </ResponsiveContainer>
       </div>
    </div>
  );
};

export default InteractiveChart;