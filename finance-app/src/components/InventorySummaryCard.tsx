import React, { useMemo } from 'react';
import { Boxes, TrendingDown, TrendingUp } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { buildInventorySummary } from '../lib/transactionHistory';
import { buildMerchandiseBatchBalances } from '../lib/merchandiseSale';

export function InventorySummaryCard({ compact = false }: { compact?: boolean }): React.ReactElement {
  const { journalEntries, formatCurrency } = useFinance();
  const summary = useMemo(() => buildInventorySummary(journalEntries), [journalEntries]);
  const recentMovements = [...summary.movements].reverse().slice(0, compact ? 3 : 8);
  const acquisitionBatches = useMemo(() => buildMerchandiseBatchBalances(journalEntries, true).reverse().slice(0, compact ? 3 : 8), [journalEntries, compact]);

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"><Boxes className="h-4 w-4 text-indigo-700 dark:text-indigo-300" /> Inventory Summary</h3>
          <p className="mt-1 text-[10px] font-medium text-slate-600 dark:text-slate-400">Lifetime merchandise inventory balance. It carries forward across fiscal years until sold or otherwise released.</p>
        </div>
        <div className="rounded-xl bg-white px-4 py-2 text-right shadow-sm dark:bg-slate-900">
          <span className="block text-[9px] font-bold uppercase text-slate-400">Inventory on hand</span>
          <span className="text-lg font-black text-indigo-800 dark:text-indigo-200">{formatCurrency(summary.balance)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900/70"><span className="text-[9px] font-bold uppercase text-slate-400">Total inventory added</span><p className="mt-1 text-xs font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(summary.totalAdded)}</p></div>
        <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900/70"><span className="text-[9px] font-bold uppercase text-slate-400">Inventory released</span><p className="mt-1 text-xs font-black text-rose-700 dark:text-rose-300">{formatCurrency(summary.totalReleased)}</p></div>
        <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900/70"><span className="text-[9px] font-bold uppercase text-slate-400">Cost of sales recorded</span><p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-200">{formatCurrency(summary.costOfSales)}</p></div>
      </div>

      <div className="mt-4 border-t border-indigo-200 pt-3 dark:border-indigo-500/20">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent inventory movements</p>
        {recentMovements.length === 0 ? (
          <p className="mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">No merchandise inventory has been recorded yet.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {recentMovements.map(line => (
              <div key={`${line.entryId}-${line.debit}-${line.credit}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-[10px] dark:bg-slate-900/60">
                <span className="min-w-0"><span className="font-bold text-slate-800 dark:text-slate-200">{line.reference}</span><span className="ml-2 text-slate-500">{line.date} · {line.description}</span></span>
                <span className={`flex shrink-0 items-center gap-1 font-black ${line.movement === 'increase' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{line.movement === 'increase' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{line.movement === 'increase' ? '+' : '−'}{formatCurrency(Math.abs(line.debit - line.credit))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {acquisitionBatches.length > 0 && (
        <div className="mt-4 border-t border-indigo-200 pt-3 dark:border-indigo-500/20">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recorded purchase batches</p>
          <div className="mt-2 space-y-1.5">
            {acquisitionBatches.map(batch => (
              <div key={batch.entryId} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-white/70 px-3 py-2 text-[10px] dark:bg-slate-900/60">
                <span className="min-w-0"><span className="font-bold text-slate-800 dark:text-slate-200">{batch.item}</span><span className="ml-2 text-slate-500">{batch.reference} · {batch.date}</span></span>
                <span className="text-right font-bold text-slate-700 dark:text-slate-300">{batch.remainingQuantity} of {batch.purchasedQuantity} units · {formatCurrency(batch.acquisitionCost)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] font-medium text-slate-500 dark:text-slate-400">Unit balances will use these saved batches when the follow-up sales/history rules are finalized.</p>
        </div>
      )}
    </section>
  );
}
