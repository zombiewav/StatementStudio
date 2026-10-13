import React, { useEffect } from 'react';
import { ArrowRight, TrendingUp, Zap } from 'lucide-react';
import FeaturesSection from '../components/landing/FeaturesSection';
import AnalyticsSection from '../components/landing/AnalyticsSection';
import AboutSection from '../components/landing/AboutSection';
import { LogoMark } from '../components/LogoMark';

interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  // The landing page is always dark; make the page scrollbar and overscroll match it in light theme.
  useEffect(() => {
    document.documentElement.classList.add('landing-dark');
    return () => document.documentElement.classList.remove('landing-dark');
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-slate-950 text-slate-100 overflow-x-hidden relative">
      <div className="relative z-10">
        <div className="pr-4 sm:pr-6 lg:pr-8">

        {/* NAVBAR */}
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/70 border-b border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">

              {/* LOGO */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <LogoMark className="h-8 w-8 text-blue-400" />

                <span className="text-[17px] font-medium text-slate-100 tracking-tight">
                  StatementStudio
                </span>
              </div>

              {/* RIGHT SIDE */}
              <div className="ml-auto flex items-center gap-3">

                {/* NAV LINKS */}
                <div className="hidden md:flex items-center gap-8 mr-3">
                  <button
                    onClick={() => scrollToSection('features')}
                    className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
                  >
                    Features
                  </button>

                  <button
                    onClick={() => scrollToSection('analytics')}
                    className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
                  >
                    Analytics
                  </button>

                  <button
                    onClick={() => scrollToSection('about')}
                    className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
                  >
                    About
                  </button>
                </div>

                {/* CTA */}
                <button
                  onClick={onEnterApp}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="min-h-screen overflow-hidden relative flex items-center">

          {/* GRADIENT BACKGROUND */}
          <div className="absolute inset-0 z-0 bg-transparent" />

          {/* DARK OVERLAY */}
          <div className="absolute inset-0 bg-transparent z-[1]" />

          {/* CONTENT */}
          <div className="relative z-10 w-full pt-32 pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">

              <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">

                {/* LEFT SIDE */}
                <div className="space-y-8 hero-stagger">

                  <div>
                    <h1 className="font-display text-5xl lg:text-7xl text-slate-100 leading-[1.05] mb-6">
                      Modern Financial
                      <br />
                      Management for
                      <br />
                      <em className="text-blue-400">Institutions</em>
                    </h1>

                    <p className="text-lg text-slate-400 leading-relaxed max-w-lg">
                      Track transactions, manage ledgers, generate financial statements,
                      and monitor project budgets in one unified accounting workspace.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <button
                      onClick={onEnterApp}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:shadow-lg"
                    >
                      Get Started
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="pt-4">
                    <p className="text-sm text-slate-500">
                      Built for finance teams, universities, and organizations.
                    </p>
                  </div>
                </div>

                {/* RIGHT SIDE */}
                <div className="relative h-96 md:h-full hidden md:flex items-center justify-center">

                  <div className="relative w-full max-w-md h-96">

                    {/* MAIN CARD */}
                    <div className="absolute inset-0 rounded-2xl bg-slate-900 border border-slate-700/50 p-6 space-y-4">

                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-200">
                          General Ledger
                        </h3>

                        <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                      </div>

                      <div className="space-y-2">
                        {[
                          {
                            label: 'Cash',
                            value: '$142.5K',
                            change: '+12.5%',
                          },
                          {
                            label: 'Accounts Receivable',
                            value: '$89.2K',
                            change: '+8.3%',
                          },
                          {
                            label: 'Inventory',
                            value: '$56.8K',
                            change: '-2.1%',
                          },
                        ].map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs py-2 border-b border-slate-700/30"
                          >
                            <span className="text-slate-400">
                              {item.label}
                            </span>

                            <div className="flex items-center gap-3">
                              <span className="text-slate-200 font-semibold">
                                {item.value}
                              </span>

                              <span
                                className={
                                  item.change.startsWith('+')
                                    ? 'text-emerald-300'
                                    : 'text-rose-300'
                                }
                              >
                                {item.change}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* REVENUE CARD */}
                    <div className="absolute -top-8 -right-8 w-40 h-32 rounded-xl bg-slate-900 border border-slate-800 p-4 backdrop-blur-sm">

                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-blue-300">
                          Revenue
                        </span>

                        <TrendingUp className="w-4 h-4 text-emerald-300" />
                      </div>

                      <div className="text-lg font-bold text-white mb-3">
                        $428K
                      </div>

                      <div className="flex items-end gap-1 h-12">
                        {[40, 55, 35, 65, 45, 70].map((height, idx) => (
                          <div
                            key={idx}
                            className="flex-1 bg-blue-400 rounded-sm"
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* TRANSACTIONS CARD */}
                    <div className="absolute -bottom-6 -left-6 w-48 rounded-xl bg-slate-900 border border-slate-800 p-4 backdrop-blur-sm">

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-emerald-300 font-semibold mb-1">
                            Total Transactions
                          </p>

                          <p className="text-2xl font-bold text-white">
                            2,847
                          </p>
                        </div>

                        <Zap className="w-6 h-6 text-emerald-400" />
                      </div>
                    </div>

                    {/* ACCOUNT BALANCE */}
                    <div className="absolute -bottom-8 -right-4 w-40 rounded-lg bg-slate-900 border border-slate-800 p-3 backdrop-blur-sm">

                      <div className="space-y-2">
                        <p className="text-xs text-blue-300 font-semibold">
                          Account Balance
                        </p>

                        <p className="text-lg font-bold text-white">
                          $1.2M
                        </p>

                        <div className="w-full bg-slate-700/50 rounded-full h-1.5">
                          <div
                            className="bg-blue-400 h-1.5 rounded-full"
                            style={{ width: '72%' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* MOBILE PREVIEW */}
        <div className="md:hidden px-4 sm:px-6 pb-16">
          <div className="rounded-2xl bg-slate-900 border border-slate-700/50 shadow-2xl p-6 space-y-4">

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                General Ledger
              </h3>

              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            </div>

            <div className="space-y-2">
              {[
                {
                  label: 'Cash',
                  value: '$142.5K',
                  change: '+12.5%',
                },
                {
                  label: 'Accounts Receivable',
                  value: '$89.2K',
                  change: '+8.3%',
                },
                {
                  label: 'Inventory',
                  value: '$56.8K',
                  change: '-2.1%',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs py-2 border-b border-slate-700/30"
                >
                  <span className="text-slate-400">
                    {item.label}
                  </span>

                  <div className="flex items-center gap-3">
                    <span className="text-slate-200 font-semibold">
                      {item.value}
                    </span>

                    <span
                      className={
                        item.change.startsWith('+')
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                      }
                    >
                      {item.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* FEATURES */}
        <div className="bg-transparent">
          <FeaturesSection />
        </div>

        {/* ANALYTICS */}
        <div className="bg-transparent">
          <AnalyticsSection />
        </div>

        {/* ABOUT */}
        <div className="bg-transparent">
          <AboutSection />
        </div>

        </div>
      </div>
    </div>
  );
};