import { ActivityFeeRecord, DatedAmountRecord, JournalLine } from '../types';

export const ACTIVITY_FEE_RECEIVABLE_CODE = '1310';
export const UNEARNED_ACTIVITY_FEE_CODE = '2110';
export const DEFERRED_ACTIVITY_FEE_CODE = UNEARNED_ACTIVITY_FEE_CODE;
export const ACTIVITY_FEE_REVENUE_CODE = '4090';
export const ACTIVITY_FEE_REFUND_LIABILITY_CODE = '2120';
export const CASH_CODE = '1010';

export type ActivityFeeFollowUp =
  | { type: 'collect-receivable'; amount: number }
  | { type: 'event-held'; amount: number }
  | { type: 'postpone'; amount: number }
  | { type: 'cancel-refundable'; amount: number }
  | { type: 'cancel-nonrefundable' }
  | { type: 'refund'; amount: number }
  | { type: 'refund-excess'; amount: number }
  | { type: 'defer-excess-refund' }
  | { type: 'recognize-excess'; amount: number };

export interface ActivityFeeJournalPosting {
  date: string;
  lines: JournalLine[];
  action: ActivityFeeRecord['history'][number]['action'];
  amount: number;
  description: string;
}

export interface ActivityFeeSchedule {
  postings: ActivityFeeJournalPosting[];
  next: Pick<ActivityFeeRecord, 'totalExpected' | 'totalCollected' | 'totalRefunded' | 'receivableBalance' | 'deferredBalance' | 'refundLiabilityBalance' | 'status'>;
}

export interface InitialActivityFeeInput {
  eventOccursThisPeriod: boolean;
  eventDate?: string;
  totalExpected?: number;
  priorPeriodCollected?: number;
  collections: DatedAmountRecord[];
}

export interface ActivityFeePosting {
  lines: JournalLine[];
  next: Pick<ActivityFeeRecord, 'totalCollected' | 'totalRefunded' | 'receivableBalance' | 'deferredBalance' | 'refundLiabilityBalance' | 'status'>;
  action: ActivityFeeRecord['history'][number]['action'];
  amount: number;
  description: string;
}

function positive(value: number, label: string, allowZero = false): void {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) throw new Error(`${label} must be greater than zero.`);
}

function clean(lines: JournalLine[]): JournalLine[] {
  return lines.filter(line => line.debit > 0 || line.credit > 0);
}

