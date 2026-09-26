import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Undo2,
  Calendar,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { ReceiptAttachments } from '../components/ReceiptAttachments';

export function JournalEntries(): React.ReactElement {
  const { journalEntries, reverseJournalEntry, accounts, formatCurrency, projects } = useFinance();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('All');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedRow(prev => prev === id ? null : id);
  };

  // Filter & Search logic
  const filteredEntries = useMemo(() => {
    let result = [...journalEntries];

    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      result = result.filter(e => 
        e.reference.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.transactionType?.toLowerCase().includes(q) ||
        e.customName?.toLowerCase().includes(q) ||
        e.transactionDetails?.counterpartyName?.toLowerCase().includes(q) ||
        e.lines.some(l => {
          const accName = accounts.find(a => a.code === l.accountCode)?.name || '';
          return accName.toLowerCase().includes(q) || l.accountCode.includes(q);
        })
      );
    }

    if (selectedProject !== 'All') {
      result = result.filter(e => e.project === selectedProject);
    }

    // Sort order
    result.sort((a, b) => {
      if (sortOrder === 'desc') {
        return b.date.localeCompare(a.date) || b.reference.localeCompare(a.reference);
      } else {
        return a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference);
      }
    });

    return result;
  }, [journalEntries, searchTerm, selectedProject, sortOrder, accounts]);

  const entriesById = useMemo(() => new Map(journalEntries.map(e => [e.id, e])), [journalEntries]);

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Journal Entries</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Historical register of all financial events logged in double-entry bookkeeping style.</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reference, description, account..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border-none outline-none focus:ring-2 focus:ring-blue-900/10 focus:bg-white dark:focus:bg-slate-900 transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Filter className="w-3.5 h-3.5 text-blue-900 dark:text-blue-200" />
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer pr-1 py-0"
            >
              <option value="All">All Activities / Programs</option>
              {projects.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
            type="button"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-orange-500" />
            Sort: {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
          </button>
        </div>
      </div>

      {/* Main Journal Entry Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/80">
                <th className="py-4 px-6 w-12"></th>
                <th className="py-4 px-4 w-28">Reference</th>
                <th className="py-4 px-4 w-28">Date</th>
                <th className="py-4 px-4">Description</th>
                <th className="py-4 px-4 w-40">Activity / Program</th>
                <th className="py-4 px-4 w-32 text-right">Debit Balance</th>
                <th className="py-4 px-4 w-32 text-right">Credit Balance</th>
                <th className="py-4 px-6 w-16 text-right"></th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {filteredEntries.map((je) => {
                const isExpanded = expandedRow === je.id;
                const totalDebits = je.lines.reduce((s, l) => s + l.debit, 0);
                const totalCredits = je.lines.reduce((s, l) => s + l.credit, 0);
                const reversedByRef = je.reversedByEntryId ? entriesById.get(je.reversedByEntryId)?.reference : undefined;
                const reversalOfRef = je.reversalOfEntryId ? entriesById.get(je.reversalOfEntryId)?.reference : undefined;
                const isClosingEntry = je.description.startsWith('Closing Entries');

                return (
                  <React.Fragment key={je.id}>
                    {/* Header Row */}
                    <tr
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer font-semibold ${isExpanded ? 'bg-slate-50/30 dark:bg-slate-800/30' : ''} ${reversedByRef ? 'opacity-60' : ''}` }
                      onClick={() => toggleExpand(je.id)}
                    >
                      <td className="py-3.5 px-6 text-slate-400 dark:text-slate-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-slate-100">{je.reference}</td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">{new Date(je.date).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4 text-slate-900 dark:text-slate-100 font-medium">
                        <div>{je.description}</div>
                        {reversedByRef && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300 font-semibold text-[9px] uppercase tracking-wide">
                            Reversed via {reversedByRef}
                          </span>
                        )}
                        {reversalOfRef && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 font-semibold text-[9px] uppercase tracking-wide">
                            Reversal of {reversalOfRef}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-blue-50/50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200 font-semibold text-[10px]">
                          {je.project}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalDebits)}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalCredits)}</td>
                      <td className="py-3.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        {reversedByRef || isClosingEntry ? (
                          <span
                            className="inline-flex p-1.5 text-slate-300 dark:text-slate-600 rounded-lg cursor-default"
                            title={isClosingEntry ? 'Fiscal-year closing entries are permanent' : `Already reversed via ${reversedByRef}`}
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => reverseJournalEntry(je.id)}
                            className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="Reverse entry (posts an offsetting correction; the original stays on record)"
                            type="button"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expanded Double Entry Breakdown */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/30 px-6 py-4">
                          <div className="border border-slate-200/70 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-4 max-w-4xl mx-auto shadow-inner">
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2 mb-3">
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Double-Entry Breakdown ({je.reference})</span>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-orange-500" /> Booked: {je.date}
                              </span>
                            </div>
                            {je.transactionType && (
                              <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[10px] text-slate-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-slate-300 sm:grid-cols-2">
                                <p><span className="font-bold text-slate-800 dark:text-slate-100">Transaction type:</span> {je.transactionType}</p>
                                <p><span className="font-bold text-slate-800 dark:text-slate-100">Entry use:</span> {je.transactionDetails?.eventRelated ? `Event — ${je.eventName || je.project}` : 'General organization operations'}</p>
                                {je.customName && <p><span className="font-bold text-slate-800 dark:text-slate-100">Custom name:</span> {je.customName}</p>}
                                {je.transactionDetails?.counterpartyName && <p><span className="font-bold text-slate-800 dark:text-slate-100">Officer / payee:</span> {je.transactionDetails.counterpartyName}</p>}
                                {je.transactionDetails?.fundingSourceId && <p><span className="font-bold text-slate-800 dark:text-slate-100">Funding source:</span> {je.transactionDetails.fundingSourceId.replace(/-/g, ' ')}</p>}
                                {je.transactionDetails?.donorRestriction && <p><span className="font-bold text-slate-800 dark:text-slate-100">Donor restriction:</span> {je.transactionDetails.donorRestriction.replace(/-/g, ' ')}</p>}
                                {je.transactionDetails?.deferredAmount !== undefined && <p><span className="font-bold text-slate-800 dark:text-slate-100">Not yet used:</span> {formatCurrency(je.transactionDetails.deferredAmount)}</p>}
                                {je.transactionDetails?.membershipUnpaidAmount !== undefined && <p><span className="font-bold text-slate-800 dark:text-slate-100">Membership fees unpaid:</span> {formatCurrency(je.transactionDetails.membershipUnpaidAmount)}</p>}
                              </div>
                            )}
                            <ReceiptAttachments entryId={je.id} />
                            
                            <div className="space-y-2 text-xs">
                              {/* Headers */}
                              <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-slate-50 pb-1">
                                <div className="col-span-2">Account Code</div>
                                <div className="col-span-4">Account Name</div>
                                <div className="col-span-2">Posting Date</div>
                                <div className="col-span-2 text-right">Debit</div>
                                <div className="col-span-2 text-right">Credit</div>
                              </div>

                              {/* lines */}
                              {je.lines.map((line, idx) => {
                                const acc = accounts.find(a => a.code === line.accountCode);
                                const isCredit = line.credit > 0;
                                return (
                                  <div 
                                    key={idx} 
                                    className={`grid grid-cols-12 py-1.5 border-b border-slate-50/30 last:border-0 font-medium ${isCredit ? 'pl-6 text-slate-700 dark:text-slate-200' : 'text-slate-900 dark:text-slate-100'}`}
                                  >
                                    <div className="col-span-2 font-bold text-slate-600 dark:text-slate-300">{line.accountCode}</div>
                                    <div className="col-span-4 truncate font-semibold">{acc?.name || 'Unknown Account'}</div>
                                    <div className="col-span-2 text-slate-500 dark:text-slate-400">{new Date(line.date || je.date).toLocaleDateString()}</div>
                                    <div className="col-span-2 text-right font-bold text-slate-900 dark:text-slate-100">
                                      {line.debit > 0 ? formatCurrency(line.debit) : ''}
                                    </div>
                                    <div className="col-span-2 text-right font-bold text-slate-900 dark:text-slate-100">
                                      {line.credit > 0 ? formatCurrency(line.credit) : ''}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 font-semibold text-xs">
                    No journal entries match your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
