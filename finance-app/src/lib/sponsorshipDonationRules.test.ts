import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, INITIAL_ACCOUNTS, migrateRetiredAccountLines, migrateRetiredOpeningBalances } from '../context/FinanceContext';

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

  it('does not expose the removed donated food and donated event supplies accounts or rules', () => {
    expect(INITIAL_ACCOUNTS.some(account => ['1710', '1720'].includes(account.code))).toBe(false);
    expect(DEFAULT_RULES.some(rule => ['1710', '1720'].includes(rule.debitAccountCode))).toBe(false);
  });

  it('preserves historical entries by moving removed donated supply lines to Supplies and Materials', () => {
    const [entry] = migrateRetiredAccountLines([{
      id: 'legacy-donation', reference: 'JE-1', date: '2026-01-01', description: 'Legacy donated food', project: 'General Fund Operations',
      lines: [{ accountCode: '1710', debit: 500, credit: 0 }, { accountCode: '4030', debit: 0, credit: 500 }],
    }]);
    expect(entry.lines).toEqual([{ accountCode: '1285', debit: 500, credit: 0 }, { accountCode: '4030', debit: 0, credit: 500 }]);
  });

  it('migrates retired prepaid accounts without losing historical balances', () => {
    const [entry] = migrateRetiredAccountLines([{
      id: 'legacy-prepaid', reference: 'JE-2', date: '2026-01-01', description: 'Legacy rent deposit', project: 'General Fund Operations',
      transactionDetails: { eventRelated: false, receiptAttachmentIds: [], prepaidAssetCategory: 'rent' },
      lines: [{ accountCode: '1340', debit: 200, credit: 0 }, { accountCode: '2060', debit: 0, credit: 200 }],
    }]);
    expect(entry.lines).toEqual([{ accountCode: '1275', debit: 200, credit: 0 }, { accountCode: '2063', debit: 0, credit: 200 }]);
    expect(migrateRetiredOpeningBalances({ '1290': 50, '1340': 100, '1345': 150, '2060': 300 })).toEqual({ '1260': 50, '1270': 250, '2010': 300 });
  });

  it('moves earlier Prepaid Rent / Clothing-Uniform downpayments off Advances to Suppliers - Merchandise', () => {
    const base = { id: 'e', reference: 'JE-3', date: '2026-01-01', description: 'Downpayment', project: 'General Fund Operations' };
    const [prepaid, merchandise] = migrateRetiredAccountLines([
      { ...base, transactionDetails: { eventRelated: false, receiptAttachmentIds: [], prepaidAssetCategory: 'uniform' }, lines: [{ accountCode: '1270', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }] },
      { ...base, id: 'm', transactionDetails: { eventRelated: false, receiptAttachmentIds: [] }, lines: [{ accountCode: '1270', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }] },
    ]);
    expect(prepaid.lines[0].accountCode).toBe('1275');
    expect(merchandise.lines[0].accountCode).toBe('1270');
  });
});
