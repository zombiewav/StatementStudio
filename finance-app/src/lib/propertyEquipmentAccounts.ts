import { Account } from '../types';

// Property and Equipment on the Statement of Financial Position: every Equipment item (1500-1516), Furniture and
// Fixtures item (1651-1653) and their accumulated depreciation (1550, 1660). The chart numbers them 1500-1699.
export const isPropertyAndEquipmentAccount = (account: Pick<Account, 'code' | 'type'>): boolean => {
  const code = Number(account.code);
  return account.type === 'Assets' && Number.isInteger(code) && code >= 1500 && code <= 1699;
};
