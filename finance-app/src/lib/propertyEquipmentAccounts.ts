import { Account } from '../types';

// Property and Equipment on the Statement of Financial Position: every Equipment item (1500-1516), Furniture and
// Fixtures item (1651-1653) and their accumulated depreciation (1550, 1660). The chart numbers them 1500-1699.
// Equipment (1500-1599, ending with 1550) comes first, then Furniture and Fixtures (1600-1699, ending with 1660); each
// accumulated depreciation account is the last line of its own section.
export const ppeSectionOf = (code: string): 'Equipment' | 'Furniture and Fixtures' => (Number(code) < 1600 ? 'Equipment' : 'Furniture and Fixtures');
export const isPpeAccumulatedDepreciation = (code: string): boolean => code === '1550' || code === '1660';
export const comparePpeAccounts = (a: Pick<Account, 'code'>, b: Pick<Account, 'code'>): number => {
  const rank = (code: string) => (ppeSectionOf(code) === 'Equipment' ? 0 : 2) + (isPpeAccumulatedDepreciation(code) ? 1 : 0);
  return rank(a.code) - rank(b.code) || Number(a.code) - Number(b.code);
};

export const isPropertyAndEquipmentAccount = (account: Pick<Account, 'code' | 'type'>): boolean => {
  const code = Number(account.code);
  return account.type === 'Assets' && Number.isInteger(code) && code >= 1500 && code <= 1699;
};
