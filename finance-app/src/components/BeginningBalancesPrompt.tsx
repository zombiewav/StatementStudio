import React, { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { shouldPromptBeginningBalances } from '../lib/beginningBalances';
import { BeginningBalancesForm } from './BeginningBalancesForm';

// First sign-in only: asks a brand-new organization for its Beginning Balances. Answering (posting or skipping) is
// remembered in the synced workspace settings, so the dialog never comes back on this or another device. The same
// form stays available in Settings.
export function BeginningBalancesPrompt(): React.ReactElement | null {
  const { workspaceStatus, settings, journalEntries, reportingPeriodWorkspaces, updateSettings } = useFinance();
  const [visible, setVisible] = useState(false);
  const due = shouldPromptBeginningBalances({ workspaceStatus, settings, journalEntries, reportingPeriodWorkspaces });

  // Once shown, it stays open until the user closes it, even after posting turns `due` off (so Undo remains reachable).
  useEffect(() => { if (due) setVisible(true); }, [due]);

  const markAnswered = () => { if (!settings.beginningBalancesPrompted) updateSettings({ beginningBalancesPrompted: true }); };
  const close = () => { markAnswered(); setVisible(false); };

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="beginning-balances-title">
      <div className="my-4 w-full max-w-4xl space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-blue-900 p-2.5 text-white"><Wallet className="h-5 w-5" /></span>
          <div>
            <h2 id="beginning-balances-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">Welcome! Set up your Beginning Balances</h2>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
              Enter what your organization already has in each asset account before you record transactions. This appears only the first time you sign in, and you can always do it later in Settings.
            </p>
          </div>
        </div>
        <BeginningBalancesForm heading={false} onPosted={markAnswered}>
          <button
            type="button"
            onClick={close}
            className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {settings.beginningBalancesPrompted ? 'Continue to the dashboard' : 'Skip for now'}
          </button>
        </BeginningBalancesForm>
      </div>
    </div>
  );
}
