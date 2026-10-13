import { Account, JournalEntry, JournalLine } from '../types';
import { isCashAccountCode } from './cashAccounts';

// Statement of Cash Flows built straight from the journal (direct method).
// Rules from the client's "closing to SFP" document:
//  1. Only entries that touch a cash account produce a cash flow; moves between
//     cash accounts are not receipts or payments.
//  2. Cash debited is a Cash Receipt, cash credited is a Cash Payment, for the
//     actual amount on the cash line.
//  3. The category is the related account on the other side. With several
//     related accounts the actual cash is split across them in proportion to
//     their amounts, never assigned in full to each.
//  4. Operating by default. Only cash paid for Equipment and Furniture & Fixtures
//     is Investing.
//  5. Every cash movement appears once: no cash line, no cash flow; a reversed
//     entry and its reversal inside the period cancel out.
//  6. Group, total, add beginning cash and check ending cash against the ledger.

export const EQUIPMENT_PURCHASE_LABEL = 'Purchase of equipment';
export const FURNITURE_PURCHASE_LABEL = 'Purchase of furniture and fixture';

export interface CashFlowLine {
  /** Account code, or 'other' when an entry has no related account on that side. */
  key: string;
  label: string;
  amount: number;
}

export interface CashFlowStatement {
  /** Operating cash receipts by category (positive amounts). */
  receipts: CashFlowLine[];
  /** Operating cash payments by category (positive amounts, shown as outflows). */
  payments: CashFlowLine[];
  totalReceipts: number;
  totalPayments: number;
  netOperating: number;
  /** Cash paid for equipment and for furniture and fixtures (positive amounts, shown as outflows). */
  equipmentPurchases: number;
  furniturePurchases: number;
  netInvesting: number;
  netChange: number;
  beginningCash: number;
  endingCash: number;
  /** Cash balance per the general ledger at the end date, to check the statement against. */
  ledgerCash: number;
  reconcilesToLedger: boolean;
}

const cents = (value: number): number => Math.round(value * 100) / 100;
const inCode = (code: string, from: number, to: number): boolean => {
  const value = Number(code);
  return Number.isInteger(value) && value >= from && value <= to;
};
const isEquipmentCode = (code: string): boolean => inCode(code, 1500, 1516);
const isFurnitureCode = (code: string): boolean => inCode(code, 1650, 1653);

const lineDate = (entry: JournalEntry, line: JournalLine): string => line.date || entry.date;

/** Splits an amount across weights to the cent; the last share takes the rounding remainder. */
function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights.map(() => 0);
  let remaining = cents(amount);
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return remaining;
    const share = cents(amount * weight / total);
    remaining = cents(remaining - share);
    return share;
  });
}

interface RelatedAccount { code: string; amount: number }

/** Accounts on the side opposite the cash line, netted per account, with their amounts. */
function relatedAccounts(otherLines: JournalLine[], side: 'credit' | 'debit'): RelatedAccount[] {
  const net = new Map<string, number>();
  otherLines.forEach(line => {
    const signed = side === 'credit' ? line.credit - line.debit : line.debit - line.credit;
    net.set(line.accountCode, cents((net.get(line.accountCode) || 0) + signed));
  });
  return [...net.entries()].filter(([, amount]) => amount > 0).map(([code, amount]) => ({ code, amount }));
}

