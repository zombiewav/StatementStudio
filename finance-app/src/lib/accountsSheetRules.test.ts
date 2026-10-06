import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, INITIAL_ACCOUNTS } from '../context/FinanceContext';
import { PREPAID_ASSET_CATEGORIES, PREPAID_ASSET_ITEMS } from './prepaidAssets';

describe('Accounts spreadsheet mappings', () => {
  it.each([
    ['Purchase of Laptop', '1500'], ['Purchase of Projector', '1500'], ['Purchase of Printer', '1500'],
    ['Purchase of UPS (Uninterrupted Power System)', '1500'], ['Purchase of Cash Box', '1500'], ['Purchase of HDMI', '1500'],
    ['Purchase of WIFI Box', '1500'], ['Purchase of Microphone', '1500'], ['Purchase of Flash Drive', '1500'],
    ['Purchase of Mouse', '1500'], ['Purchase of Speaker', '1500'], ['Purchase of Projector Stand', '1500'],
    ['Purchase of Adaptor', '1500'], ['Purchase of Cabinet', '1650'], ['Purchase Chairs', '1650'], ['Purchase of Tables/Desks', '1650'],
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
});
