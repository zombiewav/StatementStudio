import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, INITIAL_ACCOUNTS, restoreSavedAccounts } from '../context/FinanceContext';
import { PREPAID_ASSET_CATEGORIES, PREPAID_ASSET_ITEMS, prepaidCategoryForAssetAccount } from './prepaidAssets';

describe('Accounts spreadsheet mappings', () => {
  it('adds the shared Event Expense account and routes the event-program entry to cash', () => {
    expect(INITIAL_ACCOUNTS.find(account => account.code === '5300')).toMatchObject({ name: 'Event Expense', type: 'Expenses' });
    expect(DEFAULT_RULES.find(rule => rule.description === 'Event/Program Expense')).toMatchObject({ debitAccountCode: '5300', creditAccountCode: '1010' });
  });

  it('routes Printing Services income to Other Income', () => {
    expect(DEFAULT_RULES.find(rule => rule.description === 'Income from Printing Services')).toMatchObject({ debitAccountCode: '1010', creditAccountCode: '4050' });
  });
  it.each([
    ['Purchase of Laptop', '1501'], ['Purchase of Projector', '1502'], ['Purchase of Printer', '1503'],
    ['Purchase of UPS (Uninterrupted Power System)', '1504'], ['Purchase of Cash Box', '1505'], ['Purchase of HDMI', '1506'],
    ['Purchase of WIFI Box', '1507'], ['Purchase of Microphone', '1508'], ['Purchase of Flash Drive', '1509'],
    ['Purchase of Mouse', '1510'], ['Purchase of Speaker', '1511'], ['Purchase of Projector Stand', '1512'],
    ['Purchase of Adaptor', '1513'], ['Purchase of Cabinet', '1651'], ['Purchase Chairs', '1652'], ['Purchase of Tables/Desks', '1653'],
    ['Purchase of Computer Hardware', '1514'], ['Purchase of Extension Wire', '1515'], ['Purchase of Other Small Equipment', '1516'],
  ])('%s records to the required asset class', (description, debitAccountCode) => {
    expect(DEFAULT_RULES.find(rule => rule.description === description)).toMatchObject({ debitAccountCode, creditAccountCode: '1010' });
  });

  it.each([
    ['Depreciation of Laptop', '5090', '1550'], ['Depreciation of Projector', '5090', '1550'],
    ['Depreciation of Printer', '5090', '1550'], ['Depreciation of UPS (Uninterrupted Power System)', '5090', '1550'],
    ['Depreciation of Cabinet', '5095', '1660'], ['Depreciation of Chairs', '5095', '1660'], ['Depreciation of Tables/Desk', '5095', '1660'],
  ])('%s uses the required depreciation pair', (description, debitAccountCode, creditAccountCode) => {
    const rule = DEFAULT_RULES.find(candidate => candidate.description === description)
      || DEFAULT_RULES.find(candidate => candidate.keyword === description.toLowerCase().replace('chairs', 'chair').replace('tables/desk', 'table'));
    expect(rule).toMatchObject({ debitAccountCode, creditAccountCode });
  });

  it('keeps each prepaid category in its own payable account', () => {
    expect(PREPAID_ASSET_CATEGORIES.awards.payableCode).toBe('2061');
    expect(PREPAID_ASSET_CATEGORIES.supplies.payableCode).toBe('2062');
    expect(PREPAID_ASSET_CATEGORIES.rent.payableCode).toBe('2063');
    expect(PREPAID_ASSET_CATEGORIES.uniform.payableCode).toBe('2064');
    expect(INITIAL_ACCOUNTS.filter(account => ['2061', '2062', '2063', '2064'].includes(account.code))).toHaveLength(4);
  });

  it('matches the prepaid and other asset accounts and removes retired choices', () => {
    expect(Object.keys(PREPAID_ASSET_CATEGORIES)).toEqual(['awards', 'supplies', 'rent', 'uniform']);
    expect(PREPAID_ASSET_ITEMS.Wifi).toBeUndefined();
    expect(PREPAID_ASSET_ITEMS.Load).toBeUndefined();
    expect(INITIAL_ACCOUNTS.find(account => account.code === '1270')?.name).toBe('Advances to Suppliers');
    expect(INITIAL_ACCOUNTS.find(account => account.code === '1360')?.name).toBe('Accounts Receivable - Suppliers');
    expect(INITIAL_ACCOUNTS.find(account => account.code === '2020')?.name).toBe('Accounts Payable - Merchandise');
    expect(INITIAL_ACCOUNTS.some(account => ['1290', '1340', '1345', '2060'].includes(account.code))).toBe(false);
  });

  it('keeps Event Expense as the only 5300 account', () => {
    expect(INITIAL_ACCOUNTS.filter(account => account.code === '5300').map(account => account.name)).toEqual(['Event Expense']);
    expect(INITIAL_ACCOUNTS.some(account => account.name === 'Professional Fee Expense')).toBe(false);
  });

  it('links each prepaid asset account to its related expense account', () => {
    const pairs = [['1280', '5120'], ['1285', '5290'], ['1295', '5020'], ['1298', '5180']];
    pairs.forEach(([assetCode, expenseCode]) => {
      const category = prepaidCategoryForAssetAccount(assetCode);
      expect(category && PREPAID_ASSET_CATEGORIES[category].expenseCode).toBe(expenseCode);
      expect(INITIAL_ACCOUNTS.find(account => account.code === expenseCode)?.type).toBe('Expenses');
    });
    expect(prepaidCategoryForAssetAccount('1260')).toBeUndefined();
  });

  it('drops a saved Professional Fee Expense row and backfills the prepaid expense accounts', () => {
    const saved = INITIAL_ACCOUNTS
      .filter(account => !['5300', '5290', '5120', '5180'].includes(account.code))
      .concat({ code: '5300', name: 'Professional Fee Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true });
    const restored = restoreSavedAccounts(saved);
    expect(restored.filter(account => account.code === '5300').map(account => account.name)).toEqual(['Event Expense']);
    ['5120', '5180', '5290'].forEach(code => expect(restored.some(account => account.code === code)).toBe(true));
  });

  it('uses a single "Others" item in every prepaid category and drops the two "Other ..." items', () => {
    expect(PREPAID_ASSET_ITEMS.Others).toEqual(['awards', 'supplies', 'rent', 'uniform']);
    expect(PREPAID_ASSET_ITEMS['Other Prizes and Awards']).toBeUndefined();
    expect(PREPAID_ASSET_ITEMS['Other Materials and Supplies']).toBeUndefined();
  });

  it('names the clothing/uniform consumption expense as the Accounts sheet does, including saved workspaces', () => {
    expect(INITIAL_ACCOUNTS.find(account => account.code === '5180')?.name).toBe('Clothing/Uniform Expense');
    const saved = INITIAL_ACCOUNTS.map(account => account.code === '5180' ? { ...account, name: 'Uniform Expense' } : account);
    expect(restoreSavedAccounts(saved).find(account => account.code === '5180')?.name).toBe('Clothing/Uniform Expense');
  });
});
