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
  // Optional because entries created before dated payments existed only have
  // one journal-level date. Ledger views fall back to JournalEntry.date.
  date?: string;
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

export interface DatedAmountRecord {
  date: string;
  amount: number;
}

export interface TransactionDetails {
  customerOrder?: { total: number; estimatedCost: number; kind: 'merchandise' | 'service' };
  // Customer pre-orders affect the live books immediately, but their source
  // details remain editable in Review until the user explicitly finalizes them.
  reviewFinalized?: boolean;
  customerOrderId?: string;
  customerOrderOpening?: { sales: number; cost: number; collected: number; unearned: number; receivable: number; refundable: number };
  carriedInventoryCost?: number;
  carriedForward?: boolean;
  memo?: string;
  purpose?: string;
  semester?: '1st Semester' | '2nd Semester';
  reportingPeriod?: 'August to December' | 'January to May';
  reportingYear?: number;
  fundingSourceId?: string;
  sponsorshipKind?: 'cash' | 'food' | 'supplies';
  counterpartyName?: string;
  eventRelated: boolean;
  donorRestriction?: 'none' | 'satisfied-in-period' | 'temporary';
  restrictionEventPeriod?: 'same-period' | 'future';
  membershipUnpaidAmount?: number;
  membershipTotalFees?: number;
  membershipPeriodStartDate?: string;
  membershipCollections?: DatedAmountRecord[];
  deferredAmount?: number;
  expectedUsePeriod?: 'within' | 'next';
  prepaidAssetCategory?: 'awards' | 'supplies' | 'wifi' | 'rent' | 'uniform';
  prepaidAssetItem?: string;
  prepaidAssetQuantity?: number;
  prepaidAssetPurchasePrice?: number;
  prepaidAssetPaymentMethod?: 'organization-funds' | 'officer-personal' | 'officer-advance' | 'combination' | 'not-yet-paid';
  prepaidAssetExpenseAccountCode?: string;
  prepaidAssetDownpaymentEntryId?: string;
  prepaidAssetDownpaymentAmount?: number;
  prepaidAssetPayableAmount?: number;
  prepaidAssetPurpose?: 'event' | 'general';
  priorPeriodPayableAccountCode?: string;
  priorPeriodPayablePaymentAmount?: number;
  priorPeriodPayablePaymentMethod?: 'organization-funds' | 'officer-personal' | 'officer-advance' | 'combination';
  inventoryCost?: number;
  merchandiseItem?: string;
  merchandiseBatch?: string;
  merchandisePurchaseDate?: string;
  merchandisePrepaymentEntryId?: string;
  merchandisePrepaymentAmount?: number;
  merchandiseQuantity?: number;
  merchandisePaymentMethod?: 'organization-funds' | 'officer-personal' | 'organization-advance' | 'advance-and-personal' | 'not-yet-paid';
  merchandiseOrganizationPayment?: number;
  merchandiseOrganizationPayments?: DatedAmountRecord[];
  merchandiseOfficerPayment?: number;
  merchandiseOfficerPayments?: DatedAmountRecord[];
  merchandiseAdvancePayment?: number;
  merchandiseAdvancePayments?: DatedAmountRecord[];
  merchandiseReimbursement?: number;
  merchandiseReimbursements?: DatedAmountRecord[];
  merchandisePayableAmount?: number;
  merchandiseBatchEntryId?: string;
  merchandiseQuantitySold?: number;
  merchandiseSellingPrice?: number;
  merchandiseTotalSales?: number;
  merchandiseCollectionMethod?: 'not-yet-collected' | 'organization-direct' | 'officer-to-remit';
  merchandiseCollections?: DatedAmountRecord[];
  merchandiseRemittances?: DatedAmountRecord[];
  merchandiseAccountsReceivable?: number;
  merchandiseDueFromOfficer?: number;
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
  // Reversals preserve both sides by default. Review also offers an explicit
  // confirmed permanent-delete action for test or correction workflows.
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
  // The org's currently active semester, set via the Navbar's fiscal year
  // picker (see reportingPeriod.ts for the canonical Semester type — kept
  // as a literal union here rather than imported, since types.ts otherwise
  // depends on nothing outside itself). Empty until the org sets it once.
  // Drives which semester-restricted classification rules are selectable
  // (see availableInSemester on ClassificationRuleWithWorkflow).
  semester?: '1st Semester' | '2nd Semester' | '';
  // The starting calendar year set alongside semester (e.g. 2021 for
  // "FY 2021-2022"). Both are set once, together, via the Navbar's fiscal
  // year picker, and every transaction now inherits them automatically
  // instead of asking again per-transaction.
  reportingYear?: number;
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
  revenueClosingEntryId?: string;
  expenseClosingEntryId?: string;
  incomeSummaryClosingEntryId?: string;
  completed?: boolean;
}

