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

export interface ReceiptAttachmentDraft {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
}

export interface ReceiptAttachment extends ReceiptAttachmentDraft {
  entryId: string;
}

export interface TransactionDetails {
  memo?: string;
  purpose?: string;
  fundingSourceId?: string;
  sponsorshipKind?: 'cash' | 'food' | 'supplies';
  counterpartyName?: string;
  eventRelated: boolean;
  donorRestriction?: 'none' | 'satisfied-in-period' | 'temporary';
  restrictionEventPeriod?: 'same-period' | 'future';
  membershipUnpaidAmount?: number;
  deferredAmount?: number;
  expectedUsePeriod?: 'within' | 'next';
  receiptAttachmentIds: string[];
}

export interface TransactionMetadata {
  transactionType: string;
  customName?: string;
  details: TransactionDetails;
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
  // Present when the entry came from Smart Transaction Entry. The selected
  // type owns the accounting rule; customName is only the user's label and
  // never changes the debit/credit mapping.
  transactionType?: string;
  customName?: string;
  transactionDetails?: TransactionDetails;
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

export interface CustomClassificationRule extends ClassificationRule {
  id: string;
  isActive: boolean;
  createdAt: string;
}

// One completed year-end close: Revenue/Expenses zeroed via journalEntryId,
// their net posted into Fund Balance. Recorded so the same fiscal year
// can't silently be closed twice and so Settings can show close history.
export interface ClosingRecord {
  id: string;
  fiscalYear: string;
  closingDate: string;
  netIncome: number;
  journalEntryId: string;
  closedAt: string;
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
  // Optional: absent in backups exported before Closing Entries existed —
  // restoring one of those just starts with no close history, not an error.
  closedFiscalYears?: ClosingRecord[];
  // Optional for compatibility with backups created before receipt photos
  // were supported.
  receiptAttachments?: ReceiptAttachment[];
  customClassificationRules?: CustomClassificationRule[];
}
