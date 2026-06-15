import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Zap } from 'lucide-react';
import Aurora from '../ui/Aurora';

const AboutSection = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const highlights = [
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: 'Smart Financial Reporting',
      description: 'Automated financial statements with real-time data accuracy.',
    },
    {
      icon: <TrendingUp className="w-5 h-5" />,
      title: 'Real-Time Budget Monitoring',
      description: 'Track allocations, expenses, and project performance instantly.',
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: 'Institutional Grade Analytics',
      description: 'Enterprise-level financial intelligence for complex organizations.',
    },
  ];

  return (
    <section
      id="about"
      className="py-32 px-6 bg-transparent relative overflow-hidden"
    >
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-32 right-1/4 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      {/* Aurora Background */}
      <div className="absolute inset-0 pointer-events-none">
        <Aurora
          colorStops={['#1D4ED8', '#06B6D4', '#7C3AED']}
          blend={0.4}
          amplitude={0.9}
          speed={0.5}
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 gap-16 items-center transition-all duration-700 ${
            isVisible
              ? 'translate-y-0 opacity-100'
              : 'translate-y-8 opacity-0'
          }`}
        >
          {/* LEFT SIDE - Content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Built for Modern Financial Operations
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                StatementStudio helps institutions, universities, and
                organizations manage accounting workflows, monitor budgets,
                generate financial reports, and maintain transparent financial
                operations through one centralized platform.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-4 pt-4">
              {highlights.map((highlight, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-900/40 transition-all duration-300 cursor-default"
                >
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all duration-300 text-blue-400">
                      {highlight.icon}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1 group-hover:text-blue-300 transition-colors">
                      {highlight.title}
                    </h3>
                    <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                      {highlight.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE - Visual Panel */}
          <div className="relative h-96 lg:h-full min-h-96">
            {/* Main Dashboard Card */}
            <div
              className={`absolute inset-0 rounded-3xl bg-gradient-to-br from-slate-900/60 to-slate-950/60 border border-slate-800/60 backdrop-blur-sm p-6 shadow-2xl overflow-hidden transition-all duration-700 ${
                isVisible
                  ? 'scale-100 opacity-100'
                  : 'scale-95 opacity-0'
              }`}
              style={{
                animation: isVisible
                  ? 'float 6s ease-in-out infinite'
                  : 'none',
              }}
            >
              {/* Glow background */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
              </div>

              {/* Card Content */}
              <div className="relative z-10 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-700/50">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">
                      Financial Summary
                    </p>
                    <p className="text-sm text-slate-300 font-medium">
                      Last 30 Days
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  </div>
                </div>

                {/* Mini Chart */}
                <div className="h-20">
                  <div className="flex items-end justify-around h-full gap-1.5">
                    {[45, 52, 38, 68, 55, 72, 48].map((height, idx) => (
                      <div
                        key={idx}
                        className="flex-1 bg-gradient-to-t from-blue-500 to-cyan-400 rounded-t-sm hover:from-blue-400 hover:to-cyan-300 transition-all duration-300 opacity-80 hover:opacity-100"
                        style={{
                          height: `${height}%`,
                          animation: isVisible
                            ? `chartGrow 0.8s ease-out ${idx * 80}ms backwards`
                            : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl bg-slate-800/40 p-3 border border-slate-700/40">
                    <p className="text-xs text-slate-400 mb-1">Revenue</p>
                    <p className="text-lg font-bold text-cyan-300">$2.4M</p>
                  </div>
                  <div className="rounded-xl bg-slate-800/40 p-3 border border-slate-700/40">
                    <p className="text-xs text-slate-400 mb-1">Expenses</p>
                    <p className="text-lg font-bold text-orange-300">$860K</p>
                  </div>
                </div>

                {/* Activity Indicator */}
                <div className="rounded-xl bg-slate-800/40 p-3 border border-slate-700/40">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-400">Active Transactions</p>
                    <div className="flex gap-1">
                      {[1, 0.6, 0.3].map((opacity, idx) => (
                        <div
                          key={idx}
                          className="w-1.5 h-1.5 rounded-full bg-blue-400"
                          style={{
                            opacity,
                            animation: isVisible
                              ? `pulse 2s ease-in-out infinite`
                              : 'none',
                            animationDelay: `${idx * 200}ms`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white">247</p>
                </div>
              </div>
            </div>

            {/* Floating Corner Cards */}
            {/* Top Right */}
            <div
              className={`absolute -top-6 -right-6 w-48 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 backdrop-blur-sm p-4 shadow-xl transition-all duration-700 ${
                isVisible ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
              }`}
              style={{
                animation: isVisible
                  ? 'float 7s ease-in-out infinite'
                  : 'none',
                animationDelay: '0.2s',
              }}
            >
              <p className="text-xs text-blue-300 font-semibold mb-2">
                Annual Growth
              </p>
              <p className="text-2xl font-bold text-white">+34.2%</p>
              <p className="text-xs text-blue-300/60 mt-2">
                vs previous year
              </p>
            </div>

            {/* Bottom Left */}
            <div
              className={`absolute -bottom-4 -left-4 w-44 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 backdrop-blur-sm p-4 shadow-xl transition-all duration-700 ${
                isVisible ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
              }`}
              style={{
                animation: isVisible
                  ? 'float 8s ease-in-out infinite'
                  : 'none',
                animationDelay: '0.4s',
              }}
            >
              <p className="text-xs text-emerald-300 font-semibold mb-2">
                Cash Flow
              </p>
              <p className="text-xl font-bold text-white">$1.54M</p>
              <div className="w-full bg-slate-700/50 rounded-full h-1.5 mt-3">
                <div className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-1.5 rounded-full w-3/4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        @keyframes chartGrow {
          from {
            height: 0;
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </section>
  );
};

export default AboutSection;
