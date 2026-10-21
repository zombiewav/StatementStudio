import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { counterpartySummary } from '../lib/counterpartyBalances';
import { ledgerWithoutDraftEntry } from '../lib/draftLedger';
import { automaticPostingDate, isDateWithinReportingPeriod } from '../lib/reportingPeriod';
import { JournalLine, TransactionDraft } from '../types';
import { FinancialPreviewPanels } from './FinancialPreviewPanels';
import { OfficerAdvanceSummary } from './OfficerAdvanceSummary';
import { ReviewLaterNote } from './ReviewLaterNote';

const GENERAL_FUND = 'General Fund Operations';
const RETURN_TYPE = 'Return of Advances';
export const RETURN_OF_ADVANCES_DRAFT = 'return-of-advances';
const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800';

interface ReturnOfAdvancesEntryProps {
  draftToResume?: TransactionDraft | null;
  onDraftResumed?: () => void;
  onDraftSaved?: () => void;
  // Set when Review's "Post" opened this draft; it is recorded once its saved fields are restored.
  autoPostDraft?: boolean;
  onDraftPosted?: (message: string) => void;
}

export function ReturnOfAdvancesEntry({ draftToResume = null, onDraftResumed, onDraftSaved, autoPostDraft = false, onDraftPosted }: ReturnOfAdvancesEntryProps): React.ReactElement {
  const { accounts, journalEntries, openingBalances, accountBalances, draftTransactions, addJournalEntry, saveDraftTransaction, deleteDraftTransaction, formatCurrency, settings } = useFinance();
  const [officer, setOfficer] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [pendingAutoPost, setPendingAutoPost] = useState(false);
  const appliedDraftIdRef = useRef<string | null>(null);

  // A saved draft is already in the ledger (balances update on Save as Draft), so while it is edited it must not count against itself.
  const draftEntryId = editingDraftId ? draftTransactions.find(draft => draft.id === editingDraftId)?.journalEntryId : undefined;
  const { entries: ledgerEntries, balances: ledgerBalances } = useMemo(
    () => ledgerWithoutDraftEntry(journalEntries, draftEntryId, accounts, openingBalances, accountBalances),
    [journalEntries, draftEntryId, accounts, openingBalances, accountBalances]
  );
  const summary = useMemo(() => counterpartySummary(ledgerEntries, '1250', 'Debit'), [ledgerEntries]);
  const withBalance = summary.filter(row => row.balance > 0);
  const remaining = withBalance.find(row => row.name === officer)?.balance || 0;
  const postingDate = date || (settings.semester && settings.reportingYear ? automaticPostingDate(settings.semester, settings.reportingYear) : '');
  const value = Number(amount) || 0;
  const lines = useMemo<JournalLine[]>(() => officer && value > 0 ? [
    { accountCode: '1010', debit: value, credit: 0, date: postingDate },
    { accountCode: '1250', debit: 0, credit: value, date: postingDate },
  ] : [], [officer, value, postingDate]);

  const reset = () => { setOfficer(''); setAmount(''); setDate(''); setEditingDraftId(null); appliedDraftIdRef.current = null; };

  useEffect(() => {
    if (!draftToResume || draftToResume.category !== RETURN_OF_ADVANCES_DRAFT || appliedDraftIdRef.current === draftToResume.id) return;
    appliedDraftIdRef.current = draftToResume.id;
    const snapshot = draftToResume.formState;
    setEditingDraftId(draftToResume.id);
    setOfficer(typeof snapshot.officer === 'string' ? snapshot.officer : '');
    setAmount(typeof snapshot.amount === 'string' ? snapshot.amount : '');
    setDate(typeof snapshot.date === 'string' ? snapshot.date : '');
    setError(''); setMessage('');
    setPendingAutoPost(autoPostDraft);
    onDraftResumed?.();
  }, [draftToResume, onDraftResumed]);

  const problem = (): string => {
    if (!settings.semester || !settings.reportingYear) return 'Set the organization Semester and Year before saving.';
    if (!officer) return 'Select the accountable officer returning the advance.';
    if (value <= 0) return 'Enter an amount greater than zero.';
    if (value > remaining + 0.005) return `The amount cannot exceed ${officer}'s remaining advance of ${formatCurrency(remaining)}.`;
    if (date && !isDateWithinReportingPeriod(date, settings.semester, settings.reportingYear)) return 'The date must be within the active reporting period.';
    return '';
  };

  // Saving as a draft writes the entry to the ledger as a draft (Dr Cash / Cr Advances to Officers); Review posts it.
  const record = (asDraft: boolean) => {
    setError(''); setMessage('');
    const issue = problem();
    if (issue) { setError(issue); return; }
    try {
      const entry = addJournalEntry(postingDate, `Return of Advance - ${officer}`, GENERAL_FUND, lines, undefined, undefined,
        { transactionType: RETURN_TYPE, details: { eventRelated: false, receiptAttachmentIds: [], counterpartyName: officer } },
        asDraft, editingDraftId || undefined, draftEntryId);
      if (asDraft) {
        const id = saveDraftTransaction({ id: editingDraftId || undefined, category: RETURN_OF_ADVANCES_DRAFT, label: `Return of Advances - ${officer}`, formState: { officer, amount, date }, journalEntryId: entry.id });
        setEditingDraftId(id);
        setMessage(`${entry.reference} saved as a draft. Its debit and credit are visible in the ledger and excluded from Financial Statements. Post it from Review.`);
        onDraftSaved?.();
        return;
      }
      if (editingDraftId) {
        deleteDraftTransaction(editingDraftId, [entry.id]);
        onDraftPosted?.(`${entry.reference}: ${officer} returned ${formatCurrency(value)}.`);
      }
      setMessage(`${officer} returned ${formatCurrency(value)}.`);
      reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save the return.'); }
  };

  // Review's Post runs the same checks and posts the saved draft.
  useEffect(() => {
    if (!pendingAutoPost) return;
    setPendingAutoPost(false);
    record(false);
  }, [pendingAutoPost]);

  const submit = (event: React.FormEvent) => { event.preventDefault(); record(true); };

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Return of Advances</h3>
    <p className="mt-1 text-[12px] font-medium text-slate-500">Record cash an accountable officer gives back from an advance. The amount cannot be more than that officer's remaining advance.</p>
    <div className="mt-4"><OfficerAdvanceSummary rows={summary} formatCurrency={formatCurrency} /></div>
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)]">
      <div className="grid content-start gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-bold uppercase text-slate-600 sm:col-span-2">Accountable officer
          <select value={officer} onChange={event => setOfficer(event.target.value)} className={inputClass}>
            <option value="">{withBalance.length ? 'Select an officer…' : 'No officer has a remaining advance'}</option>
            {withBalance.map(row => <option key={row.name} value={row.name}>{row.name} — {formatCurrency(row.balance)} remaining</option>)}
          </select>
        </label>
        <label className="text-[12px] font-bold uppercase text-slate-600">Amount
          <input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} disabled={!officer} placeholder="0.00" className={inputClass} />
          {officer && <span className={`mt-1 block text-[12px] normal-case ${value > remaining + 0.005 ? 'text-rose-600' : 'text-slate-500'}`}>Up to {formatCurrency(remaining)} can be returned.</span>}
        </label>
        <label className="text-[12px] font-bold uppercase text-slate-600">Date <span className="font-medium normal-case">(optional)</span>
          <input type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} />
          <span className="mt-1 block text-[12px] normal-case text-slate-500">If blank, the system uses {postingDate || 'the reporting period date'}.</span>
        </label>
      </div>
      <div className="h-fit"><FinancialPreviewPanels lines={lines} fallbackDate={postingDate} accounts={accounts} accountBalances={ledgerBalances} formatCurrency={formatCurrency} /></div>
    </div>
    {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}{message && <p className="mt-3 text-xs font-semibold text-emerald-600">{message}</p>}
    <div className="mt-4"><ReviewLaterNote /></div>
    <button type="submit" disabled={withBalance.length === 0} className="mt-4 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">Save as Draft</button>
  </form>;
}
