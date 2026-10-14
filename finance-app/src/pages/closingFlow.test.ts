import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { TrialBalance } from './TrialBalance';
import { GeneralLedger } from './GeneralLedger';
import { PostClosingTrialBalance } from './PostClosingTrialBalance';
import { FinancialStatements } from './FinancialStatements';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
const PROJECT = 'General Fund Operations';
let Page: () => ReturnType<typeof createElement> = () => createElement('div');
function Probe() { finance = useFinance(); return createElement(Page); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ');
const flat = (value: string) => value.replace(/\s+/g, ' ');

// The client's closing example: revenue 5k (dues 4k + other income 1k), four expenses.
function seed(communication: number) {
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    finance.addJournalEntry('2026-09-01', 'Fund contribution', PROJECT, [{ accountCode: '1010', debit: 10000, credit: 0 }, { accountCode: '3010', debit: 0, credit: 10000 }]);
    finance.addJournalEntry('2026-10-01', 'Dues', PROJECT, [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 4000 }, { accountCode: '4050', debit: 0, credit: 1000 }]);
    [['5130', communication, '1010'], ['5150', 1000, '1010'], ['5100', 1000, '1010'], ['5040', 1000, '1010']].forEach(([code, amount, paidFrom], index) =>
      finance.addJournalEntry(`2026-10-0${index + 2}`, `Expense ${code}`, PROJECT, [{ accountCode: code as string, debit: amount as number, credit: 0 }, { accountCode: paidFrom as string, debit: 0, credit: amount as number }]));
  });
}
const closingEntry = () => finance.journalEntries.find(entry => entry.description.startsWith('Closing Entries'));

describe('closing entries named Fund Balance', () => {
  it('posts revenue debited, expenses credited and the surplus credited to Fund Balance', () => {
    seed(1000);
    expect(finance.accounts.find(account => account.code === '3010')?.name).toBe('Fund Balance');
    const lines = closingEntry()!.lines;
    expect(lines.find(line => line.accountCode === '3010')).toEqual({ accountCode: '3010', debit: 0, credit: 1000 });
    expect(lines.filter(line => line.debit > 0).map(line => line.accountCode).sort()).toEqual(['4040', '4050']);
    expect(lines.filter(line => line.credit > 0 && line.accountCode !== '3010').map(line => line.accountCode).sort()).toEqual(['5040', '5100', '5130', '5150']);
    // Day-to-day balances never see the closing entry; the post-closing reports do.
    expect(finance.accountBalances['4040']).toBe(4000);
  });

  it('debits Fund Balance for a deficit, leaving it negative', () => {
    seed(3000);
    expect(closingEntry()!.lines.find(line => line.accountCode === '3010')).toEqual({ accountCode: '3010', debit: 1000, credit: 0 });
    expect(finance.accountBalances['3010']).toBe(10000);
  });
});

