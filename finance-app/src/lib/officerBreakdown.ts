import { JournalEntry } from '../types';

export interface OfficerExpenseRow {
  entryId: string;
  date: string;
  transaction: string;
  amount: number;
}

export interface OfficerBreakdown {
  rows: OfficerExpenseRow[];
  total: number;
  reimbursed: number;
  remaining: number;
}

const DUE_TO_OFFICERS = '2050';
const cents = (value: number): number => Math.round(value * 100) / 100;

/** What one accountable officer paid out of personal money on behalf of the
 * organization (credits to Due to Officers), the reimbursements already made
 * (debits), and what is still owed. Reversed entries and their reversals are
 * left out so the breakdown matches the officer's payable balance. */
export function officerBreakdown(entries: JournalEntry[], officer: string): OfficerBreakdown {
  const key = officer.trim().toLocaleLowerCase();
  const rows: OfficerExpenseRow[] = [];
  let reimbursed = 0;

  if (key) {
    entries.forEach(entry => {
      if (entry.reversedByEntryId || entry.reversalOfEntryId) return;
      if (entry.transactionDetails?.counterpartyName?.trim().toLocaleLowerCase() !== key) return;
      entry.lines.filter(line => line.accountCode === DUE_TO_OFFICERS).forEach(line => {
        if (line.credit > 0) {
          rows.push({ entryId: entry.id, date: line.date || entry.date, transaction: entry.transactionType || entry.description, amount: cents(line.credit) });
        }
        reimbursed = cents(reimbursed + line.debit);
      });
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  const total = cents(rows.reduce((sum, row) => sum + row.amount, 0));
  return { rows, total, reimbursed, remaining: Math.max(0, cents(total - reimbursed)) };
}
