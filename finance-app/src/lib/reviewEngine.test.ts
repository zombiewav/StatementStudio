import { describe, it, expect } from 'vitest';
import {
  computePendingObligations,
  computeAdvanceSettlement,
  buildAdvanceSettlementLines,
  buildSimpleSettlementLines,
  buildPrepaidExpenseSettlementLines,
  computeTransactionReviewStates,
  buildRestrictionReleaseLines,
  buildDonatedInventorySettlementLines,
  AdvanceSettlementStatus,
} from './reviewEngine';
import { Account, JournalEntry } from '../types';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1200', name: 'Accounts Receivable', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1320', name: 'Due from Officers', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1250', name: 'Advances to Officers', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1260', name: 'Prepaid Expenses', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1710', name: 'Donated Food Supplies', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1720', name: 'Donated Event Supplies', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '2010', name: 'Due to Supplier', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '2020', name: 'Merchandise Payable', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '2050', name: 'Due to Officers', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '5020', name: 'Rent Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
  { code: '5080', name: 'Meals & Refreshments', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
  { code: '5160', name: 'Supplies Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
  { code: '5170', name: 'Loss from Spoilage', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
];

const baseEntry = (overrides: Partial<JournalEntry>): JournalEntry => ({
  id: 'je-1',
  reference: 'JE-0001',
  date: '2026-01-01',
  description: 'Test entry',
  project: 'General Fund Operations',
  lines: [],
  ...overrides,
});

describe('computePendingObligations', () => {
  it('finds an obligation-creating entry with no settlement as fully open', () => {
    const entries = [
      baseEntry({
        lines: [
          { accountCode: '5020', debit: 1000, credit: 0 },
          { accountCode: '2050', debit: 0, credit: 1000 },
        ],
      }),
    ];
    const pending = computePendingObligations(entries, accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].remainingAmount).toBe(1000);
    expect(pending[0].accountCode).toBe('2050');
  });

  it('nets a settlement entry against its original via settlesEntryId', () => {
    const entries = [
      baseEntry({
        id: 'je-1',
        lines: [
          { accountCode: '5020', debit: 1000, credit: 0 },
          { accountCode: '2050', debit: 0, credit: 1000 },
        ],
      }),
      baseEntry({
        id: 'je-2',
        settlesEntryId: 'je-1',
        lines: [
          { accountCode: '2050', debit: 500, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 500 },
        ],
      }),
    ];
    const pending = computePendingObligations(entries, accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].settledAmount).toBe(500);
    expect(pending[0].remainingAmount).toBe(500);
  });

  it('drops an obligation once fully settled', () => {
    const entries = [
      baseEntry({
        id: 'je-1',
        lines: [
          { accountCode: '5020', debit: 1000, credit: 0 },
          { accountCode: '2010', debit: 0, credit: 1000 },
        ],
      }),
      baseEntry({
        id: 'je-2',
        settlesEntryId: 'je-1',
        lines: [
          { accountCode: '2010', debit: 1000, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 1000 },
        ],
      }),
    ];
    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
  });

  it('tracks an unpaid merchandise acquisition until it is settled', () => {
    const entries = [
      baseEntry({
        lines: [
          { accountCode: '1700', debit: 1000, credit: 0 },
          { accountCode: '2020', debit: 0, credit: 1000 },
        ],
      }),
    ];
    const pending = computePendingObligations(entries, accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ accountCode: '2020', remainingAmount: 1000 });
  });

  it('collects a debit-normal receivable with debit Cash and credit Receivable', () => {
    expect(buildSimpleSettlementLines('1200', '1010', 400, 'Debit')).toEqual([
      { accountCode: '1010', debit: 400, credit: 0 },
      { accountCode: '1200', debit: 0, credit: 400 },
    ]);
  });

  it('restores an obligation when its settlement is reversed', () => {
    const entries = [
      baseEntry({
        id: 'je-1',
        lines: [
          { accountCode: '5020', debit: 1000, credit: 0 },
          { accountCode: '2010', debit: 0, credit: 1000 },
        ],
      }),
      baseEntry({
        id: 'je-2',
        settlesEntryId: 'je-1',
        reversedByEntryId: 'je-3',
        lines: [
          { accountCode: '2010', debit: 1000, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 1000 },
        ],
      }),
      baseEntry({
        id: 'je-3',
        settlesEntryId: 'je-1',
        reversalOfEntryId: 'je-2',
        lines: [
          { accountCode: '2010', debit: 0, credit: 1000 },
          { accountCode: '1010', debit: 1000, credit: 0 },
        ],
      }),
    ];

    const pending = computePendingObligations(entries, accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].settledAmount).toBe(0);
    expect(pending[0].remainingAmount).toBe(1000);
  });

  it('does not keep an obligation open after its creating entry is reversed', () => {
    const entries = [
      baseEntry({
        id: 'je-1',
        reversedByEntryId: 'je-2',
        lines: [
          { accountCode: '5020', debit: 1000, credit: 0 },
          { accountCode: '2050', debit: 0, credit: 1000 },
        ],
      }),
      baseEntry({
        id: 'je-2',
        reversalOfEntryId: 'je-1',
        lines: [
          { accountCode: '5020', debit: 0, credit: 1000 },
          { accountCode: '2050', debit: 1000, credit: 0 },
        ],
      }),
    ];

    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
  });

  it('detects an Advances to Officers obligation on its DEBIT side (it is a debit-normal asset, not a liability)', () => {
    const entries = [
      baseEntry({
        id: 'je-1',
        lines: [
          { accountCode: '1250', debit: 1000, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 1000 },
        ],
      }),
    ];
    const pending = computePendingObligations(entries, accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].accountCode).toBe('1250');
    expect(pending[0].remainingAmount).toBe(1000);
  });

  it('nets an Advances to Officers settlement, which clears it via a CREDIT', () => {
    const entries = [
      baseEntry({
        id: 'je-1',
        lines: [
          { accountCode: '1250', debit: 1000, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 1000 },
        ],
      }),
      baseEntry({
        id: 'je-2',
        settlesEntryId: 'je-1',
        lines: [
          { accountCode: '5020', debit: 1000, credit: 0 },
          { accountCode: '1250', debit: 0, credit: 1000 },
        ],
      }),
    ];
    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
  });

  it('never treats a settlement entry itself as a new obligation', () => {
    // A settlement entry's own lines debit the obligation account (to clear
    // it) and credit cash — it has no line that CREDITS an obligation
    // account, so it can never be mistaken for a new one regardless of
    // settlesEntryId.
    const entries = [
      baseEntry({
        id: 'je-2',
        settlesEntryId: 'je-1',
        lines: [
          { accountCode: '2050', debit: 500, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 500 },
        ],
      }),
    ];
    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
  });

  it('keeps a supplier balance created while liquidating an advance in Review', () => {
    const entries = [
      baseEntry({ id: 'je-1', lines: [
        { accountCode: '1250', debit: 1000, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 1000 },
      ] }),
      baseEntry({ id: 'je-2', settlesEntryId: 'je-1', lines: [
        { accountCode: '5020', debit: 1000, credit: 0 },
        { accountCode: '1010', debit: 1000, credit: 0 },
        { accountCode: '1250', debit: 0, credit: 1000 },
        { accountCode: '2010', debit: 0, credit: 1000 },
      ] }),
    ];
    const pending = computePendingObligations(entries, accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].accountCode).toBe('2010');
    expect(pending[0].entryId).toBe('je-2');
    expect(pending[0].reviewEntryId).toBe('je-1');
    expect(computeTransactionReviewStates(entries, accounts)[0].status).toBe('incomplete');
  });

  it('completes the original advance only after its follow-up supplier balance is paid', () => {
    const entries = [
      baseEntry({ id: 'je-1', date: '2026-01-01', lines: [
        { accountCode: '1250', debit: 1000, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 1000 },
      ] }),
      baseEntry({ id: 'je-2', date: '2026-01-02', settlesEntryId: 'je-1', lines: [
        { accountCode: '5020', debit: 1000, credit: 0 },
        { accountCode: '1010', debit: 1000, credit: 0 },
        { accountCode: '1250', debit: 0, credit: 1000 },
        { accountCode: '2010', debit: 0, credit: 1000 },
      ] }),
      baseEntry({ id: 'je-3', date: '2026-01-03', settlesEntryId: 'je-2', lines: [
        { accountCode: '2010', debit: 1000, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 1000 },
      ] }),
    ];
    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
    const state = computeTransactionReviewStates(entries, accounts)[0];
    expect(state.status).toBe('complete');
    expect(state.completedOn).toBe('2026-01-03');
  });
});

describe('computeAdvanceSettlement — balances against the working paper\'s worked example (advance=1000, partial=500)', () => {
  // Deliberately NOT advance/2 for the two "partly" cases — a degenerate
  // 500-of-1000 partial once masked a real imbalance (see the dedicated
  // regression test below) because it made two different quantities
  // numerically coincide.
  const cases: [AdvanceSettlementStatus, number][] = [
    ['used-paid-wholly', 1000],
    ['used-not-yet-paid', 1000],
    ['not-used', 1000],
    ['used-partly-paid', 600],
    ['not-used-partly-paid', 300],
  ];

  it.each(cases)('%s balances debits and credits', (status, partial) => {
    const result = computeAdvanceSettlement(status, 1000, partial);
    const totalDebits = result.expenseAmount + result.cashAmount;
    const totalCredits = 1000 /* advance always fully cleared */ + result.dueToSupplierAmount;
    expect(totalDebits).toBe(totalCredits);
  });

  it('matches the paper\'s row 43 figures exactly', () => {
    expect(computeAdvanceSettlement('used-paid-wholly', 1000, 0)).toEqual({
      expenseAmount: 1000, cashAmount: 0, dueToSupplierAmount: 0,
    });
  });

  it('matches the paper\'s row 44 figures exactly', () => {
    expect(computeAdvanceSettlement('used-not-yet-paid', 1000, 0)).toEqual({
      expenseAmount: 1000, cashAmount: 1000, dueToSupplierAmount: 1000,
    });
  });

  it('matches the paper\'s row 46 figures at its own (degenerate, partial=advance/2) example', () => {
    expect(computeAdvanceSettlement('used-partly-paid', 1000, 500)).toEqual({
      expenseAmount: 1000, cashAmount: 500, dueToSupplierAmount: 500,
    });
  });

  it('used-partly-paid balances for a NON-degenerate partial amount (regression: an earlier version only balanced when partial === advance/2)', () => {
    const result = computeAdvanceSettlement('used-partly-paid', 1000, 600);
    expect(result).toEqual({ expenseAmount: 1000, cashAmount: 400, dueToSupplierAmount: 400 });
    expect(result.expenseAmount + result.cashAmount).toBe(1000 + result.dueToSupplierAmount);
  });
});

