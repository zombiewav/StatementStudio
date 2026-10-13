import React, { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeAccountBalances } from '../lib/accountTotals';
import { computeDirectClosingLines, excludeClosingEntries, findFiscalCloseBlockers } from '../lib/closingEntries';

// Client's closing design: one entry, no Income Summary. Every Revenue is debited and every
// Expense credited to zero; the balancing figure goes to Fund Balance (credit for a surplus,
// debit for a deficit).
export function ClosingEntriesDirect(): React.ReactElement {
  const { accounts, journalEntries, settings, closedFiscalYears, postDirectClosing, formatCurrency } = useFinance();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const record = closedFiscalYears.find(item => item.fiscalYear === settings.fiscalYear);
  // The entry is built from the pre-closing balances, so it never reads its own effect.
  const balances = useMemo(
    () => computeAccountBalances(excludeClosingEntries(journalEntries, closedFiscalYears).filter(entry => !entry.isDraft && entry.date <= date), accounts),
    [journalEntries, closedFiscalYears, accounts, date],
  );
  const { lines, netIncome, totalRevenue, totalExpenses } = useMemo(() => computeDirectClosingLines(balances, accounts), [balances, accounts]);
  const isDeficit = netIncome < 0;
  // The closing entry only appears once every Review item has been posted.
  const openReviewItems = useMemo(() => findFiscalCloseBlockers(journalEntries, accounts).length, [journalEntries, accounts]);
  const nameOf = (code: string) => accounts.find(account => account.code === code)?.name || code;
  const run = () => {
    try { postDirectClosing(settings.fiscalYear, date); setMessage('Closing entry posted successfully.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to post closing entry.'); }
  };
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl text-slate-900 dark:text-slate-100">Closing <em className="text-blue-700 dark:text-blue-400">Entries</em></h2>
        <p className="mt-1 text-xs text-slate-500">
          One entry closes all Revenues (debited) and Expenses (credited) to zero. The difference goes to Fund Balance: a credit when revenue is greater than expenses, a debit when expenses are greater than revenue.
        </p>
      </div>
      <div className="max-w-xs"><label className="text-xs font-bold">Closing date</label><input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></div>
      {message && <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">{message}</p>}
      {openReviewItems > 0 && !record?.completed ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          {openReviewItems} item{openReviewItems === 1 ? '' : 's'} in Review still need to be posted. The closing entry will appear here automatically once Review is complete.
        </p>
      ) : (
      <section className="rounded-xl border bg-white p-4 dark:bg-slate-900">
        <h3 className="font-bold">Closing entry for {settings.fiscalYear}</h3>
        {lines.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No Revenue or Expense balances remain to close.</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2.5">Account</th><th className="p-2.5 text-right">Debit</th><th className="p-2.5 text-right">Credit</th></tr></thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.accountCode}-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className={`p-2.5 ${line.credit > 0 ? 'pl-8' : ''} ${line.accountCode === '3010' ? 'font-bold' : ''}`}>{nameOf(line.accountCode)}</td>
                    <td className="p-2.5 text-right">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                    <td className="p-2.5 text-right">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">Total revenue {formatCurrency(totalRevenue)} · Total expenses {formatCurrency(totalExpenses)} · {isDeficit ? `Deficit ${formatCurrency(-netIncome)} (debit to Fund Balance)` : netIncome > 0 ? `Surplus ${formatCurrency(netIncome)} (credit to Fund Balance)` : 'Revenue equals expenses, so no Fund Balance line is needed'}</p>
        <button disabled={!!record?.completed || lines.length === 0} onClick={run} className="mt-4 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-center text-xs font-bold text-white disabled:opacity-40 sm:w-72">{record?.completed ? 'Closing Complete' : 'Post Closing Entry'}</button>
      </section>
      )}
      {record?.completed && <p className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> {settings.fiscalYear} is closed.</p>}
    </div>
  );
}
