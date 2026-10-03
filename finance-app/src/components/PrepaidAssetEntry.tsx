import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { counterpartyBalance, counterpartyBalances } from '../lib/counterpartyBalances';
import { computePendingObligations } from '../lib/reviewEngine';
import {
  buildPrepaidAssetConsumptionPosting,
  buildPrepaidAssetDownpaymentPosting,
  buildPrepaidAssetPurchasePosting,
  PREPAID_ASSET_CATEGORIES,
  PREPAID_ASSET_ITEMS,
  PrepaidAssetCategory,
  PrepaidAssetPaymentMethod,
} from '../lib/prepaidAssets';
import { DatedAmountRecord } from '../types';

type Mode = 'purchase' | 'consumption' | 'downpayment';
const GENERAL_FUND = 'General Fund Operations';
const paymentMethods: { value: PrepaidAssetPaymentMethod; label: string }[] = [
  { value: 'organization-funds', label: 'Paid directly by the organization' },
  { value: 'officer-personal', label: 'Paid by an officer using personal money - to be reimbursed' },
  { value: 'officer-advance', label: 'Paid using a cash advance previously given to the officer' },
  { value: 'combination', label: 'Combination of organization funds, officer personal money, and/or cash advance' },
  { value: 'not-yet-paid', label: 'Not yet paid (payment will be made next reporting period)' },
];

const money = (value: string) => Number(value) || 0;
const rowsTotal = (rows: DatedAmountRecord[]) => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

function PaymentRows({ label, rows, setRows, defaultDate }: { label: string; rows: DatedAmountRecord[]; setRows: (rows: DatedAmountRecord[]) => void; defaultDate: string }) {
  return <div className="space-y-2">
    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</label>
    {rows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
      <input type="date" value={row.date} onChange={event => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item))} className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
      <input type="number" min="0" step="0.01" value={row.amount || ''} onChange={event => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, amount: money(event.target.value) } : item))} placeholder="Amount" className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
      <button type="button" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))} className="px-2 text-xs font-bold text-rose-600" aria-label={`Remove ${label} row ${index + 1}`}>×</button>
    </div>)}
    <button type="button" onClick={() => setRows([...rows, { date: defaultDate, amount: 0 }])} className="text-[10px] font-bold text-blue-700 dark:text-blue-300">+ Add payment</button>
  </div>;
}

