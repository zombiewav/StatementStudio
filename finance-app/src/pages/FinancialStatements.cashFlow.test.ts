import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { FinancialStatements } from './FinancialStatements';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement(FinancialStatements); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ');

describe('Statement of Cash Flows tab', () => {
  it('shows the client format with receipts and payments by related account, and no Financing section', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Pre-order downpayment', 'General Fund Operations', [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '2140', debit: 0, credit: 1000 }]);
      finance.addJournalEntry('2026-10-02', 'Supplier downpayment', 'General Fund Operations', [{ accountCode: '1270', debit: 600, credit: 0 }, { accountCode: '1010', debit: 0, credit: 400 }, { accountCode: '2050', debit: 0, credit: 200 }]);
      finance.addJournalEntry('2026-10-03', 'Laptop', 'General Fund Operations', [{ accountCode: '1501', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }]);
    });
    const tab = renderer.root.findAllByType('button').find(button => text(button).trim() === 'Statement of Cash Flows');
    expect(tab).toBeTruthy();
    act(() => { tab!.props.onClick(); });
    const page = text(renderer.root);
    ['Receipts from:', 'Payments for:', 'Unearned Merchandise Revenue', 'Advances to Suppliers', 'Purchase of equipment', 'Purchase of furniture and fixture',
      'Net cash provided by operating activities', 'Net cash provided by investing activities', 'Net increase (decrease) in cash and cash equivalents',
      'Cash and cash equivalents at beginning of year', 'Cash and cash equivalents at end of year', 'Ending cash agrees with the General Ledger'].forEach(label => expect(page).toContain(label));
    expect(page).not.toContain('Financing Activities');
    expect(page).not.toContain('Less:');
  });
});

describe('Financial Statements page', () => {
  it('no longer offers Changes in Fund Balance, the restriction table, or the Prepared By / Approved By footer', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    const openTab = (label: string) => {
      const tab = renderer.root.findAllByType('button').find(button => text(button).trim() === label);
      expect(tab).toBeTruthy();
      act(() => { tab!.props.onClick(); });
      return text(renderer.root);
    };
    const tabs = ['Statement of Financial Position', 'Statement of Activities', 'Statement of Functional Expenses', 'Statement of Cash Flows'];
    tabs.forEach(label => {
      const page = openTab(label);
      expect(page).not.toContain('Changes in Fund Balance');
      expect(page).not.toContain('Prepared By');
      expect(page).not.toContain('Approved By');
      expect(page).not.toContain('by restriction');
    });
    expect(renderer.root.findAllByType('button').some(button => text(button).includes('Changes in Fund Balance'))).toBe(false);
  });
});

describe('Statement of Functional Expenses', () => {
  it('lists event expenses in their event column and leaves out expenses with a zero balance', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Capital', 'General Fund Operations', [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4030', debit: 0, credit: 5000 }]);
      finance.addJournalEntry('2026-10-02', 'Event Expense - October Fest', 'General Fund Operations', [{ accountCode: '5300', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }], 'October Fest');
      finance.addJournalEntry('2026-10-03', 'Office supplies', 'General Fund Operations', [{ accountCode: '5040', debit: 200, credit: 0 }, { accountCode: '1010', debit: 0, credit: 200 }]);
    });
    const tab = renderer.root.findAllByType('button').find(button => text(button).trim() === 'Statement of Functional Expenses');
    act(() => { tab!.props.onClick(); });
    const rows = renderer.root.findAllByType('tr').map(row => text(row));
    const labels = rows.map(row => row.trim().split(/\s+/).slice(0, 3).join(' '));
    expect(rows.some(row => row.includes('Event Expense') && row.includes('700'))).toBe(true);
    expect(rows.some(row => row.includes('Office Supplies') && row.includes('200'))).toBe(true);
    expect(rows.some(row => row.includes('Bank Charges'))).toBe(false);
    expect(rows.some(row => row.includes('Rent Expense'))).toBe(false);
    expect(labels.length).toBeLessThan(8);
    expect(text(renderer.root)).toContain('October Fest');
  });
});

describe('Statement period header', () => {
  const headerFor = (semester: string, label: string) => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => { finance.updateSettings({ semester, reportingYear: 2026 } as never); });
    const tab = renderer.root.findAllByType('button').find(button => text(button).trim() === label);
    act(() => { tab!.props.onClick(); });
    return text(renderer.root).replace(/\s+/g, ' ');
  };

  it('says "For the period ended December 31, Year" for the 1st semester', () => {
    ['Statement of Activities', 'Statement of Functional Expenses', 'Statement of Cash Flows'].forEach(label => {
      const page = headerFor('1st Semester', label);
      expect(page).toContain('For the period ended December 31, 2026');
      expect(page).not.toContain('For the Period');
      act(() => renderer.unmount());
    });
  });

  it('says "For the period ended May 31, Year" for the 2nd semester', () => {
    ['Statement of Activities', 'Statement of Functional Expenses', 'Statement of Cash Flows'].forEach(label => {
      const page = headerFor('2nd Semester', label);
      expect(page).toContain('For the period ended May 31, 2027');
      act(() => renderer.unmount());
    });
  });

  it('leaves the Statement of Financial Position as an "As of" date', () => {
    const page = headerFor('1st Semester', 'Statement of Financial Position');
    expect(page).toContain('As of December 31, 2026');
  });
});
