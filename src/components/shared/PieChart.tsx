import { useState, useMemo } from 'react';

interface PieChartData {
  name: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartData[];
  title?: string;
  id?: string;
}

export function PieChart({ data, title, id }: PieChartProps) {
  // Find the index of the largest slice
  const largestSliceIndex = useMemo(() => {
    if (data.length === 0) return null;
    let maxIndex = 0;
    let maxValue = data[0].value;
    data.forEach((item, index) => {
      if (item.value > maxValue) {
        maxValue = item.value;
        maxIndex = index;
      }
    });
    return maxIndex;
  }, [data]);

  const [hoveredSlice, setHoveredSlice] = useState<number | null>(largestSliceIndex);

  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
  const size = 200;
  const chartId = id || 'chart';
  const center = size / 2;
  const outerRadius = 80;
  const innerRadius = 50; // Donut hole

  const slices = useMemo(() => {
    // Special case: if only one item, draw full circle
    if (data.length === 1) {
      const item = data[0];
      // Draw a full donut circle using two semicircle arcs
      const pathData = [
        `M ${center} ${center - outerRadius}`, // Start at top of outer circle
        `A ${outerRadius} ${outerRadius} 0 0 1 ${center} ${center + outerRadius}`, // First semicircle
        `A ${outerRadius} ${outerRadius} 0 0 1 ${center} ${center - outerRadius}`, // Second semicircle
        `M ${center} ${center - innerRadius}`, // Move to top of inner circle
        `A ${innerRadius} ${innerRadius} 0 0 0 ${center} ${center + innerRadius}`, // First inner semicircle (reverse direction)
        `A ${innerRadius} ${innerRadius} 0 0 0 ${center} ${center - innerRadius}`, // Second inner semicircle (reverse direction)
        'Z'
      ].join(' ');

      return [{
        path: pathData,
        color: item.color,
        name: item.name,
        percentage: '100.0'
      }];
    }

    let currentAngle = -90; // Start from top

    return data.map((item) => {
      const percentage = (item.value / total) * 100;
      const angle = (item.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;

      currentAngle = endAngle;

      // Calculate slice path for donut
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1Outer = center + outerRadius * Math.cos(startRad);
      const y1Outer = center + outerRadius * Math.sin(startRad);
      const x2Outer = center + outerRadius * Math.cos(endRad);
      const y2Outer = center + outerRadius * Math.sin(endRad);

      const x1Inner = center + innerRadius * Math.cos(startRad);
      const y1Inner = center + innerRadius * Math.sin(startRad);
      const x2Inner = center + innerRadius * Math.cos(endRad);
      const y2Inner = center + innerRadius * Math.sin(endRad);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${x1Inner} ${y1Inner}`,
        `L ${x1Outer} ${y1Outer}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2Outer} ${y2Outer}`,
        `L ${x2Inner} ${y2Inner}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x1Inner} ${y1Inner}`,
        'Z'
      ].join(' ');

      return {
        path: pathData,
        color: item.color,
        name: item.name,
        percentage: percentage.toFixed(1)
      };
    });
  }, [data, total, center, outerRadius, innerRadius]);

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {slices.map((slice, index) => {
            // Use smaller gradient radius for tighter gradient effect
            const gradientRadius = outerRadius * 0.7;
            const innerOffset = (innerRadius / gradientRadius) * 100;
            return (
              <radialGradient
                key={index}
                id={`gradient-${chartId}-${index}`}
                cx={center}
                cy={center}
                r={gradientRadius}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#000000" stopOpacity="0.8" />
                <stop offset={`${innerOffset}%`} stopColor={slice.color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={slice.color} stopOpacity="1" />
              </radialGradient>
            );
          })}
          <filter id={`glow-${chartId}`}>
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {slices.map((slice, index) => (
          <path
            key={index}
            d={slice.path}
            fill={`url(#gradient-${chartId}-${index})`}
            stroke="rgba(24, 24, 27, 0.5)"
            strokeWidth="2"
            className="transition-all cursor-pointer"
            style={{
              filter: hoveredSlice === index ? `url(#glow-${chartId})` : 'none',
              opacity: hoveredSlice === index ? 1 : hoveredSlice !== null ? 0.6 : 1
            }}
            onMouseEnter={() => setHoveredSlice(index)}
            onMouseLeave={() => setHoveredSlice(largestSliceIndex)}
          />
        ))}
      </svg>
      {/* Center text - percentage inside circle */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
        {hoveredSlice !== null ? (
          <div className="text-white text-base font-bold transition-all duration-200 ease-out" style={{ animation: 'fadeInScale 0.2s ease-out' }}>
            {slices[hoveredSlice].percentage}%
            <style>{`
              @keyframes fadeInScale {
                from {
                  opacity: 0;
                  transform: scale(0.95);
                }
                to {
                  opacity: 1;
                  transform: scale(1);
                }
              }
            `}</style>
          </div>
        ) : title ? (
          <div className="text-zinc-400 text-xs font-medium whitespace-pre-line leading-tight max-w-[80px]">{title}</div>
        ) : null}
      </div>
      {/* Name below the chart */}
      {hoveredSlice !== null && (
        <div className="absolute left-1/2 transform -translate-x-1/2 text-center pointer-events-none w-full" style={{ top: `${size - 5}px`, animation: 'fadeInSlide 0.2s ease-out' }}>
          <div className="text-zinc-300 text-sm font-medium truncate px-2">{slices[hoveredSlice].name}</div>
          <style>{`
            @keyframes fadeInSlide {
              from {
                opacity: 0;
                transform: translateY(-4px) translateX(-50%);
              }
              to {
                opacity: 1;
                transform: translateY(0) translateX(-50%);
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
