import { JournalEntry } from '../types';

export interface CounterpartyBalance {
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/** Builds a running subledger from the counterparty saved on each transaction.
 * `normalBalance` controls whether debit or credit activity increases the balance. */
export function counterpartyBalances(
  entries: JournalEntry[],
  accountCode: string,
  normalBalance: 'Debit' | 'Credit',
): CounterpartyBalance[] {
  const totals = new Map<string, CounterpartyBalance>();

  entries.forEach(entry => {
    const name = entry.transactionDetails?.counterpartyName?.trim();
    if (!name) return;
    entry.lines.filter(line => line.accountCode === accountCode).forEach(line => {
      const key = name.toLocaleLowerCase();
      const current = totals.get(key) || { name, debit: 0, credit: 0, balance: 0 };
      current.debit = cents(current.debit + line.debit);
      current.credit = cents(current.credit + line.credit);
      current.balance = cents(normalBalance === 'Debit'
        ? current.debit - current.credit
        : current.credit - current.debit);
      totals.set(key, current);
    });
  });

  return [...totals.values()]
    .filter(item => item.balance > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function counterpartyBalance(
  entries: JournalEntry[],
  accountCode: string,
  normalBalance: 'Debit' | 'Credit',
  name: string,
): number {
  const key = name.trim().toLocaleLowerCase();
  return counterpartyBalances(entries, accountCode, normalBalance)
    .find(item => item.name.toLocaleLowerCase() === key)?.balance || 0;
}