export function buildCashFlowStatement(
  entries: JournalEntry[],
  accounts: Account[],
  startDate: string,
  endDate: string,
  openingCash = 0,
): CashFlowStatement {
  const posted = entries.filter(entry => !entry.isDraft);
  const byId = new Map(posted.map(entry => [entry.id, entry]));
  const cashLinesOf = (entry: JournalEntry) => entry.lines.filter(line => isCashAccountCode(line.accountCode));
  const isWithin = (entry: JournalEntry, line: JournalLine) => lineDate(entry, line) >= startDate && lineDate(entry, line) <= endDate;
  const entirelyWithin = (entry: JournalEntry) => cashLinesOf(entry).every(line => isWithin(entry, line));

  // A reversed entry and its reversal, both inside the period, are the same movement undone.
  const cancelled = new Set<string>();
  posted.forEach(entry => {
    const reversal = entry.reversedByEntryId ? byId.get(entry.reversedByEntryId) : undefined;
    if (reversal && cashLinesOf(entry).length && entirelyWithin(entry) && entirelyWithin(reversal)) {
      cancelled.add(entry.id);
      cancelled.add(reversal.id);
    }
  });

  const nameOf = (code: string) => accounts.find(account => account.code === code)?.name || code;
  const receipts = new Map<string, number>();
  const payments = new Map<string, number>();
  let equipmentPurchases = 0;
  let furniturePurchases = 0;
  const add = (map: Map<string, number>, key: string, amount: number) => map.set(key, cents((map.get(key) || 0) + amount));

  let beginningCash = openingCash;
  let ledgerCash = openingCash;

  posted.forEach(entry => {
    const cashLines = cashLinesOf(entry);
    if (!cashLines.length) return;
    cashLines.forEach(line => {
      const net = line.debit - line.credit;
      const date = lineDate(entry, line);
      if (date < startDate) beginningCash = cents(beginningCash + net);
      if (date <= endDate) ledgerCash = cents(ledgerCash + net);
    });

    const otherLines = entry.lines.filter(line => !isCashAccountCode(line.accountCode));
    // Moving money between cash accounts is neither a receipt nor a payment.
    if (!otherLines.length || cancelled.has(entry.id)) return;

    const received = cents(cashLines.filter(line => isWithin(entry, line)).reduce((sum, line) => sum + line.debit, 0));
    const paid = cents(cashLines.filter(line => isWithin(entry, line)).reduce((sum, line) => sum + line.credit, 0));

    if (received > 0) {
      const related = relatedAccounts(otherLines, 'credit');
      if (!related.length) add(receipts, 'other', received);
      else allocate(received, related.map(item => item.amount)).forEach((amount, index) => add(receipts, related[index].code, amount));
    }
    if (paid > 0) {
      const related = relatedAccounts(otherLines, 'debit');
      if (!related.length) add(payments, 'other', paid);
      else allocate(paid, related.map(item => item.amount)).forEach((amount, index) => {
        const code = related[index].code;
        if (isEquipmentCode(code)) equipmentPurchases = cents(equipmentPurchases + amount);
        else if (isFurnitureCode(code)) furniturePurchases = cents(furniturePurchases + amount);
        else add(payments, code, amount);
      });
    }
  });

  const toLines = (map: Map<string, number>, otherLabel: string): CashFlowLine[] => [...map.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([key, amount]) => ({ key, label: key === 'other' ? otherLabel : nameOf(key), amount }))
    .sort((a, b) => (a.key === 'other' ? 1 : b.key === 'other' ? -1 : a.label.localeCompare(b.label)));

  const receiptLines = toLines(receipts, 'Other receipts');
  const paymentLines = toLines(payments, 'Other payments');
  const totalReceipts = cents(receiptLines.reduce((sum, line) => sum + line.amount, 0));
  const totalPayments = cents(paymentLines.reduce((sum, line) => sum + line.amount, 0));
  const netOperating = cents(totalReceipts - totalPayments);
  const netInvesting = cents(-(equipmentPurchases + furniturePurchases));
  const netChange = cents(netOperating + netInvesting);
  const endingCash = cents(beginningCash + netChange);

  return {
    receipts: receiptLines,
    payments: paymentLines,
    totalReceipts,
    totalPayments,
    netOperating,
    equipmentPurchases,
    furniturePurchases,
    netInvesting,
    netChange,
    beginningCash,
    endingCash,
    ledgerCash,
    reconcilesToLedger: Math.abs(endingCash - ledgerCash) < 0.005,
  };
}
