import { Account, ClassificationRule, CustomClassificationRule } from '../types';

export interface CustomRuleInput {
  description: string;
  debitAccountCode: string;
  creditAccountCode: string;
}

export interface CustomRuleValidationResult {
  valid: boolean;
  reason?: string;
}

export function getEffectiveClassificationRules(
  builtInRules: ClassificationRule[],
  customRules: CustomClassificationRule[]
): ClassificationRule[] {
  return [...builtInRules, ...customRules.filter(rule => rule.isActive)];
}

export function validateCustomTransactionRule(
  input: CustomRuleInput,
  accounts: Account[],
  builtInRules: ClassificationRule[],
  customRules: CustomClassificationRule[],
  editingId?: string
): CustomRuleValidationResult {
  const description = input.description.trim();
  if (description.length < 3) return { valid: false, reason: 'Transaction type name must contain at least 3 characters.' };
  if (!input.debitAccountCode || !input.creditAccountCode) return { valid: false, reason: 'Select both automatic accounts.' };
  if (input.debitAccountCode === input.creditAccountCode) return { valid: false, reason: 'Debit and credit accounts must be different.' };

  const debit = accounts.find(account => account.code === input.debitAccountCode && account.isActive);
  const credit = accounts.find(account => account.code === input.creditAccountCode && account.isActive);
  if (!debit || !credit) return { valid: false, reason: 'Both automatic accounts must be active.' };

  const normalized = description.toLowerCase();
  if (builtInRules.some(rule => rule.description.trim().toLowerCase() === normalized)) {
    return { valid: false, reason: 'That name is already used by a protected built-in transaction type.' };
  }
  if (customRules.some(rule => rule.id !== editingId && rule.description.trim().toLowerCase() === normalized)) {
    return { valid: false, reason: 'A custom transaction type already uses that name.' };
  }
  return { valid: true };
}
