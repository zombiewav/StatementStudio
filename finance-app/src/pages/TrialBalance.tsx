import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';

export function TrialBalance(): React.ReactElement {
  const { accounts, accountBalances, formatCurrency, settings } = useFinance();

  // Compute Trial Balance Rows:
  // For each account, if it has a balance, put it in the Debit column if it's normal Debit, Credit column if normal Credit.
  // Wait, if an account has a balance opposite to its normal balance, it goes to its normal column with a negative value, or we list them according to their current balance!
  // In standard bookkeeping, we list the balance in whichever side it currently falls (Debit balance goes in Debit column, Credit balance goes in Credit column).
  // Let's implement standard classification:
  // - Asset / Expense normal balance is Debit. If balance >= 0, it is Debit. If balance < 0, it represents a credit balance on that asset (e.g. overdrawn cash), so it goes to Credit.
  // - Liability / Equity / Revenue normal balance is Credit. If balance >= 0, it is Credit. If balance < 0, it goes to Debit.
  // For simplicity and clarity, we place it in the normal column of the account, unless it's opposite, or we just put standard:
  // If normal balance is Debit: if current balance is positive it's a Debit, if negative it's a Credit.
  // Let's write the math clean:
  const trialBalanceRows = useMemo(() => {
    return accounts.map(acc => {
      const bal = accountBalances[acc.code] || 0;
      let debit = 0;
      let credit = 0;

      if (bal !== 0) {
        if (acc.normalBalance === 'Debit') {
          if (bal >= 0) {
            debit = bal;
          } else {
            credit = Math.abs(bal);
          }
        } else {
          if (bal >= 0) {
            credit = bal;
          } else {
            debit = Math.abs(bal);
          }
        }
      }

      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        debit,
        credit
      };
    }).filter(row => row.debit !== 0 || row.credit !== 0);
  }, [accounts, accountBalances]);

  const { totalDebits, totalCredits } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    trialBalanceRows.forEach(row => {
      debits += row.debit;
      credits += row.credit;
    });
    return { totalDebits: debits, totalCredits: credits };
  }, [trialBalanceRows]);

  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.01;

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto w-full">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Trial Balance</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Verify that the sum of all debits equals the sum of all credits in the ledger.</p>
        </div>
      </div>

      {/* Verification Status Alert */}
      <div className={`p-4.5 rounded-2xl border flex items-center justify-between text-xs font-semibold shadow-sm transition-colors bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${
        isBalanced 
          ? 'bg-blue-50/40 border-blue-100 text-blue-900' 
          : 'bg-rose-50/50 border-rose-100 text-rose-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isBalanced ? 'bg-white shadow-sm dark:bg-slate-800' : 'bg-rose-100/50 text-rose-600 dark:text-rose-200'}`}>
            {isBalanced ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-rose-500" />}
          </div>

          <div>
            <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
              {isBalanced ? 'Books are Balanced' : 'Ledger Out of Balance'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5">
              {isBalanced 
                ? 'Excellent! The sum of debits matches the sum of credits perfectly.' 
                : 'Warning! There is a discrepancy between total debits and credits.'}
            </p>
          </div>

        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-400 dark:text-slate-400 block font-bold leading-none">Difference</span>
          <span className={`text-sm font-black ${isBalanced ? 'text-slate-700 dark:text-slate-100' : 'text-rose-650 animate-pulse dark:text-rose-300'}`}>

            {formatCurrency(difference)}
          </span>
        </div>
      </div>

      {/* Trial Balance Table */}
      <div className="bg-white dark:bg-slate-900 dark:text-slate-100 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden w-full mx-auto max-w-5xl">
        <div className="px-6 py-5 border-b border-gray-50 dark:border-slate-800 text-center">

          <h3 className="text-sm font-black uppercase text-gray-900 dark:text-slate-100 tracking-wider">{settings.organizationName}</h3>
          <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 mt-1">Trial Balance</h4>
          <p className="text-[9px] text-gray-400 dark:text-slate-400 mt-0.5">For Fiscal Period Ending {settings.fiscalYear}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full bg-white dark:bg-slate-900 text-left text-xs select-none">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase font-bold">

                <th className="py-3 px-6 w-28 text-slate-700 dark:text-slate-300">Account Code</th>


                <th className="py-3 px-4 text-slate-700 dark:text-slate-300">Account Name</th>

                <th className="py-3 px-4 w-40 text-slate-700 dark:text-slate-300">Category</th>

                <th className="py-3 px-6 w-36 text-right text-slate-700 dark:text-slate-300">Debit Balance</th>

                <th className="py-3 px-6 w-36 text-right text-slate-700 dark:text-slate-300">Credit Balance</th>

              </tr>

            </thead>
            <tbody className="divide-y divide-gray-50/50 dark:divide-slate-800/60">
              {trialBalanceRows.map((row) => (
                <tr key={row.code} className="border-b border-slate-800 hover:bg-slate-50/30 dark:hover:bg-slate-800/60 transition-colors font-medium text-gray-800 dark:text-slate-200">
                  <td className="py-2.5 px-6 font-bold text-gray-500 dark:text-slate-300">{row.code}</td>
                  <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-slate-100">{row.name}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent dark:border-slate-700 font-bold text-[9px]">
                      {row.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-6 text-right font-bold text-gray-900 dark:text-slate-100">
                    {row.debit > 0 ? formatCurrency(row.debit) : ''}
                  </td>
                  <td className="py-2.5 px-6 text-right font-bold text-gray-900 dark:text-slate-100">
                    {row.credit > 0 ? formatCurrency(row.credit) : ''}
                  </td>
                </tr>
              ))}

              {trialBalanceRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-450 dark:text-slate-400 font-bold text-xs">
                    No account balances found. Load sample data or post transactions.
                  </td>
                </tr>
              )}

            </tbody>
            {/* Totals Footer */}
            <tfoot>
              <tr className="bg-slate-50/40 dark:bg-slate-900/80 border-t-2 border-gray-300 dark:border-slate-800 border-b-4 border-double border-b-gray-800 dark:border-b-slate-800 font-bold text-gray-900 dark:text-slate-100">
                <td colSpan={3} className="py-3 px-6 text-right uppercase tracking-wider text-[10px] font-bold text-gray-500 dark:text-slate-400">
                  Total Trial Balance
                </td>
                <td className="py-3 px-6 text-right text-xs font-black text-gray-900 dark:text-slate-100">
                  {formatCurrency(totalDebits)}
                </td>
                <td className="py-3 px-6 text-right text-xs font-black text-gray-900 dark:text-slate-100">
                  {formatCurrency(totalCredits)}
                </td>
              </tr>
            </tfoot>

          </table>
        </div>
      </div>
    </div>
  );
}
