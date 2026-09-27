import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { DatedAmountInputRow, DatedAmountRows } from './DatedAmountRows';
import { NewFeatureBadge } from './NewFeatureBadge';
import { ReviewLaterNote } from './ReviewLaterNote';

const firstRow = (): DatedAmountInputRow[] => [{ id: `activity-fee-${Date.now()}`, date: '', amount: '' }];

export function ActivityFeeEntry({ defaultOpen = false }: { defaultOpen?: boolean }): React.ReactElement {
  const { createActivityFeeRecord, settings, formatCurrency } = useFinance();
  const [open, setOpen] = useState(defaultOpen);
  const [eventName, setEventName] = useState('');
  const [totalExpected, setTotalExpected] = useState('');
  const [priorPeriodCollected, setPriorPeriodCollected] = useState('');
  const [eventOccursThisPeriod, setEventOccursThisPeriod] = useState<'yes' | 'no'>('yes');
  const [eventDate, setEventDate] = useState('');
  const [collections, setCollections] = useState<DatedAmountInputRow[]>(firstRow);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const collectionTotal = useMemo(() => collections.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), [collections]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const record = createActivityFeeRecord({
        eventName,
        eventOccursThisPeriod: eventOccursThisPeriod === 'yes',
        ...(eventOccursThisPeriod === 'yes' ? { eventDate, totalExpected: Number(totalExpected), priorPeriodCollected: Number(priorPeriodCollected || 0) } : {}),
        collections: collections.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        reportingPeriod: settings.fiscalYear,
      });
      setMessage(`${record.reference} created for ${record.eventName}. ${record.status === 'complete' ? 'Complete.' : 'Follow-up is available in Review.'}`);
      setEventName(''); setTotalExpected(''); setPriorPeriodCollected(''); setCollections(firstRow());
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not record activity fees.'); }
  };

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 dark:border-blue-500/20 dark:bg-blue-500/10">
      <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span><span className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300"><CalendarDays className="h-4 w-4" /> Activity / Event Fees <NewFeatureBadge /></span><span className="mt-1 block text-[10px] font-medium text-slate-600 dark:text-slate-400">Record each dated collection and let the event date determine Unearned Fees, Revenue, and Receivables.</span></span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 border-t border-blue-200 p-4 dark:border-blue-500/20 sm:grid-cols-2">
          <div className="sm:col-span-2"><ReviewLaterNote /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Has the event already taken place, or is it scheduled to take place during this reporting period?</label><div className="flex flex-wrap gap-2">{(['yes','no'] as const).map(answer => <button key={answer} type="button" onClick={() => setEventOccursThisPeriod(answer)} className={`rounded-lg px-4 py-2 text-xs font-bold ${eventOccursThisPeriod === answer ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{answer === 'yes' ? 'Yes — this reporting period' : 'No — a future reporting period'}</button>)}</div></div>
          <label className="text-[10px] font-bold uppercase text-slate-500">Event Name<input value={eventName} onChange={event => setEventName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /></label>
          {eventOccursThisPeriod === 'yes' && <label className="text-[10px] font-bold uppercase text-slate-500">Date of Event<input type="date" value={eventDate} onChange={event => setEventDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /></label>}
          {eventOccursThisPeriod === 'yes' && <>
            <label className="text-[10px] font-bold uppercase text-slate-500">What is the total amount of activity fees for this event?<input type="number" min="0.01" step="0.01" value={totalExpected} onChange={event => setTotalExpected(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /><span className="mt-1 block normal-case font-medium">Note: Enter the full amount expected to be collected from all participants.</span></label>
            <label className="text-[10px] font-bold uppercase text-slate-500">Activity fees collected in a previous reporting period (if applicable)<input type="number" min="0" step="0.01" value={priorPeriodCollected} onChange={event => setPriorPeriodCollected(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /><span className="mt-1 block normal-case font-medium">Note: Check the previous reporting period's ledger to see how much was collected for this event.</span></label>
          </>}
          <div className="sm:col-span-2 rounded-xl border border-indigo-200 bg-white/70 p-3 dark:border-indigo-500/30 dark:bg-slate-900/40"><DatedAmountRows label="How much of the activity fee was collected during the current reporting period?" rows={collections} onChange={setCollections} currencySymbol={settings.currencySymbol} defaultDate={eventDate} addLabel="Add collection" allowEmptyAmounts /></div>
          {eventOccursThisPeriod === 'yes' && Number(totalExpected) > 0 && Number(priorPeriodCollected || 0) + collectionTotal > Number(totalExpected) && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700">Previous and current collections cannot exceed {formatCurrency(Number(totalExpected))}.</p>}
          {error && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {message && <p className="sm:col-span-2 rounded-lg bg-emerald-100 p-2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
          <button type="submit" className="sm:col-span-2 rounded-xl bg-blue-700 p-3 text-xs font-bold text-white hover:bg-blue-800">Record Activity Fees {collectionTotal ? `(${formatCurrency(collectionTotal)})` : ''}</button>
        </form>
      )}
    </section>
  );
}
