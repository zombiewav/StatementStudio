import React, { useState, useMemo } from 'react';
import { Search, ListFilter, ArrowLeftRight } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';


interface LedgerLine {
  date: string;
  reference: string;
  description: string;
  project: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export function GeneralLedger(): React.ReactElement {
  const { accounts, journalEntries, accountBalances, formatCurrency } = useFinance();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'All' | 'Assets' | 'Liabilities' | 'Fund Balance' | 'Revenue' | 'Expenses'>('All');

  // Compute the transaction history with running balances for each account
  const ledgerData = useMemo(() => {
    const data: Record<string, LedgerLine[]> = {};

    // Sort entries chronologically
    const sortedEntries = [...journalEntries].sort((a, b) => 
      a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference)
    );

    accounts.forEach(acc => {
      let balance = 0;
      const lines: LedgerLine[] = [];

      sortedEntries.forEach(je => {
        je.lines.forEach(line => {
          if (line.accountCode === acc.code) {
            const isDebitAcc = acc.normalBalance === 'Debit';
            
            // Adjust running balance
            if (isDebitAcc) {
              balance += (line.debit - line.credit);
            } else {
              balance += (line.credit - line.debit);
            }

            lines.push({
              date: je.date,
              reference: je.reference,
              description: je.description,
              project: je.project,
              debit: line.debit,
              credit: line.credit,
              runningBalance: balance
            });
          }
        });
      });

      data[acc.code] = lines;
    });

    return data;
  }, [journalEntries, accounts]);

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
          const lines = ledgerData[acc.code] || [];
          const currentBal = accountBalances[acc.code] || 0;

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
                      <th className="py-2.5 px-4 w-40 text-slate-500 dark:text-slate-400">Activity / Program</th>
                      <th className="py-2.5 px-4 w-28 text-right text-slate-500 dark:text-slate-400">Debit</th>
                      <th className="py-2.5 px-4 w-28 text-right text-slate-500 dark:text-slate-400">Credit</th>
                      <th className="py-2.5 px-6 w-32 text-right text-slate-500 dark:text-slate-400">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50/50 dark:divide-slate-800/60">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="py-2 px-6 text-slate-900 dark:text-slate-100">{new Date(line.date).toLocaleDateString()}</td>
                        <td className="py-2 px-4 font-bold text-blue-900 dark:text-blue-200">{line.reference}</td>
                        <td className="py-2 px-4 text-slate-900 dark:text-slate-100 font-medium">{line.description}</td>
                        <td className="py-2 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 font-semibold text-[9px]">
                            {line.project}
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
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 px-6 text-center text-slate-500 dark:text-slate-400 font-medium">
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
