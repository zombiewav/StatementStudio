import React, { useEffect, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { CashAdjustment, checkBankAndEwallet } from '../lib/otherAdjustments';

interface CashAdjustmentSectionProps {
  cash: CashAdjustment;
  onSave: (bankAndEwallet: number) => void;
}

// The answer only records where the cash is held: it never changes the Cash balance or posts a transaction.
export function CashAdjustmentSection({ cash, onSave }: CashAdjustmentSectionProps): React.ReactElement {
  const { formatCurrency, settings } = useFinance();
  const [input, setInput] = useState(cash.declared !== undefined ? String(cash.declared) : '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Switching semester shows that semester's saved answer.
  useEffect(() => { setInput(cash.declared !== undefined ? String(cash.declared) : ''); setSaved(false); }, [settings.semester, settings.reportingYear]);

  const live = input.trim() === '' ? NaN : Number(input);
  const remaining = Number.isFinite(live) && live >= 0 && live <= cash.balance + 0.005 ? Math.round((cash.balance - live) * 100) / 100 : undefined;

  const save = () => {
    const problem = checkBankAndEwallet(cash.balance, input, formatCurrency);
    setError(problem);
    if (problem) { setSaved(false); return; }
    onSave(Math.round(Number(input) * 100) / 100);
    setSaved(true);
  };

  return <div className="space-y-3">
    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">This helps identify where your recorded cash is held. Your answer does not change the Cash balance or create a transaction.</p>
    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Balance of Cash: <span aria-label="Balance of Cash">{formatCurrency(cash.balance)}</span></p>
    {!cash.required
      ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[13px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">The organization has no cash balance, so there is nothing to answer.</p>
      : <>
        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300">How much of this amount is held in bank accounts and/or e-wallets?
          <input type="number" min="0" step="0.01" max={cash.balance} aria-label="Held in bank accounts and e-wallets" value={input} onChange={event => { setInput(event.target.value); setSaved(false); }} placeholder={`0.00, up to ${formatCurrency(cash.balance)}`} className="mt-1.5 w-full max-w-sm rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-800" />
        </label>
        {remaining !== undefined && <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Remaining cash held outside bank accounts and e-wallets: <span aria-label="Remaining cash">{formatCurrency(remaining)}</span></p>}
        {error && <p role="alert" className="text-[12px] font-bold text-rose-700 dark:text-rose-300">{error}</p>}
        {saved && !error && <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Saved for this semester.</p>}
        <button type="button" onClick={save} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800">Save</button>
      </>}
  </div>;
}
