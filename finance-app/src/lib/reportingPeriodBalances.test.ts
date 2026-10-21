import { describe, expect, it } from 'vitest';
import { Account, JournalEntry } from '../types';
import { buildAccountPeriodHistory } from './transactionHistory';
import { carryForwardOpeningBalances, combineOpeningAndPeriodBalances, entriesThroughPeriodEnd, linesAfterPeriodEnd, periodEndingBalances, withCarriedFundBalance } from './reportingPeriodBalances';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '2010', name: 'Accounts Payable', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '3010', name: 'Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4010', name: 'Fees', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
];

const entry = (id: string, lines: JournalEntry['lines']): JournalEntry => ({
  id,
  date: '2021-09-01',
  reference: id,
  description: id,
  project: 'General Fund Operations',
  lines,
});

describe('reporting-period opening balances', () => {
  it('carries assets and liabilities into the next semester but not revenue', () => {
    const firstSemester = [entry('je-1', [
      { accountCode: '1010', debit: 1_000, credit: 0 },
      { accountCode: '2010', debit: 0, credit: 600 },
      { accountCode: '4010', debit: 0, credit: 400 },
    ])];

    expect(carryForwardOpeningBalances({}, firstSemester, accounts)).toEqual({
      '1010': 1_000,
      '2010': 600,
    });
  });

  it('uses the current opening balance when forwarding to the following school year', () => {
    const secondSemester = [entry('je-2', [
      { accountCode: '1010', debit: 0, credit: 250 },
      { accountCode: '2010', debit: 250, credit: 0 },
    ])];

    expect(carryForwardOpeningBalances({ '1010': 1_000, '2010': 600 }, secondSemester, accounts)).toEqual({
      '1010': 750,
      '2010': 350,
    });
  });

  it('adds opening balances to the active period ledger and trial-balance view', () => {
    expect(combineOpeningAndPeriodBalances({ '1010': 1_000 }, { '1010': -250, '4010': 250 }, accounts)).toMatchObject({
      '1010': 750,
      '4010': 250,
    });
  });

  it('carries Fund Balance too, including a surplus whose closing entry is not posted yet', () => {
    const unclosed = [entry('je-1', [
      { accountCode: '1010', debit: 1_000, credit: 0 },
      { accountCode: '2010', debit: 0, credit: 600 },
      { accountCode: '4010', debit: 0, credit: 400 },
    ])];
    const opening = carryForwardOpeningBalances({}, unclosed, accounts);
    expect(opening).toEqual({ '1010': 1_000, '2010': 600 });
    // Opening Fund Balance is what makes the opening Statement of Financial Position balance.
    expect(withCarriedFundBalance(opening, accounts)['3010']).toBe(400);
    expect(combineOpeningAndPeriodBalances(opening, {}, accounts)).toMatchObject({ '3010': 400, '4010': 0 });

    const closed = [...unclosed, entry('je-2', [
      { accountCode: '4010', debit: 400, credit: 0 },
      { accountCode: '3010', debit: 0, credit: 400 },
    ])];
    const closedOpening = carryForwardOpeningBalances({}, closed, accounts);
    expect(closedOpening).toEqual({ '1010': 1_000, '2010': 600, '3010': 400 });
    expect(withCarriedFundBalance(closedOpening, accounts)['3010']).toBe(400);
  });

  it('never carries revenue or expenses', () => {
    const opening = withCarriedFundBalance({ '1010': 500, '4010': 999 }, accounts);
    expect(combineOpeningAndPeriodBalances(opening, {}, accounts)['4010']).toBe(0);
  });
});

describe('period-end ties between ledger, trial balance and next opening', () => {
  const late = entry('je-late', [
    { accountCode: '1010', debit: 0, credit: 300, date: '2022-02-01' },
    { accountCode: '2010', debit: 300, credit: 0, date: '2021-10-01' },
  ]);
  const base = entry('je-base', [{ accountCode: '1010', debit: 1_000, credit: 0 }, { accountCode: '2010', debit: 0, credit: 1_000 }]);

  it('leaves lines dated after the period end out of the ending balances and flags them', () => {
    const clipped = entriesThroughPeriodEnd([base, late], '2021-12-31');
    expect(clipped[1].lines).toHaveLength(1);
    expect(linesAfterPeriodEnd([base, late], '2021-12-31')).toEqual([{ reference: 'je-late', accountCode: '1010', date: '2022-02-01', amount: 300 }]);
  });

  it('gives the next semester the same ending balance the ledger shows', () => {
    const ending = combineOpeningAndPeriodBalances({}, carryForwardOpeningBalances({}, entriesThroughPeriodEnd([base, late], '2021-12-31'), accounts), accounts);
    expect(ending['1010']).toBe(1_000);
  });
});

describe('ending balances copy from ledger to trial balance to next semester', () => {
  const books = [
    entry('je-1', [{ accountCode: '1010', debit: 1_000, credit: 0 }, { accountCode: '2010', debit: 0, credit: 600 }, { accountCode: '4010', debit: 0, credit: 400 }]),
    entry('je-late', [{ accountCode: '1010', debit: 0, credit: 300, date: '2022-03-01' }, { accountCode: '2010', debit: 300, credit: 0, date: '2022-03-01' }]),
    { ...entry('closing', [{ accountCode: '4010', debit: 400, credit: 0 }, { accountCode: '3010', debit: 0, credit: 400 }]), date: '2021-12-31' },
  ];
  const opening = { '1010': 50, '3010': 50 };

  it('shows the same ending balance for every account in the ledger and the period balances', () => {
    const ending = periodEndingBalances(opening, books, accounts, '2021-12-31');
    accounts.forEach(account => {
      const history = buildAccountPeriodHistory(account, books, '2021-08-01', '2021-12-31');
      const hasOpening = account.type !== 'Revenue' && account.type !== 'Expenses';
      const ledgerEnding = (history.lines[history.lines.length - 1]?.runningBalance ?? history.beginningBalance) + (hasOpening ? (opening[account.code as keyof typeof opening] || 0) : 0);
      expect(ending[account.code]).toBe(ledgerEnding);
    });
  });

  it('opens the next semester with exactly those ending balances', () => {
    const ending = periodEndingBalances(opening, books, accounts, '2021-12-31');
    const next = carryForwardOpeningBalances(opening, entriesThroughPeriodEnd(books, '2021-12-31'), accounts);
    expect(next).toEqual({ '1010': ending['1010'], '2010': ending['2010'], '3010': ending['3010'] });
    expect(ending['1010']).toBe(1_050);
  });
});
