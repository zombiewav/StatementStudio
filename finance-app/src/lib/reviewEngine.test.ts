import { describe, it, expect } from 'vitest';
import {
  computePendingObligations,
  isJournalEntryEditLocked,
  computeAdvanceSettlement,
  buildAdvanceSettlementLines,
  buildSimpleSettlementLines,
  buildPrepaidExpenseSettlementLines,
  computeTransactionReviewStates,
  buildRestrictionReleaseLines,
  AdvanceSettlementStatus,
} from './reviewEngine';
import { Account, ClosingRecord, JournalEntry } from '../types';
import { counterpartyBalance } from './counterpartyBalances';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1200', name: 'Accounts Receivable', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1320', name: 'Due from Officers', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1250', name: 'Advances to Officers', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1260', name: 'Prepaid Expenses', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1285', name: 'Supplies and Materials', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '5290', name: 'Supplies and Materials Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
  { code: '2010', name: 'Due to Supplier', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '2020', name: 'Accounts Payable - Merchandise', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
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

describe('isJournalEntryEditLocked', () => {
  const closing: ClosingRecord = { id: 'close', fiscalYear: '2026', closingDate: '2026-05-31', netIncome: 0, journalEntryId: 'closing-je', closedAt: '2026-05-31', completed: true };
  it('locks closed dates, including the boundary, but allows the next open period', () => {
    expect(isJournalEntryEditLocked(baseEntry({ date: '2026-05-31' }), [closing])).toBe(true);
    expect(isJournalEntryEditLocked(baseEntry({ date: '2026-06-01' }), [closing])).toBe(false);
    expect(isJournalEntryEditLocked(baseEntry({}), [{ ...closing, completed: false }])).toBe(false);
    expect(isJournalEntryEditLocked(baseEntry({}), [{ ...closing, completed: undefined }])).toBe(true);
  });
  it('protects closing-stage entries even before closing is completed', () => {
    expect(isJournalEntryEditLocked(baseEntry({ id: 'revenue-close' }), [{ ...closing, completed: false, revenueClosingEntryId: 'revenue-close' }])).toBe(true);
  });
  it('retains finalized, reversed, and carried-forward protections', () => {
    for (const patch of [
      { reversedByEntryId: 'reversal' }, { reversalOfEntryId: 'original' },
      { transactionDetails: { eventRelated: false, receiptAttachmentIds: [], reviewFinalized: true } },
      { transactionDetails: { eventRelated: false, receiptAttachmentIds: [], carriedForward: true } },
    ]) expect(isJournalEntryEditLocked(baseEntry(patch), [])).toBe(true);
    expect(isJournalEntryEditLocked(baseEntry({}), [])).toBe(false);
  });
});

describe('Review scope: only Prepaid Expenses and Other Assets hold a transaction open', () => {
  it('never marks Due to Officers incomplete, even before the officer is reimbursed', () => {
    const expense = baseEntry({
      transactionType: 'Outright Expense Payment',
      lines: [
        { accountCode: '5020', debit: 500, credit: 0 },
        { accountCode: '2050', debit: 0, credit: 500 },
      ],
    });
    expect(computePendingObligations([expense], accounts)).toEqual([]);
    expect(computeTransactionReviewStates([expense], accounts)[0].status).toBe('complete');
  });

  it('keeps an officer-paid expense complete after a reimbursement is recorded as its own transaction', () => {
    const expense = baseEntry({
      transactionType: 'Outright Expense Payment',
      transactionDetails: { counterpartyName: 'TEST officer', eventRelated: false, receiptAttachmentIds: [] },
      lines: [
        { accountCode: '5020', debit: 500, credit: 0 },
        { accountCode: '2050', debit: 0, credit: 500 },
      ],
    });
    const reimbursement = baseEntry({
      id: 'reimbursement', transactionType: 'Reimbursement to Officers',
      transactionDetails: { counterpartyName: 'TEST officer', eventRelated: false, receiptAttachmentIds: [] },
      lines: [
        { accountCode: '2050', debit: 200, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 200 },
      ],
    });
    const states = computeTransactionReviewStates([expense, reimbursement], accounts);
    expect(states.every(state => state.status === 'complete')).toBe(true);
    expect(counterpartyBalance([expense, reimbursement], '2050', 'Credit', 'TEST officer')).toBe(300);
  });

  it('keeps a standalone officer advance complete without removing its available balance', () => {
    const entry = baseEntry({
      transactionType: 'Advances to Officers',
      transactionDetails: { counterpartyName: 'TEST officer', eventRelated: false, receiptAttachmentIds: [] },
      lines: [
        { accountCode: '1250', debit: 500, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 500 },
      ],
    });
    expect(computePendingObligations([entry], accounts)).toEqual([]);
    expect(computeTransactionReviewStates([entry], accounts)[0].status).toBe('complete');
    expect(counterpartyBalance([entry], '1250', 'Debit', 'TEST officer')).toBe(500);
  });

  it.each([
    ['unpaid merchandise payable', '2020', 'credit'],
    ['unpaid expense payable', '2010', 'credit'],
    ['accounts receivable', '1200', 'debit'],
    ['due from officers', '1320', 'debit'],
  ] as const)('does not hold a transaction open for an %s', (_label, accountCode, side) => {
    const entry = baseEntry({
      lines: side === 'credit'
        ? [{ accountCode: '5020', debit: 1000, credit: 0 }, { accountCode, debit: 0, credit: 1000 }]
        : [{ accountCode, debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }],
    });
    expect(computePendingObligations([entry], accounts)).toEqual([]);
    expect(computeTransactionReviewStates([entry], accounts)[0].status).toBe('complete');
  });
});

describe('computePendingObligations', () => {
  const purchase = (overrides: Partial<JournalEntry> = {}) => baseEntry({
    id: 'je-1',
    lines: [
      { accountCode: '1285', debit: 1000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 1000 },
    ],
    ...overrides,
  });
  const consumption = (id: string, amount: number, overrides: Partial<JournalEntry> = {}) => baseEntry({
    id,
    settlesEntryId: 'je-1',
    lines: [
      { accountCode: '5290', debit: amount, credit: 0 },
      { accountCode: '1285', debit: 0, credit: amount },
    ],
    ...overrides,
  });

  it('finds a prepaid purchase with no consumption as fully open', () => {
    const pending = computePendingObligations([purchase()], accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ accountCode: '1285', remainingAmount: 1000 });
  });

  it('nets a consumption entry against its purchase via settlesEntryId', () => {
    const pending = computePendingObligations([purchase(), consumption('je-2', 400)], accounts);
    expect(pending).toHaveLength(1);
    expect(pending[0].settledAmount).toBe(400);
    expect(pending[0].remainingAmount).toBe(600);
  });

  it('drops an obligation once fully consumed and completes the purchase on the last consumption date', () => {
    const entries = [purchase({ date: '2026-01-01' }), consumption('je-2', 1000, { date: '2026-01-03' })];
    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
    const state = computeTransactionReviewStates(entries, accounts)[0];
    expect(state.status).toBe('complete');
    expect(state.completedOn).toBe('2026-01-03');
  });

  it('restores an obligation when its consumption is reversed', () => {
    const entries = [
      purchase(),
      consumption('je-2', 1000, { reversedByEntryId: 'je-3' }),
      baseEntry({
        id: 'je-3',
        settlesEntryId: 'je-1',
        reversalOfEntryId: 'je-2',
        lines: [
          { accountCode: '5290', debit: 0, credit: 1000 },
          { accountCode: '1285', debit: 1000, credit: 0 },
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
      purchase({ reversedByEntryId: 'je-2' }),
      baseEntry({
        id: 'je-2',
        reversalOfEntryId: 'je-1',
        lines: [
          { accountCode: '1285', debit: 0, credit: 1000 },
          { accountCode: '1010', debit: 1000, credit: 0 },
        ],
      }),
    ];
    expect(computePendingObligations(entries, accounts)).toHaveLength(0);
  });

  it('never treats a consumption entry itself as a new obligation', () => {
    expect(computePendingObligations([consumption('je-2', 500)], accounts)).toHaveLength(0);
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

describe('transaction review status', () => {
  it('keeps completed transactions in Review; an unused prepaid balance is answered in Other Adjustments, not here', () => {
    const entries = [
      baseEntry({ id: 'je-1', transactionType: 'Purchase of Prepaid Assets', lines: [
        { accountCode: '1285', debit: 1000, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 1000 },
      ] }),
      baseEntry({ id: 'je-2', reference: 'JE-0002', transactionType: 'Supplies', lines: [
        { accountCode: '5160', debit: 200, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 200 },
      ] }),
    ];
    const states = computeTransactionReviewStates(entries, accounts);
    expect(states.find(state => state.entry.id === 'je-1')).toMatchObject({ status: 'complete', missing: [] });
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

describe('what still blocks Financial Statements and closing', () => {
  const acct = (code: string, name: string, type: 'Assets' | 'Revenue', normalBalance: 'Debit' | 'Credit') => ({ code, name, type, normalBalance, description: '', isActive: true });
  const accts = [acct('1010', 'Cash on Hand', 'Assets', 'Debit'), acct('1285', 'Supplies and Materials', 'Assets', 'Debit'), acct('4030', 'Contributions', 'Revenue', 'Credit'), acct('4035', 'Temporarily Restricted Revenue', 'Revenue', 'Credit')];
  const entry = (id: string, lines: { accountCode: string; debit: number; credit: number }[]) => ({ id, reference: id, date: '2026-10-14', description: id, project: 'p', lines });

  it('does not hold an unused prepaid balance in Review or block statements (Other Adjustments asks about it)', () => {
    const states = computeTransactionReviewStates([entry('staples', [{ accountCode: '1285', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }])], accts);
    expect(states[0]).toMatchObject({ status: 'complete', blocksStatements: false, missing: [] });
  });

  it('still blocks statements for other open items, such as a donor restriction', () => {
    const states = computeTransactionReviewStates([entry('grant', [{ accountCode: '1010', debit: 500, credit: 0 }, { accountCode: '4035', debit: 0, credit: 500 }])], accts);
    expect(states[0]).toMatchObject({ status: 'incomplete', blocksStatements: true });
  });

  it('a complete transaction does not block', () => {
    const states = computeTransactionReviewStates([entry('gift', [{ accountCode: '1010', debit: 500, credit: 0 }, { accountCode: '4030', debit: 0, credit: 500 }])], accts);
    expect(states[0]).toMatchObject({ status: 'complete', blocksStatements: false });
  });
});
