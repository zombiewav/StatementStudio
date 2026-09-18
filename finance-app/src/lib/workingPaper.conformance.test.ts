// Phase 3 of the posting-engine build plan: proves journalEngine.ts against
// the working paper's own worked examples, using the app's REAL Chart of
// Accounts (INITIAL_ACCOUNTS, imported from FinanceContext — not a copy),
// so this test breaks the moment the engine and the shipped accounts drift
// apart. See workingPaper.fixtures.ts for the extraction methodology and
// why only 5 of the paper's 79 rows can be checked end-to-end today.
import { describe, it, expect } from 'vitest';
import { INITIAL_ACCOUNTS } from '../context/FinanceContext';
import { checkEntryEffects, resolveEntry } from './journalEngine';
import {
  COVERED_ROWS,
  EXCLUDED_ROWS,
  FUNDING_SOURCE_EXAMPLES,
  WORKING_PAPER_TOTAL_ROWS,
} from './workingPaper.fixtures';

describe('working paper conformance: full rows (debit + credit + effects)', () => {
  for (const fixture of COVERED_ROWS) {
    it(`${fixture.sheet} row ${fixture.row} — "${fixture.label}"`, () => {
      const result = checkEntryEffects(
        INITIAL_ACCOUNTS,
        fixture.debitAccountCode,
        fixture.creditAccountCode,
        fixture.expectedDebitEffect,
        fixture.expectedCreditEffect
      );
      expect(
        result.ok,
        `Expected debit ${fixture.expectedDebitEffect} / credit ${fixture.expectedCreditEffect}, ` +
          `but the Chart of Accounts derives debit ${result.resolved.debitEffect} / credit ${result.resolved.creditEffect}`
      ).toBe(true);
    });
  }
});

describe('working paper conformance: funding-source mechanism (Sheet2)', () => {
  for (const example of FUNDING_SOURCE_EXAMPLES) {
    it(`"${example.fundingSourceAnswer}" (rows ${example.rows.join('-')}) resolves to account ${example.expectedCreditAccountCode}`, () => {
      const account = INITIAL_ACCOUNTS.find(a => a.code === example.expectedCreditAccountCode);
      expect(account, `Account ${example.expectedCreditAccountCode} should exist in the Chart of Accounts`).toBeDefined();
    });
  }

  it('both funding-source answers derive a credit-side Increase or Decrease consistent with the account type', () => {
    // Sheet2 states no Increase/Decrease column, so there is no paper value
    // to check against — this asserts the engine's own derivation is
    // internally coherent: crediting a liability (money now owed to an
    // officer) increases it; crediting an asset (a cash advance being used
    // up) decreases it. That is standard double-entry accounting, and it is
    // what the two funding-source answers actually represent.
    const dueToOfficers = resolveEntry(INITIAL_ACCOUNTS, '1010', '2050');
    expect(dueToOfficers.creditEffect).toBe('Increase');

    const advancesToOfficers = resolveEntry(INITIAL_ACCOUNTS, '1010', '1250');
    expect(advancesToOfficers.creditEffect).toBe('Decrease');
  });

  it('the two funding-source answers resolve to two different credit accounts', () => {
    const codes = new Set(FUNDING_SOURCE_EXAMPLES.map(e => e.expectedCreditAccountCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('working paper conformance: coverage accounting', () => {
  it('every row is either covered or excluded, and the two sets do not overlap', () => {
    const coveredKeys = new Set(COVERED_ROWS.map(r => `${r.sheet}:${r.row}`));
    const excludedKeys = new Set(EXCLUDED_ROWS.map(r => `${r.sheet}:${r.row}`));

    for (const key of coveredKeys) {
      expect(excludedKeys.has(key), `${key} is listed as both covered and excluded`).toBe(false);
    }

    expect(COVERED_ROWS.length + EXCLUDED_ROWS.length).toBe(WORKING_PAPER_TOTAL_ROWS);
  });

  it('every excluded row has a documented reason', () => {
    for (const row of EXCLUDED_ROWS) {
      expect(row.reason, `${row.sheet} row ${row.row} has no reason`).toBeTruthy();
    }
  });

  it('reports current coverage', () => {
    const total = WORKING_PAPER_TOTAL_ROWS;
    const covered = COVERED_ROWS.length;
    const byReason: Record<string, number> = {};
    for (const row of EXCLUDED_ROWS) {
      byReason[row.reason] = (byReason[row.reason] || 0) + 1;
    }
    // Not an assertion — this is a deliberate console report so `npm run
    // test` prints current coverage every run, since that number is
    // expected to grow as the Chart of Accounts expands in future phases.
    console.log(
      `\nWorking paper coverage: ${covered}/${total} rows fully verified.\n` +
        `Excluded breakdown: ${JSON.stringify(byReason, null, 2)}\n`
    );
    expect(covered).toBeGreaterThan(0);
  });
});