describe('pre-closing and post-closing reports', () => {
  const tableRows = () => renderer.root.findAllByType('tr').map(row => flat(text(row)));

  it('the Trial Balance and General Ledger ignore the closing entry; the post-closing versions include it', () => {
    Page = () => createElement('div', null, createElement(TrialBalance), createElement(PostClosingTrialBalance), createElement(GeneralLedger), createElement(GeneralLedger as never, { mode: 'post' } as never));
    seed(1000);
    const page = flat(text(renderer.root));
    expect(page).toContain('Post-Closing Trial Balance');
    expect(page).toContain('Post-Closing General Ledger');
    const [pre, post] = [renderer.root.findAllByType(TrialBalance)[0], renderer.root.findAllByType(PostClosingTrialBalance)[0]];
    const preRows = pre.findAllByType('tr').map(row => flat(text(row)));
    const postRows = post.findAllByType('tr').map(row => flat(text(row)));
    // Original Trial Balance: revenues and expenses are all still there, and Fund Balance has no surplus yet.
    expect(preRows.some(row => row.includes('Membership Dues') && row.includes('4,000'))).toBe(true);
    expect(preRows.some(row => row.includes('Fund Balance') && row.includes('11,000'))).toBe(false);
    // Post-closing: revenues and expenses are gone and Fund Balance carries the surplus.
    expect(postRows.some(row => row.includes('Membership Dues'))).toBe(false);
    expect(postRows.some(row => row.includes('Fund Balance') && row.includes('11,000'))).toBe(true);
    expect(tableRows().length).toBeGreaterThan(0);
  });

  it('the post-closing reports wait while Review is open, then the closing entry posts by itself', () => {
    Page = () => createElement('div', null, createElement(PostClosingTrialBalance), createElement(GeneralLedger as never, { mode: 'post' } as never));
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Dues', PROJECT, [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 5000 }]);
    });
    // Posts on its own as soon as Review is clear.
    expect(closingEntry()).toBeTruthy();
    let purchase: any;
    act(() => { purchase = finance.addJournalEntry('2026-10-05', 'Restricted gift', PROJECT, [{ accountCode: '1010', debit: 800, credit: 0 }, { accountCode: '4035', debit: 0, credit: 800 }]); });
    // A new open item reopens Review, so the closing entry is withdrawn until it is settled.
    expect(closingEntry()).toBeUndefined();
    expect(flat(text(renderer.root))).toContain('The closing entry has not been posted yet');
    act(() => { finance.addJournalEntry('2026-10-06', 'Release restriction', PROJECT, [{ accountCode: '4035', debit: 800, credit: 0 }, { accountCode: '4030', debit: 0, credit: 800 }], undefined, purchase.id); });
    expect(closingEntry()).toBeTruthy();
    expect(flat(text(renderer.root))).not.toContain('The closing entry has not been posted yet');
    const rows = renderer.root.findAllByType(PostClosingTrialBalance)[0].findAllByType('tr').map(row => flat(text(row)));
    expect(rows.some(row => row.includes('Membership Dues') || row.includes('Restricted'))).toBe(false);
    expect(rows.some(row => row.includes('Fund Balance') && row.includes('5,800'))).toBe(true);
  });

  it('closes the whole semester, including entries dated after today, and follows later changes', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-08-01', 'Activity fees', PROJECT, [{ accountCode: '1010', debit: 10000, credit: 0 }, { accountCode: '4090', debit: 0, credit: 10000 }]);
      finance.addJournalEntry('2026-12-30', 'Late recognition', PROJECT, [{ accountCode: '1010', debit: 500, credit: 0 }, { accountCode: '4090', debit: 0, credit: 500 }]);
    });
    const closing = () => closingEntry()!;
    expect(closing().lines.find(line => line.accountCode === '4090')).toEqual({ accountCode: '4090', debit: 10500, credit: 0 });
    expect(closing().date).toBe('2026-12-31');
    expect(finance.closedFiscalYears[0].automatic).toBe(true);
    act(() => { finance.addJournalEntry('2026-12-31', 'One more', PROJECT, [{ accountCode: '1010', debit: 200, credit: 0 }, { accountCode: '4090', debit: 0, credit: 200 }]); });
    expect(closing().lines.find(line => line.accountCode === '4090')?.debit).toBe(10700);
    expect(finance.journalEntries.filter(entry => entry.description.startsWith('Closing Entries'))).toHaveLength(1);
    // The automatic entry does not lock the period's own transactions.
    expect(() => act(() => finance.updateJournalEntry({ ...finance.journalEntries[0], description: 'Activity fees (edited)' }))).not.toThrow();
  });

  it('a deficit Fund Balance does not stop the financial statements', () => {
    Page = () => createElement(FinancialStatements);
    seed(3000);
    const page = flat(text(renderer.root));
    expect(page).not.toContain('have a negative balance');
    expect(page).toContain('Statement of Financial Position');
  });
});

describe('Trial Balance order', () => {
  it('lists Assets, Liabilities, Revenue and last Expenses even when the accounts are stored out of order', () => {
    Page = () => createElement(TrialBalance);
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Dues', PROJECT, [{ accountCode: '1010', debit: 3000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 3000 }]);
      finance.addJournalEntry('2026-10-02', 'Supplies', PROJECT, [{ accountCode: '5040', debit: 200, credit: 0 }, { accountCode: '2050', debit: 0, credit: 200 }]);
    });
    act(() => { finance.restoreBackupData({ ...finance.exportBackupData(), accounts: [...finance.accounts].reverse() }); });
    const types = renderer.root.findAllByType('tbody')[0].findAllByType('tr').map(row => row.findAllByType('span')[0]?.children.join(''));
    expect(types).toEqual(['Assets', 'Liabilities', 'Revenue', 'Expenses']);
  });
});

describe('second semester beginning balances', () => {
  it('carries only the permanent accounts, including Fund Balance, and starts revenue and expenses at zero', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-09-01', 'Dues', PROJECT, [{ accountCode: '1010', debit: 3000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 3000 }]);
      finance.addJournalEntry('2026-09-02', 'Supplies', PROJECT, [{ accountCode: '5040', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }]);
    });
    act(() => { finance.switchReportingPeriod('2026-2027', '2nd Semester', 2026); });
    expect(finance.accountBalances['1010']).toBe(2500);
    expect(finance.accountBalances['3010']).toBe(2500);
    expect(finance.accountBalances['4040'] || 0).toBe(0);
    expect(finance.accountBalances['5040'] || 0).toBe(0);
    expect(finance.journalEntries.some(entry => entry.description.startsWith('Closing Entries'))).toBe(false);
  });
});
