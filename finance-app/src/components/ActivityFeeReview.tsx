import React, { useState } from 'react';
import { ActivityFeeRecord } from '../types';
import { useFinance } from '../context/FinanceContext';
import { DatedAmountInputRow, DatedAmountRows } from './DatedAmountRows';
import { NewFeatureBadge } from './NewFeatureBadge';
import { isActivityFeeIncomplete } from '../lib/activityFees';

const today = (): string => new Date().toISOString().slice(0, 10);
const blankRows = (): DatedAmountInputRow[] => [{ id: `activity-review-${Date.now()}`, date: '', amount: '' }];
const recordsFromRows = (rows: DatedAmountInputRow[]) => rows.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) }));

function RecordCard({ record }: { record: ActivityFeeRecord }): React.ReactElement {
  const { recognizeScheduledActivityFee, collectActivityFeeReceivable, updateActivityFeeRecord, postActivityFeeReviewCollections, postActivityFeeReviewPayments, markActivityFeeReviewComplete, formatCurrency, settings } = useFinance();
  const [collections, setCollections] = useState<DatedAmountInputRow[]>(blankRows);
  const [additionalCollections, setAdditionalCollections] = useState<DatedAmountInputRow[]>(blankRows);
  const [additionalPayments, setAdditionalPayments] = useState<DatedAmountInputRow[]>(blankRows);
  const [collectionAnswer, setCollectionAnswer] = useState<'' | 'yes' | 'no'>('');
  const [paymentAnswer, setPaymentAnswer] = useState<'' | 'yes' | 'no'>('');
  const [eventDate, setEventDate] = useState('');
  const [totalExpected, setTotalExpected] = useState(record.totalExpected ? String(record.totalExpected) : '');
  const [legacyAmount, setLegacyAmount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const reset = () => setCollections(blankRows());
  const post = (callback: () => ActivityFeeRecord) => {
    setError(''); setMessage('');
    try { const updated = callback(); setMessage(`Updated ${updated.reference}.`); reset(); setLegacyAmount(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this event.'); }
  };

  const incomplete = isActivityFeeIncomplete(record);
  const refundDeferred = record.history.some(item => item.action === 'excess-refund-deferred');
  return <article className={`rounded-xl border p-4 ${incomplete ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10' : 'border-emerald-200 bg-white dark:border-emerald-500/20 dark:bg-slate-900'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-900 dark:text-slate-100">{record.eventName}</p><p className="mt-1 text-[10px] text-slate-500">{record.reference} • {record.status.replace('-', ' ')}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${incomplete ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{incomplete ? 'incomplete' : 'complete'}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 sm:grid-cols-5"><span>Total fees<br/><b>{record.totalExpected ? formatCurrency(record.totalExpected) : 'To be completed'}</b></span><span>Collected<br/><b>{formatCurrency(record.totalCollected)}</b></span><span>Receivable<br/><b>{formatCurrency(record.receivableBalance)}</b></span><span>Unearned<br/><b>{formatCurrency(record.deferredBalance)}</b></span><span>Refund liability<br/><b>{formatCurrency(record.refundLiabilityBalance || 0)}</b></span></div>

    {record.status === 'postponed' && <div className="mt-4 space-y-3 border-t border-rose-200 pt-3 dark:border-rose-500/20">
      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">When the event happens, enter its final total, event date, and any additional collections.</p>
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-bold uppercase text-slate-500">Total activity fees<input type="number" min="0.01" step="0.01" value={totalExpected} onChange={event => setTotalExpected(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900" /></label><label className="text-[10px] font-bold uppercase text-slate-500">Event date<input type="date" value={eventDate} onChange={event => setEventDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900" required /></label></div>
      <DatedAmountRows label="Additional collections" rows={collections} onChange={setCollections} currencySymbol={settings.currencySymbol} defaultDate={eventDate} addLabel="Add collection" allowEmptyAmounts allowBlankDates blankDateHelp={`A blank collection date uses the event date (${eventDate || 'once entered'}).`} />
      <button type="button" onClick={() => post(() => recognizeScheduledActivityFee(record.id, Number(totalExpected), eventDate, recordsFromRows(collections), settings.fiscalYear))} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">Recognize event and collections</button>
    </div>}

    {record.status === 'receivable' && <div className="mt-4 space-y-3 border-t border-rose-200 pt-3 dark:border-rose-500/20"><p className="text-[10px] font-medium text-slate-600 dark:text-slate-300">Record one collection transaction at a time. Use this for unpaid activity fees from an event completed in a previous reporting period.</p><DatedAmountRows label="Collection of unpaid activity fees" rows={collections} onChange={setCollections} currencySymbol={settings.currencySymbol} defaultDate="" maxTotal={record.receivableBalance} allowEmptyAmounts allowMultiple={false} /><button type="button" onClick={() => post(() => collectActivityFeeReceivable(record.id, recordsFromRows(collections), settings.fiscalYear))} className="rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white">Collect unpaid fees</button></div>}

    {record.status !== 'scheduled' && record.totalExpected > 0 && record.semesterCollectionsReviewed !== true && <div className="mt-4 space-y-3 border-t border-rose-200 pt-3 dark:border-rose-500/20">
      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">Are there any additional collections this semester for this transaction?</p>
      <div className="flex gap-2"><button type="button" onClick={() => setCollectionAnswer('yes')} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${collectionAnswer === 'yes' ? 'bg-blue-700 text-white' : 'border border-slate-300'}`}>Yes</button><button type="button" onClick={() => { setCollectionAnswer('no'); setAdditionalCollections(blankRows()); }} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${collectionAnswer === 'no' ? 'bg-blue-700 text-white' : 'border border-slate-300'}`}>No</button></div>
      {collectionAnswer === 'yes' && <><DatedAmountRows label="Additional collections" rows={additionalCollections} onChange={setAdditionalCollections} currencySymbol={settings.currencySymbol} defaultDate={today()} maxTotal={Math.max(0, record.totalExpected - record.totalCollected)} allowEmptyAmounts /><button type="button" onClick={() => post(() => postActivityFeeReviewCollections(record.id, recordsFromRows(additionalCollections), settings.fiscalYear))} className="rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white">Record additional collections</button></>}
      {collectionAnswer === 'no' && <button type="button" onClick={() => { markActivityFeeReviewComplete(record.id, 'collections'); setCollectionAnswer(''); }} className="rounded-lg border border-slate-300 px-3 py-2 text-[10px] font-bold">Confirm no additional collections</button>}
      <p className="text-[10px] font-medium text-slate-500">Additional collections are capped at the remaining Activity Fees Revenue amount ({formatCurrency(Math.max(0, record.totalExpected - record.totalCollected))}).</p>
    </div>}

    {(record.refundLiabilityBalance || 0) > 0 && !refundDeferred && record.semesterPaymentsReviewed !== true && <div className="mt-4 space-y-3 border-t border-rose-200 pt-3 dark:border-rose-500/20">
      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">Are there any additional payments made this semester for this transaction?</p>
      <div className="flex gap-2"><button type="button" onClick={() => setPaymentAnswer('yes')} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${paymentAnswer === 'yes' ? 'bg-blue-700 text-white' : 'border border-slate-300'}`}>Yes</button><button type="button" onClick={() => { setPaymentAnswer('no'); setAdditionalPayments(blankRows()); }} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${paymentAnswer === 'no' ? 'bg-blue-700 text-white' : 'border border-slate-300'}`}>No</button></div>
      {paymentAnswer === 'yes' && <><DatedAmountRows label="Additional payments" rows={additionalPayments} onChange={setAdditionalPayments} currencySymbol={settings.currencySymbol} defaultDate={today()} maxTotal={record.refundLiabilityBalance || 0} allowEmptyAmounts /><button type="button" onClick={() => post(() => postActivityFeeReviewPayments(record.id, recordsFromRows(additionalPayments), settings.fiscalYear))} className="rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white">Record additional payments</button></>}
      {paymentAnswer === 'no' && <button type="button" onClick={() => { markActivityFeeReviewComplete(record.id, 'payments'); setPaymentAnswer(''); }} className="rounded-lg border border-slate-300 px-3 py-2 text-[10px] font-bold">Confirm no additional payments</button>}
      <p className="text-[10px] font-medium text-slate-500">Payments are capped at the remaining Refund Liability ({formatCurrency(record.refundLiabilityBalance || 0)}).</p>
    </div>}

    {record.status === 'refund-due' && (record.refundLiabilityBalance || 0) > 0 && <div className="mt-4 rounded-lg border-t border-rose-200 bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Refund Liability remaining: {formatCurrency(record.refundLiabilityBalance || 0)}. Open Transactions → Activity Fees → Excess Activity Fees - Refund Status to refund it, carry it forward, or recognize a non-refundable amount.</div>}
    {record.status === 'refund-due' && !(record.refundLiabilityBalance || 0) && <div className="mt-4 space-y-2 border-t border-rose-200 pt-3"><p className="text-[10px] font-bold text-slate-600">Legacy refundable-cancellation balance</p><input type="number" min="0" step="0.01" value={legacyAmount} onChange={event => setLegacyAmount(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs" /><button type="button" onClick={() => post(() => updateActivityFeeRecord(record.id, { type: 'refund', amount: Number(legacyAmount || 0) }, today(), settings.fiscalYear))} className="rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white">Record refund</button></div>}
    {error && <p className="mt-2 text-[10px] font-bold text-rose-600">{error}</p>}{message && <p className="mt-2 text-[10px] font-bold text-emerald-600">{message}</p>}
    {record.status !== 'scheduled' && <details className="mt-3"><summary className="cursor-pointer text-[10px] font-bold text-blue-700 dark:text-blue-300">Transaction history ({record.history.length})</summary><div className="mt-2 space-y-1">{record.history.map(item => <p key={item.id} className="text-[9px] text-slate-500">{item.date} • {item.reportingPeriod} • {item.action.replace(/-/g, ' ')} • {formatCurrency(item.amount)}</p>)}</div></details>}
  </article>;
}

export function ActivityFeeReview(): React.ReactElement | null {
  const { activityFeeRecords } = useFinance();
  if (activityFeeRecords.length === 0) return null;
  return <section className="space-y-3"><div><h3 className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">Activity Fee History <NewFeatureBadge /></h3><p className="mt-1 text-[10px] text-slate-500">Track each event's unearned balance, event-date recognition, and dated receivable collections.</p></div>{[...activityFeeRecords].reverse().map(record => <RecordCard key={record.id} record={record} />)}</section>;
}
