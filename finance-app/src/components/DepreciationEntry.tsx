import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { ledgerWithoutDraftEntry } from '../lib/draftLedger';
import { buildPpeReferences } from '../lib/ppeItems';
import { automaticPostingDate, isDateWithinReportingPeriod, periodForSemester } from '../lib/reportingPeriod';
import { JournalLine, TransactionDraft } from '../types';
import { FinancialPreviewPanels } from './FinancialPreviewPanels';
import { ReviewLaterNote } from './ReviewLaterNote';

const GENERAL_FUND = 'General Fund Operations';
export const DEPRECIATION_DRAFT = 'depreciation';
const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800';

interface DepreciationEntryProps {
  /** The PPE group (Item Reference) being depreciated; the item and its quantity are pre-identified. */
  referenceId: string;
  draftToResume?: TransactionDraft | null;
  onDraftResumed?: () => void;
  onDraftSaved?: () => void;
  // Set when Review's "Post" opened this draft; it is posted once its saved fields are restored.
  autoPostDraft?: boolean;
  onDraftPosted?: (message: string) => void;
}

export function DepreciationEntry({ referenceId, draftToResume = null, onDraftResumed, onDraftSaved, autoPostDraft = false, onDraftPosted }: DepreciationEntryProps): React.ReactElement {
  const { accounts, journalEntries, openingBalances, accountBalances, draftTransactions, addJournalEntry, saveDraftTransaction, deleteDraftTransaction, formatCurrency, settings } = useFinance();
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
  const reference = useMemo(() => buildPpeReferences(ledgerEntries, openingBalances).find(candidate => candidate.referenceId === referenceId), [ledgerEntries, openingBalances, referenceId]);
  const value = Number(amount) || 0;
  const postingDate = date || (settings.semester && settings.reportingYear ? automaticPostingDate(settings.semester, settings.reportingYear) : '');
  const lines = useMemo<JournalLine[]>(() => reference && value > 0 ? [
    { accountCode: reference.item.depreciationExpenseCode, debit: value, credit: 0, date: postingDate },
    { accountCode: reference.item.accumulatedAccountCode, debit: 0, credit: value, date: postingDate },
  ] : [], [reference, value, postingDate]);
  const accumulatedName = reference ? accounts.find(account => account.code === reference.item.accumulatedAccountCode)?.name || 'Accumulated Depreciation' : '';

  const reset = () => { setAmount(''); setDate(''); setEditingDraftId(null); appliedDraftIdRef.current = null; };

  useEffect(() => {
    if (!draftToResume || draftToResume.category !== DEPRECIATION_DRAFT || appliedDraftIdRef.current === draftToResume.id) return;
    appliedDraftIdRef.current = draftToResume.id;
    const snapshot = draftToResume.formState;
    setEditingDraftId(draftToResume.id);
    // Drafts saved by the older general form keep their amount as a number.
    setAmount(typeof snapshot.amount === 'string' ? snapshot.amount : typeof snapshot.amount === 'number' && snapshot.amount > 0 ? String(snapshot.amount) : '');
    setDate(typeof snapshot.date === 'string' ? snapshot.date : '');
    setError(''); setMessage('');
    setPendingAutoPost(autoPostDraft);
    onDraftResumed?.();
  }, [draftToResume, onDraftResumed]);

  const problem = (): string => {
    if (!settings.semester || !settings.reportingYear) return 'Set the organization Semester and Year before saving.';
    if (!reference) return 'This purchase no longer has a balance to depreciate.';
    if (reference.netBookValue <= 0.005) return 'These units have a Net Book Value of zero, so no depreciation transaction is necessary.';
    if (value <= 0) return 'Enter a depreciation amount greater than zero.';
    if (value > reference.netBookValue + 0.005) return `Depreciation cannot exceed the Net Book Value of the selected ${reference.item.label} purchase (${formatCurrency(reference.netBookValue)}).`;
    if (date && !isDateWithinReportingPeriod(date, settings.semester, settings.reportingYear)) return 'The date must be within the active reporting period.';
    return '';
  };

  // Saving as a draft writes the entry to the ledger as a draft (Dr Depreciation Expense / Cr Accumulated Depreciation); Review posts it.
  const record = (asDraft: boolean) => {
    setError(''); setMessage('');
    const issue = problem();
    if (issue || !reference) { setError(issue || 'This purchase no longer has a balance to depreciate.'); return; }
    const type = reference.item.depreciationType;
    try {
      const entry = addJournalEntry(postingDate, type, GENERAL_FUND, lines, undefined, undefined, {
        transactionType: type,
        details: {
          eventRelated: false, receiptAttachmentIds: [], ppeItemCode: reference.item.code, ppeReferenceId: reference.referenceId,
          semester: settings.semester || undefined, reportingPeriod: settings.semester ? periodForSemester(settings.semester) : undefined, reportingYear: settings.reportingYear,
        },
      }, asDraft, editingDraftId || undefined, draftEntryId);
      if (asDraft) {
        const id = saveDraftTransaction({ id: editingDraftId || undefined, category: DEPRECIATION_DRAFT, label: `${type}`, formState: { referenceId: reference.referenceId, amount, date }, journalEntryId: entry.id });
        setEditingDraftId(id);
        setMessage(`${entry.reference} saved as a draft. Its debit and credit are visible in the ledger and excluded from Financial Statements. Post it from Review.`);
        onDraftSaved?.();
        return;
      }
      if (editingDraftId) {
        deleteDraftTransaction(editingDraftId, [entry.id]);
        onDraftPosted?.(`${entry.reference}: ${type} of ${formatCurrency(value)} posted.`);
      }
      setMessage(`${type} of ${formatCurrency(value)} posted.`);
      reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save the depreciation.'); }
  };

  // Review's Post runs the same checks and posts the saved draft.
  useEffect(() => {
    if (!pendingAutoPost) return;
    setPendingAutoPost(false);
    record(false);
  }, [pendingAutoPost]);

  const submit = (event: React.FormEvent) => { event.preventDefault(); record(true); };

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Depreciation{reference ? ` of ${reference.item.label}` : ''}</h3>
    <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">Note: Compute depreciation based on your organization’s depreciation policy and include the depreciation for the entire semester.</p>
    <p className="mt-2 rounded-lg bg-slate-50 p-3 text-[12px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Event: General and Administrative (automatic classification)</p>
    {reference && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">Available Quantity</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{reference.quantity}</p></div>
      <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">Amount per Unit</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(reference.unitCost)}</p></div>
      <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">Remaining Original Cost</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(reference.cost)}</p></div>
      <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">{accumulatedName} ({reference.item.label})</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(reference.accumulatedDepreciation)}</p></div>
    </div>}
    {reference && <p className="mt-3 text-[12px] font-semibold text-slate-600 dark:text-slate-300">Net Book Value of the selected purchase: {formatCurrency(reference.netBookValue)}. The depreciation amount cannot be more than this.</p>}
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)]">
      <div className="grid content-start gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-bold uppercase text-slate-600">Depreciation amount
          <input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" className={inputClass} />
          <span className="mt-1 block text-[12px] normal-case text-slate-500">*Note: The amount entered here will be allocated based on the available quantity.</span>
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
    <button type="submit" disabled={!reference} className="mt-4 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">Save as Draft</button>
  </form>;
}
