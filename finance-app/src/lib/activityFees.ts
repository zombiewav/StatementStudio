import { ActivityFeeRecord, JournalLine } from '../types';

export const ACTIVITY_FEE_RECEIVABLE_CODE = '1310';
export const DEFERRED_ACTIVITY_FEE_CODE = '2110';
export const ACTIVITY_FEE_REVENUE_CODE = '4090';
export const CASH_CODE = '1010';

export type ActivityFeeFollowUp =
  | { type: 'collect-receivable'; amount: number }
  | { type: 'event-held'; amount: number }
  | { type: 'postpone'; amount: number }
  | { type: 'cancel-refundable'; amount: number }
  | { type: 'cancel-nonrefundable' }
  | { type: 'refund'; amount: number };

export interface ActivityFeePosting {
  lines: JournalLine[];
  next: Pick<ActivityFeeRecord, 'totalCollected' | 'totalRefunded' | 'receivableBalance' | 'deferredBalance' | 'status'>;
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

export function buildInitialActivityFeePosting(totalExpected: number, collected: number, eventOccurred: boolean): ActivityFeePosting {
  positive(totalExpected, 'Total expected fees');
  positive(collected, 'Amount collected', true);
  if (collected > totalExpected) throw new Error('Amount collected cannot exceed total expected fees.');

  if (!eventOccurred) {
    return {
      lines: clean([
        { accountCode: CASH_CODE, debit: collected, credit: 0 },
        { accountCode: DEFERRED_ACTIVITY_FEE_CODE, debit: 0, credit: collected },
      ]),
      next: { totalCollected: collected, totalRefunded: 0, receivableBalance: 0, deferredBalance: collected, status: 'scheduled' },
      action: 'initial', amount: collected, description: 'Activity fees collected before event',
    };
  }

  const receivable = totalExpected - collected;
  return {
    lines: clean([
      { accountCode: CASH_CODE, debit: collected, credit: 0 },
      { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: receivable, credit: 0 },
      { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: totalExpected },
    ]),
    next: { totalCollected: collected, totalRefunded: 0, receivableBalance: receivable, deferredBalance: 0, status: receivable > 0 ? 'receivable' : 'complete' },
    action: 'initial', amount: collected, description: 'Activity fees recognized for event held',
  };
}

export function buildActivityFeeFollowUp(record: ActivityFeeRecord, followUp: ActivityFeeFollowUp): ActivityFeePosting {
  const remainingCollectionCapacity = record.totalExpected - record.totalCollected;
  if ('amount' in followUp) positive(followUp.amount, followUp.type === 'refund' || followUp.type === 'cancel-refundable' ? 'Refund amount' : 'Collection amount', true);

  if (followUp.type === 'refund' && record.status !== 'refund-due') {
    throw new Error('This event has no outstanding activity-fee refund to record.');
  }

  if (followUp.type === 'collect-receivable') {
    if (record.status !== 'receivable') throw new Error('This event has no activity-fee receivable to collect.');
    if (followUp.amount <= 0 || followUp.amount > record.receivableBalance) throw new Error('Collection cannot exceed the remaining receivable.');
    const receivable = record.receivableBalance - followUp.amount;
    return { lines: [{ accountCode: CASH_CODE, debit: followUp.amount, credit: 0 }, { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: 0, credit: followUp.amount }], next: { totalCollected: record.totalCollected + followUp.amount, totalRefunded: record.totalRefunded, receivableBalance: receivable, deferredBalance: 0, status: receivable === 0 ? 'complete' : 'receivable' }, action: 'collection', amount: followUp.amount, description: 'Collection of outstanding activity fees' };
  }

  if (!['scheduled', 'postponed'].includes(record.status) && followUp.type !== 'refund') throw new Error('This activity-fee event no longer accepts that update.');

  if (followUp.type === 'postpone') {
    if (followUp.amount > remainingCollectionCapacity) throw new Error('Total collections cannot exceed total expected fees.');
    return { lines: clean([{ accountCode: CASH_CODE, debit: followUp.amount, credit: 0 }, { accountCode: DEFERRED_ACTIVITY_FEE_CODE, debit: 0, credit: followUp.amount }]), next: { totalCollected: record.totalCollected + followUp.amount, totalRefunded: record.totalRefunded, receivableBalance: 0, deferredBalance: record.deferredBalance + followUp.amount, status: 'postponed' }, action: 'postponed', amount: followUp.amount, description: 'Additional activity fees collected; event postponed' };
  }

  if (followUp.type === 'event-held') {
    if (followUp.amount > remainingCollectionCapacity) throw new Error('Total collections cannot exceed total expected fees.');
    const totalCollected = record.totalCollected + followUp.amount;
    const receivable = record.totalExpected - totalCollected;
    return { lines: clean([{ accountCode: CASH_CODE, debit: followUp.amount, credit: 0 }, { accountCode: DEFERRED_ACTIVITY_FEE_CODE, debit: record.deferredBalance, credit: 0 }, { accountCode: ACTIVITY_FEE_RECEIVABLE_CODE, debit: receivable, credit: 0 }, { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: record.totalExpected }]), next: { totalCollected, totalRefunded: record.totalRefunded, receivableBalance: receivable, deferredBalance: 0, status: receivable === 0 ? 'complete' : 'receivable' }, action: 'held', amount: followUp.amount, description: 'Event held; activity fees recognized' };
  }

  if (followUp.type === 'cancel-nonrefundable') {
    return { lines: clean([{ accountCode: DEFERRED_ACTIVITY_FEE_CODE, debit: record.deferredBalance, credit: 0 }, { accountCode: ACTIVITY_FEE_REVENUE_CODE, debit: 0, credit: record.deferredBalance }]), next: { totalCollected: record.totalCollected, totalRefunded: record.totalRefunded, receivableBalance: 0, deferredBalance: 0, status: 'complete' }, action: 'cancelled-nonrefundable', amount: record.deferredBalance, description: 'Cancelled event; non-refundable fees recognized' };
  }

  if (followUp.type === 'cancel-refundable' || followUp.type === 'refund') {
    const amount = followUp.amount;
    if (amount > record.deferredBalance) throw new Error('Refund cannot exceed the remaining deferred activity fees.');
    const deferredBalance = record.deferredBalance - amount;
    return { lines: clean([{ accountCode: DEFERRED_ACTIVITY_FEE_CODE, debit: amount, credit: 0 }, { accountCode: CASH_CODE, debit: 0, credit: amount }]), next: { totalCollected: record.totalCollected, totalRefunded: record.totalRefunded + amount, receivableBalance: 0, deferredBalance, status: deferredBalance === 0 ? 'complete' : 'refund-due' }, action: followUp.type === 'refund' ? 'refund' : 'cancelled-refundable', amount, description: 'Refund of cancelled activity fees' };
  }

  throw new Error('Unsupported activity-fee update.');
}

export function isActivityFeeIncomplete(record: ActivityFeeRecord): boolean {
  return record.status !== 'complete';
}
