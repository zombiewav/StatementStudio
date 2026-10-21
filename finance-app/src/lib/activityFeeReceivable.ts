import { JournalEntry } from '../types';

export const ACTIVITY_FEE_RECEIVABLE_COLLECTION_TYPE = 'Collection of Activity Fees Receivable';

const money = (value: number): number => Math.round(value * 100) / 100;

/**
 * Client (Oct 2026): "Collection of Activity Fees Receivable" is linked to the BEGINNING balance of Activity Fees
 * Receivable (what the previous semester carried in), like Payables and Membership Dues, not to the outstanding balance
 * of events recorded this semester.
 *
 * What was already collected is what earlier collections of this type recorded in `activityFeePriorReceivableCollected`.
 * A reversed entry (and a reversal) is skipped, which gives its amount back. Only entries inside the reporting period count,
 * because the opening balance of a later semester already reflects what earlier semesters collected.
 */
export function remainingBeginningActivityFeeReceivable(
  openingBalance: number,
  entries: JournalEntry[],
  period?: { startDate: string; endDate: string },
): number {
  const collected = entries.reduce((sum, entry) => {
    if (entry.reversedByEntryId || entry.reversalOfEntryId) return sum;
    if (period && (entry.date < period.startDate || entry.date > period.endDate)) return sum;
    return sum + Number(entry.transactionDetails?.activityFeePriorReceivableCollected || 0);
  }, 0);
  return Math.max(0, money(Number(openingBalance || 0) - collected));
}
