import { describe, expect, it } from 'vitest';
import { Account, ClassificationRule, CustomClassificationRule } from '../types';
import { getEffectiveClassificationRules, validateCustomTransactionRule } from './customTransactionRules';

const accounts: Account[] = [
  { code: '1010', name: 'Cash', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '4010', name: 'Income', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
  { code: '9999', name: 'Inactive', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: false },
];
const builtIns: ClassificationRule[] = [{ keyword: 'dues', description: 'Membership Dues', debitAccountCode: '1010', creditAccountCode: '4010' }];
const customs: CustomClassificationRule[] = [{ id: 'custom-1', keyword: 'alumni', description: 'Alumni Contribution', debitAccountCode: '1010', creditAccountCode: '4010', isActive: true, createdAt: '2026-01-01' }];

describe('validateCustomTransactionRule', () => {
  it('accepts a unique name with two active automatic accounts', () => {
    expect(validateCustomTransactionRule({ description: 'Special Fundraiser', debitAccountCode: '1010', creditAccountCode: '4010' }, accounts, builtIns, customs).valid).toBe(true);
  });

  it('protects built-in names and existing custom names case-insensitively', () => {
    expect(validateCustomTransactionRule({ description: 'membership dues', debitAccountCode: '1010', creditAccountCode: '4010' }, accounts, builtIns, customs).reason).toContain('protected built-in');
    expect(validateCustomTransactionRule({ description: 'ALUMNI CONTRIBUTION', debitAccountCode: '1010', creditAccountCode: '4010' }, accounts, builtIns, customs).reason).toContain('already uses');
  });

  it('rejects identical or inactive automatic accounts', () => {
    expect(validateCustomTransactionRule({ description: 'Special Fundraiser', debitAccountCode: '1010', creditAccountCode: '1010' }, accounts, builtIns, customs).reason).toContain('different');
    expect(validateCustomTransactionRule({ description: 'Special Fundraiser', debitAccountCode: '9999', creditAccountCode: '4010' }, accounts, builtIns, customs).reason).toContain('active');
  });

  it('allows an existing custom rule to retain its own name while editing', () => {
    expect(validateCustomTransactionRule({ description: 'Alumni Contribution', debitAccountCode: '1010', creditAccountCode: '4010' }, accounts, builtIns, customs, 'custom-1').valid).toBe(true);
  });
});

describe('getEffectiveClassificationRules', () => {
  it('adds active custom types to transaction search and excludes disabled types', () => {
    const disabled: CustomClassificationRule = {
      ...customs[0],
      id: 'custom-2',
      description: 'Disabled Contribution',
      isActive: false,
    };

    expect(getEffectiveClassificationRules(builtIns, [...customs, disabled]).map(rule => rule.description)).toEqual([
      'Membership Dues',
      'Alumni Contribution',
    ]);
  });
});
