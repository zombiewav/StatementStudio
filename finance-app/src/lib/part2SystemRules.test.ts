import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, INITIAL_ACCOUNTS } from '../context/FinanceContext';
import { OBLIGATION_ACCOUNT_CODES } from './reviewEngine';

describe('StatementStudio Part 2 system rules', () => {
  it('provides separate PPE and furniture payable accounts, and limits Review follow-ups to prepaid accounts', () => {
    expect(INITIAL_ACCOUNTS.find(account => account.code === '2030')?.name).toBe('Accounts Payable - PPE');
    expect(INITIAL_ACCOUNTS.find(account => account.code === '2040')?.name).toBe('Accounts Payable - Furniture and Fixtures');
    expect(OBLIGATION_ACCOUNT_CODES).toEqual(['1260', '1280', '1285', '1295', '1298']);
  });

  it('moves unremitted officer collections from Cash to Due from Officers automatically', () => {
    expect(DEFAULT_RULES.find(rule => rule.description === 'Unremitted Collections by an Officer')).toMatchObject({
      debitAccountCode: '1320',
      creditAccountCode: '1010',
    });
  });

  it('keeps semester depreciation mapped to the existing contra-assets', () => {
    expect(DEFAULT_RULES.find(rule => rule.description === 'Depreciation Expense - Equipment')).toMatchObject({ debitAccountCode: '5090', creditAccountCode: '1550' });
    expect(DEFAULT_RULES.find(rule => rule.description === 'Depreciation of Chairs')).toMatchObject({ debitAccountCode: '5095', creditAccountCode: '1660' });
  });
});
