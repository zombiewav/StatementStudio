import React, { useState, useMemo } from 'react';
import { Search, ListFilter, ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { reportingPeriodBounds } from '../lib/reportingPeriod';
import { AccountHistoryLine, buildAccountPeriodHistory, buildAccountTransactionHistory } from '../lib/transactionHistory';
import { counterpartyBalances } from '../lib/counterpartyBalances';
import { computeAccountBalances } from '../lib/accountTotals';
import { appliesOpeningBalance, combineOpeningAndPeriodBalances, withCarriedFundBalance } from '../lib/reportingPeriodBalances';
import { excludeClosingEntries } from '../lib/closingEntries';

// 'pre' is the original ledger: closing entries do not touch it. 'post' is a copy that
// includes the closing entries, so revenues and expenses end at zero.
export function GeneralLedger({ mode = 'pre' }: { mode?: 'pre' | 'post' } = {}): React.ReactElement {
  const { accounts, journalEntries: allJournalEntries, openingBalances, formatCurrency, settings, closedFiscalYears } = useFinance();
  const journalEntries = useMemo(
    () => mode === 'pre' ? excludeClosingEntries(allJournalEntries, closedFiscalYears) : allJournalEntries,
    [mode, allJournalEntries, closedFiscalYears]
  );
  const accountBalances = useMemo(
    () => combineOpeningAndPeriodBalances(openingBalances, computeAccountBalances(journalEntries, accounts), accounts),
    [openingBalances, journalEntries, accounts]
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'All' | 'Assets' | 'Liabilities' | 'Fund Balance' | 'Revenue' | 'Expenses'>('All');
  // Accounts with no activity start collapsed so the page isn't a wall of empty tables;
  // an explicit toggle (or Expand/Collapse all) always wins over that default.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hideEmpty, setHideEmpty] = useState(false);
  const [page, setPage] = useState(1);
  const accountsPerPage = 10;

  // Compute the transaction history with running balances for each account
  const reportingBounds = settings.semester && settings.reportingYear
    ? reportingPeriodBounds(settings.semester, settings.reportingYear)
    : null;
  const ledgerData = useMemo(() => {
    const data: Record<string, { beginningBalance: number; lines: AccountHistoryLine[] }> = {};
    const carried = withCarriedFundBalance(openingBalances, accounts);

    accounts.forEach(acc => {
      const history = reportingBounds
        ? buildAccountPeriodHistory(acc, journalEntries, reportingBounds.startDate, reportingBounds.endDate)
        : { beginningBalance: 0, lines: buildAccountTransactionHistory(acc, journalEntries) };
      const opening = appliesOpeningBalance(acc) ? (carried[acc.code] || 0) : 0;
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
  const visibleAccounts = useMemo(() => {
    if (!hideEmpty) return filteredAccounts;
    return filteredAccounts.filter(acc => {
      const history = ledgerData[acc.code];
      return !!history && (history.lines.length > 0 || history.beginningBalance !== 0);
    });
  }, [filteredAccounts, hideEmpty, ledgerData]);
  const totalPages = Math.max(1, Math.ceil(visibleAccounts.length / accountsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageAccounts = visibleAccounts.slice((currentPage - 1) * accountsPerPage, currentPage * accountsPerPage);
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

  // The post-closing reports only exist once the closing entry is posted.
  const closingPosted = journalEntries.some(entry => closedFiscalYears.some(record => record.journalEntryId === entry.id));
  if (mode === 'post' && !closingPosted) {
    return (
      <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
        <div>
          <h2 className="font-display text-3xl text-slate-900 dark:text-slate-100">Post-Closing General <em className="text-blue-700 dark:text-blue-400">Ledger</em></h2>
        </div>
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          The closing entry has not been posted yet. Post it under Closing Entries to see this report: Revenues and Expenses are closed to zero, and Fund Balance carries the surplus or deficit from the closing entry.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div>
        <h2 className="font-display text-3xl text-slate-900 dark:text-slate-100">{mode === 'post' ? 'Post-Closing General' : 'General'} <em className="text-blue-700 dark:text-blue-400">Ledger</em></h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{mode === 'post'
          ? 'A copy of the General Ledger that includes the closing entries: Revenues and Expenses end at zero and the surplus or deficit sits in Fund Balance.'
          : 'Detailed accounting records sorted by account code, showing running posting balances.'}</p>
      </div>

      {/* Filter and Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Search account code or name..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border-slate-300 dark:border-slate-700 border-none outline-none focus:ring-2 focus:ring-blue-900/10 focus:bg-white dark:focus:bg-slate-900 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => { setHideEmpty(e.target.checked); setPage(1); }} className="h-3.5 w-3.5 cursor-pointer accent-blue-900" />
          Hide empty accounts
        </label>
        <button type="button" onClick={() => setExpanded(Object.fromEntries(pageAccounts.map(acc => [acc.code, true])))} className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Expand all</button>
        <button type="button" onClick={() => setExpanded(Object.fromEntries(pageAccounts.map(acc => [acc.code, false])))} className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Collapse all</button>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200">
          <ListFilter className="w-3.5 h-3.5 text-blue-900 dark:text-blue-200" />
          <select
            value={selectedType}
            onChange={(e) => { setSelectedType(e.target.value as any); setPage(1); }}
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
      </div>


      {/* Ledger Cards list */}
      <div className="md:hidden flex items-center gap-1.5 px-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        <ArrowLeftRight className="w-3 h-3 shrink-0" />
        Swipe each table sideways to see Debit, Credit &amp; Running Balance
      </div>

      <div className="space-y-6">
        {pageAccounts.map(acc => {
          const accountHistory = ledgerData[acc.code] || { beginningBalance: 0, lines: [] };
          const lines = accountHistory.lines;
          const currentBal = reportingBounds
            ? lines[lines.length - 1]?.runningBalance ?? accountHistory.beginningBalance
            : accountBalances[acc.code] || 0;

          const hasActivity = lines.length > 0 || accountHistory.beginningBalance !== 0;
          const isOpen = expanded[acc.code] ?? hasActivity;

          if (acc.code === '2010' && expensePayableLedgers.length > 0) return (
            <section key={acc.code} className="space-y-4">
              <div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">2010 Account Payable-Expense</h3><p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">A separate running ledger is shown for every supplier or payee.</p></div>
              {expensePayableLedgers.map(ledger => <div key={ledger.name.toLocaleLowerCase()} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/30"><div><p className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">Supplier / Payee Ledger</p><h4 className="text-sm font-black text-slate-900 dark:text-slate-100">{ledger.name}</h4></div><div className="text-right"><p className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">Outstanding Balance</p><p className="text-sm font-black text-blue-900 dark:text-blue-200">{formatCurrency(ledger.lines[ledger.lines.length - 1]?.runningBalance ?? ledger.beginningBalance)}</p></div></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs text-slate-900 dark:text-slate-100"><thead><tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 text-[9px] uppercase text-slate-500 dark:text-slate-400"><th className="px-5 py-2">Date</th><th className="px-4 py-2">Reference</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-5 py-2 text-right">Balance</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{reportingBounds && <tr className="bg-indigo-50/60 dark:bg-indigo-500/10"><td className="px-5 py-2">{new Date(`${reportingBounds.startDate}T00:00:00`).toLocaleDateString()}</td><td className="px-4 py-2 font-bold">B/F</td><td className="px-4 py-2">Beginning Balance</td><td></td><td></td><td className="px-5 py-2 text-right font-black">{formatCurrency(ledger.beginningBalance)}</td></tr>}{ledger.lines.map(line => <tr key={`${line.entryId}-${line.date}-${line.debit}-${line.credit}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/60"><td className="px-5 py-2">{line.date ? new Date(`${line.date}T00:00:00`).toLocaleDateString() : 'No date'}</td><td className="px-4 py-2 font-bold text-blue-800 dark:text-blue-200">{line.reference}</td><td className="px-4 py-2">{line.description}</td><td className="px-4 py-2 text-right">{line.debit ? formatCurrency(line.debit) : ''}</td><td className="px-4 py-2 text-right">{line.credit ? formatCurrency(line.credit) : ''}</td><td className="px-5 py-2 text-right font-black">{formatCurrency(line.runningBalance)}</td></tr>)}</tbody></table></div>
              </div>)}
            </section>
          );

          return (
            <div key={acc.code} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {/* Card Header */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => setExpanded(prev => ({ ...prev, [acc.code]: !isOpen }))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(prev => ({ ...prev, [acc.code]: !isOpen })); } }}
                className={`px-6 py-3 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row justify-between sm:items-center gap-2 cursor-pointer ${isOpen ? 'border-b border-gray-55 dark:border-slate-800' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
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
              {isOpen && <div className="overflow-x-auto">
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
              </div>}
            </div>
          );
        })}
        {visibleAccounts.length === 0 && (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400 font-semibold text-xs shadow-sm">
            No accounts match your criteria.
          </div>
        )}
      </div>

      {visibleAccounts.length > accountsPerPage && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            Showing {(currentPage - 1) * accountsPerPage + 1}–{Math.min(currentPage * accountsPerPage, visibleAccounts.length)} of {visibleAccounts.length} accounts
          </p>
          <nav className="flex flex-wrap items-center gap-1.5" aria-label="General Ledger pages">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Previous accounts page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                aria-current={currentPage === n ? 'page' : undefined}
                className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition-colors ${
                  currentPage === n
                    ? 'bg-blue-900 text-white dark:bg-blue-600'
                    : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Next accounts page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        </div>
      )}

    </div>
  );
}
