import React, { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';

export function ActivityFeeEntry({ defaultOpen = false }: { defaultOpen?: boolean }): React.ReactElement {
  const { createActivityFeeRecord, settings, formatCurrency } = useFinance();
  const [open, setOpen] = useState(defaultOpen);
  const [eventName, setEventName] = useState('');
  const [totalExpected, setTotalExpected] = useState('');
  const [collected, setCollected] = useState('');
  const [eventOccurred, setEventOccurred] = useState<'yes' | 'no'>('yes');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setMessage('');
    try {
      const record = createActivityFeeRecord({ eventName, totalExpected: Number(totalExpected), collected: Number(collected || 0), eventOccurred: eventOccurred === 'yes', date, reportingPeriod: settings.fiscalYear });
      setMessage(`${record.reference} created for ${record.eventName}. ${record.status === 'complete' ? 'Complete.' : 'Follow-up is available in Review.'}`);
      setEventName(''); setTotalExpected(''); setCollected('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record activity fees.');
    }
  };

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 dark:border-blue-500/20 dark:bg-blue-500/10">
      <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span><span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"><CalendarDays className="h-4 w-4 text-blue-700 dark:text-blue-300" /> Activity / Event Fees</span><span className="mt-1 block text-[10px] font-medium text-slate-600 dark:text-slate-400">Use this guided form for participant fee collections, including future events.</span></span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 border-t border-blue-200 p-4 dark:border-blue-500/20 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Has the event already happened in this reporting period?</label><div className="flex gap-2">{(['yes','no'] as const).map(answer => <button key={answer} type="button" onClick={() => setEventOccurred(answer)} className={`rounded-lg px-4 py-2 text-xs font-bold ${eventOccurred === answer ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{answer === 'yes' ? 'Yes — event held' : 'No — future event'}</button>)}</div></div>
          <label className="text-[10px] font-bold uppercase text-slate-500">Event name<input value={eventName} onChange={e => setEventName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">Total fees expected from all participants<input type="number" min="0.01" step="0.01" value={totalExpected} onChange={e => setTotalExpected(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">Amount collected now<input type="number" min="0" step="0.01" value={collected} onChange={e => setCollected(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
          {error && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {message && <p className="sm:col-span-2 rounded-lg bg-emerald-100 p-2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
          <button type="submit" className="sm:col-span-2 rounded-xl bg-blue-700 p-3 text-xs font-bold text-white hover:bg-blue-800">Record Activity Fees {collected ? `(${formatCurrency(Number(collected))})` : ''}</button>
        </form>
      )}
    </section>
  );
}
