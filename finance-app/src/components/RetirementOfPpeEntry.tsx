import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { ledgerWithoutDraftEntry } from '../lib/draftLedger';
import { FinancialPreviewPanels } from './FinancialPreviewPanels';
import { ReviewLaterNote } from './ReviewLaterNote';
import { buildPpeReferences, describePpeReference, planPpeRetirement, PPE_ITEMS, ppeRetirementWarning, RETIREMENT_TYPE } from '../lib/ppeItems';
import { automaticPostingDate, isDateWithinReportingPeriod } from '../lib/reportingPeriod';
import { TransactionDraft } from '../types';

const GENERAL_FUND = 'General Fund Operations';
export const RETIREMENT_OF_PPE_DRAFT = 'retirement-of-ppe';
const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800';

interface RetirementOfPpeEntryProps {
  draftToResume?: TransactionDraft | null;
  onDraftResumed?: () => void;
  onDraftSaved?: () => void;
  // Set when Review's "Post" opened this draft; it is posted once its saved fields are restored.
  autoPostDraft?: boolean;
  onDraftPosted?: (message: string) => void;
}

export function RetirementOfPpeEntry({ draftToResume = null, onDraftResumed, onDraftSaved, autoPostDraft = false, onDraftPosted }: RetirementOfPpeEntryProps): React.ReactElement {
  const { accounts, journalEntries, openingBalances, draftTransactions, addJournalEntry, saveDraftTransaction, deleteDraftTransaction, accountBalances, formatCurrency, settings } = useFinance();
  const [itemCode, setItemCode] = useState('');
  const [referenceChoice, setReferenceChoice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState('');
  const [confirming, setConfirming] = useState(false);
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

  // Only Item References still held (linked to their purchases and depreciation, drafts included) can be retired.
  const references = useMemo(() => buildPpeReferences(ledgerEntries, openingBalances), [ledgerEntries, openingBalances]);
  const itemsWithStock = PPE_ITEMS.filter(item => references.some(reference => reference.item.code === item.code));
  const itemReferences = references.filter(reference => reference.item.code === itemCode);
  const selected = itemReferences.find(reference => reference.referenceId === referenceChoice) ?? (itemReferences.length === 1 ? itemReferences[0] : undefined);
  const accumulatedName = selected ? accounts.find(account => account.code === selected.item.accumulatedAccountCode)?.name || 'Accumulated Depreciation' : '';
  const postingDate = date || (settings.semester && settings.reportingYear ? automaticPostingDate(settings.semester, settings.reportingYear) : '');
  const plan = selected && quantity.trim() ? planPpeRetirement(selected, Number(quantity), postingDate) : null;
  const warning = plan ? ppeRetirementWarning(plan, formatCurrency) : '';

  const reset = () => { setItemCode(''); setReferenceChoice(''); setQuantity(''); setDate(''); setConfirming(false); setEditingDraftId(null); appliedDraftIdRef.current = null; };

  useEffect(() => {
    if (!draftToResume || draftToResume.category !== RETIREMENT_OF_PPE_DRAFT || appliedDraftIdRef.current === draftToResume.id) return;
    appliedDraftIdRef.current = draftToResume.id;
    const snapshot = draftToResume.formState;
    setEditingDraftId(draftToResume.id);
    setItemCode(typeof snapshot.itemCode === 'string' ? snapshot.itemCode : '');
    setReferenceChoice(typeof snapshot.referenceChoice === 'string' ? snapshot.referenceChoice : '');
    setQuantity(typeof snapshot.quantity === 'string' ? snapshot.quantity : '');
    setDate(typeof snapshot.date === 'string' ? snapshot.date : '');
    setConfirming(false); setError(''); setMessage('');
    setPendingAutoPost(autoPostDraft);
    onDraftResumed?.();
  }, [draftToResume, onDraftResumed]);

  const problem = (): string => {
    if (!settings.semester || !settings.reportingYear) return 'Set the organization Semester and Year before saving.';
    if (!selected) return 'Select the item and the purchase to retire.';
    if (date && !isDateWithinReportingPeriod(date, settings.semester, settings.reportingYear)) return 'The date must be within the active reporting period.';
    const result = planPpeRetirement(selected, Number(quantity), postingDate);
    return result.error || '';
  };

  // The retirement entry (accounts, quantity, cost and depreciation) is the same whether it is saved as a draft or posted.
  const record = (asDraft: boolean) => {
    setError(''); setMessage('');
    const issue = problem();
    if (issue || !selected) { setError(issue || 'Select the item and the purchase to retire.'); setConfirming(false); return; }
    const result = planPpeRetirement(selected, Number(quantity), postingDate);
    try {
      const entry = addJournalEntry(postingDate, `${RETIREMENT_TYPE} - ${selected.item.label}`, GENERAL_FUND, result.lines, undefined, undefined, {
        transactionType: RETIREMENT_TYPE,
        details: { eventRelated: false, receiptAttachmentIds: [], ppeItemCode: selected.item.code, ppeReferenceId: selected.referenceId, ppeRetiredQuantity: result.quantity, ppeRetiredCost: result.cost, ppeRetiredAccumulated: result.accumulatedDepreciation },
      }, asDraft, editingDraftId || undefined, draftEntryId);
      if (asDraft) {
        const id = saveDraftTransaction({ id: editingDraftId || undefined, category: RETIREMENT_OF_PPE_DRAFT, label: `${RETIREMENT_TYPE} - ${selected.item.label}`, formState: { itemCode, referenceChoice: selected.referenceId, quantity, date }, journalEntryId: entry.id });
        setEditingDraftId(id);
        setMessage(`${entry.reference} saved as a draft. Its debit and credit are visible in the ledger and excluded from Financial Statements. Post it from Review.`);
        onDraftSaved?.();
        return;
      }
      if (editingDraftId) {
        deleteDraftTransaction(editingDraftId, [entry.id]);
        onDraftPosted?.(`${entry.reference}: ${result.quantity} ${selected.item.label} retired.`);
      }
      setMessage(`${result.quantity} ${selected.item.label} retired.`);
      reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save the retirement.'); setConfirming(false); }
  };

  // Review's Post keeps the confirm step: a retirement with a loss or a zero book value is confirmed before it is posted.
  const requestPost = () => {
    setError(''); setMessage('');
    const issue = problem();
    if (issue) { setError(issue); return; }
    if (warning) { setConfirming(true); return; }
    record(false);
  };
  useEffect(() => {
    if (!pendingAutoPost) return;
    setPendingAutoPost(false);
    requestPost();
  }, [pendingAutoPost]);

  const submit = (event: React.FormEvent) => { event.preventDefault(); setConfirming(false); record(true); };

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Retirement of PPE</h3>
    <p className="mt-1 text-[12px] font-medium text-slate-500">Use this transaction when your organization permanently retires or disposes of equipment or furniture and fixtures that it no longer uses.</p>
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)]">
    <div className="grid content-start gap-3 sm:grid-cols-2">
      <label className="text-[12px] font-bold uppercase text-slate-600 sm:col-span-2">Item
        <select value={itemCode} onChange={event => { setItemCode(event.target.value); setReferenceChoice(''); setConfirming(false); }} className={inputClass}>
          <option value="">{itemsWithStock.length ? 'Select an item…' : 'No PPE item has a remaining quantity'}</option>
          {itemsWithStock.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      {itemCode && <label className="text-[12px] font-bold uppercase text-slate-600 sm:col-span-2">Purchase
        <select value={selected?.referenceId || ''} onChange={event => { setReferenceChoice(event.target.value); setConfirming(false); }} className={inputClass}>
          {itemReferences.length > 1 && <option value="">Select which purchase…</option>}
          {itemReferences.map(reference => <option key={reference.referenceId} value={reference.referenceId}>{describePpeReference(reference, formatCurrency)}</option>)}
        </select>
      </label>}
      {selected && <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">Available Quantity</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{selected.quantity}</p></div>
        <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">Amount per Unit</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(selected.unitCost)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">Remaining Original Cost</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(selected.cost)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3 text-[12px] dark:bg-slate-800"><span className="font-bold text-slate-500">{accumulatedName} ({selected.item.label} only)</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(selected.accumulatedDepreciation)}</p></div>
      </div>}
      <label className="text-[12px] font-bold uppercase text-slate-600">Quantity (to be disposed) <span className="text-rose-600">*required</span>
        <input type="number" min="1" step="1" value={quantity} onChange={event => { setQuantity(event.target.value); setConfirming(false); }} disabled={!selected} placeholder="Units to dispose of" className={inputClass} />
      </label>
      <label className="text-[12px] font-bold uppercase text-slate-600">Date <span className="font-medium normal-case">(optional)</span>
        <input type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} />
        <span className="mt-1 block text-[12px] normal-case text-slate-500">If blank, the system uses {postingDate || 'the reporting period date'}.</span>
      </label>
      {selected && plan && !plan.error && <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">
        <div className="rounded-lg bg-indigo-50 p-3 text-[12px] dark:bg-indigo-500/10"><span className="font-bold text-slate-500">Quantity to be disposed</span><p className="mt-1 text-xs font-black">{plan.quantity}</p></div>
        <div className="rounded-lg bg-indigo-50 p-3 text-[12px] dark:bg-indigo-500/10"><span className="font-bold text-slate-500">Original cost</span><p className="mt-1 text-xs font-black">{formatCurrency(plan.cost)}</p></div>
        <div className="rounded-lg bg-indigo-50 p-3 text-[12px] dark:bg-indigo-500/10"><span className="font-bold text-slate-500">Accumulated depreciation</span><p className="mt-1 text-xs font-black">{formatCurrency(plan.accumulatedDepreciation)}</p></div>
        <div className="rounded-lg bg-indigo-50 p-3 text-[12px] dark:bg-indigo-500/10"><span className="font-bold text-slate-500">Net Book Value</span><p className="mt-1 text-xs font-black">{formatCurrency(plan.netBookValue)}</p></div>
      </div>}
      {plan?.error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 sm:col-span-2">{plan.error}</p>}
    </div>
    <div className="h-fit"><FinancialPreviewPanels lines={plan && !plan.error ? plan.lines : []} fallbackDate={postingDate} accounts={accounts} accountBalances={ledgerBalances} formatCurrency={formatCurrency} /></div>
    </div>
    {confirming && warning && <div role="alertdialog" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <p>{warning}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => record(false)} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white">Confirm and retire</button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200">Cancel</button>
      </div>
    </div>}
    {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}{message && <p className="mt-3 text-xs font-semibold text-emerald-600">{message}</p>}
    <div className="mt-4"><ReviewLaterNote /></div>
    {!confirming && <button type="submit" disabled={references.length === 0} className="mt-4 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">Save as Draft</button>}
  </form>;
}
