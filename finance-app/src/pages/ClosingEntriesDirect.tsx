import React, { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeAccountBalances } from '../lib/accountTotals';
import { computeDirectClosingLines, findFiscalCloseBlockers } from '../lib/closingEntries';

// Client's closing design: one entry, no Income Summary.
export function ClosingEntriesDirect(): React.ReactElement {
  const { accounts, journalEntries, settings, closedFiscalYears, postDirectClosing, formatCurrency } = useFinance();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const record = closedFiscalYears.find(item => item.fiscalYear === settings.fiscalYear);
  const balances = useMemo(() => computeAccountBalances(journalEntries.filter(entry => !entry.isDraft && entry.date <= date), accounts), [journalEntries, accounts, date]);
  const { netIncome, totalRevenue, totalExpenses } = useMemo(() => computeDirectClosingLines(balances, accounts), [balances, accounts]);
  const revenue = accounts.filter(account => account.type === 'Revenue' && (balances[account.code] || 0) > 0);
  const expenses = accounts.filter(account => account.type === 'Expenses' && (balances[account.code] || 0) > 0);
  const isDeficit = netIncome < 0;
  // The closing entry only appears once every Review item has been posted.
  const openReviewItems = useMemo(() => findFiscalCloseBlockers(journalEntries, accounts).length, [journalEntries, accounts]);
  const run = () => {
    try { postDirectClosing(settings.fiscalYear, date); setMessage('Closing entry posted successfully.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to post closing entry.'); }
  };
  const rows = (items: typeof revenue) => <div className="divide-y divide-slate-100 dark:divide-slate-800">{items.map(account => <div key={account.code} className="flex justify-between px-3 py-2 text-xs"><span>{account.name}</span><span className="font-bold">{formatCurrency(balances[account.code] || 0)}</span></div>)}{items.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No balances.</p>}</div>;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl text-slate-900 dark:text-slate-100">Closing <em className="text-blue-700 dark:text-blue-400">Entries</em></h2>
        <p className="mt-1 text-xs text-slate-500">One entry closes all Revenues and Expenses into Accumulated Net {isDeficit ? 'Deficit' : 'Surplus'} for {settings.fiscalYear}.</p>
      </div>
      <div className="max-w-xs"><label className="text-xs font-bold">Closing date</label><input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></div>
      {message && <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">{message}</p>}
      {openReviewItems > 0 && !record?.completed ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          {openReviewItems} item{openReviewItems === 1 ? '' : 's'} in Review still need to be posted. The closing entry will appear here automatically once Review is complete.
        </p>
      ) : (
      <section className="rounded-xl border bg-white p-4 dark:bg-slate-900">
        {isDeficit && <div className="mb-3 flex justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 dark:bg-rose-500/10 dark:text-rose-300"><span>Accumulated Net Deficit (Expenses − Revenue)</span><span>{formatCurrency(-netIncome)}</span></div>}
        <h3 className="font-bold">Revenues</h3>
        {rows(revenue)}
        <h3 className="mt-4 font-bold">Expenses</h3>
        {rows(expenses)}
        {!isDeficit && <div className="mt-3 flex justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"><span>Accumulated Net Surplus (Revenue − Expenses)</span><span>{formatCurrency(netIncome)}</span></div>}
        <p className="mt-3 text-[11px] text-slate-500">Total revenue {formatCurrency(totalRevenue)} · Total expenses {formatCurrency(totalExpenses)}</p>
        <button disabled={!!record?.completed} onClick={run} className="mt-4 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-center text-xs font-bold text-white disabled:opacity-40 sm:w-72">{record?.completed ? 'Closing Complete' : 'Post Closing Entry'}</button>
      </section>
      )}
      {record?.completed && <p className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> {settings.fiscalYear} is closed.</p>}
    </div>
  );
}
