import { describe, expect, it } from 'vitest';
import { JournalEntry } from '../types';
import { counterpartyBalance, counterpartyBalances, counterpartySummary } from './counterpartyBalances';

const entry = (name: string, debit: number, credit: number): JournalEntry => ({
  id: crypto.randomUUID(), reference: 'JE', date: '', description: '', project: '',
  lines: [{ accountCode: '1350', debit, credit }],
  transactionDetails: { counterpartyName: name, eventRelated: false, receiptAttachmentIds: [] },
});

describe('counterpartyBalances', () => {
  it('keeps separate running loan balances for each organization', () => {
    const entries = [entry('Org A', 1000, 0), entry('Org B', 500, 0), entry('org a', 0, 400)];
    expect(counterpartyBalances(entries, '1350', 'Debit')).toEqual([
      { name: 'Org A', debit: 1000, credit: 400, balance: 600 },
      { name: 'Org B', debit: 500, credit: 0, balance: 500 },
    ]);
    expect(counterpartyBalance(entries, '1350', 'Debit', 'ORG A')).toBe(600);
  });

  it('omits fully settled counterparties', () => {
    expect(counterpartyBalances([entry('Org A', 100, 0), entry('Org A', 0, 100)], '1350', 'Debit')).toEqual([]);
  });
});

describe('counterpartySummary', () => {
  it('keeps officers whose advance is fully used, with total given and amount used', () => {
    expect(counterpartySummary([entry('Juan A.', 3000, 0), entry('Juan A.', 0, 3000), entry('Jessa B.', 1000, 0)], '1350', 'Debit')).toEqual([
      { name: 'Jessa B.', debit: 1000, credit: 0, balance: 1000 },
      { name: 'Juan A.', debit: 3000, credit: 3000, balance: 0 },
    ]);
  });
});

describe('reversed entries', () => {
  it('stop counting once they have been reversed', () => {
    const reversed = { ...entry('Org A', 1000, 0), reversedByEntryId: 'rev' };
    expect(counterpartyBalances([reversed], '1350', 'Debit')).toEqual([]);
    expect(counterpartySummary([reversed], '1350', 'Debit')).toEqual([]);
  });
});