describe('buildAdvanceSettlementLines', () => {
  it('produces a balanced 4-line entry for the used-not-yet-paid case', () => {
    const result = computeAdvanceSettlement('used-not-yet-paid', 1000, 0);
    const lines = buildAdvanceSettlementLines('5020', '1250', '1010', '2010', 1000, result);
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    // Dr Expense, Dr Cash, Cr Advances to Officers, Cr Due to Supplier
    expect(lines).toHaveLength(4);
  });

  it('omits the expense line entirely for not-used (no expenseAccountCode needed)', () => {
    const result = computeAdvanceSettlement('not-used', 1000, 0);
    const lines = buildAdvanceSettlementLines(null, '1250', '1010', '2010', 1000, result);
    expect(lines.find(l => l.accountCode === '1250')).toBeTruthy();
    expect(lines.find(l => l.accountCode === '1010')?.debit).toBe(1000);
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });
});

describe('buildSimpleSettlementLines', () => {
  it('returns nothing when the answer is "none paid"', () => {
    expect(buildSimpleSettlementLines('2050', '1010', 0)).toEqual([]);
  });

  it('builds a balanced Dr obligation / Cr cash pair for a partial payment', () => {
    const lines = buildSimpleSettlementLines('2050', '1010', 500);
    expect(lines).toEqual([
      { accountCode: '2050', debit: 500, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 500 },
    ]);
  });
});

