import React, { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeAccountBalances } from '../lib/accountTotals';
import { INCOME_SUMMARY_ACCOUNT_CODE } from '../lib/closingEntries';

export function ClosingEntries(): React.ReactElement {
  const { accounts, journalEntries, settings, closedFiscalYears, postClosingStage, formatCurrency } = useFinance();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const record = closedFiscalYears.find(item => item.fiscalYear === settings.fiscalYear);
  const balances = useMemo(() => computeAccountBalances(journalEntries.filter(entry => entry.date <= date), accounts), [journalEntries, accounts, date]);
  const revenue = accounts.filter(account => account.type === 'Revenue' && (balances[account.code] || 0) !== 0);
  const expenses = accounts.filter(account => account.type === 'Expenses' && (balances[account.code] || 0) !== 0);
  const run = (stage: 'revenue' | 'expense' | 'income-summary') => {
    try { postClosingStage(settings.fiscalYear, date, stage); setMessage('Closing entry posted successfully.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to post closing entry.'); }
  };
  const rows = (items: typeof revenue) => <div className="divide-y divide-slate-100 dark:divide-slate-800">{items.map(account => <div key={account.code} className="flex justify-between px-3 py-2 text-xs"><span>{account.name}</span><span className="font-bold">{formatCurrency(Math.abs(balances[account.code] || 0))}</span></div>)}</div>;
  return <div className="space-y-6"><div><h2 className="text-xl font-bold">Closing Entries</h2><p className="mt-1 text-xs text-slate-500">Complete all three steps before generating Financial Statements for {settings.fiscalYear}.</p></div><div className="max-w-xs"><label className="text-xs font-bold">Closing date</label><input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></div>{message && <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">{message}</p>}<section className="rounded-xl border bg-white p-4 dark:bg-slate-900"><h3 className="font-bold">1. Close Revenues to Income Summary</h3>{rows(revenue)}<button disabled={!!record?.revenueClosingEntryId} onClick={() => run('revenue')} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{record?.revenueClosingEntryId ? 'Completed' : 'Close Revenues to Income Summary'}</button></section><section className="rounded-xl border bg-white p-4 dark:bg-slate-900"><h3 className="font-bold">2. Close Expenses to Income Summary</h3>{rows(expenses)}<button disabled={!record?.revenueClosingEntryId || !!record?.expenseClosingEntryId} onClick={() => run('expense')} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{record?.expenseClosingEntryId ? 'Completed' : 'Close Expenses to Income Summary'}</button></section><section className="rounded-xl border bg-white p-4 dark:bg-slate-900"><h3 className="font-bold">3. Close Income Summary to Accumulated Net Surplus (Deficit)</h3><p className="mt-2 text-xs">Income Summary balance: <strong>{formatCurrency(balances[INCOME_SUMMARY_ACCOUNT_CODE] || 0)}</strong></p><button disabled={!record?.expenseClosingEntryId || !!record?.incomeSummaryClosingEntryId} onClick={() => run('income-summary')} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{record?.completed ? 'Closing Complete' : 'Close Income Summary'}</button></section>{record?.completed && <p className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Financial Statements are unlocked for {settings.fiscalYear}.</p>}</div>;
}