export type ActivityFeeStatus =
  | 'receivable'
  | 'scheduled'
  | 'postponed'
  | 'refund-due'
  | 'complete';

export interface ActivityFeeHistoryItem {
  id: string;
  date: string;
  reportingPeriod: string;
  action: 'initial' | 'collection' | 'held' | 'postponed' | 'cancelled-refundable' | 'cancelled-nonrefundable' | 'refund' | 'excess-refund' | 'excess-nonrefundable' | 'excess-refund-deferred';
  amount: number;
  journalEntryId?: string;
}

// A transaction the user started but hasn't finished/posted yet — saved from
// the Transactions form via "Save as Draft" whenever required data is still
// missing, then resumed and finalized from Review. `formState` is a generic
// bag rather than a strict shape here (types.ts otherwise depends on
// nothing outside itself) — Transactions.tsx owns the real shape and casts
// on read. Never touches the ledger/account balances until actually posted.
export interface TransactionDraft {
  id: string;
  savedAt: string;
  // Mirrors TransactionCategoryId from lib/transactionCategories.ts, kept
  // as a plain string here for the same dependency-free reason as above.
  category: string | null;
  label: string;
  formState: Record<string, unknown>;
}

export interface ActivityFeeRecord {
  id: string;
  reference: string;
  eventName: string;
  totalExpected: number;
  totalCollected: number;
  totalRefunded: number;
  receivableBalance: number;
  deferredBalance: number;
  refundLiabilityBalance?: number;
  status: ActivityFeeStatus;
  eventDate?: string;
  priorPeriodCollected?: number;
  collections?: DatedAmountRecord[];
  createdAt: string;
  updatedAt: string;
  history: ActivityFeeHistoryItem[];
}

export interface FinancialStatementHistoryRecord {
  id: string;
  generatedAt: string;
  schoolYear: string;
  semester: '1st Semester' | '2nd Semester';
  period: 'August to December' | 'January to May';
  startDate: string;
  endDate: string;
  action: 'Print' | 'Export PDF' | 'Export Excel';
  statements: string[];
  ledgerBalances: Array<{
    accountCode: string;
    accountName: string;
    accountType: AccountType;
    normalBalance: NormalBalanceType;
    balance: number;
  }>;
  statementTotals: {
    totalAssets: number;
    totalLiabilities: number;
    totalFundBalance: number;
    totalRevenue: number;
    totalExpenses: number;
    netSurplus: number;
    beginningCash: number;
    endingCash: number;
    beginningFundBalance: number;
    endingFundBalance: number;
  };
}

export interface ReportingPeriodWorkspace {
  key: string;
  schoolYear: string;
  semester: '1st Semester' | '2nd Semester';
  reportingYear: number;
  createdAt: string;
  updatedAt: string;
  journalEntries: JournalEntry[];
  projects: Project[];
  closedFiscalYears: ClosingRecord[];
  receiptAttachments: ReceiptAttachment[];
  activityFeeRecords: ActivityFeeRecord[];
  draftTransactions: TransactionDraft[];
  // Balances brought forward from the immediately preceding reporting period.
  // Optional so existing localStorage workspaces and older backups remain valid.
  openingBalances?: Record<string, number>;
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
  activityFeeRecords?: ActivityFeeRecord[];
  // Optional for compatibility with backups created before draft
  // transactions existed.
  draftTransactions?: TransactionDraft[];
  financialStatementHistory?: FinancialStatementHistoryRecord[];
  reportingPeriodWorkspaces?: ReportingPeriodWorkspace[];
}
