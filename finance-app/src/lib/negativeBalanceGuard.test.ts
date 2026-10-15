import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { negativeBalanceAfterChange } from './negativeBalanceGuard';
import { Account, JournalEntry } from '../types';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const account = (code: string, type: Account['type'], normalBalance: Account['normalBalance']): Account => ({ code, name: `Account ${code}`, type, normalBalance, description: '', isActive: true });
const accounts = [account('1010', 'Assets', 'Debit'), account('2010', 'Liabilities', 'Credit'), account('3010', 'Fund Balance', 'Credit'), account('5290', 'Expenses', 'Debit')];
const entry = (id: string, lines: [string, number, number][]): JournalEntry => ({ id, reference: id, date: '2026-09-01', description: id, project: 'p', lines: lines.map(([accountCode, debit, credit]) => ({ accountCode, debit, credit })) } as JournalEntry);
const fund = entry('fund', [['1010', 500, 0], ['3010', 0, 500]]);
const payable = entry('payable', [['5290', 100, 0], ['2010', 0, 100]]);
const payment = entry('payment', [['2010', 100, 0], ['1010', 0, 100]]);

describe('negativeBalanceAfterChange', () => {
  it('flags removing a payable that was already paid', () => {
    expect(negativeBalanceAfterChange([fund, payable, payment], [fund, payment], accounts, {})?.code).toBe('2010');
  });

  it('allows removing a payable together with its payment, or one nothing depends on', () => {
    expect(negativeBalanceAfterChange([fund, payable, payment], [fund], accounts, {})).toBeUndefined();
    expect(negativeBalanceAfterChange([fund, payable], [fund], accounts, {})).toBeUndefined();
  });

  it('counts opening balances and lets Fund Balance go negative', () => {
    expect(negativeBalanceAfterChange([payment], [payment], accounts, { '2010': 100 })).toBeUndefined();
    expect(negativeBalanceAfterChange([fund], [], accounts, {})).toBeUndefined();
  });

  it('only flags an already-negative account when the change makes it worse', () => {
    const overdrawn = [fund, entry('spend', [['5290', 600, 0], ['1010', 0, 600]])];
    expect(negativeBalanceAfterChange(overdrawn, [overdrawn[0]], accounts, {})).toBeUndefined();
    expect(negativeBalanceAfterChange(overdrawn, [overdrawn[1]], accounts, {})?.code).toBe('1010');
  });
});

describe('deleting, reversing and editing a payable that was already paid', () => {
  let renderer: ReactTestRenderer;
  let finance: ReturnType<typeof useFinance>;
  const alert = vi.fn();
  const PROJECT = 'General Fund Operations';
  function Probe() { finance = useFinance(); return createElement('div'); }
  beforeEach(() => {
    alert.mockClear();
    (globalThis as { window?: unknown }).window = Object.assign((globalThis as { window?: object }).window ?? {}, { alert });
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-09-01', 'Fund contribution', PROJECT, [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '3010', debit: 0, credit: 1000 }]);
      finance.addJournalEntry('2026-09-02', 'Unpaid supplies', PROJECT, [{ accountCode: '5290', debit: 100, credit: 0 }, { accountCode: '2010', debit: 0, credit: 100 }]);
      finance.addJournalEntry('2026-09-03', 'Payment of payable', PROJECT, [{ accountCode: '2010', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }]);
    });
  });
  afterEach(() => { act(() => renderer.unmount()); });
  const payableEntry = () => finance.journalEntries.find(item => item.description === 'Unpaid supplies')!;

  it('blocks deleting it', () => {
    let deleted = true;
    act(() => { deleted = finance.deleteJournalEntry(payableEntry().id); });
    expect(deleted).toBe(false);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('negative balance'));
    expect(finance.journalEntries.some(item => item.description === 'Unpaid supplies')).toBe(true);
    expect(finance.accountBalances['2010']).toBe(0);
  });

  it('blocks reversing it', () => {
    act(() => finance.reverseJournalEntry(payableEntry().id));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('negative balance'));
    expect(finance.journalEntries.some(item => item.reversalOfEntryId)).toBe(false);
  });

  it('blocks editing it so that the payable shrinks below what was paid', () => {
    const edited = { ...payableEntry(), lines: [{ accountCode: '5290', debit: 40, credit: 0 }, { accountCode: '2010', debit: 0, credit: 40 }] };
    expect(() => act(() => finance.updateJournalEntry(edited))).toThrow(/negative balance/);
    expect(finance.accountBalances['2010']).toBe(0);
  });

  it('allows deleting the payment first, then the payable', () => {
    act(() => { finance.deleteJournalEntry(finance.journalEntries.find(item => item.description === 'Payment of payable')!.id); });
    expect(finance.accountBalances['2010']).toBe(100);
    act(() => { finance.deleteJournalEntry(payableEntry().id); });
    expect(finance.journalEntries.some(item => item.description === 'Unpaid supplies')).toBe(false);
    expect(finance.accountBalances['2010']).toBe(0);
  });
});
