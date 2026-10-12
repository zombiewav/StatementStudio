import React from 'react';
import { CounterpartyBalance } from '../lib/counterpartyBalances';

interface OfficerAdvanceSummaryProps {
  rows: CounterpartyBalance[];
  formatCurrency: (value: number) => string;
}

// "Summary of Advances per Accountable Officer" from the client's rules: what
// each officer was given, how much has been used, and what is still available.
export function OfficerAdvanceSummary({ rows, formatCurrency }: OfficerAdvanceSummaryProps): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-indigo-200 bg-white/70 text-[10px] dark:border-indigo-500/30 dark:bg-slate-900/40">
      <p className="px-3 py-2 font-black uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Summary of Advances per Accountable Officer</p>
      <div className="grid grid-cols-4 gap-2 border-t border-indigo-100 px-3 py-2 font-bold text-slate-500 dark:border-indigo-500/20">
        <span>Accountable Officer</span><span className="text-right">Total Cash Advance</span><span className="text-right">Amount Used</span><span className="text-right">Balance</span>
      </div>
      {rows.length === 0 && <p className="border-t border-indigo-100 px-3 py-2 font-medium text-slate-500 dark:border-indigo-500/20">No cash advance has been recorded yet.</p>}
      {rows.map(row => (
        <div key={row.name} className="grid grid-cols-4 gap-2 border-t border-indigo-100 px-3 py-2 dark:border-indigo-500/20">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{row.name}</span>
          <span className="text-right font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(row.debit)}</span>
          <span className="text-right font-semibold text-slate-700 dark:text-slate-200">{row.credit > 0 ? formatCurrency(row.credit) : '-'}</span>
          <span className="text-right font-black text-indigo-800 dark:text-indigo-200">{formatCurrency(row.balance)}</span>
        </div>
      ))}
      <p className="border-t border-indigo-100 px-3 py-2 font-medium text-slate-500 dark:border-indigo-500/20">Balances update every time a payment is made through an officer advance.</p>
    </div>
  );
}
