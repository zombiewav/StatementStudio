import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from './FinanceContext';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Consumer() { finance = useFinance(); return null; }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

describe('journal posting batches', () => {
  it('uses unique identities and updated balances for consecutive entries in one action', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Consumer))); });
    act(() => {
      finance.addJournalEntry('2026-10-01', 'TEST funding', 'General Fund Operations', [
        { accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '4030', debit: 0, credit: 100 },
      ]);
      const purchase = finance.addJournalEntry('2026-10-02', 'TEST expense', 'General Fund Operations', [
        { accountCode: '5030', debit: 100, credit: 0 }, { accountCode: '2010', debit: 0, credit: 100 },
      ]);
      finance.addJournalEntry('2026-10-03', 'TEST payment', 'General Fund Operations', [
        { accountCode: '2010', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 },
      ], undefined, purchase.id);
    });
    expect(finance.journalEntries.map(entry => entry.reference)).toEqual(['JE-0001', 'JE-0002', 'JE-0003']);
    expect(new Set(finance.journalEntries.map(entry => entry.id)).size).toBe(3);
    expect(finance.journalEntries[2].settlesEntryId).toBe(finance.journalEntries[1].id);
    expect(finance.accountBalances['2010']).toBe(0);
    expect(finance.accountBalances['1010']).toBe(0);
  });

  it('enforces closed-period protection in the save action', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Consumer))); });
    act(() => {
      finance.restoreBackupData({ ...finance.exportBackupData(), closedFiscalYears: [{
        id: 'TEST-close', fiscalYear: '2026', closingDate: '2026-05-31', closedAt: '2026-05-31',
        journalEntryId: 'closing', netIncome: 0, completed: true,
      }] });
    });
    act(() => {
      finance.addJournalEntry('2026-10-01', 'TEST open entry', 'General Fund Operations', [
        { accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '4030', debit: 0, credit: 100 },
      ]);
    });
    expect(() => finance.updateJournalEntry({ ...finance.journalEntries[0], date: '2026-05-01' })).toThrow('can no longer be edited');
  });
});

describe('multi-entry posting', () => {
  const funding = [{ accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '4030', debit: 0, credit: 100 }];
  const cashPayment = [{ accountCode: '5030', debit: 60, credit: 0 }, { accountCode: '1010', debit: 0, credit: 60 }];

  it('lets a posting spend cash that comes from a saved draft', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Consumer))); });
    act(() => {
      finance.addJournalEntry('2026-10-01', 'TEST draft funding', 'General Fund Operations', funding, undefined, undefined, undefined, true);
    });
    expect(() => act(() => {
      finance.addJournalEntry('2026-10-02', 'TEST payment', 'General Fund Operations', cashPayment);
    })).not.toThrow();
    expect(finance.accountBalances['1010']).toBe(40);
  });

  it('rolls back every entry when a later one in the same posting fails', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Consumer))); });
    act(() => {
      finance.addJournalEntry('2026-10-01', 'TEST funding', 'General Fund Operations', funding);
    });
    const draft = (() => {
      let entry!: ReturnType<typeof finance.addJournalEntry>;
      act(() => { entry = finance.addJournalEntry('2026-10-02', 'TEST draft', 'General Fund Operations', cashPayment, undefined, undefined, undefined, true); });
      return entry;
    })();
    expect(() => act(() => {
      finance.runAtomicPosting(() => {
        finance.addJournalEntry('2026-10-02', 'TEST finalized', 'General Fund Operations', cashPayment, undefined, undefined, undefined, false, undefined, draft.id);
        finance.addJournalEntry('2026-10-03', 'TEST overspend', 'General Fund Operations', [
          { accountCode: '5030', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 },
        ]);
      });
    })).toThrow('negative balance');
    expect(finance.journalEntries).toHaveLength(2);
    expect(finance.journalEntries.find(entry => entry.id === draft.id)?.isDraft).toBe(true);
  });
});
