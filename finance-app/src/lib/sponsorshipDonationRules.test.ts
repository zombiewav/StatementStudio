import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, INITIAL_ACCOUNTS } from '../context/FinanceContext';

describe('sponsorships and donations workbook rules', () => {
  it('keeps Donations and Sponsorships as separate revenue accounts', () => {
    expect(INITIAL_ACCOUNTS.find(account => account.code === '4100')).toMatchObject({ name: 'Donations', type: 'Revenue', normalBalance: 'Credit' });
    expect(INITIAL_ACCOUNTS.find(account => account.code === '4110')).toMatchObject({ name: 'Sponsorships', type: 'Revenue', normalBalance: 'Credit' });
  });

  it('offers one purpose-driven cash receipt type', () => {
    const rules = DEFAULT_RULES.filter(rule => rule.description === 'Sponsorships and Donations');
    expect(rules.map(rule => rule.keyword)).toEqual(['sponsorships and donations', 'donation', 'sponsor']);
    expect(rules.every(rule => rule.debitAccountCode === '1010' && rule.sponsorshipKind === 'cash')).toBe(true);
  });
});
