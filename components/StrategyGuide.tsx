import React from 'react';
import { BookOpen, TrendingUp, BarChart2, Target, Zap, Activity, BoxSelect, GitMerge, Waves, GitCompare, Disc, BarChart4, Move } from 'lucide-react';

const StrategyGuide: React.FC = () => {
  const strategies = [
    {
      title: "VCP (Volatility Contraction)",
      icon: <Target className="w-6 h-6 text-purple-400" />,
      desc: "A powerful setup popularized by Mark Minervini. It identifies stocks where volatility is drying up before an explosive move.",
      rules: [
        "Range contracts over 3 swings (e.g., 20% -> 10% -> 5%).",
        "Volume decreases as price tightens (supply drying up).",
        "Stock is in an uptrend (Price > 50 EMA).",
        "Buy point is the breakout from the tightest pivot."
      ],
      color: "border-purple-500/20 bg-purple-500/5"
    },
    {
      title: "Trend Following (ADX)",
      icon: <Activity className="w-6 h-6 text-cyan-400" />,
      desc: "Uses the Average Directional Index (ADX) to find the strongest trending stocks in the market.",
      rules: [
        "ADX must be > 25 (Strong Trend).",
        "Price > 50 SMA (Long term uptrend).",
        "9 EMA > 20 EMA (Short term momentum).",
        "RSI between 50-70 (Bullish but not overbought)."
      ],
      color: "border-cyan-500/20 bg-cyan-500/5"
    },
    {
      title: "Golden Cross",
      icon: <GitCompare className="w-6 h-6 text-yellow-400" />,
      desc: "The classic long-term bullish signal indicating a major shift in market sentiment.",
      rules: [
        "50 EMA crosses ABOVE the 200 SMA.",
        "Price is trading above the 20 EMA.",
        "Often marks the start of a multi-month bull run.",
        "Stop Loss placed below the 200 SMA."
      ],
      color: "border-yellow-500/20 bg-yellow-500/5"
    },
    {
      title: "20-Day Breakout",
      icon: <BoxSelect className="w-6 h-6 text-orange-400" />,
      desc: "Momentum strategy catching stocks hitting new short-term highs.",
      rules: [
        "Price breaks above the highest high of the last 20 days.",
        "Volume is > 1.5x the 20-day average (Confirmation).",
        "Candle closes near the top of its range.",
        "Classic 'Donchian Channel' breakout logic."
      ],
      color: "border-orange-500/20 bg-orange-500/5"
    },
    {
      title: "VWAP Reversion",
      icon: <Waves className="w-6 h-6 text-indigo-400" />,
      desc: "Institutions use VWAP (Volume Weighted Average Price) as a benchmark. We trade the bounce.",
      rules: [
        "Stock is in an Uptrend.",
        "Price dips down to touch or near the VWAP line.",
        "Price bounces off VWAP with a green candle.",
        "Low risk entry: Stop loss just below VWAP."
      ],
      color: "border-indigo-500/20 bg-indigo-500/5"
    },
    {
      title: "RSI Divergence",
      icon: <GitMerge className="w-6 h-6 text-pink-400" />,
      desc: "Detects hidden reversals where momentum contradicts price action.",
      rules: [
        "Bullish Divergence: Price makes a Lower Low.",
        "But RSI makes a Higher Low (Momentum shifting).",
        "RSI should be in the 30-50 zone.",
        "High probability reversal setup."
      ],
      color: "border-pink-500/20 bg-pink-500/5"
    },
    {
      title: "Bollinger Squeeze",
      icon: <Disc className="w-6 h-6 text-rose-400" />,
      desc: "Volatility compression setup. When bands tighten, a big move is imminent.",
      rules: [
        "Bollinger Bandwidth narrows to < 10%.",
        "Price consolidates sideways.",
        "Buy when Price closes ABOVE the Upper Band.",
        "Stop loss at the Middle Band (20 SMA)."
      ],
      color: "border-rose-500/20 bg-rose-500/5"
    },
    {
      title: "Volume Spread Analysis (VPA)",
      icon: <BarChart4 className="w-6 h-6 text-blue-400" />,
      desc: "Follows the 'Smart Money'. Large candles with huge volume mean institutions are active.",
      rules: [
        "Volume > 2x Average Volume.",
        "Candle Spread (High - Low) is wide.",
        "Close is near the High (Bullish effort).",
        "Ideally occurs after a consolidation phase."
      ],
      color: "border-blue-500/20 bg-blue-500/5"
    },
    {
      title: "50 EMA Pullback",
      icon: <TrendingUp className="w-6 h-6 text-emerald-400" />,
      desc: "Buying the dip in a verified uptrend.",
      rules: [
        "Stock is in a clear Uptrend (Price > 200 EMA).",
        "Price pulls back gently to the 50 EMA line.",
        "Price respects the line (does not close significantly below).",
        "Enter on a green reversal candle."
      ],
      color: "border-emerald-500/20 bg-emerald-500/5"
    },
    {
      title: "Inside Bar Breakout",
      icon: <Zap className="w-6 h-6 text-amber-400" />,
      desc: "Price Action setup indicating a pause in momentum, followed by continuation.",
      rules: [
        "Mother Bar: Large range candle.",
        "Inside Bar: Completely contained within Mother Bar's range.",
        "Buy when price breaks the High of the Mother Bar.",
        "Explosive momentum move expected."
      ],
      color: "border-amber-500/20 bg-amber-500/5"
    },
    {
      title: "MA Trend Ride",
      icon: <Move className="w-6 h-6 text-teal-400" />,
      desc: "For super-momentum stocks that 'surf' the short-term averages.",
      rules: [
        "Price > 9 EMA > 20 EMA > 50 EMA (Perfect Alignment).",
        "Stock never closes below the 20 EMA.",
        "Strategy: Buy and hold until a candle closes below 20 EMA.",
        "Captures the 'meat' of a runaway trend."
      ],
      color: "border-teal-500/20 bg-teal-500/5"
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold text-white mb-4">Algo Trading Strategies</h1>
        <p className="text-slate-400 text-lg">
          Our engine runs these <span className="text-emerald-400 font-bold">11 Professional Strategies</span> on every stock in real-time.
          Green signals in the scanner indicate that all rules for a strategy have been met.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {strategies.map((strat, idx) => (
          <div key={idx} className={`glass-panel p-6 rounded-xl border ${strat.color} hover:scale-[1.01] transition-transform`}>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-700">
                {strat.icon}
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">{strat.title}</h3>
            </div>
            <p className="text-slate-300 mb-6 leading-relaxed text-sm min-h-[60px]">
              {strat.desc}
            </p>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Key Rules</h4>
              <ul className="space-y-2">
                {strat.rules.map((rule, rIdx) => (
                  <li key={rIdx} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-600 shrink-0"></span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrategyGuide;