export type AccountType = 'Assets' | 'Liabilities' | 'Fund Balance' | 'Revenue' | 'Expenses';
export type NormalBalanceType = 'Debit' | 'Credit';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalanceType;
  description: string;
  isActive: boolean;
}

export interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  reference: string; // e.g. JE-001
  date: string;
  description: string;
  project: string;
  lines: JournalLine[];
}

export interface Project {
  id: string;
  name: string;
  budget: number;
  description: string;
  status: 'Active' | 'Completed' | 'On Hold';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  user: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Administrator' | 'Accountant' | 'Auditor';
}

export interface AppSettings {
  fiscalYear: string;
  organizationName: string;
  currencySymbol: string;
  currencyCode: string;
}

export interface ClassificationRule {
  keyword: string;
  debitAccountCode: string;
  creditAccountCode: string;
  description: string;
}
