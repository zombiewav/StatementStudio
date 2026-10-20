import React, { useState } from 'react';
import { Undo2, Wallet } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { buildBeginningBalancePosting, BEGINNING_BALANCES_DESCRIPTION } from '../lib/beginningBalances';

// Beginning Balances (Sheet3 of the working paper): the opening figures a first-time user fills in before recording
// regular transactions. Posts as one ordinary balanced journal entry (a debit line per asset account with an opening
// amount, credited in total to Fund Balance), so every ledger, trial balance and statement picks it up unchanged.
export function BeginningBalancesForm({ onPosted, heading = true, compact = false, children }: {
  onPosted?: () => void;
  heading?: boolean;
  // Inside the first-sign-in dialog: no inner card, the account fields scroll and the buttons stay in view.
  compact?: boolean;
  children?: React.ReactNode;
}): React.ReactElement {
  const { accounts, settings, addJournalEntry, reverseJournalEntry, formatCurrency } = useFinance();
  const assetAccounts = accounts.filter(account => account.type === 'Assets' && account.isActive);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lastEntry, setLastEntry] = useState<{ id: string; reference: string } | null>(null);

  const handlePost = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLastEntry(null);
    const posting = buildBeginningBalancePosting(accounts, amounts);
    if (!posting) {
      setError('Enter at least one beginning balance greater than zero.');
      return;
    }
    const date = new Date().toISOString().split('T')[0];
    const entry = addJournalEntry(date, BEGINNING_BALANCES_DESCRIPTION, 'General Fund Operations', posting.lines);
    setAmounts({});
    setSuccess(`Posted beginning balances totaling ${formatCurrency(posting.total)}.`);
    setLastEntry({ id: entry.id, reference: entry.reference });
    setTimeout(() => { setSuccess(''); setLastEntry(null); }, 5000);
    onPosted?.();
  };

  const handleUndo = () => {
    if (!lastEntry) return;
    reverseJournalEntry(lastEntry.id);
    setSuccess(`${lastEntry.reference} was undone with a reversing entry.`);
    setLastEntry(null);
    setTimeout(() => setSuccess(''), 5000);
  };

  return (
    <form onSubmit={handlePost} className={compact ? 'flex min-h-0 flex-1 flex-col gap-4' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4'}>
      {heading && (
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-2">
          <Wallet className="w-4.5 h-4.5 text-blue-900" /> Beginning Balances
        </h3>
      )}
      <p className="text-[12px] text-slate-500 dark:text-slate-400 font-medium">
        First-time setup: enter each asset account's opening balance before recording regular transactions. Posts as one balanced entry against Fund Balance.
      </p>

      {error && <p className="text-[12px] text-rose-600 font-bold bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300 p-2 rounded-lg">{error}</p>}
      {success && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2 text-[12px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <span>{success}</span>
          {lastEntry && (
            <button
              type="button"
              onClick={handleUndo}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-white/70 px-2 py-1 text-[12px] font-bold transition-colors hover:bg-white dark:border-emerald-500/30 dark:bg-slate-900/40 dark:hover:bg-slate-900"
              title="Post a reversing entry for these beginning balances"
            >
              <Undo2 className="h-3 w-3" /> Undo
            </button>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs ${compact ? 'min-h-0 flex-1 content-start overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 custom-scrollbar dark:border-slate-800 dark:bg-slate-950' : 'lg:grid-cols-3 2xl:grid-cols-4'}`}>
        {assetAccounts.map(account => (
          <div key={account.code}>
            <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{account.name}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 dark:text-slate-400">{settings.currencySymbol}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amounts[account.code] || ''}
                onChange={event => setAmounts(previous => ({ ...previous, [account.code]: event.target.value }))}
                placeholder="0.00"
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2.5 pl-7 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
        ))}
      </div>

      <div className={compact ? 'shrink-0 space-y-3' : 'space-y-4'}>
      <button
        type="submit"
        className="w-full bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs p-2.5 rounded-xl transition-all shadow-md shadow-blue-900/10 cursor-pointer"
      >
        Post Beginning Balances
      </button>
      {children}
      </div>
    </form>
  );
}
