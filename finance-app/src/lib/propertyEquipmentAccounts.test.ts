import { describe, expect, it } from 'vitest';
import { isPropertyAndEquipmentAccount } from './propertyEquipmentAccounts';

const asset = (code: string) => ({ code, type: 'Assets' as const });

describe('isPropertyAndEquipmentAccount', () => {
  it('covers equipment items, furniture items and both accumulated depreciation accounts', () => {
    ['1500', '1501', '1508', '1510', '1511', '1516', '1550', '1651', '1652', '1653', '1660'].forEach(code => expect(isPropertyAndEquipmentAccount(asset(code))).toBe(true));
  });
  it('leaves cash, receivables, prepaid items and inventory out', () => {
    ['1010', '1200', '1250', '1260', '1298', '1700'].forEach(code => expect(isPropertyAndEquipmentAccount(asset(code))).toBe(false));
  });
  it('ignores accounts of another type', () => {
    expect(isPropertyAndEquipmentAccount({ code: '1550', type: 'Revenue' })).toBe(false);
  });
});
