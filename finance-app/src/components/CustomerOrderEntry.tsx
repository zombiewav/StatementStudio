import React, { useEffect, useRef, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { JournalEntry, TransactionDraft } from '../types';
import { buildCustomerOrderPosting, buildProvisionalCustomerOrderPosting, customerOrderFinalizationIssues, customerOrderState, sameMerchandise } from '../lib/customerOrders';
import { buildMerchandiseBatchBalances } from '../lib/merchandiseSale';
import { isDateWithinReportingPeriod } from '../lib/reportingPeriod';
import { DatedAmountInputRow, DatedAmountRows } from './DatedAmountRows';

export const CUSTOMER_ORDER_DRAFT = 'customer-order';
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const button = 'rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-800 dark:text-blue-200';
const empty = () => ({ mode: 'new', orderId: '', item: 'Lanyard', other: '', batch: '', kind: 'merchandise', total: '', estimatedCost: '', date: '', sales: '', cost: '', quantity: '', batchEntryId: '', refund: '', collections: [{ id: 'cash-1', date: '', amount: '' }] as DatedAmountInputRow[] });
type Form = ReturnType<typeof empty>;

export function CustomerOrderEntry({ orderId, editOriginal = false, draftToResume, onDraftResumed }: {
  orderId?: string; editOriginal?: boolean; draftToResume?: TransactionDraft | null; onDraftResumed?: () => void; onDraftSaved?: () => void;
}) {
  const { journalEntries, accounts, settings, formatCurrency, addJournalEntry, updateJournalEntry, deleteDraftTransaction } = useFinance();
  const original = orderId ? journalEntries.find(entry => entry.id === orderId) : undefined;
  const originalForm = (): Form => {
    if (!editOriginal || !original?.transactionDetails?.customerOrder) return { ...empty(), ...(orderId ? { mode: 'update', orderId } : {}) };
    const details = original.transactionDetails;
    const orderTerms = details.customerOrder;
    if (!orderTerms) return { ...empty(), ...(orderId ? { mode: 'update', orderId } : {}) };
    const savedItem = details.merchandiseItem || '';
    const standardItem = ['Lanyard', 'Shirt', 'Pins', 'Tote Bag', 'Mugs', 'Stickers'].includes(savedItem);
    return {
      ...empty(), mode: 'new', orderId: original.id,
      item: standardItem ? savedItem : 'Others', other: standardItem ? '' : savedItem,
      batch: details.merchandiseBatch || '', kind: orderTerms.kind,
      total: String(orderTerms.total), estimatedCost: String(orderTerms.estimatedCost), date: original.date,
      collections: original.lines.filter(line => line.accountCode === '1010' && line.debit > 0).map((line, index) => ({ id: `saved-${index}`, date: line.date || original.date, amount: String(line.debit) })),
    };
  };
  const [form, setForm] = useState<Form>(originalForm);
  const [draftId, setDraftId] = useState<string>();
  const [message, setMessage] = useState('');
  const applied = useRef('');
  const change = (patch: Partial<Form>) => { setForm(old => ({ ...old, ...patch })); setMessage(''); };
  useEffect(() => {
    if (draftToResume?.category !== CUSTOMER_ORDER_DRAFT || applied.current === draftToResume.id) return;
    applied.current = draftToResume.id;
    setForm({ ...empty(), ...draftToResume.formState } as Form);
    setDraftId(draftToResume.id);
    onDraftResumed?.();
  }, [draftToResume, onDraftResumed]);
  const orders = journalEntries.filter(e => e.transactionDetails?.customerOrder && !e.reversalOfEntryId && !e.reversedByEntryId);
  const root = form.mode === 'update' ? orders.find(e => e.id === form.orderId) : undefined;
  const terms = root?.transactionDetails?.customerOrder;
  const state = root ? customerOrderState(root, journalEntries) : undefined;
  const item = root?.transactionDetails?.merchandiseItem || (form.item === 'Others' ? form.other : form.item);
  const batch = root?.transactionDetails?.merchandiseBatch || form.batch;
  const kind = terms?.kind || (form.kind === 'service' ? 'service' : 'merchandise');
  const batches = buildMerchandiseBatchBalances(journalEntries).filter(b => sameMerchandise(b.item, item) && sameMerchandise(b.batch, batch));
  const noInventory = kind === 'merchandise' && !batches.length;
  const total = terms?.total ?? Number(form.total);
  const post = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (!settings.semester || !settings.reportingYear) throw new Error('Select the organization semester and reporting year first.');
      const semester = settings.semester;
      const reportingYear = settings.reportingYear;
      if (form.mode === 'update' && !root) throw new Error('Choose a saved customer transaction.');
      if (root && (!item.trim() || !batch.trim())) throw new Error('The saved order needs an item/service and batch/order reference before follow-up activity can be posted.');
      if (!root && form.estimatedCost !== '' && (!Number.isFinite(Number(form.estimatedCost)) || Number(form.estimatedCost) < 0)) throw new Error('Estimated cost must be zero or greater.');
      const collections = form.collections.filter(r => r.amount !== '').map(r => ({ date: r.date || form.date, amount: Number(r.amount) }));
      if ([form.date, ...collections.map(r => r.date)].some(d => !isDateWithinReportingPeriod(d, semester, reportingYear))) throw new Error('All dates must be within the active reporting period.');
      const sales = root ? Number(form.sales) : 0;
      const lines = !root && total <= 0
        ? buildProvisionalCustomerOrderPosting(form.date, collections)
        : buildCustomerOrderPosting({ root, entries: journalEntries, total, kind, date: form.date, collections,
          sales, cost: root ? Number(form.cost) : 0, quantity: root ? Number(form.quantity) : 0,
          batchEntryId: form.batchEntryId, refund: root ? Number(form.refund) : 0 });
      if (lines.some(l => !accounts.some(a => a.code === l.accountCode && a.isActive))) throw new Error('A required posting account is inactive. Enable it in Settings first.');
      const description = `${root ? 'Customer order update' : 'Customer pre-order'}: ${item.trim() || 'Details pending'} — ${batch.trim() || 'Reference pending'}`;
      const transactionDetails = {
        eventRelated: false, receiptAttachmentIds: original?.transactionDetails?.receiptAttachmentIds || [], merchandiseItem: item.trim(), merchandiseBatch: batch.trim(),
        ...(root ? { customerOrderId: root.id } : { customerOrder: { total, estimatedCost: Number(form.estimatedCost), kind }, reviewFinalized: false }),
        ...(sales > 0 && kind === 'merchandise' ? { merchandiseBatchEntryId: form.batchEntryId, merchandiseQuantitySold: Number(form.quantity), inventoryCost: Number(form.cost) } : {}),
      };
      if (editOriginal && original) {
        const candidate = { ...original, date: form.date, description, lines, transactionType: 'Customers’ Pre-order and Downpayment', transactionDetails };
        const state = customerOrderState(candidate, journalEntries.map(entry => entry.id === original.id ? candidate : entry));
        if ([state.remainingSales, state.unearned, state.receivable, state.refundable].some(value => value < 0)) throw new Error('These changes conflict with later order activity. Adjust the values or delete the later updates first.');
        updateJournalEntry(candidate);
        if (draftId) deleteDraftTransaction(draftId);
        setDraftId(undefined);
        setMessage(`${candidate.reference} updated.`);
        return;
      }
      const entry = addJournalEntry(form.date, description, root?.project || 'General Fund Operations', lines, undefined, root?.id, {
        transactionType: root ? 'Actual Sale / Delivery / Render of Service' : 'Customers’ Pre-order and Downpayment',
        details: transactionDetails,
      });
      if (draftId) deleteDraftTransaction(draftId);
      setDraftId(undefined);
      setForm({ ...empty(), mode: 'update', orderId: root?.id || entry.id });
      setMessage(`${entry.reference} posted. Saved order details are loaded below; enter only new activity.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not post the customer order.'); }
  };
  const input = (key: keyof Form, label: string, type = 'text', required = false) => <label className="block text-xs font-semibold">{label}<input aria-label={label} className={field} type={type} value={String(form[key])} onChange={e => change({ [key]: e.target.value })} required={required} {...(type === 'number' ? { min: 0, step: key === 'quantity' ? '1' : '0.01' } : {})} /></label>;
  return <form onSubmit={post} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
    <h3 className="text-sm font-bold">Customer pre-orders and actual sales</h3>
    {!orderId && <div className="flex gap-2"><button className={button} type="button" aria-pressed={form.mode === 'new'} onClick={() => { setForm(empty()); setDraftId(undefined); setMessage(''); }}>New pre-order</button><button className={button} type="button" aria-pressed={form.mode === 'update'} onClick={() => change({ mode: 'update' })}>Actual sale / delivery / collection</button></div>}
    {draftId && <p className="text-xs">Continuing a saved draft.</p>}
    {form.mode === 'update' && !orderId && <label className="block text-xs font-semibold">Choose customer transaction<select aria-label="Choose customer transaction" className={field} value={form.orderId} onChange={e => { setForm({ ...empty(), mode: 'update', orderId: e.target.value }); setDraftId(undefined); }}><option value="">Select a saved order…</option>{orders.map(e => <option key={e.id} value={e.id}>{e.reference} — {e.transactionDetails?.merchandiseItem} — {e.transactionDetails?.merchandiseBatch}</option>)}</select></label>}
    {form.mode === 'new' && <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold">Order type<select aria-label="Order type" className={field} value={form.kind} onChange={e => change({ kind: e.target.value })}><option value="merchandise">Merchandise</option><option value="service">Service</option></select></label>
      <label className="text-xs font-semibold">Name of item<select aria-label="Name of item" className={field} value={form.item} onChange={e => change({ item: e.target.value })}>{['Lanyard', 'Shirt', 'Pins', 'Tote Bag', 'Mugs', 'Stickers', 'Others'].map(i => <option key={i}>{i}</option>)}</select></label>
      {form.item === 'Others' && input('other', 'Other item / service name', 'text', true)}
      {input('batch', 'Batch / order reference')}{input('estimatedCost', 'Total estimated cost price', 'number')}{input('total', 'Total order selling price', 'number')}
      <p className="text-xs sm:col-span-2">Estimated cost is for reference. Delivery records the actual cost of the items sold.</p>
    </div>}
    {root && state && <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
      <p className="font-bold">{item} — {batch} · Order {formatCurrency(total)} · Estimated cost {formatCurrency(terms?.estimatedCost || 0)}</p>
      <p>Delivered sales: {formatCurrency(state.sales)} · Still to deliver: {formatCurrency(state.remainingSales)}</p>
      <p>Net cash collected: {formatCurrency(state.collected)} · Customer advance: {formatCurrency(state.unearned)}</p>
      <p>Due from customer: {formatCurrency(state.receivable)} · Refundable excess: {formatCurrency(state.refundable)}</p>
      <p>Previously saved amounts are already included. Enter only additional activity.</p>
    </div>}
    {(form.mode === 'new' || root) && <>
      {input('date', root ? 'Activity / delivery date' : 'Order date', 'date', true)}
      {root && noInventory && state && state.remainingSales > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">You haven’t purchased this merchandise from your supplier yet, or this batch has no remaining stock. Record an acquisition with the same item and batch. You can still record cash collections.</p>}
      {root && <fieldset disabled={noInventory || state?.remainingSales === 0} className="grid gap-4 rounded-lg border border-slate-200 p-3 disabled:opacity-50 dark:border-slate-700"><legend className="px-1 text-xs font-bold">New delivery / service rendered (leave blank for collection only)</legend>
        {input('sales', 'Selling value of items delivered / services rendered now', 'number')}
        <p className="text-xs">Exclude undelivered items and all previously recorded sales.</p>
        {kind === 'merchandise' && <>
          <label className="text-xs font-semibold">Inventory purchase batch<select aria-label="Inventory purchase batch" className={field} value={form.batchEntryId} onChange={e => change({ batchEntryId: e.target.value })}><option value="">Select matching purchase…</option>{batches.map(b => <option key={b.entryId} value={b.entryId}>{b.reference} — {b.remainingQuantity} units — {formatCurrency(b.netInventoryBalance)} cost remaining</option>)}</select></label>
          {input('quantity', 'Units delivered now', 'number')}{input('cost', 'Cost of items delivered now', 'number')}
          <p className="text-xs">Only the cost of delivered units becomes Cost of Sales. Unsold units remain in Inventory.</p>
        </>}
      </fieldset>}
      <DatedAmountRows label={root ? 'Additional cash collections' : 'Initial cash collection / downpayment'} rows={form.collections} onChange={collections => change({ collections })} currencySymbol={settings.currencySymbol} defaultDate={form.date} allowBlankDates allowEmptyAmounts blankDateHelp="A blank collection date uses the activity/order date. Leave amounts blank if no cash was received." addLabel="Add collection" />
      {root && state && state.refundable > 0 && input('refund', 'Refund of excess paid to customer', 'number')}
      <p className="text-xs text-slate-500 dark:text-slate-400">Deposits remain unearned until delivery. Later payments settle unpaid sales first. Payments exceeding the entire order are refundable.</p>
    </>}
    {message && <p role="status" className="rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-900 dark:bg-blue-900/30 dark:text-blue-200">{message}</p>}
    <div className="flex gap-3"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white">{editOriginal ? 'Save Changes' : `Post ${root ? 'update' : 'pre-order'}`}</button></div>
  </form>;
}

export function CustomerOrderFollowUp({ entry }: { entry: JournalEntry }) {
  const [open, setOpen] = useState<'edit' | 'update' | null>(null);
  const { finalizeJournalEntry } = useFinance();
  const finalized = entry.transactionDetails?.reviewFinalized === true;
  const issues = customerOrderFinalizationIssues(entry);
  return <div className="mt-3"><div className="flex flex-wrap gap-2">{!finalized && <button className={button} type="button" onClick={() => setOpen(open === 'edit' ? null : 'edit')}>{open === 'edit' ? 'Close editor' : 'Edit posted transaction'}</button>}<button className={button} type="button" onClick={() => setOpen(open === 'update' ? null : 'update')}>{open === 'update' ? 'Close order update' : 'Update delivery / collections'}</button>{!finalized && <button type="button" disabled={issues.length > 0} title={issues.join('. ')} onClick={() => { finalizeJournalEntry(entry.id); setOpen(null); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Finalize and Post</button>}{finalized && <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Finalized</span>}</div>{issues.length > 0 && !finalized && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Complete the missing details above before finalizing.</p>}{open && <div className="mt-3"><CustomerOrderEntry orderId={entry.id} editOriginal={open === 'edit'} /></div>}</div>;
}
