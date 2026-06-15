import { useEffect, useState } from 'react';
import {
  TrendingUp,
  PieChart,
  Activity,
  Target,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface InsightCard {
  icon: React.ReactNode;
  title: string;
  metric: string;
  trend: string;
  trendUp: boolean;
  description: string;
}

const AnalyticsSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const insights: InsightCard[] = [
    {
      icon: <TrendingUp className="w-6 h-6 text-blue-400" />,
      title: 'Cash Flow Trend',
      metric: '$2.4M',
      trend: '+18.5%',
      trendUp: true,
      description: 'Last 30 days',
    },
    {
      icon: <PieChart className="w-6 h-6 text-emerald-400" />,
      title: 'Budget Efficiency',
      metric: '87%',
      trend: '+4.2%',
      trendUp: true,
      description: 'Against allocation',
    },
    {
      icon: <Activity className="w-6 h-6 text-violet-400" />,
      title: 'Operational Surplus',
      metric: '$347K',
      trend: '+12.8%',
      trendUp: true,
      description: 'Monthly surplus',
    },
    {
      icon: <Target className="w-6 h-6 text-orange-400" />,
      title: 'Active Projects',
      metric: '24',
      trend: '-2.1%',
      trendUp: false,
      description: 'On track',
    },
  ];

  const chartData = [
    { month: 'Jan', revenue: 42, expense: 28 },
    { month: 'Feb', revenue: 88, expense: 44 },
    { month: 'Mar', revenue: 65, expense: 63 },
    { month: 'Apr', revenue: 118, expense: 52 },
    { month: 'May', revenue: 97, expense: 81 },
    { month: 'Jun', revenue: 145, expense: 76 },
  ];

  const chartWidth = 640;
  const chartHeight = 320;
  const chartPadding = { top: 24, right: 28, bottom: 42, left: 44 };
  const maxValue = 150;
  const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const xStep = innerWidth / (chartData.length - 1);

  const getY = (value: number) =>
    chartPadding.top + innerHeight - (value / maxValue) * innerHeight;

  const revenuePoints = chartData.map((data, index) => ({
    x: chartPadding.left + index * xStep,
    y: getY(data.revenue),
    month: data.month,
    value: data.revenue,
  }));

  const expensePoints = chartData.map((data, index) => ({
    x: chartPadding.left + index * xStep,
    y: getY(data.expense),
    month: data.month,
    value: data.expense,
  }));

  const buildAngularPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) {
      return '';
    }

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    const cornerRadius = Math.min(xStep * 0.18, 14);
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let index = 1; index < points.length; index += 1) {
      const previousPoint = points[index - 1];
      const currentPoint = points[index];
      const dx = currentPoint.x - previousPoint.x;
      const dy = currentPoint.y - previousPoint.y;
      const segmentLength = Math.hypot(dx, dy) || 1;
      const offset = Math.min(cornerRadius, segmentLength / 3);

      const lineStartX =
        previousPoint.x + (dx / segmentLength) * (index === 1 ? 0 : offset);
      const lineStartY =
        previousPoint.y + (dy / segmentLength) * (index === 1 ? 0 : offset);
      const lineEndX =
        currentPoint.x - (dx / segmentLength) * (index === points.length - 1 ? 0 : offset);
      const lineEndY =
        currentPoint.y - (dy / segmentLength) * (index === points.length - 1 ? 0 : offset);

      if (index === 1) {
        path += ` L ${lineEndX} ${lineEndY}`;
      } else {
        path += ` L ${lineStartX} ${lineStartY}`;
        path += ` Q ${previousPoint.x} ${previousPoint.y} ${lineEndX} ${lineEndY}`;
      }

      if (index === points.length - 1) {
        path += ` L ${currentPoint.x} ${currentPoint.y}`;
      }
    }

    return path;
  };

  const revenuePath = buildAngularPath(revenuePoints);
  const expensePath = buildAngularPath(expensePoints);
  const revenueAreaPath = `${revenuePath} L ${
    revenuePoints[revenuePoints.length - 1].x
  } ${chartPadding.top + innerHeight} L ${revenuePoints[0].x} ${
    chartPadding.top + innerHeight
  } Z`;
  const yAxisLabels = [150, 112, 75, 38, 0];
  const hoveredPoint = hoveredIndex !== null ? chartData[hoveredIndex] : null;
  const hoveredX =
    hoveredIndex !== null ? chartPadding.left + hoveredIndex * xStep : null;

  return (
    <section
      id="analytics"
      className="py-28 px-6 bg-transparent"
    >
      <style>{`
        @keyframes floatDot {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes linePulse {
          from { stroke-dashoffset: 42; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block mb-4">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10">
              FINANCIAL ANALYTICS
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
            Real-time insights across your institution
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Track revenues, monitor expenditures, evaluate project performance,
            and visualize operational trends through intelligent financial
            analytics.
          </p>
        </div>

        {/* Analytics Layout */}
        <div
          className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          {/* Left Side - Large Dashboard Card */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm p-8 hover:border-blue-500/40 transition-all duration-300 hover:shadow-[0_0_40px_rgba(37,99,235,0.15)]">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    Revenue vs Expenses
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Last 6 months comparison
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-xs text-slate-400">Revenue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-xs text-slate-400">Expenses</span>
                  </div>
                </div>
              </div>

              {/* Chart Area */}
              <div className="relative mb-8">
                <div className="pointer-events-none absolute inset-x-12 top-8 h-24 rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
                <div className="pointer-events-none absolute bottom-6 right-16 h-24 w-40 rounded-full bg-orange-500/10 blur-3xl animate-pulse" />
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="relative h-72 w-full"
                  fill="none"
                  aria-label="Revenue and expenses line chart"
                >
                  <defs>
                    <filter id="revenueGlow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="expenseGlow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <linearGradient id="chartGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="revenueAreaFill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {yAxisLabels.map((label, index) => {
                    const y =
                      chartPadding.top +
                      (innerHeight / (yAxisLabels.length - 1)) * index;

                    return (
                      <g key={label}>
                        <line
                          x1={chartPadding.left}
                          y1={y}
                          x2={chartWidth - chartPadding.right}
                          y2={y}
                          stroke="#94a3b8"
                          strokeOpacity="0.12"
                          strokeWidth="1"
                        />
                        <text
                          x={chartPadding.left - 12}
                          y={y + 4}
                          textAnchor="end"
                          fill="#94a3b8"
                          fontSize="11"
                        >
                          {label}K
                        </text>
                      </g>
                    );
                  })}

                  {chartData.map((data, index) => (
                    <text
                      key={data.month}
                      x={chartPadding.left + index * xStep}
                      y={chartHeight - 10}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="11"
                    >
                      {data.month}
                    </text>
                  ))}

                  <path
                    d={revenueAreaPath}
                    fill="url(#revenueAreaFill)"
                    className={`transition-opacity duration-700 ${
                      isVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                  />

                  {hoveredX !== null && (
                    <line
                      x1={hoveredX}
                      y1={chartPadding.top}
                      x2={hoveredX}
                      y2={chartPadding.top + innerHeight}
                      stroke="#93c5fd"
                      strokeOpacity="0.45"
                      strokeWidth="1.5"
                      strokeDasharray="4 6"
                    />
                  )}

                  <path
                    d={expensePath}
                    stroke="#F97316"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#expenseGlow)"
                    className={`transition-opacity duration-700 ${
                      isVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                    pathLength="1"
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: isVisible ? 0 : 1,
                      transition:
                        'stroke-dashoffset 1.4s ease, opacity 0.7s ease',
                    }}
                  />
                  <path
                    d={revenuePath}
                    stroke="#3B82F6"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#revenueGlow)"
                    className={`transition-opacity duration-700 ${
                      isVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                    pathLength="1"
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: isVisible ? 0 : 1,
                      transition:
                        'stroke-dashoffset 1.4s ease 0.15s, opacity 0.7s ease',
                    }}
                  />
                  <path
                    d={revenuePath}
                    stroke="#93c5fd"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray="8 34"
                    filter="url(#revenueGlow)"
                    opacity={isVisible ? 0.95 : 0}
                    style={{
                      animation: 'linePulse 1.7s linear infinite',
                      transition: 'opacity 0.7s ease',
                    }}
                  />

                  {chartData.map((data, index) => (
                    <rect
                      key={`hover-${data.month}`}
                      x={chartPadding.left + index * xStep - xStep / 2}
                      y={chartPadding.top}
                      width={xStep}
                      height={innerHeight}
                      fill="transparent"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  ))}

                  {expensePoints.map((point, index) => (
                    <g
                      key={`expense-${point.month}`}
                      className="group"
                      style={{
                        opacity: isVisible ? 1 : 0,
                        transformOrigin: `${point.x}px ${point.y}px`,
                        animation: `floatDot 3.6s ease-in-out ${index * 0.18}s infinite`,
                        transition: `opacity 0.45s ease ${index * 120 + 350}ms`,
                      }}
                    >
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="9"
                        fill="#F97316"
                        fillOpacity="0.16"
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="5"
                        fill="#F97316"
                        filter="url(#expenseGlow)"
                        className="transition-all duration-300 group-hover:scale-125"
                        style={{
                          transformBox: 'fill-box',
                          transformOrigin: 'center',
                        }}
                      />
                    </g>
                  ))}

                  {revenuePoints.map((point, index) => (
                    <g
                      key={`revenue-${point.month}`}
                      className="group"
                      style={{
                        opacity: isVisible ? 1 : 0,
                        transformOrigin: `${point.x}px ${point.y}px`,
                        animation: `floatDot 3.6s ease-in-out ${index * 0.18 + 0.2}s infinite`,
                        transition: `opacity 0.45s ease ${index * 120 + 500}ms`,
                      }}
                    >
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="10"
                        fill="#3B82F6"
                        fillOpacity="0.18"
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="5"
                        fill="#3B82F6"
                        filter="url(#revenueGlow)"
                        className="transition-all duration-300 group-hover:scale-125"
                        style={{
                          transformBox: 'fill-box',
                          transformOrigin: 'center',
                        }}
                      />
                    </g>
                  ))}
                </svg>

                {hoveredPoint && hoveredX !== null && (
                  <div
                    className="pointer-events-none absolute z-20 rounded-2xl border border-blue-500/20 bg-slate-950/95 px-3 py-2 text-xs shadow-2xl shadow-blue-950/30 transition-all duration-200"
                    style={{
                      left: `clamp(1rem, calc(${((hoveredX / chartWidth) * 100).toFixed(
                        2
                      )}% - 3.5rem), calc(100% - 8.5rem))`,
                      top: '1rem',
                    }}
                  >
                    <p className="font-semibold text-white">{hoveredPoint.month}</p>
                    <p className="text-blue-300">Revenue: ${hoveredPoint.revenue}K</p>
                    <p className="text-orange-300">Expenses: ${hoveredPoint.expense}K</p>
                  </div>
                )}
              </div>

              {/* Analytics Badges */}
              <div className="flex flex-wrap gap-3 pt-6 border-t border-slate-800/50">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-blue-300">
                    Revenue Up 35%
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <ArrowUp className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-300">
                    Margins Healthy
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-300">
                    Cash Positive
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Insight Cards Stack */}
          <div className="space-y-4">
            {insights.map((insight, index) => (
              <div
                key={index}
                className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 hover:border-blue-500/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(37,99,235,0.1)]"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <p className="text-sm text-slate-400 mb-2">
                      {insight.title}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-white">
                        {insight.metric}
                      </p>
                      <div
                        className={`flex items-center gap-1 text-sm ${
                          insight.trendUp
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {insight.trendUp ? (
                          <ArrowUp className="w-4 h-4" />
                        ) : (
                          <ArrowDown className="w-4 h-4" />
                        )}
                        <span>{insight.trend}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-slate-600">{insight.icon}</div>
                </div>

                {/* Card Footer */}
                <p className="text-xs text-slate-500">
                  {insight.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AnalyticsSection;
