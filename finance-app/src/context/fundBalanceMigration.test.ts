import { describe, expect, it } from 'vitest';
import { Account, JournalEntry } from '../types';
import { migrateRetiredAccountLines, migrateRetiredOpeningBalances, restoreSavedAccounts } from './FinanceContext';

const account = (code: string, name: string, normalBalance: Account['normalBalance']): Account => ({ code, name, type: 'Fund Balance', normalBalance, description: '', isActive: true });

describe('Fund Balance replaces Accumulated Net Surplus / Deficit', () => {
  it('renames the saved General Fund Balance and drops the retired accumulated accounts', () => {
    const restored = restoreSavedAccounts([account('3010', 'General Fund Balance', 'Credit'), account('3040', 'Accumulated Net Surplus', 'Credit'), account('3050', 'Accumulated Net Deficit', 'Debit')]);
    expect(restored.find(item => item.code === '3010')?.name).toBe('Fund Balance');
    expect(restored.some(item => item.code === '3040' || item.code === '3050')).toBe(false);
  });

  it('moves journal lines posted to the retired accounts onto Fund Balance, keeping debit and credit', () => {
    const entry = { id: 'e', reference: 'JE-1', date: '2026-10-01', description: 'closing', project: 'p', lines: [
      { accountCode: '3050', debit: 400, credit: 0 }, { accountCode: '3040', debit: 0, credit: 400 }, { accountCode: '1010', debit: 5, credit: 5 },
    ] } as JournalEntry;
    expect(migrateRetiredAccountLines([entry])[0].lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['3010', 400, 0], ['3010', 0, 400], ['1010', 5, 5]]);
  });

  it('folds retired opening balances into Fund Balance, a deficit reducing it', () => {
    expect(migrateRetiredOpeningBalances({ '3010': 1000, '3040': 300, '3050': 100 })).toEqual({ '3010': 1200 });
  });
});
