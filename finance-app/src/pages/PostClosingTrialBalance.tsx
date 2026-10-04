import React, { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { computeAccountBalances } from '../lib/accountTotals';

export function PostClosingTrialBalance(): React.ReactElement {
  const { accounts, journalEntries, formatCurrency } = useFinance();
  const balances = useMemo(() => computeAccountBalances(journalEntries, accounts), [journalEntries, accounts]);
  const rows = accounts.filter(account => account.code !== '3000' && ['Assets', 'Liabilities', 'Fund Balance'].includes(account.type) && (balances[account.code] || 0) !== 0);
  return <div className="space-y-5"><div><h2 className="text-xl font-bold">Post-Closing Trial Balance</h2><p className="mt-1 text-xs text-slate-500">Permanent accounts only. Revenue, Expenses, and Income Summary should have zero balances.</p></div><div className="overflow-hidden rounded-xl border bg-white dark:bg-slate-900"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-3">Code</th><th className="p-3">Account</th><th className="p-3">Type</th><th className="p-3 text-right">Balance</th></tr></thead><tbody>{rows.map(account => <tr key={account.code} className="border-t"><td className="p-3 font-bold">{account.code}</td><td className="p-3">{account.name}</td><td className="p-3">{account.type}</td><td className="p-3 text-right font-bold">{formatCurrency(Math.abs(balances[account.code] || 0))}</td></tr>)}{rows.length === 0 && <tr><td colSpan={4} className="p-5 text-center text-slate-500">No permanent-account balances yet.</td></tr>}</tbody></table></div></div>;
}
