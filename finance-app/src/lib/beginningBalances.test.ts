import { describe, expect, it } from 'vitest';
import { buildBeginningBalancePosting, shouldPromptBeginningBalances } from './beginningBalances';

const accounts = [
  { code: '1010', type: 'Assets' as const, isActive: true },
  { code: '1015', type: 'Assets' as const, isActive: true },
  { code: '1999', type: 'Assets' as const, isActive: false },
  { code: '2010', type: 'Liabilities' as const, isActive: true },
];

describe('buildBeginningBalancePosting', () => {
  it('debits each asset with an amount and credits Fund Balance for the total', () => {
    expect(buildBeginningBalancePosting(accounts, { '1010': '1000.5', '1015': '250' })).toEqual({
      total: 1250.5,
      lines: [
        { accountCode: '1010', debit: 1000.5, credit: 0 },
        { accountCode: '1015', debit: 250, credit: 0 },
        { accountCode: '3010', debit: 0, credit: 1250.5 },
      ],
    });
  });
  it('ignores blanks, zeros, inactive accounts and non-asset accounts', () => {
    expect(buildBeginningBalancePosting(accounts, { '1010': '', '1015': '0', '1999': '50', '2010': '70' })).toBeNull();
  });
});

describe('shouldPromptBeginningBalances', () => {
  const fresh = { workspaceStatus: 'ready', settings: {}, journalEntries: [], reportingPeriodWorkspaces: [] };
  it('shows on a new organization\'s first sign-in', () => expect(shouldPromptBeginningBalances(fresh)).toBe(true));
  it('waits until the workspace has loaded', () => expect(shouldPromptBeginningBalances({ ...fresh, workspaceStatus: 'loading' })).toBe(false));
  it('never shows again once answered', () => expect(shouldPromptBeginningBalances({ ...fresh, settings: { beginningBalancesPrompted: true } })).toBe(false));
  it('does not show for books that already have entries, in this or another semester', () => {
    expect(shouldPromptBeginningBalances({ ...fresh, journalEntries: [{ id: 'e1' }] })).toBe(false);
    expect(shouldPromptBeginningBalances({ ...fresh, reportingPeriodWorkspaces: [{ journalEntries: [{ id: 'e1' } as never] }] })).toBe(false);
  });
});
