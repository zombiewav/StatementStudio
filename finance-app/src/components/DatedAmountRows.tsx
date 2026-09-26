import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export interface DatedAmountInputRow {
  id: string;
  date: string;
  amount: string;
}

interface DatedAmountRowsProps {
  label: string;
  rows: DatedAmountInputRow[];
  onChange: (rows: DatedAmountInputRow[]) => void;
  currencySymbol: string;
  defaultDate: string;
  maxTotal?: number;
  addLabel?: string;
  allowBlankDates?: boolean;
  allowEmptyAmounts?: boolean;
  blankDateHelp?: string;
}

const makeId = (): string => `amount-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function DatedAmountRows({ label, rows, onChange, currencySymbol, defaultDate, maxTotal, addLabel = 'Add another payment', allowBlankDates = false, allowEmptyAmounts = false, blankDateHelp }: DatedAmountRowsProps): React.ReactElement {
  const total = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), [rows]);
  const updateRow = (id: string, patch: Partial<DatedAmountInputRow>) => onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-bold text-indigo-900 dark:text-indigo-200">{label}</label>
        <span className="text-[10px] font-black text-indigo-800 dark:text-indigo-200">Total: {currencySymbol}{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      {rows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input type="date" value={row.date} onChange={event => updateRow(row.id, { date: event.target.value })} aria-label={`${label} date ${index + 1}`} className="min-w-0 rounded-lg border border-indigo-200 bg-white p-2.5 text-[10px] font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required={!allowBlankDates} />
          <div className="relative min-w-0"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-500">{currencySymbol}</span><input type="number" min="0" step="0.01" value={row.amount} onChange={event => updateRow(row.id, { amount: event.target.value })} aria-label={`${label} amount ${index + 1}`} placeholder="0.00" className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 pl-7 text-[10px] font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required={!allowEmptyAmounts} /></div>
          <button type="button" aria-label={`Remove ${label} row ${index + 1}`} disabled={rows.length === 1} onClick={() => onChange(rows.filter(candidate => candidate.id !== row.id))} className="rounded-lg border border-indigo-200 px-2 text-indigo-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-indigo-500/30"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {blankDateHelp && <p className="text-[9px] font-medium text-indigo-700 dark:text-indigo-300">{blankDateHelp}</p>}
      <button type="button" onClick={() => onChange([...rows, { id: makeId(), date: allowBlankDates ? '' : defaultDate, amount: '' }])} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-slate-900/50 dark:text-indigo-200"><Plus className="h-3 w-3" /> {addLabel}</button>
      {maxTotal !== undefined && total > maxTotal && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">Total cannot exceed {currencySymbol}{maxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.</p>}
    </div>
  );
}