describe('Prepaid Expenses (1260) as an obligation account', () => {
  it('detects a Prepaid Expenses obligation on its DEBIT side, same as Advances to Officers', () => {
    const entries: JournalEntry[] = [
      baseEntry({
        id: 'je-1',
        lines: [
          { accountCode: '5160', debit: 400, credit: 0 },
          { accountCode: '1260', debit: 600, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 1000 },
        ],
      }),
    ];
    const pending = computePendingObligations(entries, accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].accountCode).toBe('1260');
    expect(pending[0].remainingAmount).toBe(600);
  });

  it('nets a Prepaid Expenses settlement, which clears it via a CREDIT', () => {
    const entries: JournalEntry[] = [
      baseEntry({
        id: 'je-1',
        lines: [
          { accountCode: '1260', debit: 600, credit: 0 },
          { accountCode: '1010', debit: 0, credit: 600 },
        ],
      }),
      baseEntry({
        id: 'je-2',
        settlesEntryId: 'je-1',
        lines: [
          { accountCode: '5160', debit: 600, credit: 0 },
          { accountCode: '1260', debit: 0, credit: 600 },
        ],
      }),
    ];
    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
  });
});

describe('buildPrepaidExpenseSettlementLines', () => {
  it('returns nothing when nothing is used yet', () => {
    expect(buildPrepaidExpenseSettlementLines('5160', 0)).toEqual([]);
  });

  it('builds a balanced Dr expense / Cr Prepaid Expenses pair', () => {
    const lines = buildPrepaidExpenseSettlementLines('5160', 250);
    expect(lines).toEqual([
      { accountCode: '5160', debit: 250, credit: 0 },
      { accountCode: '1260', debit: 0, credit: 250 },
    ]);
  });
});

describe('donated food and supplies follow-up', () => {
  it('keeps unused donated food open and supports a combined partial usage/spoilage update', () => {
    const original = baseEntry({ id: 'je-1', lines: [
      { accountCode: '1710', debit: 1000, credit: 0 },
      { accountCode: '4030', debit: 0, credit: 1000 },
    ] });
    const partialLines = buildDonatedInventorySettlementLines('1710', '5080', 300, 100);
    expect(partialLines).toEqual([
      { accountCode: '5080', debit: 300, credit: 0 },
      { accountCode: '5170', debit: 100, credit: 0 },
      { accountCode: '1710', debit: 0, credit: 400 },
    ]);
    expect(partialLines.reduce((sum, line) => sum + line.debit, 0)).toBe(
      partialLines.reduce((sum, line) => sum + line.credit, 0)
    );

    const partial = baseEntry({ id: 'je-2', settlesEntryId: 'je-1', lines: partialLines });
    const pending = computePendingObligations([original, partial], accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].accountCode).toBe('1710');
    expect(pending[0].remainingAmount).toBe(600);

    const final = baseEntry({
      id: 'je-3',
      settlesEntryId: 'je-1',
      lines: buildDonatedInventorySettlementLines('1710', '5080', 600, 0),
    });
    expect(computePendingObligations([original, partial, final], accounts)).toHaveLength(0);
  });

  it('requires both inventory resolution and donor-restriction release before completion', () => {
    const restrictedAccount: Account = { code: '4035', name: 'Contributions Revenue - Temporarily Restricted', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true };
    const unrestrictedAccount: Account = { code: '4030', name: 'Contributions Revenue - Unrestricted', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true };
    const allAccounts = [...accounts, restrictedAccount, unrestrictedAccount];
    const original = baseEntry({ id: 'je-1', lines: [
      { accountCode: '1720', debit: 800, credit: 0 },
      { accountCode: '4035', debit: 0, credit: 800 },
    ] });
    const inventorySettlement = baseEntry({
      id: 'je-2',
      settlesEntryId: 'je-1',
      lines: buildDonatedInventorySettlementLines('1720', '5160', 700, 100),
    });
    const release = baseEntry({ id: 'je-3', settlesEntryId: 'je-1', lines: buildRestrictionReleaseLines(800) });

    const initial = computeTransactionReviewStates([original], allAccounts)[0];
    expect(initial.status).toBe('incomplete');
    expect(initial.missing).toHaveLength(2);
    expect(computeTransactionReviewStates([original, inventorySettlement], allAccounts)[0].status).toBe('incomplete');
    expect(computeTransactionReviewStates([original, release], allAccounts)[0].status).toBe('incomplete');
    expect(computeTransactionReviewStates([original, inventorySettlement, release], allAccounts)[0].status).toBe('complete');
  });
});

