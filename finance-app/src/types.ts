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
  // Name of the specific event this expense was for, required by the
  // Transactions form whenever the transaction is marked Event-Related.
  // Optional/absent on General & Administrative entries and on every entry
  // recorded before this field existed.
  eventName?: string;
  // Set on a reversing entry: the id of the original entry it reverses.
  // Posted entries are never hard-deleted, only reversed, so both sides of
  // a correction stay in the permanent record.
  reversalOfEntryId?: string;
  // Set on an original entry once it has been reversed: the id of the
  // reversing entry. Prevents reversing the same entry twice.
  reversedByEntryId?: string;
  // Set on a REVIEW settlement entry: the id of the obligation-creating
  // entry (one that credited Due to Officers, Due to Supplier, or Advances
  // to Officers) it resolves, fully or partially. Lets computePendingObligations
  // (src/lib/reviewEngine.ts) net a specific original entry against every
  // settlement posted against it, rather than only tracking each
  // obligation account's balance in aggregate.
  settlesEntryId?: string;
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

// Full export of everything StatementStudio persists to localStorage
// (accounts, journalEntries, projects, auditLogs, settings), so a user can
// back up and later restore their entire workspace. `schemaVersion` exists
// so a future incompatible change to any of these shapes has something to
// check against before attempting a restore.
export interface BackupPayload {
  schemaVersion: 1;
  exportedAt: string;
  organizationName: string;
  accounts: Account[];
  journalEntries: JournalEntry[];
  projects: Project[];
  auditLogs: AuditLog[];
  settings: AppSettings;
}