// `defaultDate` lets a blank collection date fall back to the event date
// (recognition schedule, where one is already known and required) instead
// of being rejected — same-day collections are the common case, so forcing
// a redundant date entry there is pure friction. Left undefined (the
// future-event schedule, with no event date yet to fall back to), a blank
// date is still an error — there's nothing sensible to default it to.
function validateCollections(collections: DatedAmountRecord[], defaultDate?: string): DatedAmountRecord[] {
  return collections
    .filter(collection => collection.amount > 0)
    .map(collection => {
      const date = collection.date || defaultDate;
      if (!date) throw new Error('Each activity-fee collection needs a date.');
      positive(collection.amount, 'Collection amount');
      return { ...collection, date };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sum(collections: DatedAmountRecord[]): number {
  return collections.reduce((total, collection) => total + collection.amount, 0);
}

function assertUniqueDates(collections: DatedAmountRecord[], label: string): void {
  const dates = collections.map(collection => collection.date);
  if (new Set(dates).size !== dates.length) throw new Error(`${label} cannot contain duplicate dates. Combine collections received on the same date into one amount.`);
}

function collectionPosting(collection: DatedAmountRecord, creditAccountCode: string, action: ActivityFeeJournalPosting['action'], description: string): ActivityFeeJournalPosting {
  return {
    date: collection.date,
    lines: [
      { accountCode: CASH_CODE, debit: collection.amount, credit: 0, date: collection.date },
      { accountCode: creditAccountCode, debit: 0, credit: collection.amount, date: collection.date },
    ],
    action,
    amount: collection.amount,
    description,
  };
}

function buildRecognitionSchedule(existingUnearned: number, totalExpected: number, eventDate: string, collections: DatedAmountRecord[]): ActivityFeeSchedule {
  positive(totalExpected, 'Total activity fees');
  positive(existingUnearned, 'Activity fees collected in previous periods', true);
  if (!eventDate) throw new Error('Event date is required.');
  const dated = validateCollections(collections, eventDate);
  const currentCollected = sum(dated);
  const early = dated.filter(collection => collection.date < eventDate);
  const sameDay = dated.filter(collection => collection.date === eventDate);
  const after = dated.filter(collection => collection.date > eventDate);
  assertUniqueDates(early, 'Collections before the event');
  assertUniqueDates([...sameDay, ...after], 'Collections on or after the event');
  const earlyTotal = sum(early);
  const sameDayTotal = sum(sameDay);
  const unearnedReleased = existingUnearned + earlyTotal;
  const collectedAtEvent = unearnedReleased + sameDayTotal;
  const receivableAtEvent = Math.max(0, totalExpected - collectedAtEvent);
  let remainingReceivable = receivableAtEvent;
  let refundLiability = Math.max(0, collectedAtEvent - totalExpected);
  const postings: ActivityFeeJournalPosting[] = [
    ...early.map(collection => collectionPosting(collection, UNEARNED_ACTIVITY_FEE_CODE, 'initial', 'Activity fees collected before the event')),
    {
      date: eventDate,
      lines: clean([
        { accountCode: UNEARNED_ACTIVITY_FEE_CODE, debit: unearnedReleased, credit: 0, date: eventDate },
        { accountCode: CASH_CODE, debit: sameDayTotal, credit: 0, date: eventDate },
        { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: receivableAtEvent, credit: 0, date: eventDate },
        { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: totalExpected, date: eventDate },
        { accountCode: ACTIVITY_FEE_REFUND_LIABILITY_CODE, debit: 0, credit: refundLiability, date: eventDate },
      ]),
      action: 'held',
      amount: totalExpected,
      description: 'Event held; activity fees recognized',
    },
  ];

  after.forEach(collection => {
    const receivablePortion = Math.min(remainingReceivable, collection.amount);
    const excessPortion = collection.amount - receivablePortion;
    postings.push({
      date: collection.date,
      lines: clean([
        { accountCode: CASH_CODE, debit: collection.amount, credit: 0, date: collection.date },
        { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: 0, credit: receivablePortion, date: collection.date },
        { accountCode: ACTIVITY_FEE_REFUND_LIABILITY_CODE, debit: 0, credit: excessPortion, date: collection.date },
      ]),
      action: 'collection',
      amount: collection.amount,
      description: excessPortion > 0 ? 'Activity fee collection with excess refund liability' : 'Collection of activity fees after the event',
    });
    remainingReceivable -= receivablePortion;
    refundLiability += excessPortion;
  });

  return {
    postings,
    next: { totalExpected, totalCollected: existingUnearned + currentCollected, totalRefunded: 0, receivableBalance: remainingReceivable, deferredBalance: 0, refundLiabilityBalance: refundLiability, status: refundLiability > 0 ? 'refund-due' : remainingReceivable === 0 ? 'complete' : 'receivable' },
  };
}

export function buildInitialActivityFeeSchedule(input: InitialActivityFeeInput): ActivityFeeSchedule {
  if (!input.eventOccursThisPeriod) {
    // No event date exists yet to default a blank collection date to.
    const collections = validateCollections(input.collections);
    const totalCollected = sum(collections);
    return {
      postings: collections.map(collection => collectionPosting(collection, UNEARNED_ACTIVITY_FEE_CODE, 'initial', 'Activity fees collected before a future event')),
      next: { totalExpected: 0, totalCollected, totalRefunded: 0, receivableBalance: 0, deferredBalance: totalCollected, refundLiabilityBalance: 0, status: 'scheduled' },
    };
  }
  // buildRecognitionSchedule re-validates with input.eventDate as the
  // blank-date default, so the raw (unvalidated) collections pass through.
  return buildRecognitionSchedule(input.priorPeriodCollected || 0, input.totalExpected || 0, input.eventDate || '', input.collections);
}

export function buildScheduledActivityFeeRecognition(record: ActivityFeeRecord, totalExpected: number, eventDate: string, collections: DatedAmountRecord[]): ActivityFeeSchedule {
  if (!['scheduled', 'postponed'].includes(record.status)) throw new Error('This event is not waiting to be held.');
  const schedule = buildRecognitionSchedule(record.deferredBalance, totalExpected, eventDate, collections);
  return { ...schedule, next: { ...schedule.next, totalCollected: record.totalCollected + sum(validateCollections(collections, eventDate)), totalRefunded: record.totalRefunded } };
}

export function buildActivityFeeReceivableCollections(record: ActivityFeeRecord, collections: DatedAmountRecord[]): ActivityFeeSchedule {
  if (record.status !== 'receivable') throw new Error('This event has no activity-fee receivable to collect.');
  const dated = validateCollections(collections);
  const collected = sum(dated);
  if (collected <= 0) throw new Error('Enter at least one collection amount.');
  if (collected > record.receivableBalance) throw new Error('Collections cannot exceed the remaining activity-fee receivable.');
  const receivableBalance = record.receivableBalance - collected;
  return {
    postings: dated.map(collection => collectionPosting(collection, ACTIVITY_FEE_RECEIVABLE_CODE, 'collection', 'Collection of outstanding activity fees')),
    next: { totalExpected: record.totalExpected, totalCollected: record.totalCollected + collected, totalRefunded: record.totalRefunded, receivableBalance, deferredBalance: 0, refundLiabilityBalance: record.refundLiabilityBalance || 0, status: receivableBalance === 0 ? 'complete' : 'receivable' },
  };
}

// Legacy builders keep older saved postpone/cancel/refund records operable.
export function buildInitialActivityFeePosting(totalExpected: number, collected: number, eventOccurred: boolean): ActivityFeePosting {
  positive(totalExpected, 'Total expected fees'); positive(collected, 'Amount collected', true);
  if (collected > totalExpected) throw new Error('Amount collected cannot exceed total expected fees.');
  if (!eventOccurred) return { lines: clean([{ accountCode: CASH_CODE, debit: collected, credit: 0 }, { accountCode: UNEARNED_ACTIVITY_FEE_CODE, debit: 0, credit: collected }]), next: { totalCollected: collected, totalRefunded: 0, receivableBalance: 0, deferredBalance: collected, status: 'scheduled' }, action: 'initial', amount: collected, description: 'Activity fees collected before event' };
  const receivable = totalExpected - collected;
  return { lines: clean([{ accountCode: CASH_CODE, debit: collected, credit: 0 }, { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: receivable, credit: 0 }, { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: totalExpected }]), next: { totalCollected: collected, totalRefunded: 0, receivableBalance: receivable, deferredBalance: 0, status: receivable > 0 ? 'receivable' : 'complete' }, action: 'initial', amount: collected, description: 'Activity fees recognized for event held' };
}

export function buildActivityFeeFollowUp(record: ActivityFeeRecord, followUp: ActivityFeeFollowUp): ActivityFeePosting {
  const remainingCollectionCapacity = record.totalExpected - record.totalCollected;
  if ('amount' in followUp) positive(followUp.amount, followUp.type === 'refund' || followUp.type === 'cancel-refundable' ? 'Refund amount' : 'Collection amount', true);
  if (followUp.type === 'defer-excess-refund') {
    return { lines: [], next: { totalCollected: record.totalCollected, totalRefunded: record.totalRefunded, receivableBalance: record.receivableBalance, deferredBalance: record.deferredBalance, refundLiabilityBalance: record.refundLiabilityBalance || 0, status: 'refund-due' }, action: 'excess-refund-deferred', amount: record.refundLiabilityBalance || 0, description: 'Excess activity fees will be refunded in the next reporting period' };
  }
  if (followUp.type === 'refund-excess' || followUp.type === 'recognize-excess') {
    const balance = record.refundLiabilityBalance || 0;
    if (balance <= 0) throw new Error('This event has no excess activity-fee refund liability.');
    if (followUp.amount <= 0 || followUp.amount > balance) throw new Error('Amount cannot exceed the remaining refund liability.');
    const remaining = balance - followUp.amount;
    return {
      lines: followUp.type === 'refund-excess'
        ? [{ accountCode: ACTIVITY_FEE_REFUND_LIABILITY_CODE, debit: followUp.amount, credit: 0 }, { accountCode: CASH_CODE, debit: 0, credit: followUp.amount }]
        : [{ accountCode: ACTIVITY_FEE_REFUND_LIABILITY_CODE, debit: followUp.amount, credit: 0 }, { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: followUp.amount }],
      next: { totalCollected: record.totalCollected, totalRefunded: record.totalRefunded + (followUp.type === 'refund-excess' ? followUp.amount : 0), receivableBalance: record.receivableBalance, deferredBalance: record.deferredBalance, refundLiabilityBalance: remaining, status: remaining === 0 ? 'complete' : 'refund-due' },
      action: followUp.type === 'refund-excess' ? 'excess-refund' : 'excess-nonrefundable',
      amount: followUp.amount,
      description: followUp.type === 'refund-excess' ? 'Refund of excess activity fees' : 'Non-refundable excess activity fees recognized as revenue',
    };
  }
  if (followUp.type === 'refund' && record.status !== 'refund-due') throw new Error('This event has no outstanding activity-fee refund to record.');
  if (followUp.type === 'collect-receivable') {
    if (record.status !== 'receivable') throw new Error('This event has no activity-fee receivable to collect.');
    if (followUp.amount <= 0 || followUp.amount > record.receivableBalance) throw new Error('Collection cannot exceed the remaining receivable.');
    const receivable = record.receivableBalance - followUp.amount;
    return { lines: [{ accountCode: CASH_CODE, debit: followUp.amount, credit: 0 }, { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: 0, credit: followUp.amount }], next: { totalCollected: record.totalCollected + followUp.amount, totalRefunded: record.totalRefunded, receivableBalance: receivable, deferredBalance: 0, status: receivable === 0 ? 'complete' : 'receivable' }, action: 'collection', amount: followUp.amount, description: 'Collection of outstanding activity fees' };
  }
  if (!['scheduled', 'postponed'].includes(record.status) && followUp.type !== 'refund') throw new Error('This activity-fee event no longer accepts that update.');
  if (followUp.type === 'postpone') {
    if (followUp.amount > remainingCollectionCapacity) throw new Error('Total collections cannot exceed total expected fees.');
    return { lines: clean([{ accountCode: CASH_CODE, debit: followUp.amount, credit: 0 }, { accountCode: UNEARNED_ACTIVITY_FEE_CODE, debit: 0, credit: followUp.amount }]), next: { totalCollected: record.totalCollected + followUp.amount, totalRefunded: record.totalRefunded, receivableBalance: 0, deferredBalance: record.deferredBalance + followUp.amount, status: 'postponed' }, action: 'postponed', amount: followUp.amount, description: 'Additional activity fees collected; event postponed' };
  }
  if (followUp.type === 'event-held') {
    if (followUp.amount > remainingCollectionCapacity) throw new Error('Total collections cannot exceed total expected fees.');
    const totalCollected = record.totalCollected + followUp.amount; const receivable = record.totalExpected - totalCollected;
    return { lines: clean([{ accountCode: CASH_CODE, debit: followUp.amount, credit: 0 }, { accountCode: UNEARNED_ACTIVITY_FEE_CODE, debit: record.deferredBalance, credit: 0 }, { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: receivable, credit: 0 }, { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: record.totalExpected }]), next: { totalCollected, totalRefunded: record.totalRefunded, receivableBalance: receivable, deferredBalance: 0, status: receivable === 0 ? 'complete' : 'receivable' }, action: 'held', amount: followUp.amount, description: 'Event held; activity fees recognized' };
  }
  if (followUp.type === 'cancel-nonrefundable') return { lines: clean([{ accountCode: UNEARNED_ACTIVITY_FEE_CODE, debit: record.deferredBalance, credit: 0 }, { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: record.deferredBalance }]), next: { totalCollected: record.totalCollected, totalRefunded: record.totalRefunded, receivableBalance: 0, deferredBalance: 0, status: 'complete' }, action: 'cancelled-nonrefundable', amount: record.deferredBalance, description: 'Cancelled event; non-refundable fees recognized' };
  if (followUp.type === 'cancel-refundable' || followUp.type === 'refund') {
    if (followUp.amount > record.deferredBalance) throw new Error('Refund cannot exceed the remaining unearned activity fees.');
    const deferredBalance = record.deferredBalance - followUp.amount;
    return { lines: clean([{ accountCode: UNEARNED_ACTIVITY_FEE_CODE, debit: followUp.amount, credit: 0 }, { accountCode: CASH_CODE, debit: 0, credit: followUp.amount }]), next: { totalCollected: record.totalCollected, totalRefunded: record.totalRefunded + followUp.amount, receivableBalance: 0, deferredBalance, status: deferredBalance === 0 ? 'complete' : 'refund-due' }, action: followUp.type === 'refund' ? 'refund' : 'cancelled-refundable', amount: followUp.amount, description: 'Refund of cancelled activity fees' };
  }
  throw new Error('Unsupported activity-fee update.');
}

export function isActivityFeeIncomplete(record: ActivityFeeRecord): boolean { return record.status !== 'complete'; }
