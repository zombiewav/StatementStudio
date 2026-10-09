import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeAccountBalances } from '../lib/accountTotals';
import { ACTIVITY_FEE_RECEIVABLE_CODE, ACTIVITY_FEE_REFUND_LIABILITY_CODE, ACTIVITY_FEE_REVENUE_CODE, buildInitialActivityFeeSchedule, CASH_CODE, UNEARNED_ACTIVITY_FEE_CODE } from '../lib/activityFees';
import { reportingPeriodBounds } from '../lib/reportingPeriod';
import { buildAccountPeriodHistory } from '../lib/transactionHistory';
import { JournalLine, TransactionDraft } from '../types';
import { DatedAmountInputRow, DatedAmountRows } from './DatedAmountRows';
import { NewFeatureBadge } from './NewFeatureBadge';
import { ReviewLaterNote } from './ReviewLaterNote';
import { FinancialPreviewPanels } from './FinancialPreviewPanels';

const firstRow = (): DatedAmountInputRow[] => [{ id: `activity-fee-${Date.now()}`, date: '', amount: '' }];
const previousDate = (date: string): string => {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

interface ActivityFeeEntryProps {
  defaultOpen?: boolean;
  draftToResume?: TransactionDraft | null;
  onDraftResumed?: () => void;
  onDraftSaved?: () => void;
}

export function ActivityFeeEntry({ defaultOpen = false, draftToResume = null, onDraftResumed, onDraftSaved }: ActivityFeeEntryProps): React.ReactElement {
  const { createActivityFeeRecord, collectActivityFeeReceivable, updateActivityFeeRecord, activityFeeRecords, saveDraftTransaction, deleteDraftTransaction, settings, formatCurrency, accounts, journalEntries } = useFinance();
  const [open, setOpen] = useState(defaultOpen);
  const [transactionType, setTransactionType] = useState<'activity-fees' | 'receivable' | 'excess-refund'>('activity-fees');
  const [eventName, setEventName] = useState('');
  const [totalExpected, setTotalExpected] = useState('');
  const [priorPeriodCollected, setPriorPeriodCollected] = useState('');
  const [eventOccursThisPeriod, setEventOccursThisPeriod] = useState<'yes' | 'no'>('yes');
  const [eventDate, setEventDate] = useState('');
  const [collections, setCollections] = useState<DatedAmountInputRow[]>(firstRow);
  const [priorEventCollections, setPriorEventCollections] = useState<DatedAmountInputRow[]>(firstRow);
  const [onOrAfterEventCollections, setOnOrAfterEventCollections] = useState<DatedAmountInputRow[]>(firstRow);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedReceivableId, setSelectedReceivableId] = useState('');
  const [receivableCollection, setReceivableCollection] = useState<DatedAmountInputRow[]>(firstRow);
  const [selectedExcessId, setSelectedExcessId] = useState('');
  const [excessStatus, setExcessStatus] = useState<'current' | 'next' | 'nonrefundable'>('current');
  const [excessAmount, setExcessAmount] = useState('');
  const [excessDate, setExcessDate] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const receivableRecords = useMemo(
    () => activityFeeRecords.filter(record => record.status === 'receivable' && record.receivableBalance > 0),
    [activityFeeRecords]
  );
  const selectedReceivable = receivableRecords.find(record => record.id === selectedReceivableId);
  const excessRecords = useMemo(() => activityFeeRecords.filter(record => (record.refundLiabilityBalance || 0) > 0), [activityFeeRecords]);
  const selectedExcess = excessRecords.find(record => record.id === selectedExcessId);

  useEffect(() => {
    if (!draftToResume || draftToResume.category !== 'activity-fees') return;
    const snapshot = draftToResume.formState as Record<string, unknown>;
    setEditingDraftId(draftToResume.id);
    setOpen(true);
    setTransactionType(snapshot.transactionType === 'receivable' || snapshot.transactionType === 'excess-refund' ? snapshot.transactionType : 'activity-fees');
    setEventName(typeof snapshot.eventName === 'string' ? snapshot.eventName : '');
    setTotalExpected(typeof snapshot.totalExpected === 'string' ? snapshot.totalExpected : '');
    setPriorPeriodCollected(typeof snapshot.priorPeriodCollected === 'string' ? snapshot.priorPeriodCollected : '');
    setEventOccursThisPeriod(snapshot.eventOccursThisPeriod === 'no' ? 'no' : 'yes');
    const savedEventDate = typeof snapshot.eventDate === 'string' ? snapshot.eventDate : '';
    const savedCollections = Array.isArray(snapshot.collections) ? snapshot.collections as DatedAmountInputRow[] : [];
    setEventDate(savedEventDate);
    setCollections(savedCollections.length ? savedCollections : firstRow());
    setPriorEventCollections(Array.isArray(snapshot.priorEventCollections) && snapshot.priorEventCollections.length
      ? snapshot.priorEventCollections as DatedAmountInputRow[]
      : savedCollections.filter(row => row.date && row.date < savedEventDate).length
        ? savedCollections.filter(row => row.date && row.date < savedEventDate)
        : firstRow());
    setOnOrAfterEventCollections(Array.isArray(snapshot.onOrAfterEventCollections) && snapshot.onOrAfterEventCollections.length
      ? snapshot.onOrAfterEventCollections as DatedAmountInputRow[]
      : savedCollections.filter(row => !row.date || row.date >= savedEventDate).length
        ? savedCollections.filter(row => !row.date || row.date >= savedEventDate)
        : firstRow());
    setSelectedReceivableId(typeof snapshot.selectedReceivableId === 'string' ? snapshot.selectedReceivableId : '');
    setReceivableCollection(Array.isArray(snapshot.receivableCollection) && snapshot.receivableCollection.length ? snapshot.receivableCollection as DatedAmountInputRow[] : firstRow());
    setSelectedExcessId(typeof snapshot.selectedExcessId === 'string' ? snapshot.selectedExcessId : '');
    setExcessStatus(snapshot.excessStatus === 'next' || snapshot.excessStatus === 'nonrefundable' ? snapshot.excessStatus : 'current');
    setExcessAmount(typeof snapshot.excessAmount === 'string' ? snapshot.excessAmount : '');
    setExcessDate(typeof snapshot.excessDate === 'string' ? snapshot.excessDate : '');
    setError(''); setMessage('');
    onDraftResumed?.();
  }, [draftToResume, onDraftResumed]);
  const activeCollections = useMemo(() => eventOccursThisPeriod === 'yes' ? [...priorEventCollections, ...onOrAfterEventCollections] : collections, [eventOccursThisPeriod, priorEventCollections, onOrAfterEventCollections, collections]);
  const collectionTotal = useMemo(() => activeCollections.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), [activeCollections]);
  const periodBounds = useMemo(() => settings.semester && settings.reportingYear ? reportingPeriodBounds(settings.semester, settings.reportingYear) : null, [settings.semester, settings.reportingYear]);
  const dayBeforeEvent = previousDate(eventDate);

  useEffect(() => {
    if (!eventDate || eventOccursThisPeriod !== 'yes') return;
    setPriorEventCollections(rows => rows.map(row => !row.date && !row.amount ? { ...row, date: dayBeforeEvent } : row));
    setOnOrAfterEventCollections(rows => rows.map(row => !row.date && !row.amount ? { ...row, date: eventDate } : row));
  }, [eventDate, eventOccursThisPeriod, dayBeforeEvent]);
  // Prior-period precollections are limited to the Unearned Activity Fees
  // balance carried into the selected semester. This is the same beginning
  // balance displayed by the General Ledger and excludes current-semester
  // collections even when no fiscal-year close has been posted yet.
  const unearnedActivityFeesBalance = useMemo(() => {
    const account = accounts.find(candidate => candidate.code === UNEARNED_ACTIVITY_FEE_CODE);
    if (!account) return 0;
    if (!settings.semester || !settings.reportingYear) {
      return computeAccountBalances(journalEntries, accounts)[UNEARNED_ACTIVITY_FEE_CODE] || 0;
    }
    const { startDate, endDate } = reportingPeriodBounds(settings.semester, settings.reportingYear);
    return buildAccountPeriodHistory(account, journalEntries, startDate, endDate).beginningBalance;
  }, [journalEntries, accounts, settings.semester, settings.reportingYear]);
  const priorPeriodCollectedMax = Math.max(0, unearnedActivityFeesBalance);
  const showUnearnedBalanceWarning = eventOccursThisPeriod === 'yes' && Number(priorPeriodCollected || 0) > unearnedActivityFeesBalance;
  const excessCollection = Math.max(0, Number(priorPeriodCollected || 0) + collectionTotal - Number(totalExpected || 0));

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
        collections: activeCollections.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
      });
    } catch {
      return null;
    }
  }, [eventOccursThisPeriod, eventDate, totalExpected, priorPeriodCollected, activeCollections]);
  const accountLabel = (code: string) => { const account = accounts.find(candidate => candidate.code === code); return account ? `${account.code} - ${account.name}` : code; };
  const accountBalances = useMemo(() => computeAccountBalances(journalEntries, accounts), [journalEntries, accounts]);
  const previewLines = useMemo<JournalLine[]>(() => {
    if (transactionType === 'activity-fees') {
      return preview?.postings.flatMap(posting => posting.lines.map(line => ({ ...line, date: posting.date }))) || [];
    }
    if (transactionType === 'excess-refund') {
      const amount = Number(excessAmount) || 0;
      if (!selectedExcess || excessStatus === 'next' || amount <= 0) return [];
      return excessStatus === 'current'
        ? [{ accountCode: ACTIVITY_FEE_REFUND_LIABILITY_CODE, debit: amount, credit: 0, date: excessDate }, { accountCode: CASH_CODE, debit: 0, credit: amount, date: excessDate }]
        : [{ accountCode: ACTIVITY_FEE_REFUND_LIABILITY_CODE, debit: amount, credit: 0, date: excessDate }, { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: amount, date: excessDate }];
    }
    const amount = Number(receivableCollection[0]?.amount) || 0;
    if (!selectedReceivable || amount <= 0) return [];
    return [
      { accountCode: CASH_CODE, debit: amount, credit: 0, date: receivableCollection[0]?.date },
      { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: 0, credit: amount, date: receivableCollection[0]?.date },
    ];
  }, [transactionType, preview, selectedReceivable, receivableCollection, selectedExcess, excessStatus, excessAmount, excessDate]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (showUnearnedBalanceWarning) {
      setError(`Activity fees collected in a previous reporting period cannot exceed the ${formatCurrency(unearnedActivityFeesBalance)} currently on the books as Unearned Activity Fees.`);
      return;
    }
    try {
      if (eventOccursThisPeriod === 'yes') {
        if (priorEventCollections.some(row => Number(row.amount) > 0 && (!row.date || row.date >= eventDate))) throw new Error('Every collection in “Before the event” must have a date earlier than the event date.');
        if (onOrAfterEventCollections.some(row => Number(row.amount) > 0 && (!row.date || row.date < eventDate))) throw new Error('Every collection in “On or after the event” must have a date on or after the event date.');
      }
      const record = createActivityFeeRecord({
        eventName,
        eventOccursThisPeriod: eventOccursThisPeriod === 'yes',
        ...(eventOccursThisPeriod === 'yes' ? { eventDate, totalExpected: Number(totalExpected), priorPeriodCollected: Number(priorPeriodCollected || 0) } : {}),
        collections: activeCollections.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        reportingPeriod: settings.fiscalYear,
      });
      setMessage(`${record.reference} created for ${record.eventName}. ${record.status === 'complete' ? 'Complete.' : 'Follow-up is available in Review.'}`);
      setEventName(''); setTotalExpected(''); setPriorPeriodCollected(''); setCollections(firstRow()); setPriorEventCollections(firstRow()); setOnOrAfterEventCollections(firstRow());
      if (editingDraftId) { deleteDraftTransaction(editingDraftId); setEditingDraftId(null); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not record activity fees.'); }
  };

  const submitReceivableCollection = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!selectedReceivable) {
      setError('Select an event with an outstanding Activity Fees Receivable balance.');
      return;
    }
    try {
      const updated = collectActivityFeeReceivable(
        selectedReceivable.id,
        receivableCollection
          .filter(row => Number(row.amount) > 0)
          .map(row => ({ date: row.date, amount: Number(row.amount) })),
        settings.fiscalYear
      );
      setMessage(`Collection recorded for ${updated.eventName}. Remaining receivable: ${formatCurrency(updated.receivableBalance)}.`);
      setReceivableCollection(firstRow());
      if (updated.receivableBalance === 0) setSelectedReceivableId('');
      if (editingDraftId) { deleteDraftTransaction(editingDraftId); setEditingDraftId(null); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not collect the activity-fee receivable.');
    }
  };

  const submitExcessResolution = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!selectedExcess) { setError('Select an event with an outstanding refund liability.'); return; }
    try {
      if (excessStatus === 'next') {
        updateActivityFeeRecord(selectedExcess.id, { type: 'defer-excess-refund' }, new Date().toISOString().slice(0, 10), settings.fiscalYear);
      } else {
        const amount = Number(excessAmount || 0);
        if (excessDate && settings.reportingYear && settings.semester) {
          const selected = new Date(`${excessDate}T00:00:00`);
          const expectedYear = settings.semester === '1st Semester' ? settings.reportingYear : settings.reportingYear + 1;
          const allowedMonths = settings.semester === '1st Semester' ? [7, 8, 9, 10, 11] : [0, 1, 2, 3, 4];
          if (selected.getFullYear() !== expectedYear || !allowedMonths.includes(selected.getMonth())) {
            throw new Error(`Date must be within ${settings.semester === '1st Semester' ? 'August to December' : 'January to May'} ${expectedYear}.`);
          }
        }
        updateActivityFeeRecord(selectedExcess.id, { type: excessStatus === 'current' ? 'refund-excess' : 'recognize-excess', amount }, excessDate, settings.fiscalYear);
      }
      setMessage(excessStatus === 'current' ? 'Excess activity fee refund recorded.' : excessStatus === 'next' ? 'Refund remains payable for the next reporting period.' : 'Non-refundable excess recognized as Activity Fees Revenue.');
      setExcessAmount(''); setExcessDate('');
      if (editingDraftId) { deleteDraftTransaction(editingDraftId); setEditingDraftId(null); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update the excess activity fees.'); }
  };

  // Existing posting routines remain available to the Review workflow; this
  // form now saves all collection/payment rows as drafts first.

  const saveAsDraft = () => {
    setError(''); setMessage('');
    const label = transactionType === 'receivable'
      ? `Activity Fees Receivable${selectedReceivable ? ` - ${selectedReceivable.eventName}` : ''}`
      : transactionType === 'excess-refund'
        ? `Excess Activity Fees${selectedExcess ? ` - ${selectedExcess.eventName}` : ''}`
      : eventName.trim() || 'Activity / Event Fees';
    const id = saveDraftTransaction({
      id: editingDraftId || undefined,
      category: 'activity-fees',
      label,
      formState: {
        transactionType,
        eventName,
        totalExpected,
        priorPeriodCollected,
        eventOccursThisPeriod,
        eventDate,
        collections,
        priorEventCollections,
        onOrAfterEventCollections,
        selectedReceivableId,
        receivableCollection,
        selectedExcessId,
        excessStatus,
        excessAmount,
        excessDate,
      },
    });
    setEditingDraftId(id);
    onDraftSaved?.();
  };

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 dark:border-blue-500/20 dark:bg-blue-500/10">
      <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span><span className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300"><CalendarDays className="h-4 w-4" /> Activity / Event Fees <NewFeatureBadge /></span><span className="mt-1 block text-[10px] font-medium text-slate-600 dark:text-slate-400">Record each dated collection and let the event date determine Unearned Fees, Revenue, and Receivables.</span></span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-blue-200 p-4 dark:border-blue-500/20">
          <label className="block text-[10px] font-bold uppercase text-slate-500">
            Activity Fees Transaction
            <select
              value={transactionType}
              onChange={event => { setTransactionType(event.target.value as 'activity-fees' | 'receivable' | 'excess-refund'); setError(''); setMessage(''); }}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="activity-fees">Collection of Activity / Event Fees</option>
              <option value="receivable">Collection of Activity Fees Receivable</option>
              <option value="excess-refund">Excess Activity Fees - Refund Status</option>
            </select>
          </label>

          <div className="mt-4 grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
          <div className="xl:col-span-7">
          {transactionType === 'activity-fees' ? (
        <form onSubmit={event => { event.preventDefault(); if (editingDraftId) submit(event); else saveAsDraft(); }} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><ReviewLaterNote /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Has the event already taken place, or is it scheduled to take place during this reporting period?</label><div className="flex flex-wrap gap-2">{(['yes','no'] as const).map(answer => <button key={answer} type="button" onClick={() => setEventOccursThisPeriod(answer)} className={`rounded-lg px-4 py-2 text-xs font-bold ${eventOccursThisPeriod === answer ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{answer === 'yes' ? 'Yes — this reporting period' : 'No — a future reporting period'}</button>)}</div></div>
          <label className="text-[10px] font-bold uppercase text-slate-500">Event Name<input value={eventName} onChange={event => setEventName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /></label>
          {eventOccursThisPeriod === 'yes' && <label className="text-[10px] font-bold uppercase text-slate-500">Date of Event<input type="date" value={eventDate} onChange={event => setEventDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /></label>}
          {eventOccursThisPeriod === 'yes' && <>
            <label className="text-[10px] font-bold uppercase text-slate-500">What is the total amount of activity fees for this event?<input type="number" min="0.01" step="0.01" value={totalExpected} onChange={event => setTotalExpected(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required /><span className="mt-1 block normal-case font-medium">Note: Enter the full amount expected to be collected from all participants.</span></label>
            <label className="text-[10px] font-bold uppercase text-slate-500">Advance Collection of Activity Fees from the Previous Reporting Period/Semester (If applicable)<input type="number" min="0" step="0.01" max={priorPeriodCollectedMax} value={priorPeriodCollected} onChange={event => setPriorPeriodCollected(event.target.value)} placeholder="Precollection" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:italic placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" /><span className="mt-1 block normal-case font-medium">Enter only the amount collected in advance for this event during a previous semester. It cannot exceed the {formatCurrency(priorPeriodCollectedMax)} beginning balance of Unearned Activity Fees.</span></label>
          </>}
          <div className="sm:col-span-2 space-y-3 rounded-xl border border-indigo-200 bg-white/70 p-3 dark:border-indigo-500/30 dark:bg-slate-900/40">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Collections during the current reporting period / semester</p>
              <p className="mt-1 rounded-lg bg-indigo-50 p-2.5 text-[10px] font-semibold text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200">Include all current-semester activity-fee collections, including amounts received before the event. Do not include advance collections already reported in a previous semester.</p>
            </div>
            {eventOccursThisPeriod === 'yes' ? <>
              <div className="rounded-lg border border-indigo-100 p-3 dark:border-indigo-500/20">
                <DatedAmountRows label="Collections before the event" rows={priorEventCollections} onChange={setPriorEventCollections} currencySymbol={settings.currencySymbol} defaultDate={dayBeforeEvent} minDate={periodBounds?.startDate} maxDate={dayBeforeEvent || undefined} addLabel="Add collection before event" allowEmptyAmounts />
                <p className="mt-2 text-[9px] font-medium text-indigo-700 dark:text-indigo-300">Dates must be earlier than the event date. Collections received on the same date must be combined into one amount.</p>
              </div>
              <div className="rounded-lg border border-indigo-100 p-3 dark:border-indigo-500/20">
                <DatedAmountRows label="Collections on or after the event" rows={onOrAfterEventCollections} onChange={setOnOrAfterEventCollections} currencySymbol={settings.currencySymbol} defaultDate={eventDate} minDate={eventDate || periodBounds?.startDate} maxDate={periodBounds?.endDate} addLabel="Add collection on/after event" allowEmptyAmounts />
                <p className="mt-2 text-[9px] font-medium text-indigo-700 dark:text-indigo-300">Dates cannot be earlier than the event date. Collections received on the same date must be combined into one amount.</p>
              </div>
            </> : <DatedAmountRows label="Collections received for the future event" rows={collections} onChange={setCollections} currencySymbol={settings.currencySymbol} defaultDate="" minDate={periodBounds?.startDate} maxDate={periodBounds?.endDate} addLabel="Add collection" allowEmptyAmounts />}
          </div>
          {excessCollection > 0 && <p className="sm:col-span-2 rounded-lg bg-amber-100 p-2 text-[10px] font-bold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Caution: Collections exceed the required activity fees by {formatCurrency(excessCollection)}. The excess will be recorded as Refund Liability - Activity Fees.</p>}
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
          <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row">
            <button type="submit" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{editingDraftId ? `Record Activity Fees ${collectionTotal ? `(${formatCurrency(collectionTotal)})` : ''}` : 'Save as Draft'}</button>
          </div>
        </form>
          ) : transactionType === 'receivable' ? (
            <form onSubmit={event => { event.preventDefault(); if (editingDraftId) submitReceivableCollection(event); else saveAsDraft(); }} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><ReviewLaterNote /></div>
              <p className="sm:col-span-2 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                Use this for unpaid activity fees from an event that was already held or completed in a previous reporting period. Record one collection transaction at a time.
              </p>
              <label className="sm:col-span-2 text-[10px] font-bold uppercase text-slate-500">
                Event with unpaid activity fees
                <select
                  value={selectedReceivableId}
                  onChange={event => { setSelectedReceivableId(event.target.value); setError(''); setMessage(''); }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  required
                >
                  <option value="">Select an event…</option>
                  {receivableRecords.map(record => (
                    <option key={record.id} value={record.id}>{record.eventName} — {formatCurrency(record.receivableBalance)} remaining</option>
                  ))}
                </select>
              </label>
              {receivableRecords.length === 0 && (
                <p className="sm:col-span-2 rounded-lg bg-amber-100 p-3 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  No events currently have an outstanding Activity Fees Receivable balance.
                </p>
              )}
              {selectedReceivable && (
                <div className="sm:col-span-2 rounded-xl border border-indigo-200 bg-white/70 p-3 dark:border-indigo-500/30 dark:bg-slate-900/40">
                  <DatedAmountRows
                    label="Date and collection"
                    rows={receivableCollection}
                    onChange={setReceivableCollection}
                    currencySymbol={settings.currencySymbol}
                    defaultDate=""
                    maxTotal={selectedReceivable.receivableBalance}
                    allowEmptyAmounts
                    allowMultiple={false}
                  />
                  <div className="mt-3 rounded-lg bg-indigo-50 p-3 text-[10px] dark:bg-indigo-500/10">
                    <p className="font-bold text-slate-500">Automatic journal entry</p>
                    <p className="mt-1 font-semibold text-indigo-800 dark:text-indigo-200">Debit Cash • Credit Activity Fees Receivable</p>
                  </div>
                </div>
              )}
              {error && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
              {message && <p className="sm:col-span-2 rounded-lg bg-emerald-100 p-2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
              <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row">
                <button type="submit" disabled={!selectedReceivable} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{editingDraftId ? 'Record Receivable Collection' : 'Save as Draft'}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={event => { event.preventDefault(); if (editingDraftId) submitExcessResolution(event); else saveAsDraft(); }} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><ReviewLaterNote /></div>
              <p className="sm:col-span-2 text-[10px] font-medium text-slate-600 dark:text-slate-300">Use this when collections exceeded the total required activity fees. Resolve the outstanding Refund Liability for the event.</p>
              <label className="sm:col-span-2 text-[10px] font-bold uppercase text-slate-500">Event with excess activity fees<select value={selectedExcessId} onChange={event => setSelectedExcessId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900" required><option value="">Select an event…</option>{excessRecords.map(record => <option key={record.id} value={record.id}>{record.eventName} — {formatCurrency(record.refundLiabilityBalance || 0)} refund liability</option>)}</select></label>
              {excessRecords.length === 0 && <p className="sm:col-span-2 rounded-lg bg-amber-100 p-3 text-[10px] font-semibold text-amber-800">No events currently have an excess Activity Fees Refund Liability.</p>}
              <label className="sm:col-span-2 text-[10px] font-bold uppercase text-slate-500">How will the excess activity fee be handled?<select value={excessStatus} onChange={event => setExcessStatus(event.target.value as typeof excessStatus)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"><option value="current">Refunded in the Current Reporting Period</option><option value="next">Will Be Refunded in the Next Reporting Period</option><option value="nonrefundable">Will Not Be Refunded</option></select></label>
              {excessStatus !== 'next' && <><label className="text-[10px] font-bold uppercase text-slate-500">{excessStatus === 'current' ? 'Amount refunded' : 'Amount not refunded'}<input type="number" min="0.01" step="0.01" max={selectedExcess?.refundLiabilityBalance} value={excessAmount} onChange={event => setExcessAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900" required /></label><label className="text-[10px] font-bold uppercase text-slate-500">{excessStatus === 'current' ? 'Date of refund (optional)' : 'Date recognized (optional)'}<input type="date" value={excessDate} onChange={event => setExcessDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900" /><span className="mt-1 block normal-case font-medium">Leave blank if unavailable. If entered, it must fall within the selected reporting period.</span></label></>}
              {excessStatus === 'next' && <p className="sm:col-span-2 rounded-lg bg-indigo-50 p-3 text-[10px] font-semibold text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200">No journal entry is posted. The refund liability remains open in Review for the next reporting period.</p>}
              {error && <p className="sm:col-span-2 rounded-lg bg-rose-100 p-2 text-[10px] font-bold text-rose-700">{error}</p>}{message && <p className="sm:col-span-2 rounded-lg bg-emerald-100 p-2 text-[10px] font-bold text-emerald-700">{message}</p>}
              <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row"><button type="submit" disabled={!selectedExcess} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 disabled:opacity-50">{editingDraftId ? 'Update Refund Status' : 'Save as Draft'}</button></div>
            </form>
          )}
          </div>
          <div className="xl:col-span-5">
            <FinancialPreviewPanels lines={previewLines} fallbackDate={eventDate} accounts={accounts} accountBalances={accountBalances} formatCurrency={formatCurrency} />
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
