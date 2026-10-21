import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { periodEndingBalances } from '../lib/reportingPeriodBalances';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement('div'); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const PROJECT = 'General Fund Operations';

describe('1st semester ending balance = 2nd semester beginning balance', () => {
  it('copies the ending balances, leaves out lines dated after the semester, and refreshes after a later change', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-09-01', 'capital', PROJECT, [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 5000 }]);
      finance.addJournalEntry('2026-09-05', 'Downpayment', PROJECT, [{ accountCode: '1270', debit: 600, credit: 0 }, { accountCode: '1010', debit: 0, credit: 600 }]);
      // A payment line typed with a date after the semester ends.
      finance.addJournalEntry('2026-09-06', 'Downpayment 2', PROJECT, [{ accountCode: '1270', debit: 300, credit: 0, date: '2027-02-01' }, { accountCode: '1010', debit: 0, credit: 300, date: '2027-02-01' }]);
    });
    const endOf1st = periodEndingBalances(finance.openingBalances, finance.journalEntries, finance.accounts, '2026-12-31');
    expect(endOf1st['1270']).toBe(600);
    expect(endOf1st['1010']).toBe(4400);

    act(() => { finance.switchReportingPeriod('2026-2027', '2nd Semester', 2026); });
    expect(finance.openingBalances['1270']).toBe(endOf1st['1270']);
    expect(finance.openingBalances['1010']).toBe(endOf1st['1010']);

    // Change the 1st semester afterwards, then reopen the 2nd: its beginning balance follows.
    act(() => { finance.switchReportingPeriod('2026-2027', '1st Semester', 2026); });
    act(() => { finance.addJournalEntry('2026-11-01', 'Downpayment 3', PROJECT, [{ accountCode: '1270', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }]); });
    const newEnd = periodEndingBalances(finance.openingBalances, finance.journalEntries, finance.accounts, '2026-12-31');
    act(() => { finance.switchReportingPeriod('2026-2027', '2nd Semester', 2026); });
    expect(finance.openingBalances['1270']).toBe(newEnd['1270']);
    expect(finance.openingBalances['1270']).toBe(700);
  });
});
