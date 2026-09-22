import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  Account,
  JournalEntry,
  Project,
  AuditLog,
  AppSettings,
  ClassificationRule,
  BackupPayload,
  ClosingRecord,
  TransactionMetadata,
  ReceiptAttachment,
  ReceiptAttachmentDraft,
  CustomClassificationRule
} from '../types';
import { validateBackupPayload } from '../lib/backupValidation';
import { computeAccountBalances, computeTypeTotals } from '../lib/accountTotals';
import { computeClosingEntryLines, findFiscalCloseBlockers } from '../lib/closingEntries';
import { linkReceiptIdsToEntry } from '../lib/receiptAttachments';
import { getEffectiveClassificationRules, validateCustomTransactionRule } from '../lib/customTransactionRules';

// The default catch-all project and the account closing entries post their
// net income plug to — same constants Transactions.tsx and INITIAL_PROJECTS
// use by string literal, named here for the one new consumer that needs to
// reference them without a hardcoded string of its own.
const GENERAL_FUND_PROJECT = 'General Fund Operations';
const GENERAL_FUND_BALANCE_CODE = '3010';

// Extended classification rule shape used by the rule-based classification
// engine below. It builds on the base `ClassificationRule` shape from
// ../types by adding `purposeOptions`. Defined locally so the shared
// ../types module does not need to change.
export interface ClassificationRuleWithWorkflow extends ClassificationRule {
  // Question A from the posting-engine build plan ("what was it for?").
  // Present only on rules whose category is genuinely ambiguous the way
  // the working paper's own "Payment for Meals" example is (Sheet2): the
  // same keyword can mean different things depending on purpose, which
  // changes the description and whether the expense is Event-Related —
  // but not the debit account itself, which the keyword match already
  // fixed. Absent on every other (unambiguous) rule, which is what makes
  // the Transactions form show this question only when it's needed.
  purposeOptions?: PurposeOption[];

  // Marks the "Cash Collection of Current School Year Membership Fees"
  // category from the working paper (row 3-4): one selection needs TWO
  // mandatory answers that together post two journal lines, so full-period
  // revenue is never understated relative to what's actually collected in
  // cash. See the accrual-completion question on the Transactions form.
  requiresAccrualCompletion?: boolean;

  // Marks a category where the money paid can plausibly outlive the
  // period it was paid in — event supplies bought ahead of the event,
  // materials not all used yet, and the like (the client's own flowchart:
  // "what amount is not yet used/consumed/expired/benefited?"). Absent on
  // routine, immediately-consumed categories (utilities, rent, salaries,
  // bank charges) so THOSE stay a single question-free entry. Present
  // rules drive the "How much of this is not yet used?" question on the
  // Transactions form, which defers that portion into Prepaid Expenses
  // (1260) instead of expensing it immediately — see PREPAID_EXPENSE_CODE
  // in src/lib/reviewEngine.ts, which resolves it later.
  mayDeferPortion?: boolean;
  sponsorshipKind?: 'cash' | 'food' | 'supplies';
}

export interface PurposeOption {
  label: string;
  description: string;
}

