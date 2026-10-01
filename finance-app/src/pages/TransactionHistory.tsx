import React, { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { BookOpen, ClipboardCheck, FileSpreadsheet, History, ReceiptText, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { FinancialStatementHistoryRecord, ReportingPeriodWorkspace } from '../types';
import { NewFeatureBadge } from '../components/NewFeatureBadge';

type SnapshotView = 'statements' | 'ledger';

export function TransactionHistory({ onNavigate }: { onNavigate: (page: string) => void }): React.ReactElement {
  const { financialStatementHistory, reportingPeriodWorkspaces, switchReportingPeriod, deleteSemester, formatCurrency } = useFinance();
  const [selected, setSelected] = useState<FinancialStatementHistoryRecord | null>(null);
  const [deleting, setDeleting] = useState<ReportingPeriodWorkspace | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<SnapshotView>('statements');

  const openEditableWorkspace = (workspace: ReportingPeriodWorkspace, page: string) => {
    switchReportingPeriod(workspace.schoolYear, workspace.semester, workspace.reportingYear);
    onNavigate(page);
  };

  if (selected) {
    const totals = selected.statementTotals;
    const nonZeroLedger = selected.ledgerBalances.filter(account => Math.abs(account.balance) > 0.005);
    return (
      <div className="space-y-5 bg-slate-50 dark:bg-slate-950">
        <button type="button" onClick={() => setSelected(null)} className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-300">← Back to semester history</button>
        <div><h2 className="text-xl font-black text-slate-900 dark:text-slate-100">{selected.semester} {selected.schoolYear}</h2><p className="mt-1 text-xs text-slate-500">Final snapshot for {selected.period} · {selected.startDate} to {selected.endDate}</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => setView('statements')} className={`rounded-xl px-4 py-2 text-xs font-bold ${view === 'statements' ? 'bg-blue-700 text-white' : 'border bg-white dark:bg-slate-900'}`}><FileSpreadsheet className="mr-1.5 inline h-4 w-4" />Financial Statements</button><button type="button" onClick={() => setView('ledger')} className={`rounded-xl px-4 py-2 text-xs font-bold ${view === 'ledger' ? 'bg-blue-700 text-white' : 'border bg-white dark:bg-slate-900'}`}><BookOpen className="mr-1.5 inline h-4 w-4" />Final Ledger Balances</button></div>
        {view === 'statements' ? <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="mb-4 text-sm font-bold">{selected.statements.join(' · ')}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
          ['Total Assets', totals.totalAssets], ['Total Liabilities', totals.totalLiabilities], ['Total Fund Balance', totals.totalFundBalance], ['Total Revenue', totals.totalRevenue], ['Total Expenses', totals.totalExpenses], ['Net Surplus / (Deficit)', totals.netSurplus], ['Cash at Beginning', totals.beginningCash], ['Cash at End', totals.endingCash], ['Beginning Fund Balance', totals.beginningFundBalance],
        ].map(([label, amount]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-base font-black">{formatCurrency(Number(amount))}</p></div>)}</div></section> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead><tr className="border-b bg-slate-50 text-[9px] uppercase text-slate-500 dark:bg-slate-950"><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Final Balance</th><th className="px-4 py-3">Side</th></tr></thead><tbody>{nonZeroLedger.map(account => <tr key={account.accountCode} className="border-b border-slate-100 dark:border-slate-800"><td className="px-4 py-3 font-bold text-blue-700">{account.accountCode}</td><td className="px-4 py-3 font-semibold">{account.accountName}</td><td className="px-4 py-3 text-slate-500">{account.accountType}</td><td className="px-4 py-3 text-right font-black">{formatCurrency(account.balance)}</td><td className="px-4 py-3">{account.normalBalance}</td></tr>)}</tbody></table></div></section>}
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-violet-700 dark:text-violet-300"><History className="h-5 w-5" /> Semester Workspace History <NewFeatureBadge /></h2><p className="mt-1 text-xs font-medium text-slate-500">Every semester keeps its own editable Transactions, Review, journals, Ledger, Trial Balance, and Financial Statements.</p></div>
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
      {deleting && <AlertDialog.Root open onOpenChange={open => { if (!open) setDeleting(null); }}><AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100">
          <AlertDialog.Title className="text-lg font-bold">Delete {deleting.semester} {deleting.schoolYear}?</AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm text-slate-600 dark:text-slate-300">This permanently deletes this semester's transactions, drafts, receipts, programs, closing records, and saved financial statements. Export a backup in Settings first if you need a copy.</AlertDialog.Description>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Other semesters stay unchanged, including their saved beginning balances. You can add this semester again from the selector above to start fresh with balances from the preceding saved semester.</p>
          {deleteError && <p role="alert" className="mt-3 text-sm text-red-600">{deleteError}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <AlertDialog.Cancel asChild><button type="button" className="rounded-lg border px-4 py-2 text-sm font-bold">Cancel</button></AlertDialog.Cancel>
            <button type="button" onClick={() => {
              try {
                deleteSemester(deleting.key);
                setNotice(`${deleting.semester} ${deleting.schoolYear} deleted. Add it again using the semester selector to start fresh.`);
                setDeleting(null);
              } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Could not delete this semester.'); }
            }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Delete Semester</button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal></AlertDialog.Root>}
      {reportingPeriodWorkspaces.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900"><p className="text-sm font-bold">No semester workspaces yet</p><p className="mt-1 text-xs text-slate-500">Add a School Year and semester from the selector above.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{reportingPeriodWorkspaces.map(workspace => {
        const finalSnapshot = financialStatementHistory.find(record => record.schoolYear === workspace.schoolYear && record.semester === workspace.semester);
        return <section key={workspace.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><button type="button" onClick={() => finalSnapshot ? setSelected(finalSnapshot) : openEditableWorkspace(workspace, 'transactions')} className="w-full text-left"><p className="text-base font-black text-blue-900 dark:text-blue-200">{workspace.semester} {workspace.schoolYear}</p><p className="mt-1 text-xs text-slate-500">{workspace.journalEntries.length} journal entr{workspace.journalEntries.length === 1 ? 'y' : 'ies'} · {workspace.draftTransactions.length} draft{workspace.draftTransactions.length === 1 ? '' : 's'}{finalSnapshot ? ' · Final FS saved' : ' · FS not finalized yet'}</p></button><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><button type="button" onClick={() => openEditableWorkspace(workspace, 'transactions')} className="rounded-lg border px-2 py-2 text-[10px] font-bold hover:bg-blue-50"><ReceiptText className="mx-auto mb-1 h-4 w-4" />Transactions</button><button type="button" onClick={() => openEditableWorkspace(workspace, 'review')} className="rounded-lg border px-2 py-2 text-[10px] font-bold hover:bg-blue-50"><ClipboardCheck className="mx-auto mb-1 h-4 w-4" />Review</button><button type="button" onClick={() => openEditableWorkspace(workspace, 'ledger')} className="rounded-lg border px-2 py-2 text-[10px] font-bold hover:bg-blue-50"><BookOpen className="mx-auto mb-1 h-4 w-4" />Ledger</button><button type="button" onClick={() => openEditableWorkspace(workspace, 'statements')} className="rounded-lg border px-2 py-2 text-[10px] font-bold hover:bg-blue-50"><FileSpreadsheet className="mx-auto mb-1 h-4 w-4" />FS</button></div><button type="button" onClick={() => { setDeleting(workspace); setDeleteError(''); setNotice(''); }} className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" />Delete Semester</button></section>;
      })}</div>}
    </div>
  );
}
