import React, { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { InventorySummaryCard } from '../components/InventorySummaryCard';
import { useFinance } from '../context/FinanceContext';
import { buildAccountTransactionHistory } from '../lib/transactionHistory';
import { NewFeatureBadge } from '../components/NewFeatureBadge';

export function TransactionHistory(): React.ReactElement {
  const { accounts, journalEntries, formatCurrency } = useFinance();
  const [selectedAccountCode, setSelectedAccountCode] = useState('1700');
  const [search, setSearch] = useState('');
  const selectedAccount = accounts.find(account => account.code === selectedAccountCode) || accounts[0];
  const history = useMemo(
    () => selectedAccount ? buildAccountTransactionHistory(selectedAccount, journalEntries) : [],
    [selectedAccount, journalEntries]
  );
  const visibleHistory = history.filter(line => `${line.reference} ${line.description} ${line.project}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-violet-700 dark:text-violet-300"><History className="h-5 w-5" /> Transaction History <NewFeatureBadge /></h2>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Choose an account to see every posting and its running balance, including entries from prior years.</p>
      </div>

      <InventorySummaryCard />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_18rem]">
          <label className="text-[10px] font-bold uppercase text-slate-500">Account
            <select value={selectedAccountCode} onChange={event => setSelectedAccountCode(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {accounts.map(account => <option key={account.code} value={account.code}>{account.code} — {account.name}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">Search this account
            <span className="relative mt-1 block"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Reference or description" className="w-full rounded-xl border border-slate-200 bg-white p-3 pl-9 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" /></span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{selectedAccount?.code} — {selectedAccount?.name}</h3><p className="text-[10px] text-slate-500">{history.length} posting{history.length === 1 ? '' : 's'} in lifetime history</p></div>
          <div className="text-right"><span className="block text-[9px] font-bold uppercase text-slate-400">Current running balance</span><span className="text-sm font-black text-blue-900 dark:text-blue-200">{formatCurrency(history[history.length - 1]?.runningBalance || 0)}</span></div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead><tr className="border-b border-slate-200 text-[9px] font-bold uppercase text-slate-500 dark:border-slate-800"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Program</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Running balance</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleHistory.map(line => <tr key={`${line.entryId}-${line.debit}-${line.credit}`}><td className="px-3 py-2">{line.date}</td><td className="px-3 py-2 font-bold text-blue-800 dark:text-blue-200">{line.reference}</td><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2">{line.project}</td><td className="px-3 py-2 text-right">{line.debit ? formatCurrency(line.debit) : '—'}</td><td className="px-3 py-2 text-right">{line.credit ? formatCurrency(line.credit) : '—'}</td><td className="px-3 py-2 text-right font-black">{formatCurrency(line.runningBalance)}</td></tr>)}
              {visibleHistory.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-xs font-medium text-slate-500">No matching transactions for this account.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