// Standard Chart of Accounts
export const INITIAL_ACCOUNTS: Account[] = [
  // Assets (Normal: Debit)
  // 1010 keeps its original code so existing journal entries and any data
  // already saved in localStorage still resolve correctly — only its name
  // narrows from the combined "Cash & Cash Equivalents" now that physical
  // cash and bank/e-wallet funds are tracked as separate accounts (see
  // CASH_ACCOUNT_CODES in src/lib/cashAccounts.ts, which both this account
  // and 1015 belong to).
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: 'Physical cash held directly by the organization (petty cash, cash box)', isActive: true },
  { code: '1015', name: 'Cash in Bank', type: 'Assets', normalBalance: 'Debit', description: 'Funds held in bank accounts, GCash, Maya, and other e-wallets', isActive: true },
  { code: '1200', name: 'Receivables', type: 'Assets', normalBalance: 'Debit', description: 'Uncollected amounts due from sponsors, partners, and other receivables', isActive: true },
  { code: '1250', name: 'Advances to Officers', type: 'Assets', normalBalance: 'Debit', description: 'Cash advances given to officers for organization expenses, pending liquidation', isActive: true },
  // The matching principle, generalized: whenever a transaction's own
  // classification rule allows it (mayDeferPortion — see DEFAULT_RULES),
  // the portion not yet used/consumed/benefited this period lands here
  // instead of being expensed immediately, and REVIEW (src/lib/reviewEngine.ts)
  // reclassifies it into the real expense account once it's actually used.
  { code: '1260', name: 'Prepaid Expenses', type: 'Assets', normalBalance: 'Debit', description: 'Cash paid for goods/services not yet used, consumed, or benefited from this period', isActive: true },
  { code: '1500', name: 'Equipment & Tools', type: 'Assets', normalBalance: 'Debit', description: 'Laptops, computers, hardware, tools, and other equipment used by the organization', isActive: true },
  // Contra-assets: Credit-normal despite being Assets-type accounts, so they
  // reduce Total Assets instead of adding to it (see isContraAccount in
  // src/lib/accountTotals.ts, which every Total Assets calculation relies on
  // to net these correctly). Kept per-category (Equipment vs. Furniture &
  // Fixtures), matching the working paper's own rows 20 and 28 exactly,
  // rather than one shared generic pair.
  { code: '1550', name: 'Accumulated Depreciation - Equipment', type: 'Assets', normalBalance: 'Credit', description: 'Cumulative depreciation charged against Equipment & Tools to date', isActive: true },
  { code: '1600', name: 'Property & Facilities', type: 'Assets', normalBalance: 'Debit', description: 'Real estate and facilities owned/held by the organization', isActive: true },
  { code: '1650', name: 'Furniture & Fixtures', type: 'Assets', normalBalance: 'Debit', description: 'Desks, chairs, cabinets, and other furnishings owned by the organization', isActive: true },
  { code: '1660', name: 'Accumulated Depreciation - Furniture & Fixtures', type: 'Assets', normalBalance: 'Credit', description: 'Cumulative depreciation charged against Furniture & Fixtures to date', isActive: true },
  { code: '1700', name: 'Inventory - Merchandise', type: 'Assets', normalBalance: 'Debit', description: 'Goods purchased for resale (organization merchandise, apparel, etc.)', isActive: true },
  { code: '1710', name: 'Donated Food Supplies', type: 'Assets', normalBalance: 'Debit', description: 'Food received from sponsors and held until consumed or distributed for an event', isActive: true },
  { code: '1720', name: 'Donated Event Supplies', type: 'Assets', normalBalance: 'Debit', description: 'Non-cash supplies received from sponsors and held until used or distributed', isActive: true },
  // These two exist so a treasurer can post to them via "Advanced: Override
  // Accounts Manually" on the Transactions form, but deliberately carry no
  // classification rule: a keyword match would have to guess whether an
  // entry is the cash collection or the accrual/billing side of a
  // membership-dues or inter-org transaction, and that guess isn't ours to
  // make (same principle as the funding-source question already applies
  // elsewhere — see workingPaper.fixtures.ts's own note on not normalizing
  // ambiguity away).
  { code: '1300', name: 'Membership Dues Receivable', type: 'Assets', normalBalance: 'Debit', description: 'Membership dues billed to members but not yet collected', isActive: true },
  { code: '1350', name: 'Due from Other Organization', type: 'Assets', normalBalance: 'Debit', description: 'Amounts owed to the organization by another organization or affiliate', isActive: true },

  // Liabilities (Normal: Credit)
  // Renamed from the generic "Accounts Payable" to match the working
  // paper's own exact term — it distinguishes this (amounts owed directly
  // to a supplier/vendor) from Due to Officers (owed to a person) in the
  // REVIEW settlement mechanism, which asks a different question for each.
  { code: '2010', name: 'Due to Supplier', type: 'Liabilities', normalBalance: 'Credit', description: 'Outstanding unpaid bills owed directly to a supplier or vendor', isActive: true },
  { code: '2050', name: 'Due to Officers', type: 'Liabilities', normalBalance: 'Credit', description: 'Amounts owed to officers who paid organization expenses out of their own money, pending reimbursement', isActive: true },
  { code: '2200', name: 'Loans & Financial Obligations', type: 'Liabilities', normalBalance: 'Credit', description: 'Loans and other financial obligations payable within a year', isActive: true },
  { code: '2300', name: 'Accrued Liabilities', type: 'Liabilities', normalBalance: 'Credit', description: 'Accrued unpaid expenses such as taxes or interest', isActive: true },
  
  // Fund Balance / Equity (Normal: Credit)
  { code: '3010', name: 'General Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: 'Unrestricted accumulated fund balances', isActive: true },
  { code: '3020', name: 'Restricted Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: 'Donor-restricted capital or specific reserves', isActive: true },
  
  // Revenue (Normal: Credit)
  { code: '4010', name: 'Organization Income', type: 'Revenue', normalBalance: 'Credit', description: 'Income earned through the organization’s programs and services', isActive: true },
  { code: '4020', name: 'Government Grants', type: 'Revenue', normalBalance: 'Credit', description: 'State and federal funding allocations', isActive: true },
  // Renamed to match the working paper's own account name exactly — it's
  // the "No" / same-period-"Yes" outcome of the donor-restriction question
  // (see the donation/restriction branching logic in Transactions.tsx).
  { code: '4030', name: 'Contributions Revenue - Unrestricted', type: 'Revenue', normalBalance: 'Credit', description: 'Donations and sponsorships with no donor-imposed restriction, or whose restriction was already satisfied this period', isActive: true },
  // The other outcome of that same question: a donor-restricted
  // contribution whose triggering event hasn't happened yet this period.
  // Stays here (not moved to Fund Balance) until a "Release from
  // Restriction" transaction reclassifies it — matching the paper's own
  // Situation 5.3, whose G-column literally reads "Contribution Revenue -
  // Restricted", a Revenue account, not an equity/fund-balance one.
  { code: '4035', name: 'Contributions Revenue - Temporarily Restricted', type: 'Revenue', normalBalance: 'Credit', description: 'Donor-restricted contributions whose triggering event has not yet occurred this period', isActive: true },
  { code: '4040', name: 'Membership Dues', type: 'Revenue', normalBalance: 'Credit', description: 'Dues collected from members', isActive: true },
  { code: '4050', name: 'Other Income', type: 'Revenue', normalBalance: 'Credit', description: 'Miscellaneous income not covered by another revenue account (cashback, advertising revenue, cash prizes received, ticket sales, etc.)', isActive: true },
  // Split out from Other Income per the client's revised note sheet: renting
  // out projector/extension wire/other equipment, and printing services, now
  // get their own line instead of being lumped into Miscellaneous Income.
  { code: '4055', name: 'Rental Revenues', type: 'Revenue', normalBalance: 'Credit', description: 'Income from renting out equipment (projector, extension wire, etc.) and from printing services', isActive: true },
  { code: '4060', name: 'Interest Income', type: 'Revenue', normalBalance: 'Credit', description: 'Interest earned on bank deposits or investments', isActive: true },
  { code: '4070', name: 'Merchandise Sales', type: 'Revenue', normalBalance: 'Credit', description: 'Revenue from selling organization merchandise or apparel', isActive: true },
  { code: '4080', name: 'Ticket Sales', type: 'Revenue', normalBalance: 'Credit', description: 'Revenue from ticket sales to events', isActive: true },

  // Expenses (Normal: Debit)
  { code: '5010', name: 'Salaries & Wages', type: 'Expenses', normalBalance: 'Debit', description: 'Staff payroll, social security, and benefits', isActive: true },
  { code: '5020', name: 'Rent Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Monthly lease cost for office spaces', isActive: true },
  { code: '5030', name: 'Utilities Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Electricity, water, gas, and internet fees', isActive: true },
  { code: '5040', name: 'Office Supplies', type: 'Expenses', normalBalance: 'Debit', description: 'Stationary, postage, and administrative sundries', isActive: true },
  { code: '5050', name: 'Travel & Transportation', type: 'Expenses', normalBalance: 'Debit', description: 'Business travel, flights, hotels, and mileage', isActive: true },
  // Added to support the Training Expense and Maintenance Expense
  // classification categories used by the rule-based engine below. These are
  // additive entries only — they plug into the existing generic balance,
  // totals, and statement calculations without any logic changes.
  { code: '5060', name: 'Training & Seminar Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Costs for staff training, seminars, workshops, and certifications', isActive: true },
  { code: '5070', name: 'Repairs & Maintenance Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Costs for repairing and maintaining equipment and facilities', isActive: true },
  // Added to support the "meal(s)" classification rule below, the concrete
  // example (working paper Sheet2, "Payment for Meals") that demonstrates
  // the purpose question (Question A) — see purposeOptions on that rule.
  { code: '5080', name: 'Meals & Refreshments', type: 'Expenses', normalBalance: 'Debit', description: 'Food and refreshments for meetings, events, and participants', isActive: true },
  { code: '5090', name: 'Depreciation Expense - Equipment', type: 'Expenses', normalBalance: 'Debit', description: 'Periodic depreciation charged against Equipment & Tools', isActive: true },
  { code: '5095', name: 'Depreciation Expense - Furniture & Fixtures', type: 'Expenses', normalBalance: 'Debit', description: 'Periodic depreciation charged against Furniture & Fixtures', isActive: true },
  { code: '5100', name: 'Bank Charges', type: 'Expenses', normalBalance: 'Debit', description: 'Bank fees, service charges, and transaction fees', isActive: true },
  { code: '5110', name: 'General Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Miscellaneous operating expenses not covered by another category', isActive: true },
  { code: '5120', name: 'Awards & Prizes Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Awards, prizes, and incentives given out during events and competitions', isActive: true },
  { code: '5130', name: 'Communication Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Phone, mobile load, and other communication costs', isActive: true },
  { code: '5140', name: 'Printing Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Printing, photocopying, and reproduction costs', isActive: true },
  { code: '5150', name: 'Freight Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Freight, shipping, and delivery costs', isActive: true },
  { code: '5160', name: 'Supplies Expense', type: 'Expenses', normalBalance: 'Debit', description: 'General event and operational supplies (distinct from administrative Office Supplies)', isActive: true },
  { code: '5170', name: 'Loss from Spoilage', type: 'Expenses', normalBalance: 'Debit', description: 'Donated food or supplies that expired, spoiled, or became unusable', isActive: true },
  { code: '5180', name: 'Uniform Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Uniforms and organization apparel for members and officers', isActive: true },
  { code: '5190', name: 'Tokens & Recognition Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Tokens, certificates, and recognition items for volunteers and participants', isActive: true },
  { code: '5200', name: 'Honoraria Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Honoraria paid to guest speakers and resource persons', isActive: true },
  { code: '5210', name: 'Membership Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Dues and fees the organization itself pays to join another association or federation', isActive: true },
  { code: '5220', name: 'Service Charge', type: 'Expenses', normalBalance: 'Debit', description: 'Third-party service charges (distinct from Bank Charges)', isActive: true },
  { code: '5230', name: 'Donation Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Donations given out by the organization to other causes or organizations', isActive: true },
];

// Sample Projects — fabricated demo programs and budgets, opt-in only via
// loadSampleData(). A real organization's own numbers, not this, is what
// should appear anywhere budgets are charted (see DEFAULT_PROJECTS below).
const INITIAL_PROJECTS: Project[] = [
  { id: 'proj-1', name: 'General Fund Operations', budget: 500000, status: 'Active', description: 'Standard administrative and overhead operations' },
  { id: 'proj-2', name: 'Leadership Development Program', budget: 120000, status: 'Active', description: 'Core product research and engineering sprint' },
  { id: 'proj-3', name: 'Community Outreach Program', budget: 85000, status: 'Active', description: 'Annual community academic support program' },
  { id: 'proj-4', name: 'Fundraising Program 2026', budget: 150000, status: 'Active', description: 'Applied science exploration and dataset synthesis' },
];

// What a brand-new organization actually starts with: just the one
// always-needed catch-all fund, at its real (zero, not-yet-set) budget —
// not the fabricated demo programs above.
const DEFAULT_PROJECTS: Project[] = [
  { id: 'proj-1', name: 'General Fund Operations', budget: 0, status: 'Active', description: 'Default fund for transactions not tied to a specific program or event.' },
];

// Initial Journal Entries
const INITIAL_JOURNALS: JournalEntry[] = [
  {
    id: 'je-1',
    reference: 'JE-0001',
    date: '2026-01-01',
    description: 'Initial Capital Funding',
    project: 'General Fund',
    lines: [
      { accountCode: '1010', debit: 150000, credit: 0 },
      { accountCode: '3010', debit: 0, credit: 150000 }
    ]
  },
  {
    id: 'je-2',
    reference: 'JE-0002',
    date: '2026-01-15',
    description: 'Organization Laptop Purchase',
    project: 'Leadership Development Program',
    lines: [
      { accountCode: '1500', debit: 25000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 25000 }
    ]
  },
  {
    id: 'je-3',
    reference: 'JE-0003',
    date: '2026-02-01',
    description: 'Sponsor Donation Received',
    project: 'General Fund Operations',
    lines: [
      { accountCode: '1010', debit: 50000, credit: 0 },
      { accountCode: '2200', debit: 0, credit: 50000 }
    ]
  },
  {
    id: 'je-4',
    reference: 'JE-0004',
    date: '2026-02-12',
    description: 'Paid Q1 Office Lease Rent',
    project: 'General Fund',
    lines: [
      { accountCode: '5020', debit: 6000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 6000 }
    ]
  },
  {
    id: 'je-5',
    reference: 'JE-0005',
    date: '2026-03-01',
    description: 'Fundraising Event Collection',
    project: 'Leadership Development Program',
    lines: [
      { accountCode: '1200', debit: 35000, credit: 0 },
      { accountCode: '4010', debit: 0, credit: 35000 }
    ]
  },
  {
    id: 'je-6',
    reference: 'JE-0006',
    date: '2026-03-15',
    description: 'Electric and Water Utilities Payment',
    project: 'General Fund',
    lines: [
      { accountCode: '5030', debit: 4500, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 4500 }
    ]
  },
  {
    id: 'je-7',
    reference: 'JE-0007',
    date: '2026-04-05',
    description: 'University Grant Received',
    project: 'Fundraising Program 2026',
    lines: [
      { accountCode: '1010', debit: 40000, credit: 0 },
      { accountCode: '4020', debit: 0, credit: 40000 }
    ]
  },
  {
    id: 'je-8',
    reference: 'JE-0008',
    date: '2026-04-20',
    description: 'Fundraising Event Collection',
    project: 'Leadership Development Program',
    lines: [
      { accountCode: '1010', debit: 20000, credit: 0 },
      { accountCode: '1200', debit: 0, credit: 20000 }
    ]
  },
  {
    id: 'je-9',
    reference: 'JE-0009',
    date: '2026-05-10',
    description: 'Q1 Staff Salaries Payment',
    project: 'General Fund Operations',
    lines: [
      { accountCode: '5010', debit: 18000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 18000 }
    ]
  },
  {
    id: 'je-10',
    reference: 'JE-0010',
    date: '2026-05-15',
    description: 'Travel Expenses Billed to Vendor',
    project: 'Community Outreach Program',
    lines: [
      { accountCode: '5050', debit: 3500, credit: 0 },
      { accountCode: '2010', debit: 0, credit: 3500 }
    ]
  }
];

// Default Auto-classification rules
//
// Each rule maps a keyword to a debit account, credit account, and default
// memo. `purposeOptions` (see Meals & Refreshments below) is the exception:
// only genuinely ambiguous categories carry it, to drive the "What Was It
// For?" question on the Transactions form.
//
// Rules are ordered so that more specific keywords are checked before more
// general ones that could otherwise match first (e.g. 'bond paper' before
// 'paper', 'printer ink' before both 'ink' and 'printer', 'ballpen' before
// 'pen', 'water bill' before 'water', 'electricity' before 'electric').
const DEFAULT_RULES: ClassificationRuleWithWorkflow[] = [
  // --- Utilities -----------------------------------------------------------
  { keyword: 'electricity', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Electricity Bill Payment' },
  { keyword: 'electric', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Electricity Utility Bill' },
  { keyword: 'power bill', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Power Bill Payment' },
  { keyword: 'water bill', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Water Bill Payment' },
  { keyword: 'water', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Water Utility Bill' },
  { keyword: 'internet', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Office Internet Fees' },
  { keyword: 'wifi', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Wifi / Internet Subscription' },
  { keyword: 'utility', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Utility Payments' },

  // --- Rental Revenues & Printing Services (checked very early) ------------------
  // Cash received from printing services or from renting out
  // projector/equipment/office supplies is revenue, not the matching
  // expense category — but the paper's own wording ("Cash received from
  // renting projector, extension wire and other small equipment and office
  // supplies") contains 'office supplies' and 'equipment' as literal
  // substrings, which would otherwise shadow this as an expense purchase.
  // Placed here, before every expense keyword that could collide, for
  // exactly that reason. Credits 4055 Rental Revenues (not 4050 Other
  // Income) per the client's revised note sheet.
  { keyword: 'income from printing', debitAccountCode: '1010', creditAccountCode: '4055', description: 'Income from Printing Services' },
  { keyword: 'received from printing', debitAccountCode: '1010', creditAccountCode: '4055', description: 'Income from Printing Services' },
  { keyword: 'income from projector rental', debitAccountCode: '1010', creditAccountCode: '4055', description: 'Income from Projector Rental' },
  { keyword: 'income from extension wire rental', debitAccountCode: '1010', creditAccountCode: '4055', description: 'Income from Extension Wire Rental' },
  { keyword: 'received from renting', debitAccountCode: '1010', creditAccountCode: '4055', description: 'Income from Renting Equipment/Supplies' },
  { keyword: 'rental income', debitAccountCode: '1010', creditAccountCode: '4055', description: 'Rental Income Received' },

  // --- Office Supplies ------------------------------------------------------
  { keyword: 'bond paper', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Office Supplies Purchase' },
  { keyword: 'printer ink', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Printer Ink and Toner Purchase' },
  { keyword: 'ink', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Printer Ink Supplies' },
  { keyword: 'folder', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Document Folders and Filing Supplies' },
  { keyword: 'ballpen', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Ballpen and Writing Supplies' },
  // Bare 'pen' moved to the very end of this array — see the comment there.
  { keyword: 'notebook', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Notebooks and Writing Pads' },
  { keyword: 'paper', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Printer Paper and Ink' },
  { keyword: 'office supplies', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Office Administrative Supplies' },

  // --- Depreciation (non-cash adjusting entry) --------------------------------
  // Checked before the Equipment Expense section below: a plausible entry
  // name like "Depreciation of Equipment" contains both 'depreciation' and
  // 'equipment', and only one keyword can win. Unlike every other rule, this
  // one's credit side is never cash — it's a contra-asset Accumulated
  // Depreciation account. The Transactions form still asks "Whose Money Paid
  // For This?" only when the credit account is a cash account (see
  // CASH_ACCOUNT_CODES), so this rule correctly skips that question entirely.
  //
  // The paper keeps depreciation per asset category (its own rows 20 and 28:
  // "Depreciation of Laptop" -> Equipment accounts, "Depreciation of Chairs"
  // -> Furniture & Fixtures accounts), so the furniture-specific phrasings
  // are checked first — same specificity-ordering principle as everywhere
  // else in this file — and bare 'depreciation' falls back to Equipment,
  // matching the paper's own explicitly worked example (row 20) rather than
  // an invented default.
  { keyword: 'depreciation of chair', debitAccountCode: '5095', creditAccountCode: '1660', description: 'Depreciation Expense - Furniture & Fixtures (Chairs)' },
  { keyword: 'depreciation of cabinet', debitAccountCode: '5095', creditAccountCode: '1660', description: 'Depreciation Expense - Furniture & Fixtures (Cabinet)' },
  { keyword: 'depreciation of table', debitAccountCode: '5095', creditAccountCode: '1660', description: 'Depreciation Expense - Furniture & Fixtures (Tables)' },
  { keyword: 'depreciation of desk', debitAccountCode: '5095', creditAccountCode: '1660', description: 'Depreciation Expense - Furniture & Fixtures (Desks)' },
  { keyword: 'depreciation', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation Expense - Equipment' },

  // --- Equipment Expense -----------------------------------------------------
  { keyword: 'laptop', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Developer Laptop Purchase' },
  { keyword: 'computer', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Hardware Equipment Purchase' },
  { keyword: 'monitor', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Computer Monitor Purchase' },
  { keyword: 'printer', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Printer Equipment Purchase' },
  { keyword: 'equipment', debitAccountCode: '1500', creditAccountCode: '1010', description: 'General Equipment Purchase' },
  { keyword: 'hardware', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Computer Hardware' },
  { keyword: 'server', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Hosting Server Equipment' },
  { keyword: 'furniture', debitAccountCode: '1650', creditAccountCode: '1010', description: 'Furniture & Fixtures Purchase' },

  // --- Inventory (goods for resale) ---------------------------------------------
  { keyword: 'inventory', debitAccountCode: '1700', creditAccountCode: '1010', description: 'Merchandise Inventory Purchase' },

  // --- Inter-organization loans (working paper row 20) ---------------------------
  // Checked before bare 'loan' below (money the org itself borrows) — this
  // is the opposite direction, money the org lends OUT to another org.
  { keyword: 'loan to other organization', debitAccountCode: '1350', creditAccountCode: '1010', description: 'Loan Given to Other Organization' },
  { keyword: 'loans to other organization', debitAccountCode: '1350', creditAccountCode: '1010', description: 'Loans Given to Other Organizations' },

  // --- Cash advance given to an officer (client note sheet, row 19) --------------
  // This is the ORIGINAL "give the advance" transaction — a pure asset
  // swap, no expense yet. It's what the REVIEW page's Advances to Officers
  // settlement (src/lib/reviewEngine.ts) resolves once the officer reports
  // back what it was actually used for.
  { keyword: 'cash advances given to organization officers', debitAccountCode: '1250', creditAccountCode: '1010', description: 'Cash Advances Given to Organization Officers' },
  { keyword: 'cash advance given to', debitAccountCode: '1250', creditAccountCode: '1010', description: 'Cash Advance Given to Officer' },

  // --- Training Expense -------------------------------------------------------
  { keyword: 'seminar', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Seminar / Conference Attendance Fee' },
  { keyword: 'workshop', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Workshop Training Fee' },
  { keyword: 'training', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Staff Training Expense' },
  { keyword: 'certification', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Professional Certification Fee' },

  // --- Travel Expense ----------------------------------------------------------
  { keyword: 'travel', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Business Travel Reimbursement' },
  { keyword: 'hotel', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Hotel Lodging Expenses' },
  { keyword: 'flight', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Flight Ticket Fare' },
  { keyword: 'taxi', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Local Transport Expense' },
  { keyword: 'transportation', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Transportation Expense' },
  { keyword: 'fare', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Fare / Local Transport Expense' },
  { keyword: 'fuel', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Fuel Expense' },
  { keyword: 'gasoline', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Gasoline Expense' },

  // --- Maintenance Expense ----------------------------------------------------
  { keyword: 'repair', debitAccountCode: '5070', creditAccountCode: '1010', description: 'Repair Service Expense' },
  { keyword: 'maintenance', debitAccountCode: '5070', creditAccountCode: '1010', description: 'Maintenance Service Expense' },
  { keyword: 'fixing', debitAccountCode: '5070', creditAccountCode: '1010', description: 'Equipment Fixing / Repair Expense' },

  // --- Meals & Refreshments (Question A demonstration) -------------------------
  // The keyword alone fixes the debit account (Meals & Refreshments), but
  // not the description or whether it's Event-Related — that depends on
  // purpose, exactly as the working paper's Sheet2 "Payment for Meals"
  // example demonstrates. The two options below are that example's own two
  // stated purposes (C4/C9/C14 vs C19), which is why this is the one rule
  // in the whole set that carries purposeOptions: it's the paper's own
  // worked case for an ambiguous category, not an invented one.
  {
    keyword: 'meal',
    debitAccountCode: '5080',
    creditAccountCode: '1010',
    description: 'Meals and Refreshments',
    // Food bought ahead of a future event isn't "used" until that event
    // happens — see mayDeferPortion's doc comment.
    mayDeferPortion: true,
    purposeOptions: [
      {
        label: 'Meals for event participants',
        description: 'Meals and Refreshments for event participants',
      },
      {
        label: 'Meals for officers during a regular meeting',
        description: 'Meals and Refreshments for a regular meeting',
      },
    ],
  },

  // --- Checked before 'rent'/'lease' below ----------------------------------------
  // "current school year" contains 'rent' as a substring ("cur-RENT"), and
  // "release from restriction" contains 'lease' ("re-LEASE") — both would
  // otherwise be shadowed by the Rent/Lease rules just below, the exact
  // "pen"-in-"expense" bug this file has hit before. Checked here, ahead of
  // Rent/Lease, for that reason.
  //
  // "Release from Restriction" (working paper row 20's note): once the
  // event a restricted contribution was tied to actually occurs, reclassify
  // it out of Restricted and into Unrestricted.
  { keyword: 'release from restriction', debitAccountCode: '4035', creditAccountCode: '4030', description: 'Release from Restriction — Restricted Contribution Now Unrestricted' },
  //
  // "Previous school year" collection settles an existing receivable
  // (Membership Dues Receivable, 1300) rather than hitting revenue again —
  // the revenue was already recognized in full when the dues were
  // originally billed (see 'current school year' below).
  { keyword: 'previous school year', debitAccountCode: '1010', creditAccountCode: '1300', description: "Collection of Previous School Year's Membership Fees Still Receivable" },
  // "Current school year" collection is the working paper's own accrual-
  // completion example (row 3-4): the cash-collected portion posted here
  // is only half the story — requiresAccrualCompletion drives the second
  // mandatory question on the Transactions form ("how much remains
  // unpaid?"), which posts the other half to Membership Dues Receivable so
  // full-period revenue is never understated.
  { keyword: 'current school year', debitAccountCode: '1010', creditAccountCode: '4040', description: 'Cash Collection of Current School Year Membership Fees', requiresAccrualCompletion: true },
  // "Cash prizes received" contains 'prize' as a substring, which would
  // otherwise be shadowed by the Awards & Prizes EXPENSE rule below (money
  // the org gives out, not receives) — checked here, ahead of it, for that
  // reason. This is the org winning/receiving a prize, not awarding one.
  { keyword: 'income from cash prizes', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Income from Cash Prizes Received' },
  { keyword: 'cash prizes received', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Income from Cash Prizes Received' },
  { keyword: 'advertising revenue', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Advertising Revenue' },

  // --- Rent / Lease (Miscellaneous Expense) -----------------------------------
  { keyword: 'rent', debitAccountCode: '5020', creditAccountCode: '1010', description: 'Monthly Office Rental Payment' },
  { keyword: 'lease', debitAccountCode: '5020', creditAccountCode: '1010', description: 'Office Space Lease' },

  // --- Payroll (Miscellaneous Expense) ------------------------------------------
  { keyword: 'salary', debitAccountCode: '5010', creditAccountCode: '1010', description: 'Staff Payroll Disbursement' },
  { keyword: 'wage', debitAccountCode: '5010', creditAccountCode: '1010', description: 'Hourly Wages Pay' },
  { keyword: 'payroll', debitAccountCode: '5010', creditAccountCode: '1010', description: 'General Staff Payroll' },

  // --- Other Operating Expenses ---------------------------------------------------
  // 'donation expense' and 'service charge' are deliberately placed here,
  // before Revenue & Funding, so they're checked ahead of the bare
  // 'donation' and 'service' keywords below — otherwise "Donation Expense to
  // Charity" would incorrectly match the revenue-side 'donation' rule, and
  // "Service Charge Deduction" would incorrectly match the revenue-side
  // 'service' rule (same specificity-ordering principle as 'bond paper'
  // before 'paper').
  { keyword: 'bank charge', debitAccountCode: '5100', creditAccountCode: '1010', description: 'Bank Service Charge' },
  { keyword: 'miscellaneous', debitAccountCode: '5110', creditAccountCode: '1010', description: 'Miscellaneous Operating Expense' },
  // Awards/prizes, printing, event supplies, uniforms, and tokens are
  // exactly the kind of thing the client's flowchart has in mind — bought
  // ahead of an event, not necessarily all handed out/used immediately —
  // so each carries mayDeferPortion. Routine bills just below (freight,
  // shipping) don't: a shipment either arrived or it didn't.
  { keyword: 'award', debitAccountCode: '5120', creditAccountCode: '1010', description: 'Awards & Prizes Expense', mayDeferPortion: true },
  { keyword: 'prize', debitAccountCode: '5120', creditAccountCode: '1010', description: 'Awards & Prizes Expense', mayDeferPortion: true },
  { keyword: 'communication', debitAccountCode: '5130', creditAccountCode: '1010', description: 'Communication Expense' },
  { keyword: 'printing', debitAccountCode: '5140', creditAccountCode: '1010', description: 'Printing Expense', mayDeferPortion: true },
  { keyword: 'freight', debitAccountCode: '5150', creditAccountCode: '1010', description: 'Freight Expense' },
  { keyword: 'shipping', debitAccountCode: '5150', creditAccountCode: '1010', description: 'Shipping Expense' },
  { keyword: 'supplies', debitAccountCode: '5160', creditAccountCode: '1010', description: 'Event & Operational Supplies', mayDeferPortion: true },
  { keyword: 'uniform', debitAccountCode: '5180', creditAccountCode: '1010', description: 'Uniform Expense', mayDeferPortion: true },
  { keyword: 'token', debitAccountCode: '5190', creditAccountCode: '1010', description: 'Tokens & Recognition Expense', mayDeferPortion: true },
  { keyword: 'honorari', debitAccountCode: '5200', creditAccountCode: '1010', description: 'Honoraria Expense' },
  // 'national membership' (matching the paper's own real wording, "Paid
  // national membership fee") rather than bare 'membership fee': the org's
  // own members paying dues IN also gets naturally described as a
  // "membership fee" (see the revenue-side 'membership fee' keyword below),
  // and "national membership fee" contains that phrase as a substring — so
  // the more specific keyword has to be checked first, same ordering
  // principle as 'donation expense'/'service charge' above.
  { keyword: 'national membership', debitAccountCode: '5210', creditAccountCode: '1010', description: 'Membership Fee Paid to Another Association' },
  { keyword: 'service charge', debitAccountCode: '5220', creditAccountCode: '1010', description: 'Service Charge Payment' },
  // Same collision, same fix, for "Paid for GCash Service Fee" — the
  // working paper's own actual wording. Without this, "service fee" falls
  // through to the bare 'service' revenue keyword below and misclassifies
  // an expense as revenue.
  { keyword: 'service fee', debitAccountCode: '5220', creditAccountCode: '1010', description: 'Service Fee Payment' },
  { keyword: 'donation expense', debitAccountCode: '5230', creditAccountCode: '1010', description: 'Donation Given by the Organization' },

  // --- Revenue & Funding ---------------------------------------------------------
  { keyword: 'consulting', debitAccountCode: '1010', creditAccountCode: '4010', description: 'Client Consulting Services' },
  { keyword: 'service', debitAccountCode: '1010', creditAccountCode: '4010', description: 'Professional Services Rendered' },
  { keyword: 'billed', debitAccountCode: '1200', creditAccountCode: '4010', description: 'Customer Invoice Billed' },
  { keyword: 'invoice', debitAccountCode: '1200', creditAccountCode: '4010', description: 'Customer Milestone Invoice' },
  { keyword: 'grant', debitAccountCode: '1010', creditAccountCode: '4020', description: 'Public Funding Grant Receipt' },
  { keyword: 'sponsorship donated food', debitAccountCode: '1710', creditAccountCode: '4030', description: 'Sponsorship - Donated Food', sponsorshipKind: 'food' },
  { keyword: 'sponsorship donated supplies', debitAccountCode: '1720', creditAccountCode: '4030', description: 'Sponsorship - Donated Supplies', sponsorshipKind: 'supplies' },
  { keyword: 'donation', debitAccountCode: '1010', creditAccountCode: '4030', description: 'Charitable Donation Received', sponsorshipKind: 'cash' },
  { keyword: 'sponsor', debitAccountCode: '1010', creditAccountCode: '4030', description: 'Sponsorship - Cash Contribution', sponsorshipKind: 'cash' },
  // Inter-org loans (above, in the Inventory section) are checked first —
  // this bare 'loan' is money the org itself borrows, the opposite
  // direction.
  { keyword: 'loan', debitAccountCode: '1010', creditAccountCode: '2200', description: 'Bank Loan Capital Funding' },
  { keyword: 'membership dues', debitAccountCode: '1010', creditAccountCode: '4040', description: 'Membership Dues Collected' },
  { keyword: 'membership fee', debitAccountCode: '1010', creditAccountCode: '4040', description: 'Membership Fees Collected' },
  { keyword: 'other income', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Other Income Received' },
  { keyword: 'interest', debitAccountCode: '1010', creditAccountCode: '4060', description: 'Interest Income Received' },
  { keyword: 'merchandise sales', debitAccountCode: '1010', creditAccountCode: '4070', description: 'Merchandise Sales Revenue' },
  // Entrance ticket sales groups into Miscellaneous Income with printing-
  // services and rental income (see the dedicated section near the top of
  // this array, checked earlier) — see the comment there for why.
  { keyword: 'ticket', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Cash Received from Entrance Ticket Sale' },

  // --- Office Supplies purchased on credit (Accounts Payable) --------------------
  { keyword: 'vendor bill', debitAccountCode: '5040', creditAccountCode: '2010', description: 'Office Supplies Billed by Vendor' },
  { keyword: 'on account', debitAccountCode: '5040', creditAccountCode: '2010', description: 'Vendor Purchase on Credit' },

  // --- Lowest priority: generic single-word keywords prone to false-positive
  // substring matches inside other, unrelated words. Pre-existing issue found
  // while adding the rules above: 'pen' is a substring of "expense" itself
  // (e-x-'p-e-n'-s-e), so with 'pen' checked early (its original position, in
  // the Office Supplies section) any transaction named e.g. "Travel Expense"
  // or "Rent Expense" — a very natural way to name one — would incorrectly
  // match Office Supplies before ever reaching 'travel' or 'rent'. Moving it
  // to dead last means every more specific keyword above (including
  // 'ballpen', which already covers the realistic phrasing) gets first
  // chance, and 'pen' only fires when truly nothing else matched.
  { keyword: 'pen', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Office Supplies Stationary' },
];

const INITIAL_LOGS: AuditLog[] = [
  { id: 'log-1', timestamp: '2026-05-27T01:00:00Z', action: 'System Init', details: 'Initialized Chart of Accounts. No transactions recorded yet.', user: 'System' },
];

interface FinanceContextType {
  accounts: Account[];
  journalEntries: JournalEntry[];
  projects: Project[];
  auditLogs: AuditLog[];
  settings: AppSettings;
  classificationRules: ClassificationRuleWithWorkflow[];
  customClassificationRules: CustomClassificationRule[];
  closedFiscalYears: ClosingRecord[];
  receiptAttachments: ReceiptAttachment[];

  addJournalEntry: (date: string, description: string, project: string, lines: { accountCode: string; debit: number; credit: number }[], eventName?: string, settlesEntryId?: string, transactionMeta?: TransactionMetadata) => JournalEntry;
  reverseJournalEntry: (id: string) => void;
  closeFiscalYear: (fiscalYear: string, closingDate: string) => void;
  attachReceiptsToEntry: (entryId: string, receipts: ReceiptAttachmentDraft[]) => void;
  addCustomClassificationRule: (description: string, debitAccountCode: string, creditAccountCode: string) => void;
  updateCustomClassificationRule: (id: string, updated: Partial<Pick<CustomClassificationRule, 'description' | 'debitAccountCode' | 'creditAccountCode' | 'isActive'>>) => void;
  
  addAccount: (account: Account) => void;
  updateAccount: (code: string, updated: Partial<Account>) => void;
  
  addProject: (name: string, budget: number, description: string) => void;
  updateProject: (id: string, updated: Partial<Project>) => void;
  
  updateSettings: (updated: Partial<AppSettings>) => void;

  formatCurrency: (value: number) => string;
  suggestTransactionClassification: (name: string) => {
    debitAccountCode: string;
    creditAccountCode: string;
    defaultDesc: string;
    purposeOptions?: PurposeOption[];
    requiresAccrualCompletion?: boolean;
    mayDeferPortion?: boolean;
    sponsorshipKind?: 'cash' | 'food' | 'supplies';
  } | null;
  
  accountBalances: Record<string, number>;
  totals: Record<string, number>; // Assets, Liabilities, etc.
  netIncome: number;
  isBalanced: boolean;
  clearAllData: () => void;
  loadSampleData: () => void;

  exportBackupData: () => BackupPayload;
  restoreBackupData: (payload: BackupPayload) => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const local = localStorage.getItem('ss_accounts');
    if (!local) return INITIAL_ACCOUNTS;

    // Backfill any default accounts (e.g. newly added ones like Cash in
    // Bank) that are missing from data already saved in this browser.
    // Additive only — never overwrites or removes an account the user
    // already has, so their own edits, custom accounts, and balances
    // (driven by journalEntries, saved separately) are untouched.
    const saved: Account[] = (JSON.parse(local) as Account[]).map(account =>
      account.code === '4035' && account.name === 'Contributions Revenue - Restricted'
        ? { ...account, name: 'Contributions Revenue - Temporarily Restricted' }
        : account
    );
    const savedCodes = new Set(saved.map(a => a.code));
    const missingDefaults = INITIAL_ACCOUNTS.filter(a => !savedCodes.has(a.code));
    return missingDefaults.length > 0
      ? [...saved, ...missingDefaults].sort((a, b) => a.code.localeCompare(b.code))
      : saved;
  });

  // New accounts start with an empty ledger, not the fabricated demo
  // transaction history — INITIAL_JOURNALS still exists and is used, but
  // only as the explicit, opt-in payload for loadSampleData() below.
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const local = localStorage.getItem('ss_journals');
    return local ? JSON.parse(local) : [];
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const local = localStorage.getItem('ss_projects');
    return local ? JSON.parse(local) : DEFAULT_PROJECTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const local = localStorage.getItem('ss_audit_logs');
    return local ? JSON.parse(local) : INITIAL_LOGS;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const local = localStorage.getItem('ss_settings');
    return local ? JSON.parse(local) : {
      fiscalYear: 'FY 2026',
      organizationName: 'Bicol University',
      currencySymbol: '₱',
      currencyCode: 'PHP',
    };
  });

  const [customClassificationRules, setCustomClassificationRules] = useState<CustomClassificationRule[]>(() => {
    const local = localStorage.getItem('ss_custom_rules');
    return local ? JSON.parse(local) : [];
  });
  const classificationRules = useMemo<ClassificationRuleWithWorkflow[]>(
    () => getEffectiveClassificationRules(DEFAULT_RULES, customClassificationRules),
    [customClassificationRules]
  );

  const [closedFiscalYears, setClosedFiscalYears] = useState<ClosingRecord[]>(() => {
    const local = localStorage.getItem('ss_closings');
    return local ? JSON.parse(local) : [];
  });

  const [receiptAttachments, setReceiptAttachments] = useState<ReceiptAttachment[]>(() => {
    const local = localStorage.getItem('ss_receipts');
    return local ? JSON.parse(local) : [];
  });

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('ss_accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('ss_journals', JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    localStorage.setItem('ss_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('ss_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem('ss_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('ss_closings', JSON.stringify(closedFiscalYears));
  }, [closedFiscalYears]);

  useEffect(() => {
    localStorage.setItem('ss_receipts', JSON.stringify(receiptAttachments));
  }, [receiptAttachments]);

  useEffect(() => {
    localStorage.setItem('ss_custom_rules', JSON.stringify(customClassificationRules));
  }, [customClassificationRules]);

  const logAudit = (action: string, details: string) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action,
      details,
      user: settings.organizationName,
    };
    setAuditLogs(prev => [newLog, ...prev].slice(0, 100)); // Cap at 100 logs
  };

  // Rule Based Classifier
  //
  // Looks up the first rule whose keyword appears in the transaction name and
  // returns its debit/credit account suggestions, description, and (when the
  // category is ambiguous) purposeOptions.
  const suggestTransactionClassification = (name: string) => {
    if (!name || name.trim().length === 0) return null;
    const lowerName = name.toLowerCase();

    // An exact match against a rule's own description always wins first —
    // e.g. picking "Office Supplies Purchase" from the Transaction Name
    // dropdown (Transactions.tsx). Not every description literally
    // contains its trigger keyword as a substring (the description is
    // meant to read naturally — "bond paper" -> "Office Supplies
    // Purchase" — while the keyword only has to be distinctive), so
    // without this, selecting a dropdown entry could fall through to the
    // substring search below and match nothing.
    const exactDescMatch = classificationRules.find(rule => rule.description.toLowerCase() === lowerName);
    if (exactDescMatch) {
      return {
        debitAccountCode: exactDescMatch.debitAccountCode,
        creditAccountCode: exactDescMatch.creditAccountCode,
        defaultDesc: exactDescMatch.description,
        purposeOptions: exactDescMatch.purposeOptions,
        requiresAccrualCompletion: exactDescMatch.requiresAccrualCompletion,
        mayDeferPortion: exactDescMatch.mayDeferPortion,
        sponsorshipKind: exactDescMatch.sponsorshipKind
      };
    }

    for (const rule of classificationRules) {
      if (lowerName.includes(rule.keyword)) {
        return {
          debitAccountCode: rule.debitAccountCode,
          creditAccountCode: rule.creditAccountCode,
          defaultDesc: rule.description,
          purposeOptions: rule.purposeOptions,
          requiresAccrualCompletion: rule.requiresAccrualCompletion,
          mayDeferPortion: rule.mayDeferPortion,
          sponsorshipKind: rule.sponsorshipKind
        };
      }
    }
    return null;
  };

  // Generate the next sequential JE-#### reference given the entries
  // posted so far (shared by new postings and by reversal postings, so
  // both draw their reference from the same counter).
  const generateNextReference = (entries: JournalEntry[]) => {
    const lastEntry = entries
      .filter(e => e.reference.startsWith('JE-'))
      .sort((a, b) => b.reference.localeCompare(a.reference))[0];

    let nextNum = 1;
    if (lastEntry) {
      const match = lastEntry.reference.match(/JE-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    return `JE-${String(nextNum).padStart(4, '0')}`;
  };

  // Helpers to add data
  const addJournalEntry = (
    date: string,
    description: string,
    project: string,
    lines: { accountCode: string; debit: number; credit: number }[],
    eventName?: string,
    settlesEntryId?: string,
    transactionMeta?: TransactionMetadata
  ) => {
    const reference = generateNextReference(journalEntries);
    const newEntry: JournalEntry = {
      id: `je-${Date.now()}`,
      reference,
      date,
      description,
      project,
      lines,
      ...(eventName ? { eventName } : {}),
      ...(settlesEntryId ? { settlesEntryId } : {}),
      ...(transactionMeta ? {
        transactionType: transactionMeta.transactionType,
        ...(transactionMeta.customName ? { customName: transactionMeta.customName } : {}),
        transactionDetails: transactionMeta.details,
      } : {})
    };

    setJournalEntries(prev => [...prev, newEntry]);
    logAudit('Create Journal Entry', `Posted journal entry ${reference}: ${description} (${settings.currencySymbol}${lines.reduce((s, l) => s + l.debit, 0).toLocaleString()})`);
    return newEntry;
  };

  // Posted entries are never hard-deleted. Correcting one posts a new
  // entry with every line's debit/credit swapped (a standard reversing
  // entry) and marks the original as reversed, so both sides of the
  // correction stay in the permanent, audit-visible record.
  const reverseJournalEntry = (id: string) => {
    const entry = journalEntries.find(e => e.id === id);
    if (!entry || entry.reversedByEntryId || entry.description.startsWith('Closing Entries')) return;

    const reference = generateNextReference(journalEntries);
    const reversalEntry: JournalEntry = {
      id: `je-${Date.now()}`,
      reference,
      date: new Date().toISOString().slice(0, 10),
      description: `Reversal of ${entry.reference}: ${entry.description}`,
      project: entry.project,
      lines: entry.lines.map(l => ({ accountCode: l.accountCode, debit: l.credit, credit: l.debit })),
      ...(entry.eventName ? { eventName: entry.eventName } : {}),
      ...(entry.settlesEntryId ? { settlesEntryId: entry.settlesEntryId } : {}),
      reversalOfEntryId: entry.id,
    };

    setJournalEntries(prev => [
      ...prev.map(e => e.id === id ? { ...e, reversedByEntryId: reversalEntry.id } : e),
      reversalEntry,
    ]);
    logAudit('Reverse Journal Entry', `Reversed ${entry.reference}: ${entry.description} (via new entry ${reference})`);
  };

  const addCustomClassificationRule = (description: string, debitAccountCode: string, creditAccountCode: string) => {
    const input = { description, debitAccountCode, creditAccountCode };
    const validation = validateCustomTransactionRule(input, accounts, DEFAULT_RULES, customClassificationRules);
    if (!validation.valid) throw new Error(validation.reason || 'Invalid custom transaction type.');
    const trimmedDescription = description.trim();
    const rule: CustomClassificationRule = {
      id: `custom-rule-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      keyword: trimmedDescription.toLowerCase(),
      description: trimmedDescription,
      debitAccountCode,
      creditAccountCode,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    setCustomClassificationRules(previous => [...previous, rule]);
    logAudit('Add Transaction Type', `Created custom transaction type ${trimmedDescription}.`);
  };

  const updateCustomClassificationRule = (
    id: string,
    updated: Partial<Pick<CustomClassificationRule, 'description' | 'debitAccountCode' | 'creditAccountCode' | 'isActive'>>
  ) => {
    const current = customClassificationRules.find(rule => rule.id === id);
    if (!current) throw new Error('Custom transaction type not found.');
    const merged = { ...current, ...updated, description: (updated.description ?? current.description).trim() };
    if (merged.isActive) {
      const validation = validateCustomTransactionRule(merged, accounts, DEFAULT_RULES, customClassificationRules, id);
      if (!validation.valid) throw new Error(validation.reason || 'Invalid custom transaction type.');
    }
    setCustomClassificationRules(previous => previous.map(rule => rule.id === id
      ? { ...merged, keyword: merged.description.toLowerCase() }
      : rule
    ));
    logAudit('Update Transaction Type', `Updated custom transaction type ${merged.description}.`);
  };

  const attachReceiptsToEntry = (entryId: string, receipts: ReceiptAttachmentDraft[]) => {
    if (receipts.length === 0) return;
    const entry = journalEntries.find(candidate => candidate.id === entryId);

    const records: ReceiptAttachment[] = receipts.map(receipt => ({ ...receipt, entryId }));
    setReceiptAttachments(previous => [...previous, ...records]);
    setJournalEntries(previous => previous.map(candidate => {
      if (candidate.id !== entryId) return candidate;
      return linkReceiptIdsToEntry(candidate, records.map(record => record.id));
    }));
    logAudit('Attach Receipt', `Added ${receipts.length} receipt image${receipts.length === 1 ? '' : 's'} to ${entry?.reference || entryId}.`);
  };

  // Closes a fiscal year: zeroes Revenue/Expenses as of closingDate into
  // General Fund Balance via one real journal entry, exactly like a
  // traditional closing entry. Nothing else needs to "carry forward" —
  // permanent accounts (Assets/Liabilities/Fund Balance) already are
  // running totals across every entry, so the next period picks up
  // wherever this one leaves off automatically.
  const closeFiscalYear = (fiscalYear: string, closingDate: string) => {
    if (closedFiscalYears.some(c => c.fiscalYear === fiscalYear)) {
      throw new Error(`${fiscalYear} has already been closed.`);
    }
    const blockers = findFiscalCloseBlockers(journalEntries, accounts);
    if (blockers.length > 0) {
      throw new Error(`Cannot close the fiscal year while ${blockers.length} transaction${blockers.length === 1 ? '' : 's'} remain incomplete in Review.`);
    }

    const entriesToDate = journalEntries.filter(je => je.date <= closingDate);
    const balancesToDate = computeAccountBalances(entriesToDate, accounts);
    const { lines, netIncome } = computeClosingEntryLines(balancesToDate, accounts, GENERAL_FUND_BALANCE_CODE);

    if (lines.length === 0) {
      throw new Error('Nothing to close — no Revenue or Expense activity as of this date.');
    }

    const entry = addJournalEntry(closingDate, `Closing Entries — ${fiscalYear}`, GENERAL_FUND_PROJECT, lines);

    const record: ClosingRecord = {
      id: `closing-${Date.now()}`,
      fiscalYear,
      closingDate,
      netIncome,
      journalEntryId: entry.id,
      closedAt: new Date().toISOString(),
    };
    setClosedFiscalYears(prev => [...prev, record]);
    logAudit('Close Fiscal Year', `Closed ${fiscalYear} as of ${closingDate}: net ${netIncome >= 0 ? 'surplus' : 'deficit'} of ${settings.currencySymbol}${Math.abs(netIncome).toLocaleString()} posted to Fund Balance via ${entry.reference}.`);
  };

  const addAccount = (account: Account) => {
    if (accounts.some(a => a.code === account.code)) {
      throw new Error(`Account code ${account.code} already exists.`);
    }
    setAccounts(prev => [...prev, account].sort((a, b) => a.code.localeCompare(b.code)));
    logAudit('Add Account', `Created account ${account.code} - ${account.name}`);
  };

  const updateAccount = (code: string, updated: Partial<Account>) => {
    setAccounts(prev => prev.map(a => a.code === code ? { ...a, ...updated } : a));
    const acc = accounts.find(a => a.code === code);
    if (acc) {
      logAudit('Update Account', `Updated account ${code} (${acc.name}) fields: ${Object.keys(updated).join(', ')}`);
    }
  };

  const addProject = (name: string, budget: number, description: string) => {
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name,
      budget,
      status: 'Active',
      description
    };
    setProjects(prev => [...prev, newProj]);
    logAudit('Add Activity', `Created new activity/program: ${name} (Budget: ${settings.currencySymbol}${budget.toLocaleString()})`);
  };

  const updateProject = (id: string, updated: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    const proj = projects.find(p => p.id === id);
    if (proj) {
      logAudit('Update Project', `Updated project ${proj.name}: ${Object.keys(updated).join(', ')}`);
    }
  };

  const updateSettings = (updated: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updated }));
    // Not logAudit(): its `user` field reads the organizationName already in
    // state, which is exactly what a rename hasn't updated yet — the org's
    // own audit trail would misattribute its first-ever entry to the
    // placeholder name it's in the middle of replacing.
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action: 'Update Settings',
      details: `Changed app settings: ${Object.keys(updated).join(', ')}`,
      user: updated.organizationName ?? settings.organizationName,
    };
    setAuditLogs(prev => [newLog, ...prev].slice(0, 100));
  };

  const formatCurrency = (val: number): string => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings.currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(val));
    
    const symbol = settings.currencySymbol;
    // Strip original symbol and prepend user-defined symbol
    const cleanNum = formatted.replace(/[a-zA-Z$₱€£¥\s]+/g, '').trim();
    
    if (val < 0) {
      return `(${symbol}${cleanNum})`;
    }
    return `${symbol}${cleanNum}`;
  };

  const clearAllData = () => {
    setJournalEntries([]);
    setReceiptAttachments([]);
    logAudit('Clear Data', 'All financial journal entries have been cleared.');
  };

  const loadSampleData = () => {
    setAccounts(INITIAL_ACCOUNTS);
    setJournalEntries(INITIAL_JOURNALS);
    setProjects(INITIAL_PROJECTS);
    setReceiptAttachments([]);
    logAudit('Load Sample Data', 'Reset database to original sample data.');
  };

  // Bundles everything persisted to localStorage into one downloadable file,
  // so a user's books survive a cleared cache, a browser switch, or a new
  // device — the only backup this local-persistence app has.
  const exportBackupData = (): BackupPayload => ({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    organizationName: settings.organizationName,
    accounts,
    journalEntries,
    projects,
    auditLogs,
    settings,
    closedFiscalYears,
    receiptAttachments,
    customClassificationRules,
  });

  // Replaces the entire workspace with a previously exported backup. The
  // caller (Settings page) is expected to have already shown the user a
  // confirmation summarizing what will be overwritten, since this is
  // destructive and cannot be undone from within the app. Computes the
  // restore's own audit log entry directly (rather than via logAudit) so it
  // is appended to the RESTORED logs, not the ones being replaced.
  const restoreBackupData = (payload: BackupPayload) => {
    const validation = validateBackupPayload(payload);
    if (!validation.valid) {
      throw new Error(validation.reason || 'Invalid backup file.');
    }

    const restoredLogs = Array.isArray(payload.auditLogs) ? payload.auditLogs : [];
    const restoreLogEntry: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action: 'Restore Backup',
      details: `Restored data from backup exported ${payload.exportedAt || 'an unknown date'} (${payload.organizationName || 'unnamed organization'}).`,
      user: settings.organizationName,
    };

    setAccounts(payload.accounts);
    setJournalEntries(payload.journalEntries);
    setProjects(Array.isArray(payload.projects) ? payload.projects : []);
    setAuditLogs([restoreLogEntry, ...restoredLogs].slice(0, 100));
    setSettings(payload.settings);
    setClosedFiscalYears(Array.isArray(payload.closedFiscalYears) ? payload.closedFiscalYears : []);
    setReceiptAttachments(Array.isArray(payload.receiptAttachments) ? payload.receiptAttachments : []);
    setCustomClassificationRules(Array.isArray(payload.customClassificationRules) ? payload.customClassificationRules : []);
  };

  // Computations
  const accountBalances = useMemo(
    () => computeAccountBalances(journalEntries, accounts),
    [journalEntries, accounts]
  );

  const totals = useMemo(
    () => computeTypeTotals(accountBalances, accounts),
    [accountBalances, accounts]
  );

  const netIncome = useMemo(() => {
    return totals.Revenue - totals.Expenses;
  }, [totals]);

  const isBalanced = useMemo(() => {
    // Total Assets = Total Liabilities + (Beginning Fund Balance + Net Income)
    const assets = totals.Assets;
    const liabilities = totals.Liabilities;
    const begFund = totals['Fund Balance'];
    const endingFund = begFund + netIncome;
    
    // We check if Total Assets matches Total Liabilities + Ending Fund Balance
    const difference = Math.abs(assets - (liabilities + endingFund));
    return difference < 0.01;
  }, [totals, netIncome]);

  return (
    <FinanceContext.Provider value={{
      accounts,
      journalEntries,
      projects,
      auditLogs,
      settings,
      classificationRules,
      customClassificationRules,
      closedFiscalYears,
      receiptAttachments,
      addJournalEntry,
      reverseJournalEntry,
      closeFiscalYear,
      attachReceiptsToEntry,
      addCustomClassificationRule,
      updateCustomClassificationRule,
      addAccount,
      updateAccount,
      addProject,
      updateProject,
      updateSettings,
      formatCurrency,
      suggestTransactionClassification,
      accountBalances,
      totals,
      netIncome,
      isBalanced,
      clearAllData,
      loadSampleData,
      exportBackupData,
      restoreBackupData
    }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
