import { describe, it, expect } from 'vitest';
import { computeActivitiesExpenseBreakdown } from './activitiesBreakdown';
import { Account, JournalEntry } from '../types';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '5050', name: 'Travel & Transportation', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
  { code: '5040', name: 'Office Supplies', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
  { code: '4010', name: 'Organization Income', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
];

function entry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'je-1',
    reference: 'JE-0001',
    date: '2026-01-01',
    description: '',
    project: '',
    lines: [],
    ...overrides,
  };
}

describe('computeActivitiesExpenseBreakdown', () => {
  it('puts an entry with no eventName under General & Administrative', () => {
    const result = computeActivitiesExpenseBreakdown(
      [entry({ lines: [{ accountCode: '5040', debit: 200, credit: 0 }, { accountCode: '1010', debit: 0, credit: 200 }] })],
      accounts
    );
    expect(result.generalAdminByAccount['5040']).toBe(200);
    expect(result.generalAdminTotal).toBe(200);
    expect(result.eventNames).toEqual([]);
  });

  it('groups an entry with an eventName under Event-Related, by that event name', () => {
    const result = computeActivitiesExpenseBreakdown(
      [entry({
        eventName: 'Freshmen Welcome Night 2026',
        lines: [{ accountCode: '5050', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }],
      })],
      accounts
    );
    expect(result.generalAdminTotal).toBe(0);
    expect(result.eventNames).toEqual(['Freshmen Welcome Night 2026']);
    expect(result.eventGroups['Freshmen Welcome Night 2026']['5050']).toBe(500);
    expect(result.eventRelatedTotal).toBe(500);
  });

  it('ignores non-Expenses accounts entirely (e.g. the cash side of the entry)', () => {
    const result = computeActivitiesExpenseBreakdown(
      [entry({ lines: [{ accountCode: '4010', debit: 0, credit: 1000 }, { accountCode: '1010', debit: 1000, credit: 0 }] })],
      accounts
    );
    expect(result.generalAdminTotal).toBe(0);
    expect(result.eventRelatedTotal).toBe(0);
  });

  it('accumulates multiple entries for the same event into one group', () => {
    const result = computeActivitiesExpenseBreakdown(
      [
        entry({ id: 'je-1', eventName: 'Sportsfest 2026', lines: [{ accountCode: '5050', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }] }),
        entry({ id: 'je-2', eventName: 'Sportsfest 2026', lines: [{ accountCode: '5040', debit: 150, credit: 0 }, { accountCode: '1010', debit: 0, credit: 150 }] }),
      ],
      accounts
    );
    expect(result.eventGroups['Sportsfest 2026']['5050']).toBe(300);
    expect(result.eventGroups['Sportsfest 2026']['5040']).toBe(150);
    expect(result.eventRelatedTotal).toBe(450);
  });

  it('keeps generalAdminTotal + eventRelatedTotal equal to the sum of all Expenses lines', () => {
    const entries = [
      entry({ id: 'je-1', lines: [{ accountCode: '5040', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }] }),
      entry({ id: 'je-2', eventName: 'Orientation Day', lines: [{ accountCode: '5050', debit: 250, credit: 0 }, { accountCode: '1010', debit: 0, credit: 250 }] }),
    ];
    const result = computeActivitiesExpenseBreakdown(entries, accounts);
    expect(result.generalAdminTotal + result.eventRelatedTotal).toBe(350);
  });

  it('returns an empty breakdown for no entries', () => {
    const result = computeActivitiesExpenseBreakdown([], accounts);
    expect(result.generalAdminTotal).toBe(0);
    expect(result.eventRelatedTotal).toBe(0);
    expect(result.eventNames).toEqual([]);
  });
});
