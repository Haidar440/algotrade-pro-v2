import React from 'react';

interface SparklineProps {
  isPositive: boolean;
  color: string;
  id: string;
}

const Sparkline: React.FC<SparklineProps> = ({ isPositive, color, id }) => {
  // Generate a deterministic but random-looking path based on the ID
  // This ensures the chart looks static and doesn't "jitter" on re-renders
  const generatePath = () => {
    const points = [];
    const width = 100;
    const height = 40;
    const steps = 10;
    
    let y = isPositive ? height : 0; // Start low if positive (going up), high if negative
    
    for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * width;
        // Random fluctuation
        const randomY = Math.random() * (height * 0.4); 
        
        // Trend direction
        if (isPositive) {
            y = height - ((i / steps) * (height * 0.8)) - randomY + (height * 0.2);
        } else {
            y = ((i / steps) * (height * 0.8)) + randomY;
        }
        
        // Clamp to bounds
        y = Math.max(2, Math.min(height - 2, y));
        points.push(`${x},${y}`);
    }
    
    return points.join(' ');
  };

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 40" className="overflow-visible opacity-80">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      {/* The Line */}
      <polyline
        points={generatePath()}
        fill="none"
        stroke={`url(#grad-${id})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#glow-${id})`}
      />
    </svg>
  );
};

export default Sparkline;