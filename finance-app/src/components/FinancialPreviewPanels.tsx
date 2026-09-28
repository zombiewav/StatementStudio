import React, { useMemo } from 'react';
import { Layers, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { Account, JournalLine } from '../types';
import { computeStatementImpact, projectJournalLineImpacts } from '../lib/journalEngine';

interface FinancialPreviewPanelsProps {
  lines: JournalLine[];
  fallbackDate?: string;
  accounts: Account[];
  accountBalances: Record<string, number>;
  formatCurrency: (amount: number) => string;
}

export function FinancialPreviewPanels({ lines, fallbackDate = '', accounts, accountBalances, formatCurrency }: FinancialPreviewPanelsProps): React.ReactElement {
  const projectedImpacts = useMemo(
    () => projectJournalLineImpacts(lines, accounts, accountBalances),
    [lines, accounts, accountBalances]
  );
  const { assetChange, netIncomeChange } = useMemo(
    () => computeStatementImpact(lines, accounts),
    [lines, accounts]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="border-b border-slate-200 pb-3 text-xs font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Journal Entry Preview</h3>
        <div className="space-y-4">
          <div className="flex justify-between px-2 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
            <span>Account &amp; Details</span><div className="flex w-28 justify-between gap-12"><span>Debit</span><span>Credit</span></div>
          </div>
          {lines.length === 0 ? (
            <div className="p-4 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">Enter the transaction details to preview its journal lines.</div>
          ) : lines.map((line, index) => {
            const account = accounts.find(candidate => candidate.code === line.accountCode);
            return (
              <div key={`${line.accountCode}-${line.date || fallbackDate}-${index}`} className={`grid grid-cols-[1fr_7rem] items-center gap-3 rounded-xl p-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 ${line.credit > 0 ? 'pl-6' : ''}`}>
                <div><p className="text-slate-900 dark:text-slate-100">{account?.name || line.accountCode}</p><p className="text-[9px] text-slate-500 dark:text-slate-400">Code: {line.accountCode} • Date: {line.date || fallbackDate || 'Not set'} • Normal: {account?.normalBalance}</p></div>
                <div className="grid grid-cols-2 gap-3 text-right"><span>{line.debit > 0 ? formatCurrency(line.debit) : '—'}</span><span>{line.credit > 0 ? formatCurrency(line.credit) : '—'}</span></div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 p-3.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
          <span>Equation Status</span><span className="flex items-center gap-1"><Scale className="h-3.5 w-3.5" />{lines.length > 0 ? 'Balanced Dr = Cr' : 'Waiting for transaction'}</span>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="border-b border-slate-200 pb-3 text-xs font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Projected Ledger Impact</h3>
        {projectedImpacts.length === 0 ? <p className="py-3 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">No ledger movement to preview yet.</p> : projectedImpacts.map(item => (
          <div key={item.accountCode} className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{item.account?.name || item.accountCode}</p><p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{item.debit > 0 ? `Debit ${formatCurrency(item.debit)}` : `Credit ${formatCurrency(item.credit)}`} • Balance {item.normalBalanceDelta >= 0 ? 'increases' : 'decreases'}</p></div><div className="text-right"><p className="text-[10px] font-semibold text-slate-400">Before {formatCurrency(item.before)}</p><p className={`text-xs font-bold ${item.normalBalanceDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>After {formatCurrency(item.after)}</p></div></div>
        ))}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="border-b border-slate-200 pb-3 text-xs font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Statement Impact Preview</h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Balance Sheet Impact</span><span className="flex items-center justify-center gap-1 text-xs font-bold text-blue-900 dark:text-blue-200"><Layers className="h-3.5 w-3.5" />{assetChange !== 0 ? `Assets: ${assetChange > 0 ? '+' : ''}${formatCurrency(assetChange)}` : 'No net Asset change'}</span></div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50 p-3 dark:border-orange-500/20 dark:bg-orange-500/10"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Income Statement Impact</span><span className={`flex items-center justify-center gap-1 text-xs font-bold ${netIncomeChange < 0 ? 'text-rose-600 dark:text-rose-400' : netIncomeChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{netIncomeChange < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}{netIncomeChange !== 0 ? `Net Income: ${netIncomeChange > 0 ? '+' : ''}${formatCurrency(netIncomeChange)}` : 'No net income change'}</span></div>
        </div>
      </div>
    </div>
  );
}
