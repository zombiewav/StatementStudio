import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { PrepaidAdjustmentItem } from '../lib/otherAdjustments';
import { PREPAID_ASSET_CATEGORIES, prepaidCategoryForAssetAccount } from '../lib/prepaidAssets';
import { automaticPostingDate } from '../lib/reportingPeriod';
import { buildPrepaidExpenseSettlementLines } from '../lib/reviewEngine';

const GENERAL_FUND = 'General Fund Operations';
const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800';

interface PrepaidAdjustmentsSectionProps {
  items: PrepaidAdjustmentItem[];
  semesterKey: string;
  /** A balance carried in from an earlier semester has no purchase entry, so its answer is kept with the semester. */
  onCarriedUpdated: (accountCode: string) => void;
}

function PrepaidRow({ item, semesterKey, onCarriedUpdated }: { item: PrepaidAdjustmentItem; semesterKey: string; onCarriedUpdated: (accountCode: string) => void }): React.ReactElement {
  const { accounts, journalEntries, settings, formatCurrency, addJournalEntry, finalizePrepaidAssetForSemester } = useFinance();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState<'general' | 'event'>('general');
  const [eventName, setEventName] = useState('');
  const [expenseCode, setExpenseCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const purchase = item.entryId ? journalEntries.find(entry => entry.id === item.entryId) : undefined;
  // The four prepaid asset accounts each have a related expense account; only the general Prepaid Expenses account asks which expense.
  const category = prepaidCategoryForAssetAccount(item.accountCode);
  const relatedExpenseCode = category ? PREPAID_ASSET_CATEGORIES[category].expenseCode : '';
  const defaultExpenseCode = purchase?.transactionDetails?.prepaidAssetExpenseAccountCode
    || purchase?.lines.find(line => line.debit > 0 && accounts.find(account => account.code === line.accountCode)?.type === 'Expenses')?.accountCode || '';
  const resolvedExpenseCode = relatedExpenseCode || expenseCode || defaultExpenseCode;
  const expenseAccounts = accounts.filter(account => account.type === 'Expenses' && account.isActive);
  const value = amount.trim() === '' ? NaN : Number(amount);
  const accountName = accounts.find(account => account.code === item.accountCode)?.name || item.accountCode;

  const save = () => {
    setError(''); setMessage('');
    if (!Number.isFinite(value)) { setError('Enter how much was consumed this semester (0 if none).'); return; }
    if (value < 0) { setError('The consumption amount cannot be negative.'); return; }
    if (value > item.remaining + 0.005) { setError(`The consumption amount cannot be more than the available balance of ${formatCurrency(item.remaining)}.`); return; }
    if (value > 0) {
      if (purpose === 'event' && !eventName.trim()) { setError('Enter the event name.'); return; }
      if (!resolvedExpenseCode) { setError('Select the expense account before saving.'); return; }
    }
    try {
      if (value > 0) {
        addJournalEntry(
          automaticPostingDate(settings.semester, settings.reportingYear),
          `Consumption of ${purchase?.transactionDetails?.prepaidAssetItem || item.label}`,
          GENERAL_FUND,
          buildPrepaidExpenseSettlementLines(resolvedExpenseCode, Math.round(value * 100) / 100, item.accountCode),
          purpose === 'event' ? eventName.trim() : undefined,
          item.entryId,
          {
            transactionType: 'Consumption of Prepaid Assets',
            details: {
              eventRelated: purpose === 'event', receiptAttachmentIds: [], prepaidAssetCategory: category,
              prepaidAssetItem: purchase?.transactionDetails?.prepaidAssetItem, prepaidAssetExpenseAccountCode: resolvedExpenseCode, prepaidAssetPurpose: purpose,
            },
          },
        );
      }
      // Once answered for the semester, the same consumption cannot be recorded again for this period.
      if (item.entryId) finalizePrepaidAssetForSemester(item.entryId, semesterKey);
      else onCarriedUpdated(item.accountCode);
      setMessage(value > 0 ? `${formatCurrency(value)} consumption saved.` : 'Saved: nothing was consumed this semester.');
      setOpen(false); setAmount(''); setEventName(''); setPurpose('general');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save the adjustment.'); }
  };

  return <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
    <div className="flex flex-col justify-between gap-3 bg-white p-4 dark:bg-slate-900 sm:flex-row sm:items-center">
      <div>
        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.label}</p>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{accountName} ({item.accountCode})</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available balance</p>
          <p className="text-sm font-black text-slate-900 dark:text-slate-100">{formatCurrency(item.remaining)}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase ${item.updated ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'}`}>{item.updated ? 'Updated' : 'To update'}</span>
        {!item.updated && <button type="button" onClick={() => setOpen(!open)} className="rounded-lg bg-blue-50 px-3 py-1.5 text-[13px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20">{open ? 'Close' : 'Update'}</button>}
      </div>
    </div>
    {message && <p className="border-t border-slate-100 bg-emerald-50 px-4 py-2 text-[12px] font-semibold text-emerald-700 dark:border-slate-800 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
    {open && !item.updated && <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[12px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300">How much of this has been used or consumed this semester?
        <input type="number" min="0" step="0.01" max={item.remaining} aria-label="Amount consumed" value={amount} onChange={event => setAmount(event.target.value)} placeholder={`0.00, up to ${formatCurrency(item.remaining)}`} className={inputClass} />
      </label>
      {value > 0 && <>
        <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400">Purpose
          <select value={purpose} onChange={event => setPurpose(event.target.value as 'general' | 'event')} className={inputClass}>
            <option value="general">For a general purpose</option>
            <option value="event">For an event</option>
          </select>
        </label>
        {purpose === 'event' && <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400">Event name
          <input value={eventName} onChange={event => setEventName(event.target.value)} className={inputClass} />
        </label>}
        {!relatedExpenseCode && <label className="block text-[12px] font-bold text-slate-600 dark:text-slate-400">Which expense is this?
          <select value={resolvedExpenseCode} onChange={event => setExpenseCode(event.target.value)} className={inputClass}>
            <option value="" disabled>Select an expense account…</option>
            {expenseAccounts.map(account => <option key={account.code} value={account.code}>{account.code} - {account.name}</option>)}
          </select>
        </label>}
      </>}
      <button type="button" onClick={save} className="w-full rounded-lg bg-blue-700 p-2.5 text-xs font-bold text-white hover:bg-blue-800">Save adjustment</button>
    </div>}
  </div>;
}

export function PrepaidAdjustmentsSection({ items, semesterKey, onCarriedUpdated }: PrepaidAdjustmentsSectionProps): React.ReactElement {
  return <div className="space-y-3">
    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">For each prepaid asset that still has a balance, tell us how much was used up this semester. The rest stays as a prepaid asset.</p>
    {items.length === 0
      ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[13px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">No prepaid asset has a balance, so there is nothing to consume this semester.</p>
      : items.map(item => <PrepaidRow key={item.key} item={item} semesterKey={semesterKey} onCarriedUpdated={onCarriedUpdated} />)}
  </div>;
}
