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
    finance.addJournalEntry('2026-10-01', 'Dues', PROJECT, [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 4000 }, { accountCode: '4050', debit: 0, credit: 1000 }]);
    // Communication is paid by an officer (Due to Officers), so a deficit needs no extra cash.
    [['5130', communication, '2050'], ['5150', 1000, '1010'], ['5100', 1000, '1010'], ['5040', 1000, '1010']].forEach(([code, amount, paidFrom], index) =>
      finance.addJournalEntry(`2026-10-0${index + 2}`, `Expense ${code}`, PROJECT, [{ accountCode: code as string, debit: amount as number, credit: 0 }, { accountCode: paidFrom as string, debit: 0, credit: amount as number }]));
  });
}
const close = () => act(() => { finance.postDirectClosing(finance.settings.fiscalYear, '2026-12-31'); });
const closingEntry = () => finance.journalEntries.find(entry => entry.description.startsWith('Closing Entries'));

describe('closing entries named Fund Balance', () => {
  it('posts revenue debited, expenses credited and the surplus credited to Fund Balance', () => {
    seed(1000);
    expect(finance.accounts.find(account => account.code === '3010')?.name).toBe('Fund Balance');
    close();
    const lines = closingEntry()!.lines;
    expect(lines.find(line => line.accountCode === '3010')).toEqual({ accountCode: '3010', debit: 0, credit: 1000 });
    expect(lines.filter(line => line.debit > 0).map(line => line.accountCode).sort()).toEqual(['4040', '4050']);
    expect(lines.filter(line => line.credit > 0 && line.accountCode !== '3010').map(line => line.accountCode).sort()).toEqual(['5040', '5100', '5130', '5150']);
    expect(finance.accountBalances['3010']).toBe(1000);
    expect(finance.accountBalances['4040'] || 0).toBe(0);
  });

  it('debits Fund Balance for a deficit, leaving it negative', () => {
    seed(3000);
    close();
    expect(closingEntry()!.lines.find(line => line.accountCode === '3010')).toEqual({ accountCode: '3010', debit: 1000, credit: 0 });
    expect(finance.accountBalances['3010']).toBe(-1000);
  });
});

describe('pre-closing and post-closing reports', () => {
  const tableRows = () => renderer.root.findAllByType('tr').map(row => flat(text(row)));

  it('the Trial Balance and General Ledger ignore the closing entry; the post-closing versions include it', () => {
    Page = () => createElement('div', null, createElement(TrialBalance), createElement(PostClosingTrialBalance), createElement(GeneralLedger), createElement(GeneralLedger as never, { mode: 'post' } as never));
    seed(1000);
    close();
    const page = flat(text(renderer.root));
    expect(page).toContain('Post-Closing Trial Balance');
    expect(page).toContain('Post-Closing General Ledger');
    const [pre, post] = [renderer.root.findAllByType(TrialBalance)[0], renderer.root.findAllByType(PostClosingTrialBalance)[0]];
    const preRows = pre.findAllByType('tr').map(row => flat(text(row)));
    const postRows = post.findAllByType('tr').map(row => flat(text(row)));
    // Original Trial Balance: revenues and expenses are all still there, and no Fund Balance row.
    expect(preRows.some(row => row.includes('Membership Dues') && row.includes('4,000'))).toBe(true);
    expect(preRows.some(row => row.includes('Fund Balance'))).toBe(false);
    // Post-closing: revenues and expenses are gone and Fund Balance carries the surplus.
    expect(postRows.some(row => row.includes('Membership Dues'))).toBe(false);
    expect(postRows.some(row => row.includes('Fund Balance') && row.includes('1,000'))).toBe(true);
    expect(tableRows().length).toBeGreaterThan(0);
  });

  it('the post-closing reports wait for the closing entry and then show no revenue or expense rows', () => {
    Page = () => createElement('div', null, createElement(PostClosingTrialBalance), createElement(GeneralLedger as never, { mode: 'post' } as never));
    seed(1000);
    const before = flat(text(renderer.root));
    expect(before).toContain('The closing entry has not been posted yet');
    expect(before).not.toContain('Membership Dues');
    close();
    const after = flat(text(renderer.root));
    expect(after).not.toContain('The closing entry has not been posted yet');
    const rows = renderer.root.findAllByType(PostClosingTrialBalance)[0].findAllByType('tr').map(row => flat(text(row)));
    expect(rows.some(row => row.includes('Membership Dues') || row.includes('Communication'))).toBe(false);
    expect(rows.some(row => row.includes('Fund Balance') && row.includes('1,000'))).toBe(true);
  });

  it('a deficit Fund Balance does not stop the financial statements', () => {
    Page = () => createElement(FinancialStatements);
    seed(3000);
    close();
    const page = flat(text(renderer.root));
    expect(page).not.toContain('have a negative balance');
    expect(page).toContain('Statement of Financial Position');
  });
});
