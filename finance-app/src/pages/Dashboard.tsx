import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { useFinance } from '../context/FinanceContext';
import { useTheme } from '../context/ThemeContext';
import { CASH_ACCOUNT_CODES } from '../lib/cashAccounts';

export function Dashboard(): React.ReactElement {
  const { theme } = useTheme();
  const {
    accounts,
    journalEntries,
    auditLogs,
    totals,
    netIncome,
    isBalanced,
    formatCurrency,
    settings,
  } = useFinance();

  const endingFundBalance = totals['Fund Balance'] + netIncome;
  const totalLiabilitiesAndFund = totals.Liabilities + endingFundBalance;

  const recentTransactions = useMemo(() => {
    return [...journalEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [journalEntries]);

  const revenueVsExpenseData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map((month) => ({ name: month, Revenue: 0, Expenses: 0 }));

    journalEntries.forEach((entry) => {
      const monthIdx = new Date(entry.date).getMonth();
      if (monthIdx >= 0 && monthIdx < 12) {
        entry.lines.forEach((line) => {
          const account = accounts.find((item) => item.code === line.accountCode);
          if (!account) return;

          if (account.type === 'Revenue') {
            data[monthIdx].Revenue += line.credit - line.debit;
          } else if (account.type === 'Expenses') {
            data[monthIdx].Expenses += line.debit - line.credit;
          }
        });
      }
    });

    return data.slice(0, 6);
  }, [journalEntries, accounts]);

  const cashFlowTrendData = useMemo(() => {
    const sorted = [...journalEntries].sort((a, b) => a.date.localeCompare(b.date));
    let runningCash = 0;

    const trend = sorted.map((entry) => {
      entry.lines.forEach((line) => {
        if (CASH_ACCOUNT_CODES.includes(line.accountCode)) {
          runningCash += line.debit - line.credit;
        }
      });

      return {
        date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Balance: runningCash,
      };
    });

    return trend.length === 0 ? [{ date: 'Start', Balance: 0 }] : trend;
  }, [journalEntries]);

  const currentRatio = useMemo(() => {
    const assets = totals.Assets || 0;
    const liabilities = totals.Liabilities || 0;
    if (liabilities === 0) return 'Healthy (No Liabilities)';
    return (assets / liabilities).toFixed(2);
  }, [totals]);

  const latestLogs = useMemo(() => auditLogs.slice(0, 4), [auditLogs]);

  const chartFormatter = (value: number) => (value >= 1000 ? `${value / 1000}k` : `${value}`);

  const isDark = theme === 'dark';
  const chartGrid = isDark ? '#334155' : '#e2e8f0';
  const chartAxis = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    borderRadius: '12px',
    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    color: isDark ? '#f8fafc' : '#0f172a',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Student Organization Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Real-time overview of your student organization's financial position and fund activity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="app-surface p-5 rounded-2xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">Welcome</p>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Welcome back, {settings?.organizationName || 'your organization'}
          </h3>
        </div>

        <div className="app-surface p-5 rounded-2xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">Institution / Student Organization</p>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {settings?.organizationName || 'Student Organization'}
          </h3>
        </div>

        <div className="app-surface p-5 rounded-2xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">Fiscal Year</p>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {settings?.fiscalYear || 'FY 2026'}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
        <div className="app-surface p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Total Assets</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-blue-950 dark:text-blue-100 truncate">{formatCurrency(totals.Assets)}</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" /> Cash, Receivables, Equipment
            </span>
          </div>
        </div>

        <div className="app-surface p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Total Liabilities</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{formatCurrency(totals.Liabilities)}</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex items-center gap-1 mt-1">
              Payables & Financial Obligations
            </span>
          </div>
        </div>

        <div className="app-surface p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Student Organization Income</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300 truncate">{formatCurrency(totals.Revenue)}</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex items-center gap-1 mt-1">
              Grants, Donations & Student Organization Funds
            </span>
          </div>
        </div>

        <div className="app-surface p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Student Organization Expenses</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-rose-600 dark:text-rose-300 truncate">{formatCurrency(totals.Expenses)}</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex items-center gap-1 mt-1">
              Program and Operational Expenses
            </span>
          </div>
        </div>

        <div className="app-surface p-5 rounded-2xl flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Net Income</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-blue-700 dark:text-blue-300" />
            </div>
          </div>
          <div>
            <h3 className={`text-lg font-bold truncate ${netIncome >= 0 ? 'text-blue-950 dark:text-blue-100' : 'text-rose-600 dark:text-rose-300'}`}>
              {formatCurrency(netIncome)}
            </h3>
            <span className={`text-[10px] font-semibold flex items-center gap-0.5 mt-1 ${netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-500 dark:text-rose-300'}`}>
              {netIncome >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {netIncome >= 0 ? 'Fund Surplus' : 'Fund Deficit'}
            </span>
          </div>
        </div>

        <div
          className={`p-5 rounded-2xl shadow-sm flex flex-col justify-between h-32 border transition-all ${
            isBalanced
              ? 'bg-blue-50/30 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/50 text-blue-950 dark:text-blue-100 hover:shadow-md'
              : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/50 text-rose-950 dark:text-rose-100'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Accounting Equation (A = L + FB)</span>
            <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center shadow-sm">
              {isBalanced ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500" />
              )}
            </div>
          </div>
          <div>
            <h3 className="text-base font-bold truncate">{isBalanced ? 'Balanced Records' : 'Records Require Review'}</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold block mt-1">
              {isBalanced ? 'Financial records are balanced' : `Difference: ${formatCurrency(Math.abs(totals.Assets - totalLiabilitiesAndFund))}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 app-surface p-6 rounded-3xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Student Organization Income vs Student Organization Expenses</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Comparison of monthly inflows and outflows</p>
            </div>
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 bg-blue-900 rounded-full" /> Student Organization Income
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 bg-orange-500 rounded-full" /> Student Organization Expenses
                </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueVsExpenseData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGrid} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '10px', fill: chartAxis, fontWeight: 600 }} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={chartFormatter} style={{ fontSize: '10px', fill: chartAxis, fontWeight: 600 }} />
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), '']} contentStyle={tooltipStyle} />
                <Bar dataKey="Revenue" fill="#1e3a8a" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Expenses" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 app-surface p-6 rounded-3xl">
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Fund Balance Trend</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Running balance of cash on hand over time</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGrid} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: '9px', fill: chartAxis, fontWeight: 600 }} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={chartFormatter} style={{ fontSize: '10px', fill: chartAxis, fontWeight: 600 }} />
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Cash Balance']} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="Balance" stroke="#1e3a8a" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCash)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 app-surface p-6 rounded-3xl flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Recent Journal Entries</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Latest transactions recorded in the books</p>
            </div>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left min-w-[500px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
                  <th className="pb-3">Ref</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3">Activity / Program</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentTransactions.map((entry) => {
                  const debitTotal = entry.lines.reduce((sum, line) => sum + line.debit, 0);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="py-2.5 font-bold text-blue-900 dark:text-blue-200">{entry.reference}</td>
                      <td className="py-2.5 text-slate-500 dark:text-slate-400">
                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 font-medium text-slate-800 dark:text-slate-100 max-w-[150px] truncate">{entry.description}</td>
                      <td className="py-2.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold text-[10px]">
                          {entry.project}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{formatCurrency(debitTotal)}</td>
                    </tr>
                  );
                })}
                {recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                      No recent financial activity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-6">
          <div className="app-surface p-5 rounded-3xl">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Student Organization Financial Health</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Current Fund Liquidity</span>
                <span className="text-xs font-bold text-blue-950 dark:text-blue-100 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg">
                  {currentRatio}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Fund Operating Margin</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg">
                  {totals.Revenue > 0 ? `${((netIncome / totals.Revenue) * 100).toFixed(0)}%` : '0%'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Income-to-Assets Ratio</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {totals.Assets > 0 ? (totals.Revenue / totals.Assets).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>

          <div className="app-surface p-5 rounded-3xl flex flex-col">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Recent Activity</h3>
            <div className="space-y-3.5 flex-1">
              {latestLogs.map((log) => (
                <div key={log.id} className="flex gap-3 text-xs leading-snug">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">{log.action}</span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{log.details}</p>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 block">
                      By {log.user} - {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {latestLogs.length === 0 && <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-4">No recent activity.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
