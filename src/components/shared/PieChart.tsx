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
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);

  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
  const size = 200;
  const chartId = id || 'chart';
  const center = size / 2;
  const outerRadius = 80;
  const innerRadius = 50; // Donut hole

  const slices = useMemo(() => {
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
            onMouseLeave={() => setHoveredSlice(null)}
          />
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none max-w-[80px]">
        {hoveredSlice !== null ? (
          <>
            <div className="text-white text-xs font-medium truncate">{slices[hoveredSlice].name}</div>
            <div className="text-zinc-400 text-xs">{slices[hoveredSlice].percentage}%</div>
          </>
        ) : title ? (
          <div className="text-zinc-400 text-xs font-medium whitespace-pre-line leading-tight">{title}</div>
        ) : null}
      </div>
    </div>
  );
}