describe('transaction review status', () => {
  it('keeps completed transactions in Review and marks open obligations incomplete', () => {
    const entries = [
      baseEntry({ id: 'je-1', transactionType: 'Rent', lines: [
        { accountCode: '5020', debit: 1000, credit: 0 },
        { accountCode: '2010', debit: 0, credit: 1000 },
      ] }),
      baseEntry({ id: 'je-2', reference: 'JE-0002', transactionType: 'Supplies', lines: [
        { accountCode: '5160', debit: 200, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 200 },
      ] }),
    ];
    const states = computeTransactionReviewStates(entries, accounts);
    expect(states.find(state => state.entry.id === 'je-1')?.status).toBe('incomplete');
    expect(states.find(state => state.entry.id === 'je-2')?.status).toBe('complete');
  });

  it('marks temporarily restricted revenue complete after a linked release', () => {
    const restrictedAccount: Account = { code: '4035', name: 'Contributions Revenue - Temporarily Restricted', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true };
    const unrestrictedAccount: Account = { code: '4030', name: 'Contributions Revenue - Unrestricted', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true };
    const original = baseEntry({ id: 'je-1', transactionType: 'Sponsorship', lines: [
      { accountCode: '1010', debit: 500, credit: 0 },
      { accountCode: '4035', debit: 0, credit: 500 },
    ] });
    const release = baseEntry({ id: 'je-2', settlesEntryId: 'je-1', lines: buildRestrictionReleaseLines(500) });
    const states = computeTransactionReviewStates([original, release], [...accounts, restrictedAccount, unrestrictedAccount]);
    expect(states).toHaveLength(1);
    expect(states[0].status).toBe('complete');
    expect(states[0].restrictedRemaining).toBe(0);
  });

  it('restores a temporary restriction when its release is undone', () => {
    const restrictedAccount: Account = { code: '4035', name: 'Contributions Revenue - Temporarily Restricted', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true };
    const unrestrictedAccount: Account = { code: '4030', name: 'Contributions Revenue - Unrestricted', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true };
    const original = baseEntry({ id: 'je-1', lines: [
      { accountCode: '1010', debit: 500, credit: 0 },
      { accountCode: '4035', debit: 0, credit: 500 },
    ] });
    const release = baseEntry({ id: 'je-2', settlesEntryId: 'je-1', reversedByEntryId: 'je-3', lines: buildRestrictionReleaseLines(500) });
    const reversal = baseEntry({ id: 'je-3', settlesEntryId: 'je-1', reversalOfEntryId: 'je-2', lines: [
      { accountCode: '4035', debit: 0, credit: 500 },
      { accountCode: '4030', debit: 500, credit: 0 },
    ] });
    const state = computeTransactionReviewStates([original, release, reversal], [...accounts, restrictedAccount, unrestrictedAccount])[0];
    expect(state.status).toBe('incomplete');
    expect(state.restrictedRemaining).toBe(500);
  });
});
