import React, { useMemo } from 'react';
import { 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  Tooltip as ReTooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend
} from 'recharts';
import { useFinance } from '../context/FinanceContext';

const COLORS = ['#1e3a8a', '#2563eb', '#f97316', '#10b981', '#a855f7', '#6b7280'];

export function Analytics(): React.ReactElement {
  const { journalEntries, accounts, projects, formatCurrency } = useFinance();

  // 1. Expense Breakdown (Pie Chart)
  const expenseBreakdownData = useMemo(() => {
    const categories: Record<string, number> = {};
    
    journalEntries.forEach(je => {
      je.lines.forEach(line => {
        const acc = accounts.find(a => a.code === line.accountCode);
        if (acc && acc.type === 'Expenses' && line.debit > 0) {
          categories[acc.name] = (categories[acc.name] || 0) + (line.debit - line.credit);
        }
      });
    });

    const list = Object.keys(categories).map(name => ({
      name,
      value: categories[name]
    })).filter(item => item.value > 0);

    if (list.length === 0) {
      return [{ name: 'No Expenses Recorded', value: 0 }];
    }
    return list;
  }, [journalEntries, accounts]);

  // 2. Program Profitability: Budget vs Actual Spending (Bar Chart)
  const programProfitabilityData = useMemo(() => {
    return projects.map(proj => {
      let expenses = 0;
      let revenue = 0;

      journalEntries.forEach(je => {
        if (je.project === proj.name) {
          je.lines.forEach(line => {
            const acc = accounts.find(a => a.code === line.accountCode);
            if (!acc) return;
            if (acc.type === 'Expenses') {
              expenses += (line.debit - line.credit);
            } else if (acc.type === 'Revenue') {
              revenue += (line.credit - line.debit);
            }
          });
        }
      });

      return {
        name: proj.name.length > 15 ? `${proj.name.slice(0, 15)}...` : proj.name,
        Budget: proj.budget,
        ActualSpending: expenses,
        Revenue: revenue
      };
    });
  }, [projects, journalEntries, accounts]);

  // 3. Margin Ratios
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalExpenses = 0;

    journalEntries.forEach(je => {
      je.lines.forEach(line => {
        const acc = accounts.find(a => a.code === line.accountCode);
        if (!acc) return;
        if (acc.type === 'Revenue') {
          totalRevenue += (line.credit - line.debit);
        } else if (acc.type === 'Expenses') {
          totalExpenses += (line.debit - line.credit);
        }
      });
    });

    const netSurplus = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netSurplus / totalRevenue) * 100 : 0;
    const expenseRatio = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalExpenses,
      netSurplus,
      profitMargin,
      expenseRatio
    };
  }, [journalEntries, accounts]);

  // Helper chart formatting
  const chartFormatter = (val: number) => {
    if (val >= 1000) return `${val / 1000}k`;
    return `${val}`;
  };

return (
    <div id="a1" className="space-y-6 bg-slate-50 dark:bg-slate-950">
      {/* Title */}
      <div>
        <h2 id="a2" className="text-xl font-bold text-slate-900 dark:text-slate-100">Financial Analytics</h2>
        <p id="a3" className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Visual intelligence tools for expenses tracking, activity margins, and efficiency metrics.</p>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div id="a4" className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Surplus Margin</span>
          <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{stats.profitMargin.toFixed(1)}%</h4>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold block mt-0.5">Net Surplus divided by Inflows</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Expense Ratio</span>
          <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{stats.expenseRatio.toFixed(1)}%</h4>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold block mt-0.5">Outflows as % of Inflows</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Operating Inflows</span>
          <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{formatCurrency(stats.totalRevenue)}</h4>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold block mt-0.5">Total funding & earnings</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">Operating Outflows</span>
          <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{formatCurrency(stats.totalExpenses)}</h4>
          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold block mt-0.5">Total cost of delivery</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Program Profitability Comparison */}
        <div id="a5" className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="mb-6">
            <h3 id="a6" className="text-sm font-bold text-slate-900 dark:text-slate-100">Program Profitability</h3>
            <p id="a7" className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Comparison of Allocated Budget, Billed Revenues, and Actual Cost per program</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={programProfitabilityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.35} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '9px', fill: 'currentColor', fontWeight: 600 }} tick={{ fill: 'currentColor' }} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={chartFormatter} style={{ fontSize: '9px', fill: 'currentColor', fontWeight: 600 }} tick={{ fill: 'currentColor' }} />
                <ReTooltip
                  formatter={(value) => [formatCurrency(Number(value)), '']}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const val = payload[0]?.value;
                    return (
                      <div
                        id="a8"
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        style={{ borderRadius: 12, padding: 8, fontSize: 11, fontWeight: 600 }}
                      >
                        <div className="font-bold" style={{ marginBottom: 4 }}>
                          {label}
                        </div>
                        <div>{formatCurrency(Number(val))}</div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 600, paddingTop: '10px', color: 'inherit' }} />
                <Bar dataKey="Budget" fill="#1e3a8a" radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Bar dataKey="ActualSpending" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={20} name="Actual Cost" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Category Breakdown */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Expense Breakdown</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Proportional allocation of total operational expenditures</p>
          </div>
          
          <div className="h-48 relative flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={expenseBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {expenseBreakdownData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip
                  formatter={(value) => [formatCurrency(Number(value)), 'Amount']}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const val = payload[0]?.value;
                    return (
                      <div
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        style={{ borderRadius: 12, padding: 8, fontSize: 11, fontWeight: 600 }}
                      >
                        <div className="font-bold" style={{ marginBottom: 4 }}>
                          {label}
                        </div>
                        <div>{formatCurrency(Number(val))}</div>
                      </div>
                    );
                  }}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Legends list */}
          <div className="mt-4 space-y-2.5 max-h-36 overflow-y-auto pr-1">
            {expenseBreakdownData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px] font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-slate-500 dark:text-slate-400 truncate max-w-[130px]">{item.name}</span>
                </div>
                <span className="text-slate-900 dark:text-slate-100 font-bold">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
