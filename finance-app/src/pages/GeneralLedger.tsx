import React, { useState, useMemo } from 'react';
import { Search, ListFilter, ArrowLeftRight } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { reportingPeriodBounds } from '../lib/reportingPeriod';
import { AccountHistoryLine, buildAccountPeriodHistory, buildAccountTransactionHistory } from '../lib/transactionHistory';
import { counterpartyBalances } from '../lib/counterpartyBalances';

export function GeneralLedger(): React.ReactElement {
  const { accounts, journalEntries, accountBalances, openingBalances, formatCurrency, settings } = useFinance();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'All' | 'Assets' | 'Liabilities' | 'Fund Balance' | 'Revenue' | 'Expenses'>('All');

  // Compute the transaction history with running balances for each account
  const reportingBounds = settings.semester && settings.reportingYear
    ? reportingPeriodBounds(settings.semester, settings.reportingYear)
    : null;
  const ledgerData = useMemo(() => {
    const data: Record<string, { beginningBalance: number; lines: AccountHistoryLine[] }> = {};

    accounts.forEach(acc => {
      const history = reportingBounds
        ? buildAccountPeriodHistory(acc, journalEntries, reportingBounds.startDate, reportingBounds.endDate)
        : { beginningBalance: 0, lines: buildAccountTransactionHistory(acc, journalEntries) };
      const opening = (acc.type === 'Assets' || acc.type === 'Liabilities') ? (openingBalances[acc.code] || 0) : 0;
      data[acc.code] = {
        beginningBalance: history.beginningBalance + opening,
        lines: history.lines.map(line => ({ ...line, runningBalance: line.runningBalance + opening })),
      };
    });

    return data;
  }, [journalEntries, accounts, openingBalances, reportingBounds?.startDate, reportingBounds?.endDate]);

  // Filter accounts based on Search and Type selectors
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const matchesSearch = 
        acc.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        acc.code.includes(searchTerm);
      
      const matchesType = selectedType === 'All' || acc.type === selectedType;
      
      return matchesSearch && matchesType;
    });
  }, [accounts, searchTerm, selectedType]);
  const expensePayableLedgers = useMemo(() => {
    const account = accounts.find(candidate => candidate.code === '2010');
    if (!account) return [];
    return counterpartyBalances(journalEntries, '2010', 'Credit').map(summary => {
      const entries = journalEntries.filter(entry => entry.transactionDetails?.counterpartyName?.trim().toLocaleLowerCase() === summary.name.toLocaleLowerCase());
      const history = reportingBounds
        ? buildAccountPeriodHistory(account, entries, reportingBounds.startDate, reportingBounds.endDate)
        : { beginningBalance: 0, lines: buildAccountTransactionHistory(account, entries) };
      return { ...summary, ...history };
    });
  }, [accounts, journalEntries, reportingBounds?.startDate, reportingBounds?.endDate]);

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">General Ledger</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Detailed accounting records sorted by account code, showing running posting balances.</p>
      </div>

      {/* Filter and Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search account code or name..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border-slate-300 dark:border-slate-700 border-none outline-none focus:ring-2 focus:ring-blue-900/10 focus:bg-white dark:focus:bg-slate-900 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200">
          <ListFilter className="w-3.5 h-3.5 text-blue-900 dark:text-blue-200" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-bold text-slate-750 dark:text-slate-200 cursor-pointer pr-1 py-0"
          >
            <option value="All">All Categories</option>
            <option value="Assets">Assets</option>
            <option value="Liabilities">Liabilities</option>
            <option value="Fund Balance">Fund Balance</option>
            <option value="Revenue">Revenue</option>
            <option value="Expenses">Expenses</option>
          </select>
        </div>
      </div>


      {/* Ledger Cards list */}
      <div className="md:hidden flex items-center gap-1.5 px-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        <ArrowLeftRight className="w-3 h-3 shrink-0" />
        Swipe each table sideways to see Debit, Credit &amp; Running Balance
      </div>

      <div className="space-y-6">
        {filteredAccounts.map(acc => {
          const accountHistory = ledgerData[acc.code] || { beginningBalance: 0, lines: [] };
          const lines = accountHistory.lines;
          const currentBal = reportingBounds
            ? lines[lines.length - 1]?.runningBalance ?? accountHistory.beginningBalance
            : accountBalances[acc.code] || 0;

          if (acc.code === '2010' && expensePayableLedgers.length > 0) return (
            <section key={acc.code} className="space-y-4">
              <div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">2010 Account Payable-Expense</h3><p className="mt-1 text-[10px] font-medium text-slate-500">A separate running ledger is shown for every supplier or payee.</p></div>
              {expensePayableLedgers.map(ledger => <div key={ledger.name.toLocaleLowerCase()} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/30"><div><p className="text-[9px] font-bold uppercase text-slate-500">Supplier / Payee Ledger</p><h4 className="text-sm font-black">{ledger.name}</h4></div><div className="text-right"><p className="text-[9px] font-bold uppercase text-slate-500">Outstanding Balance</p><p className="text-sm font-black text-blue-900 dark:text-blue-200">{formatCurrency(ledger.lines[ledger.lines.length - 1]?.runningBalance ?? ledger.beginningBalance)}</p></div></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b text-[9px] uppercase text-slate-500"><th className="px-5 py-2">Date</th><th className="px-4 py-2">Reference</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-5 py-2 text-right">Balance</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{reportingBounds && <tr className="bg-indigo-50/60 dark:bg-indigo-500/10"><td className="px-5 py-2">{new Date(`${reportingBounds.startDate}T00:00:00`).toLocaleDateString()}</td><td className="px-4 py-2 font-bold">B/F</td><td className="px-4 py-2">Beginning Balance</td><td></td><td></td><td className="px-5 py-2 text-right font-black">{formatCurrency(ledger.beginningBalance)}</td></tr>}{ledger.lines.map(line => <tr key={`${line.entryId}-${line.date}-${line.debit}-${line.credit}`}><td className="px-5 py-2">{line.date ? new Date(`${line.date}T00:00:00`).toLocaleDateString() : 'No date'}</td><td className="px-4 py-2 font-bold text-blue-800 dark:text-blue-200">{line.reference}</td><td className="px-4 py-2">{line.description}</td><td className="px-4 py-2 text-right">{line.debit ? formatCurrency(line.debit) : ''}</td><td className="px-4 py-2 text-right">{line.credit ? formatCurrency(line.credit) : ''}</td><td className="px-5 py-2 text-right font-black">{formatCurrency(line.runningBalance)}</td></tr>)}</tbody></table></div>
              </div>)}
            </section>
          );

          return (
            <div key={acc.code} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {/* Card Header */}
              <div className="px-6 py-4.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-gray-55 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-blue-900 dark:text-blue-200">{acc.code}</span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{acc.name}</h3>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                    {acc.type}
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 dark:text-slate-400 font-bold block leading-none">Normal Balance</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{acc.normalBalance}</span>
                  </div>
                  <div className="text-right border-l border-gray-200 dark:border-slate-800 pl-6">
                    <span className="text-[10px] text-slate-400 dark:text-slate-400 font-bold block leading-none">Net Balance</span>
                    <span className="text-sm font-black text-blue-950 dark:text-blue-100">{formatCurrency(currentBal)}</span>
                  </div>
                </div>
              </div>

              {/* Transactions Table for Account */}
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[700px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200/40 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-transparent">
                      <th className="py-2.5 px-6 w-28 text-slate-500 dark:text-slate-400">Date</th>
                      <th className="py-2.5 px-4 w-28 text-slate-500 dark:text-slate-400">Reference</th>
                      <th className="py-2.5 px-4 text-slate-500 dark:text-slate-400">Description</th>
                      <th className="py-2.5 px-4 w-44 text-slate-500 dark:text-slate-400">Merchandise / Batch</th>
                      <th className="py-2.5 px-4 w-40 text-slate-500 dark:text-slate-400">Event / Program</th>
                      <th className="py-2.5 px-4 w-28 text-right text-slate-500 dark:text-slate-400">Debit</th>
                      <th className="py-2.5 px-4 w-28 text-right text-slate-500 dark:text-slate-400">Credit</th>
                      <th className="py-2.5 px-6 w-32 text-right text-slate-500 dark:text-slate-400">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50/50 dark:divide-slate-800/60">
                    {reportingBounds && (
                      <tr className="bg-indigo-50/60 font-semibold dark:bg-indigo-500/10">
                        <td className="py-2 px-6 text-slate-900 dark:text-slate-100">{new Date(`${reportingBounds.startDate}T00:00:00`).toLocaleDateString()}</td>
                        <td className="py-2 px-4 font-bold text-indigo-800 dark:text-indigo-200">B/F</td>
                        <td className="py-2 px-4 text-slate-900 dark:text-slate-100">Beginning Balance (carried forward)</td>
                        <td className="py-2 px-4 text-slate-500">—</td>
                        <td className="py-2 px-4 text-slate-500">—</td>
                        <td className="py-2 px-4 text-right"></td>
                        <td className="py-2 px-4 text-right"></td>
                        <td className="py-2 px-6 text-right font-black text-indigo-900 dark:text-indigo-100">{formatCurrency(accountHistory.beginningBalance)}</td>
                      </tr>
                    )}
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="py-2 px-6 text-slate-900 dark:text-slate-100">{new Date(line.date).toLocaleDateString()}</td>
                        <td className="py-2 px-4 font-bold text-blue-900 dark:text-blue-200">{line.reference}</td>
                        <td className="py-2 px-4 text-slate-900 dark:text-slate-100 font-medium">{line.description}</td>
                        <td className="py-2 px-4 text-slate-600 dark:text-slate-300">{line.merchandiseDetail || '—'}</td>
                        <td className="py-2 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 font-semibold text-[9px]">
                            {line.eventName || line.project}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {line.debit > 0 ? formatCurrency(line.debit) : ''}
                        </td>
                        <td className="py-2 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {line.credit > 0 ? formatCurrency(line.credit) : ''}
                        </td>
                        <td className="py-2 px-6 text-right font-bold text-blue-950 dark:text-blue-100 bg-blue-50/10 dark:bg-blue-950/20">
                          {formatCurrency(line.runningBalance)}
                        </td>
                      </tr>
                    ))}
                    {lines.length === 0 && !reportingBounds && (
                      <tr>
                        <td colSpan={8} className="py-6 px-6 text-center text-slate-500 dark:text-slate-400 font-medium">
                          No transactions recorded for this account in the current period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {filteredAccounts.length === 0 && (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400 font-semibold text-xs shadow-sm">
            No accounts match your criteria.
          </div>
        )}
      </div>

    </div>
  );
}