export function PrepaidAssetEntry(): React.ReactElement {
  const { accounts, journalEntries, addJournalEntry, accountBalances, formatCurrency, settings } = useFinance();
  const [mode, setMode] = useState<Mode>('purchase');
  const [item, setItem] = useState('');
  const [category, setCategory] = useState<PrepaidAssetCategory | ''>('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purpose, setPurpose] = useState<'event' | 'general'>('general');
  const [eventName, setEventName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PrepaidAssetPaymentMethod>('organization-funds');
  const [officer, setOfficer] = useState('');
  const [organizationPayments, setOrganizationPayments] = useState<DatedAmountRecord[]>([{ date: '', amount: 0 }]);
  const [officerPayments, setOfficerPayments] = useState<DatedAmountRecord[]>([{ date: '', amount: 0 }]);
  const [advancePayments, setAdvancePayments] = useState<DatedAmountRecord[]>([{ date: '', amount: 0 }]);
  const [selectedDownpaymentId, setSelectedDownpaymentId] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const allowedCategories = item ? PREPAID_ASSET_ITEMS[item] || [] : [];
  const availableItems = Object.keys(PREPAID_ASSET_ITEMS).filter(value => mode !== 'downpayment' || PREPAID_ASSET_ITEMS[value].some(category => category === 'rent' || category === 'uniform'));
  const officerAdvances = useMemo(() => counterpartyBalances(journalEntries, '1250', 'Debit'), [journalEntries]);
  const availableAdvance = officer ? counterpartyBalance(journalEntries, '1250', 'Debit', officer) : 0;
  const availableCash = Math.max(0, accountBalances['1010'] || 0);
  const config = category ? PREPAID_ASSET_CATEGORIES[category] : null;

  const downpayments = useMemo(() => journalEntries.flatMap(entry => {
    const entryCategory = entry.transactionDetails?.prepaidAssetCategory;
    if (!entryCategory || !['rent', 'uniform'].includes(entryCategory)) return [];
    const depositCode = PREPAID_ASSET_CATEGORIES[entryCategory].depositCode;
    const original = entry.lines.filter(line => line.accountCode === depositCode).reduce((sum, line) => sum + line.debit - line.credit, 0);
    if (original <= 0) return [];
    const applied = journalEntries.filter(candidate => candidate.transactionDetails?.prepaidAssetDownpaymentEntryId === entry.id)
      .reduce((sum, candidate) => sum + Number(candidate.transactionDetails?.prepaidAssetDownpaymentAmount || 0), 0);
    const remaining = Math.round((original - applied) * 100) / 100;
    return remaining > 0 ? [{ id: entry.id, category: entryCategory, item: entry.transactionDetails?.prepaidAssetItem || entry.description, remaining, reference: entry.reference }] : [];
  }), [journalEntries]);
  const matchingDownpayments = downpayments.filter(record => record.category === category && (!item || record.item === item));
  const selectedDownpayment = matchingDownpayments.find(record => record.id === selectedDownpaymentId);

  const prepaidPurchases = useMemo(() => computePendingObligations(journalEntries, accounts)
    .filter(obligation => ['1280', '1285', '1290', '1295', '1298'].includes(obligation.accountCode))
    .map(obligation => ({ obligation, entry: journalEntries.find(entry => entry.id === obligation.entryId) }))
    .filter(record => !!record.entry), [accounts, journalEntries]);
  const selectedPurchase = prepaidPurchases.find(record => record.obligation.entryId === selectedPurchaseId);

  const chooseItem = (nextItem: string) => {
    setItem(nextItem);
    const choices = PREPAID_ASSET_ITEMS[nextItem] || [];
    setCategory(choices.length === 1 ? choices[0] : '');
    setSelectedDownpaymentId('');
  };

  const reset = () => {
    setItem(''); setCategory(''); setDate(''); setAmount(''); setQuantity(''); setPurpose('general'); setEventName(''); setOfficer('');
    setOrganizationPayments([{ date: '', amount: 0 }]); setOfficerPayments([{ date: '', amount: 0 }]); setAdvancePayments([{ date: '', amount: 0 }]);
    setSelectedDownpaymentId(''); setSelectedPurchaseId('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!settings.semester || !settings.reportingYear) return setError('Set the organization Semester and Year before posting.');
    if (!date) return setError('Enter the transaction date.');
    try {
      if (mode === 'consumption') {
        if (!selectedPurchase?.entry) throw new Error('Select a prepaid-asset purchase with an unused balance.');
        const details = selectedPurchase.entry.transactionDetails;
        const selectedCategory = details?.prepaidAssetCategory;
        if (!selectedCategory) throw new Error('The selected purchase has no prepaid-asset category.');
        const value = money(amount);
        if (value > selectedPurchase.obligation.remainingAmount) throw new Error('Consumption cannot exceed the remaining prepaid-asset balance.');
        addJournalEntry(date, `Consumption of ${details.prepaidAssetItem || 'Prepaid Asset'}`, GENERAL_FUND, buildPrepaidAssetConsumptionPosting(selectedCategory, value, date), selectedPurchase.entry.eventName, selectedPurchase.entry.id, {
          transactionType: 'Consumption of Prepaid Assets', details: { eventRelated: !!selectedPurchase.entry.eventName, receiptAttachmentIds: [], prepaidAssetCategory: selectedCategory, prepaidAssetItem: details.prepaidAssetItem, prepaidAssetExpenseAccountCode: PREPAID_ASSET_CATEGORIES[selectedCategory].expenseCode, prepaidAssetPurpose: details.prepaidAssetPurpose },
        });
      } else {
        if (!item || !category) throw new Error('Select an item and its category.');
        const value = money(amount);
        if (mode === 'downpayment') {
          if (value > availableCash) throw new Error('Downpayment cannot exceed the available cash balance.');
          addJournalEntry(date, `Downpayment for ${item}`, GENERAL_FUND, buildPrepaidAssetDownpaymentPosting(category, value, date), purpose === 'event' ? eventName : undefined, undefined, {
            transactionType: 'Downpayment of Prepaid Assets', details: { eventRelated: purpose === 'event', receiptAttachmentIds: [], prepaidAssetCategory: category, prepaidAssetItem: item, prepaidAssetPurpose: purpose, counterpartyName: item },
          });
        } else {
          if (purpose === 'event' && !eventName.trim()) throw new Error('Enter the event name.');
          if ((category === 'awards' || category === 'supplies') && (!Number.isInteger(money(quantity)) || money(quantity) <= 0)) throw new Error('Enter a whole-number quantity greater than zero.');
          const needsOfficer = paymentMethod === 'officer-personal' || paymentMethod === 'officer-advance' || paymentMethod === 'combination';
          if (needsOfficer && !officer.trim()) throw new Error('Select or enter the accountable officer.');
          const posting = buildPrepaidAssetPurchasePosting({ category, purchasePrice: value, purchaseDate: date, paymentMethod, organizationPayments, officerPayments, advancePayments, downpaymentAmount: selectedDownpayment?.remaining || 0, availableCash, availableAdvance });
          addJournalEntry(date, `Purchase of ${item}`, GENERAL_FUND, posting.lines, purpose === 'event' ? eventName : undefined, undefined, {
            transactionType: 'Purchase of Prepaid Assets', details: { eventRelated: purpose === 'event', receiptAttachmentIds: [], prepaidAssetCategory: category, prepaidAssetItem: item, prepaidAssetQuantity: (category === 'awards' || category === 'supplies') ? money(quantity) : undefined, prepaidAssetPurchasePrice: value, prepaidAssetPaymentMethod: paymentMethod, prepaidAssetExpenseAccountCode: config?.expenseCode, prepaidAssetDownpaymentEntryId: selectedDownpayment?.id, prepaidAssetDownpaymentAmount: selectedDownpayment?.remaining, prepaidAssetPayableAmount: posting.payable, prepaidAssetPurpose: purpose, counterpartyName: officer.trim() || item },
          });
        }
      }
      setMessage('Prepaid-asset transaction posted successfully.'); reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to post the prepaid-asset transaction.'); }
  };

  const showOrg = paymentMethod === 'organization-funds' || paymentMethod === 'combination';
  const showOfficer = paymentMethod === 'officer-personal' || paymentMethod === 'combination';
  const showAdvance = paymentMethod === 'officer-advance' || paymentMethod === 'combination';
  const totalPaid = rowsTotal(showOrg ? organizationPayments : []) + rowsTotal(showOfficer ? officerPayments : []) + rowsTotal(showAdvance ? advancePayments : []) + (selectedDownpayment?.remaining || 0);

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <div className="flex flex-wrap gap-2">
      {([['purchase', 'Purchase'], ['consumption', 'Consumption'], ['downpayment', 'Downpayment']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setMode(value); setItem(''); setCategory(''); setAmount(''); setSelectedDownpaymentId(''); setSelectedPurchaseId(''); setError(''); setMessage(''); }} className={`rounded-lg px-4 py-2 text-xs font-bold ${mode === value ? 'bg-blue-700 text-white' : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>{label}</button>)}
    </div>
    <p className="mt-3 text-[10px] font-medium text-slate-500">Record purchases now so they affect the ledger and financial statements. Unused balances remain open for Consumption in this category or in Review.</p>
    {mode === 'consumption' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Prepaid asset purchase<select value={selectedPurchaseId} onChange={event => setSelectedPurchaseId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="">Select a purchase…</option>{prepaidPurchases.map(({ obligation, entry }) => <option key={obligation.entryId} value={obligation.entryId}>{entry?.transactionDetails?.prepaidAssetItem || obligation.description} — {formatCurrency(obligation.remainingAmount)} remaining</option>)}</select></label>
      <label className="text-[10px] font-bold uppercase text-slate-600">Date<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
      <label className="text-[10px] font-bold uppercase text-slate-600">Amount consumed<input type="number" min="0" step="0.01" max={selectedPurchase?.obligation.remainingAmount} value={amount} onChange={event => setAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
    </div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[10px] font-bold uppercase text-slate-600">Item<select value={item} onChange={event => chooseItem(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="">Select an item…</option>{availableItems.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-[10px] font-bold uppercase text-slate-600">Category<select value={category} onChange={event => { setCategory(event.target.value as PrepaidAssetCategory); setSelectedDownpaymentId(''); }} disabled={!item} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"><option value="">Select a category…</option>{allowedCategories.map(value => <option key={value} value={value}>{PREPAID_ASSET_CATEGORIES[value].label}</option>)}</select></label>
      <label className="text-[10px] font-bold uppercase text-slate-600">Date<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
      <label className="text-[10px] font-bold uppercase text-slate-600">{mode === 'purchase' ? 'Purchase price' : 'Initial downpayment'}<input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
      {mode === 'purchase' && (category === 'awards' || category === 'supplies') && <label className="text-[10px] font-bold uppercase text-slate-600">Quantity<input type="number" min="1" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>}
      <label className="text-[10px] font-bold uppercase text-slate-600">Purpose<select value={purpose} onChange={event => setPurpose(event.target.value as 'event' | 'general')} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="event">For an event</option><option value="general">For a general purpose</option></select></label>
      {purpose === 'event' && <label className="text-[10px] font-bold uppercase text-slate-600">Event name<input value={eventName} onChange={event => setEventName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>}
      {mode === 'purchase' && <>
        <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Payment method<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PrepaidAssetPaymentMethod)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">{paymentMethods.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
        {(showOfficer || showAdvance) && <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Accountable officer<input list="prepaid-officers" value={officer} onChange={event => setOfficer(event.target.value)} placeholder="Officer name" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><datalist id="prepaid-officers">{officerAdvances.map(record => <option key={record.name} value={record.name} />)}</datalist>{showAdvance && <span className="mt-1 block text-[10px] text-indigo-700">Available advance: {formatCurrency(availableAdvance)}</span>}</label>}
        {showOrg && <PaymentRows label={`Organization cash payments (available ${formatCurrency(availableCash)})`} rows={organizationPayments} setRows={setOrganizationPayments} defaultDate={date} />}
        {showOfficer && <PaymentRows label="Officer personal payments" rows={officerPayments} setRows={setOfficerPayments} defaultDate={date} />}
        {showAdvance && <PaymentRows label="Payments through officer advance" rows={advancePayments} setRows={setAdvancePayments} defaultDate={date} />}
        {(category === 'rent' || category === 'uniform') && <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Previously recorded downpayment<select value={selectedDownpaymentId} onChange={event => setSelectedDownpaymentId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="">None</option>{matchingDownpayments.map(record => <option key={record.id} value={record.id}>{record.reference} — {record.item} — {formatCurrency(record.remaining)}</option>)}</select></label>}
        <div className="rounded-lg bg-slate-50 p-3 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 sm:col-span-2">Total payments and applied downpayment: {formatCurrency(totalPaid)}{money(amount) > totalPaid && <span className="ml-2 text-amber-700">Unpaid balance: {formatCurrency(money(amount) - totalPaid)} will be recorded as Account Payable-Expense.</span>}</div>
      </>}
    </div>}
    {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}{message && <p className="mt-3 text-xs font-semibold text-emerald-600">{message}</p>}
    <button type="submit" className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white">Post Prepaid Asset Transaction</button>
  </form>;
}
