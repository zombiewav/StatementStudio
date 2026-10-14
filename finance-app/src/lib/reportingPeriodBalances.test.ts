import { describe, expect, it } from 'vitest';
import { Account, JournalEntry } from '../types';
import { carryForwardOpeningBalances, combineOpeningAndPeriodBalances, withCarriedFundBalance } from './reportingPeriodBalances';

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
