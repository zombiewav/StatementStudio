import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeAccountBalances } from '../lib/accountTotals';
import { buildInitialActivityFeeSchedule, UNEARNED_ACTIVITY_FEE_CODE } from '../lib/activityFees';
import { DatedAmountInputRow, DatedAmountRows } from './DatedAmountRows';
import { NewFeatureBadge } from './NewFeatureBadge';
import { ReviewLaterNote } from './ReviewLaterNote';

const firstRow = (): DatedAmountInputRow[] => [{ id: `activity-fee-${Date.now()}`, date: '', amount: '' }];

export function ActivityFeeEntry({ defaultOpen = false }: { defaultOpen?: boolean }): React.ReactElement {
  const { createActivityFeeRecord, settings, formatCurrency, accounts, journalEntries, closedFiscalYears } = useFinance();
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
  // What's declared here can't exceed the TRUE beginning-of-period balance
  // of Unearned Activity Fees — its ending balance as of the last fiscal
  // year close, carried forward (closing entries never touch liability
  // accounts, so this is just "as of the most recent close", not today's
  // running total, which could already include activity posted THIS
  // period that isn't "previous period" money). No close yet on record
  // means the whole ledger to date is still "the beginning", so this
  // naturally falls back to today's full balance in that case.
  const unearnedActivityFeesBalance = useMemo(() => {
    const lastClosingDate = closedFiscalYears.reduce<string | null>(
      (latest, record) => (!latest || record.closingDate > latest ? record.closingDate : latest),
      null
    );
    const entriesAsOfLastClose = lastClosingDate
      ? journalEntries.filter(entry => entry.date <= lastClosingDate)
      : journalEntries;
    return computeAccountBalances(entriesAsOfLastClose, accounts)[UNEARNED_ACTIVITY_FEE_CODE] || 0;
  }, [journalEntries, accounts, closedFiscalYears]);
  const priorPeriodCollectedMax = Number(totalExpected) > 0
    ? Math.max(0, Math.min(Number(totalExpected) - collectionTotal, unearnedActivityFeesBalance))
    : undefined;
  const showUnearnedBalanceWarning = eventOccursThisPeriod === 'yes' && Number(priorPeriodCollected || 0) > unearnedActivityFeesBalance;

  // Live preview of the actual journal lines this will post, using the same
  // pure builder the real submit uses — so what's shown here is exactly
  // what gets recorded, not a guess. Silently shows nothing until the
  // required fields make for a valid schedule (the same errors would surface
  // from the real submit attempt otherwise).
  const preview = useMemo(() => {
    try {
      return buildInitialActivityFeeSchedule({
        eventOccursThisPeriod: eventOccursThisPeriod === 'yes',
        eventDate: eventOccursThisPeriod === 'yes' ? eventDate : undefined,
        totalExpected: eventOccursThisPeriod === 'yes' ? Number(totalExpected) : undefined,
        priorPeriodCollected: eventOccursThisPeriod === 'yes' ? Number(priorPeriodCollected || 0) : undefined,
        collections: collections.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
      });
    } catch {
      return null;
    }
  }, [eventOccursThisPeriod, eventDate, totalExpected, priorPeriodCollected, collections]);
  const accountLabel = (code: string) => { const account = accounts.find(candidate => candidate.code === code); return account ? `${account.code} - ${account.name}` : code; };

  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (showUnearnedBalanceWarning) {
      setError(`Activity fees collected in a previous reporting period cannot exceed the ${formatCurrency(unearnedActivityFeesBalance)} currently on the books as Unearned Activity Fees.`);
      return;
    }
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
            <label className="text-[10px] font-bold uppercase text-slate-500">Activity fees collected in a previous reporting period (if applicable)<input type="number" min="0" step="0.01" max={priorPeriodCollectedMax} value={priorPeriodCollected} onChange={event => setPriorPeriodCollected(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /><span className="mt-1 block normal-case font-medium">Note: Check the previous reporting period's ledger to see how much was collected for this event. Cannot exceed the total activity fee minus what's collected this period, or the {formatCurrency(unearnedActivityFeesBalance)} currently on the books as Unearned Activity Fees, whichever is lower.</span></label>
          </>}
          <div className="sm:col-span-2 rounded-xl border border-indigo-200 bg-white/70 p-3 dark:border-indigo-500/30 dark:bg-slate-900/40"><DatedAmountRows label="How much of the activity fee was collected during the current reporting period?" rows={collections} onChange={setCollections} currencySymbol={settings.currencySymbol} defaultDate={eventDate} addLabel="Add collection" allowEmptyAmounts allowBlankDates={eventOccursThisPeriod === 'yes'} blankDateHelp={eventOccursThisPeriod === 'yes' ? `A blank collection date uses the event date (${eventDate || 'once entered'}).` : undefined} /></div>
          {eventOccursThisPeriod === 'yes' && Number(totalExpected) > 0 && Number(priorPeriodCollected || 0) + collectionTotal > Number(totalExpected) && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700">Previous and current collections cannot exceed {formatCurrency(Number(totalExpected))}.</p>}
          {showUnearnedBalanceWarning && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700">Previous-period collections cannot exceed the {formatCurrency(unearnedActivityFeesBalance)} currently on the books as Unearned Activity Fees.</p>}
          {preview && preview.postings.length > 0 && (
            <div className="sm:col-span-2 space-y-2.5 rounded-xl border border-indigo-200 bg-white/70 p-3 dark:border-indigo-500/30 dark:bg-slate-900/40">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Journal Entry Preview</p>
              {preview.postings.map((posting, index) => (
                <div key={`${posting.date}-${index}`} className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5 text-[10px] dark:border-indigo-500/20 dark:bg-indigo-500/5">
                  <p className="mb-1.5 flex items-center justify-between font-bold text-indigo-900 dark:text-indigo-200"><span>{posting.description}</span><span>{posting.date}</span></p>
                  <div className="space-y-1">
                    {posting.lines.map((line, lineIndex) => (
                      <div key={lineIndex} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span>{accountLabel(line.accountCode)}</span>
                        <span className="font-bold">{line.debit > 0 ? `Dr ${formatCurrency(line.debit)}` : `Cr ${formatCurrency(line.credit)}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {message && <p className="sm:col-span-2 rounded-lg bg-emerald-100 p-2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
          <button type="submit" className="sm:col-span-2 rounded-xl bg-blue-700 p-3 text-xs font-bold text-white hover:bg-blue-800">Record Activity Fees {collectionTotal ? `(${formatCurrency(collectionTotal)})` : ''}</button>
        </form>
      )}
    </section>
  );
}
