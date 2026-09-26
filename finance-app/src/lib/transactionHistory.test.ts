import { describe, expect, it } from 'vitest';
import { Account, JournalEntry } from '../types';
import { buildAccountTransactionHistory, buildInventorySummary, buildMerchandiseSaleLines, merchandiseSaleCostError } from './transactionHistory';

const inventory: Account = { code: '1700', name: 'Inventory', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true };
const entries: JournalEntry[] = [
  { id: 'sale', reference: 'JE-0002', date: '2030-02-01', description: 'Sale', project: 'General', lines: [{ accountCode: '5240', debit: 300, credit: 0 }, { accountCode: '1700', debit: 0, credit: 300 }] },
  { id: 'purchase', reference: 'JE-0001', date: '2026-01-01', description: 'Purchase', project: 'General', lines: [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }] },
  { id: 'last-sale', reference: 'JE-0003', date: '2031-01-01', description: 'Final sale', project: 'General', lines: [{ accountCode: '5240', debit: 700, credit: 0 }, { accountCode: '1700', debit: 0, credit: 700 }] },
];

describe('transaction history', () => {
  it('sorts entries and maintains the correct account running balance', () => {
    const history = buildAccountTransactionHistory(inventory, entries);
    expect(history.map(line => line.reference)).toEqual(['JE-0001', 'JE-0002', 'JE-0003']);
    expect(history.map(line => line.runningBalance)).toEqual([1000, 700, 0]);
  });

  it('uses a journal line posting date and falls back to the journal date for older entries', () => {
    const cash: Account = { code: '1010', name: 'Cash', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true };
    const datedEntries: JournalEntry[] = [{
      id: 'dated', reference: 'JE-0100', date: '2026-01-01', description: 'Collections', project: 'General',
      lines: [
        { accountCode: '1010', debit: 200, credit: 0, date: '2026-01-20' },
        { accountCode: '1010', debit: 100, credit: 0, date: '2026-01-10' },
        { accountCode: '1010', debit: 50, credit: 0 },
      ],
    }];
    const history = buildAccountTransactionHistory(cash, datedEntries);
    expect(history.map(line => line.date)).toEqual(['2026-01-01', '2026-01-10', '2026-01-20']);
    expect(history.map(line => line.runningBalance)).toEqual([50, 150, 350]);
  });

  it('keeps inventory history across years after the balance reaches zero', () => {
    const summary = buildInventorySummary(entries);
    expect(summary).toMatchObject({ totalAdded: 1000, totalReleased: 1000, costOfSales: 1000, balance: 0 });
    expect(summary.movements).toHaveLength(3);
    expect(summary.movements[summary.movements.length - 1]?.date).toBe('2031-01-01');
  });

  it('builds a balanced sale plus cost-of-sales entry and rejects excess inventory cost', () => {
    const lines = buildMerchandiseSaleLines(500, 300);
    expect(lines).toEqual([
      { accountCode: '1010', debit: 500, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 500 },
      { accountCode: '5240', debit: 300, credit: 0 },
      { accountCode: '1700', debit: 0, credit: 300 },
    ]);
    expect(lines.reduce((sum, line) => sum + line.debit, 0)).toBe(800);
    expect(lines.reduce((sum, line) => sum + line.credit, 0)).toBe(800);
    expect(merchandiseSaleCostError(301, 300)).toMatch(/cannot exceed/i);
    expect(merchandiseSaleCostError(300, 300)).toBeNull();
  });
});
