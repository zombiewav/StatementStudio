import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  Account,
  JournalEntry,
  Project,
  AuditLog,
  AppSettings,
  ClassificationRule,
  BackupPayload,
  FinancialStatementHistoryRecord,
  ReportingPeriodWorkspace,
  ClosingRecord,
  TransactionMetadata,
  ReceiptAttachment,
  ReceiptAttachmentDraft,
  CustomClassificationRule,
  ActivityFeeRecord,
  DatedAmountRecord,
  JournalLine,
  TransactionDraft
} from '../types';
import { deleteSemesterRecords, precedingSemester } from '../lib/semesterDeletion';
import { validateBackupPayload } from '../lib/backupValidation';
import { computeAccountBalances, computeTypeTotals } from '../lib/accountTotals';
import { combineOpeningAndPeriodBalances, carryForwardOpeningBalances, OpeningBalances } from '../lib/reportingPeriodBalances';
import { computeClosingStageLines, findFiscalCloseBlockers } from '../lib/closingEntries';
import { linkReceiptIdsToEntry } from '../lib/receiptAttachments';
import { getEffectiveClassificationRules, validateCustomTransactionRule } from '../lib/customTransactionRules';
import { ActivityFeeFollowUp, ActivityFeeSchedule, buildActivityFeeFollowUp, buildActivityFeeReceivableCollections, buildInitialActivityFeeSchedule, buildScheduledActivityFeeRecognition } from '../lib/activityFees';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { carryForwardCustomerOrders, customerOrderFinalizationIssues, customerOrderReversalBlock } from '../lib/customerOrders';
import { isDateWithinReportingPeriod, reportingPeriodBounds } from '../lib/reportingPeriod';

// The default catch-all project and the account closing entries post their
// net income plug to — same constants Transactions.tsx and INITIAL_PROJECTS
// use by string literal, named here for the one new consumer that needs to
// reference them without a hardcoded string of its own.
const GENERAL_FUND_PROJECT = 'General Fund Operations';
const GENERAL_FUND_BALANCE_CODE = '3010';
const INCOME_SUMMARY_ACCOUNT_CODE = '3000';
const RETIRED_ACCOUNT_CODES = new Set(['1290', '1340', '1345', '1710', '1720', '2060']);
const BACKFILLED_DEFAULT_ACCOUNT_CODES = new Set([
  '1210', '1220', '1230', '1270', '1280', '1285', '1295', '1298', '1330', '1360', '1370',
  '1501', '1502', '1503', '1504', '1505', '1506', '1507', '1508', '1509', '1510', '1511', '1512', '1513', '1514', '1515', '1516',
  '1651', '1652', '1653', '2020', '2030', '2040', '2061', '2062', '2063', '2064', '2070', '2080', '2140', '2150', '4100', '4110', '5300',
]);

// Retired accounts are removed from the COA, while historical journals and
// carried balances are reclassified so prior data remains balanced and visible.
export function migrateRetiredAccountLines(entries: JournalEntry[]): JournalEntry[] {
  return entries.map(entry => {
    if (!entry.lines.some(line => RETIRED_ACCOUNT_CODES.has(line.accountCode))) return entry;
    const prepaidCategory = String(entry.transactionDetails?.prepaidAssetCategory || '');
    const retiredPayableCode = prepaidCategory === 'awards' ? '2061'
      : prepaidCategory === 'supplies' ? '2062'
        : prepaidCategory === 'rent' ? '2063'
          : prepaidCategory === 'uniform' ? '2064'
            : '2010';
    return {
      ...entry,
      lines: entry.lines.map(line => {
        const replacement = line.accountCode === '1710' || line.accountCode === '1720' ? '1285'
          : line.accountCode === '1290' ? '1260'
            : line.accountCode === '1340' || line.accountCode === '1345' ? '1270'
              : line.accountCode === '2060' ? retiredPayableCode
                : null;
        return replacement ? { ...line, accountCode: replacement } : line;
      }),
    };
  });
}

export function migrateRetiredOpeningBalances(balances: OpeningBalances): OpeningBalances {
  const migrated = { ...balances };
  const move = (from: string, to: string) => {
    if (!Object.prototype.hasOwnProperty.call(migrated, from)) return;
    if (migrated[from]) migrated[to] = (migrated[to] || 0) + migrated[from];
    delete migrated[from];
  };
  move('1710', '1285');
  move('1720', '1285');
  move('1290', '1260');
  move('1340', '1270');
  move('1345', '1270');
  move('2060', '2010');
  return migrated;
}

function migrateReportingPeriodWorkspaces(workspaces: ReportingPeriodWorkspace[]): ReportingPeriodWorkspace[] {
  return workspaces.map(workspace => ({
    ...workspace,
    journalEntries: migrateRetiredAccountLines(workspace.journalEntries || []),
    openingBalances: migrateRetiredOpeningBalances(workspace.openingBalances || {}),
  }));
}

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
  sponsorshipKind?: 'cash';

  // Restricts this type to only when the org's currently active semester
  // (Navbar fiscal year picker, settings.semester) matches — absent when
  // it applies year-round. The "current school year" membership billing
  // is 1st-Semester-only (that's when the whole year's dues get billed);
  // a separate "New/Additional Members" type covers anyone who joins
  // mid-year, 2nd-Semester-only. Enforced both in the searchable dropdown
  // (isRuleAvailable) and in suggestTransactionClassification itself, so
  // a restricted type can't be triggered by typing its keyword directly
  // either.
  availableInSemester?: '1st Semester' | '2nd Semester';
  // Distinguishes which pool of members the accrual-completion question
  // is asking about, for requiresAccrualCompletion rules only — "all
  // members" (the whole year's billing) vs. "new/additional members"
  // (anyone who joined mid-year). Changes only the question's wording on
  // the Transactions form; the underlying Dr Cash / Cr Membership Dues +
  // accrual mechanics are identical either way.
  accrualAudience?: 'all' | 'new';
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
  { code: '1200', name: 'Accounts Receivable', type: 'Assets', normalBalance: 'Debit', description: 'Amounts earned or billed but not yet collected from customers, sponsors, or partners', isActive: true },
  { code: '1210', name: 'Rent Receivable', type: 'Assets', normalBalance: 'Debit', description: 'Rent income earned but not yet collected', isActive: true },
  { code: '1220', name: 'Advances to Members', type: 'Assets', normalBalance: 'Debit', description: 'Advances issued to members and pending settlement', isActive: true },
  { code: '1230', name: 'Advances to Others', type: 'Assets', normalBalance: 'Debit', description: 'Advances issued to parties other than officers or members and pending settlement', isActive: true },
  { code: '1250', name: 'Advances to Officers', type: 'Assets', normalBalance: 'Debit', description: 'Cash advances given to officers for organization expenses, pending liquidation', isActive: true },
  // The matching principle, generalized: whenever a transaction's own
  // classification rule allows it (mayDeferPortion — see DEFAULT_RULES),
  // the portion not yet used/consumed/benefited this period lands here
  // instead of being expensed immediately, and REVIEW (src/lib/reviewEngine.ts)
  // reclassifies it into the real expense account once it's actually used.
  { code: '1260', name: 'Prepaid Expenses', type: 'Assets', normalBalance: 'Debit', description: 'Cash paid for goods/services not yet used, consumed, or benefited from this period', isActive: true },
  { code: '1270', name: 'Advances to Suppliers', type: 'Assets', normalBalance: 'Debit', description: 'Downpayments and advances made to suppliers before related goods, services, or other assets are received', isActive: true },
  { code: '1280', name: 'Awards and Prizes', type: 'Assets', normalBalance: 'Debit', description: 'Awards and prizes purchased in advance and still unused or undistributed', isActive: true },
  { code: '1285', name: 'Supplies and Materials', type: 'Assets', normalBalance: 'Debit', description: 'Event and operating supplies purchased in advance and still unused', isActive: true },
  { code: '1295', name: 'Prepaid Rent', type: 'Assets', normalBalance: 'Debit', description: 'Rental rights paid for before the related event or rental period', isActive: true },
  { code: '1298', name: 'Clothing/Uniform', type: 'Assets', normalBalance: 'Debit', description: 'Uniforms and clothing purchased in advance and not yet issued or consumed', isActive: true },
  { code: '1500', name: 'Equipment & Tools', type: 'Assets', normalBalance: 'Debit', description: 'Laptops, computers, hardware, tools, and other equipment used by the organization', isActive: true },
  { code: '1501', name: 'Laptop', type: 'Assets', normalBalance: 'Debit', description: 'Laptop computers owned and used by the organization', isActive: true },
  { code: '1502', name: 'Projector', type: 'Assets', normalBalance: 'Debit', description: 'Projectors owned and used by the organization', isActive: true },
  { code: '1503', name: 'Printer', type: 'Assets', normalBalance: 'Debit', description: 'Printers owned and used by the organization', isActive: true },
  { code: '1504', name: 'Uninterrupted Power System', type: 'Assets', normalBalance: 'Debit', description: 'Uninterrupted power systems owned and used by the organization', isActive: true },
  { code: '1505', name: 'Cash Box', type: 'Assets', normalBalance: 'Debit', description: 'Cash boxes owned and used by the organization', isActive: true },
  { code: '1506', name: 'HDMI', type: 'Assets', normalBalance: 'Debit', description: 'HDMI equipment owned and used by the organization', isActive: true },
  { code: '1507', name: 'WIFI Box', type: 'Assets', normalBalance: 'Debit', description: 'Wi-Fi equipment owned and used by the organization', isActive: true },
  { code: '1508', name: 'Microphone', type: 'Assets', normalBalance: 'Debit', description: 'Microphones owned and used by the organization', isActive: true },
  { code: '1509', name: 'Flash Drive', type: 'Assets', normalBalance: 'Debit', description: 'Flash drives owned and used by the organization', isActive: true },
  { code: '1510', name: 'Mouse', type: 'Assets', normalBalance: 'Debit', description: 'Computer mice owned and used by the organization', isActive: true },
  { code: '1511', name: 'Speaker', type: 'Assets', normalBalance: 'Debit', description: 'Speakers owned and used by the organization', isActive: true },
  { code: '1512', name: 'Projector Stand', type: 'Assets', normalBalance: 'Debit', description: 'Projector stands owned and used by the organization', isActive: true },
  { code: '1513', name: 'Adaptor', type: 'Assets', normalBalance: 'Debit', description: 'Adaptors owned and used by the organization', isActive: true },
  { code: '1514', name: 'Computer Hardware', type: 'Assets', normalBalance: 'Debit', description: 'Computer hardware owned and used by the organization', isActive: true },
  { code: '1515', name: 'Extension Wire', type: 'Assets', normalBalance: 'Debit', description: 'Extension wires owned and used by the organization', isActive: true },
  { code: '1516', name: 'Small Equipment', type: 'Assets', normalBalance: 'Debit', description: 'Other small equipment owned and used by the organization', isActive: true },
  // Contra-assets: Credit-normal despite being Assets-type accounts, so they
  // reduce Total Assets instead of adding to it (see isContraAccount in
  // src/lib/accountTotals.ts, which every Total Assets calculation relies on
  // to net these correctly). Kept per-category (Equipment vs. Furniture &
  // Fixtures), matching the working paper's own rows 20 and 28 exactly,
  // rather than one shared generic pair.
  { code: '1550', name: 'Accumulated Depreciation - Equipment', type: 'Assets', normalBalance: 'Credit', description: 'Cumulative depreciation charged against Equipment & Tools to date', isActive: true },
  { code: '1600', name: 'Property & Facilities', type: 'Assets', normalBalance: 'Debit', description: 'Real estate and facilities owned/held by the organization', isActive: true },
  { code: '1650', name: 'Furniture & Fixtures', type: 'Assets', normalBalance: 'Debit', description: 'Desks, chairs, cabinets, and other furnishings owned by the organization', isActive: true },
  { code: '1651', name: 'Cabinet', type: 'Assets', normalBalance: 'Debit', description: 'Cabinets owned and used by the organization', isActive: true },
  { code: '1652', name: 'Chairs', type: 'Assets', normalBalance: 'Debit', description: 'Chairs owned and used by the organization', isActive: true },
  { code: '1653', name: 'Tables and Desks', type: 'Assets', normalBalance: 'Debit', description: 'Tables and desks owned and used by the organization', isActive: true },
  { code: '1660', name: 'Accumulated Depreciation - Furniture & Fixtures', type: 'Assets', normalBalance: 'Credit', description: 'Cumulative depreciation charged against Furniture & Fixtures to date', isActive: true },
  { code: '1700', name: 'Inventory - Merchandise', type: 'Assets', normalBalance: 'Debit', description: 'Goods purchased for resale (organization merchandise, apparel, etc.)', isActive: true },
  // These two exist so a treasurer can post to them via "Advanced: Override
  // Accounts Manually" on the Transactions form, but deliberately carry no
  // classification rule: a keyword match would have to guess whether an
  // entry is the cash collection or the accrual/billing side of a
  // membership-dues or inter-org transaction, and that guess isn't ours to
  // make (same principle as the funding-source question already applies
  // elsewhere — see workingPaper.fixtures.ts's own note on not normalizing
  // ambiguity away).
  { code: '1300', name: 'Membership Dues Receivable', type: 'Assets', normalBalance: 'Debit', description: 'Membership dues billed to members but not yet collected', isActive: true },
  { code: '1310', name: 'Activity Fees Receivable', type: 'Assets', normalBalance: 'Debit', description: 'Activity or event fees earned but not yet collected from participants', isActive: true },
  { code: '1320', name: 'Due from Officers', type: 'Assets', normalBalance: 'Debit', description: 'Organization collections still held by an accountable officer and not yet remitted', isActive: true },
  { code: '1330', name: 'Receivable from Custodian', type: 'Assets', normalBalance: 'Debit', description: 'Amounts entrusted to or recoverable from an organization custodian', isActive: true },
  { code: '1350', name: 'Loans to Other Organization', type: 'Assets', normalBalance: 'Debit', description: 'Running balance of loans receivable from other organizations', isActive: true },
  { code: '1360', name: 'Accounts Receivable - Suppliers', type: 'Assets', normalBalance: 'Debit', description: 'Payments made to suppliers in excess of the related merchandise, service, or asset cost', isActive: true },
  { code: '1370', name: 'Due from Other Organizations', type: 'Assets', normalBalance: 'Debit', description: 'Amounts recoverable from other organizations', isActive: true },

  // Liabilities (Normal: Credit)
  // Renamed from the generic "Accounts Payable" to match the working
  // paper's own exact term — it distinguishes this (amounts owed directly
  // to a supplier/vendor) from Due to Officers (owed to a person) in the
  // REVIEW settlement mechanism, which asks a different question for each.
  { code: '2010', name: 'Accounts Payable - Expense', type: 'Liabilities', normalBalance: 'Credit', description: 'Outstanding expense payables tracked separately for each supplier or payee', isActive: true },
  { code: '2020', name: 'Accounts Payable - Merchandise', type: 'Liabilities', normalBalance: 'Credit', description: 'Unpaid cost of merchandise acquired for resale', isActive: true },
  { code: '2030', name: 'Accounts Payable-PPE', type: 'Liabilities', normalBalance: 'Credit', description: 'Unpaid purchases of property, plant, and equipment', isActive: true },
  { code: '2040', name: 'Accounts Payable-Furniture & Fixture', type: 'Liabilities', normalBalance: 'Credit', description: 'Unpaid purchases of furniture and fixtures', isActive: true },
  { code: '2061', name: 'Accounts Payable-Awards and Prizes', type: 'Liabilities', normalBalance: 'Credit', description: 'Unpaid awards and prizes acquired for later distribution', isActive: true },
  { code: '2062', name: 'Accounts Payable-Supplies and Materials', type: 'Liabilities', normalBalance: 'Credit', description: 'Unpaid supplies and materials acquired for later use', isActive: true },
  { code: '2063', name: 'Accounts Payable-Prepaid Rent', type: 'Liabilities', normalBalance: 'Credit', description: 'Unpaid rental rights acquired before the related rental period', isActive: true },
  { code: '2064', name: 'Accounts Payable-Clothing/Uniform', type: 'Liabilities', normalBalance: 'Credit', description: 'Unpaid clothing and uniforms acquired before issue or use', isActive: true },
  { code: '2070', name: 'Due to Members', type: 'Liabilities', normalBalance: 'Credit', description: 'Amounts owed to members', isActive: true },
  { code: '2080', name: 'Due to Others', type: 'Liabilities', normalBalance: 'Credit', description: 'Amounts owed to parties other than officers, members, or suppliers', isActive: true },
  { code: '2050', name: 'Due to Officers', type: 'Liabilities', normalBalance: 'Credit', description: 'Amounts owed to officers who paid organization expenses out of their own money, pending reimbursement', isActive: true },
  { code: '2110', name: 'Unearned Activity Fees', type: 'Liabilities', normalBalance: 'Credit', description: 'Activity or event fees collected before the event date', isActive: true },
  { code: '2120', name: 'Refund Liability - Activity Fees', type: 'Liabilities', normalBalance: 'Credit', description: 'Activity fee collections received in excess of the required amount and still refundable', isActive: true },
  { code: '2130', name: 'Refund Liability - Membership Fees', type: 'Liabilities', normalBalance: 'Credit', description: 'Membership fee collections received in excess of the required amount and still refundable', isActive: true },
  { code: '2200', name: 'Loans & Financial Obligations', type: 'Liabilities', normalBalance: 'Credit', description: 'Loans and other financial obligations payable within a year', isActive: true },
  { code: '2140', name: 'Unearned Merchandise / Service Revenue', type: 'Liabilities', normalBalance: 'Credit', description: 'Customer advances for undelivered merchandise or services', isActive: true },
  { code: '2150', name: 'Due to Customers', type: 'Liabilities', normalBalance: 'Credit', description: 'Refundable customer payments exceeding the full order price', isActive: true },
  { code: '2300', name: 'Accrued Liabilities', type: 'Liabilities', normalBalance: 'Credit', description: 'Accrued unpaid expenses such as taxes or interest', isActive: true },
  
  // Fund Balance / Equity (Normal: Credit)
  { code: '3000', name: 'Income Summary', type: 'Fund Balance', normalBalance: 'Credit', description: 'Temporary year-end clearing account used only by Closing Entries', isActive: true },
  { code: '3010', name: 'General Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: 'Unrestricted accumulated fund balances', isActive: true },
  { code: '3020', name: 'Restricted Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: 'Donor-restricted capital or specific reserves', isActive: true },
  { code: '3030', name: 'Permanently Restricted Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: 'Donor-restricted funds that must be maintained permanently', isActive: true },
  
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
  { code: '4036', name: 'Contributions Revenue - Permanently Restricted', type: 'Revenue', normalBalance: 'Credit', description: 'Donor-restricted contributions that must remain permanently restricted', isActive: true },
  { code: '4040', name: 'Membership Dues', type: 'Revenue', normalBalance: 'Credit', description: 'Dues collected from members', isActive: true },
  { code: '4050', name: 'Other Income', type: 'Revenue', normalBalance: 'Credit', description: 'Miscellaneous income not covered by another revenue account (cashback, advertising revenue, cash prizes received, ticket sales, etc.)', isActive: true },
  // Split out from Other Income per the client's revised note sheet: renting
  // out projector/extension wire/other equipment, and printing services, now
  // get their own line instead of being lumped into Miscellaneous Income.
  { code: '4055', name: 'Rental Revenues', type: 'Revenue', normalBalance: 'Credit', description: 'Income from renting out equipment (projector, extension wire, etc.) and from printing services', isActive: true },
  { code: '4060', name: 'Interest Income', type: 'Revenue', normalBalance: 'Credit', description: 'Interest earned on bank deposits or investments', isActive: true },
  { code: '4070', name: 'Merchandise Sales', type: 'Revenue', normalBalance: 'Credit', description: 'Revenue from selling organization merchandise or apparel', isActive: true },
  { code: '4080', name: 'Ticket Sales', type: 'Revenue', normalBalance: 'Credit', description: 'Revenue from ticket sales to events', isActive: true },
  { code: '4090', name: 'Activity Fees Revenue', type: 'Revenue', normalBalance: 'Credit', description: 'Activity or event fees recognized when the event occurs or when cancelled fees are non-refundable', isActive: true },
  { code: '4100', name: 'Donations', type: 'Revenue', normalBalance: 'Credit', description: 'Cash donations received without an outstanding donor restriction', isActive: true },
  { code: '4110', name: 'Sponsorships', type: 'Revenue', normalBalance: 'Credit', description: 'Cash sponsorships received without an outstanding donor restriction', isActive: true },

  // Expenses (Normal: Debit)
  { code: '5010', name: 'Salaries & Wages', type: 'Expenses', normalBalance: 'Debit', description: 'Staff payroll, social security, and benefits', isActive: true },
  { code: '5020', name: 'Rent Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Monthly lease cost for office spaces', isActive: true },
  { code: '5030', name: 'Utilities Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Electricity, water, gas, and internet fees', isActive: true },
  { code: '5040', name: 'Office Supplies', type: 'Expenses', normalBalance: 'Debit', description: 'Stationary, postage, and administrative sundries', isActive: true },
  { code: '5050', name: 'Transportation Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Transportation fares and allowances for events and organization activities', isActive: true },
  // Added to support the Training Expense and Maintenance Expense
  // classification categories used by the rule-based engine below. These are
  // additive entries only — they plug into the existing generic balance,
  // totals, and statement calculations without any logic changes.
  { code: '5060', name: 'Training & Seminar Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Costs for staff training, seminars, workshops, and certifications', isActive: true },
  { code: '5070', name: 'Repairs and Maintenance Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Costs for repairing and maintaining equipment and facilities', isActive: true },
  // Added to support the "meal(s)" classification rule below, the concrete
  // example (working paper Sheet2, "Payment for Meals") that demonstrates
  // the purpose question (Question A) — see purposeOptions on that rule.
  { code: '5080', name: 'Meals and Refreshments Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Meals and refreshments for meetings, events, participants, speakers, and organizers', isActive: true },
  { code: '5090', name: 'Depreciation Expense - Equipment', type: 'Expenses', normalBalance: 'Debit', description: 'Periodic depreciation charged against Equipment & Tools', isActive: true },
  { code: '5095', name: 'Depreciation Expense - Furniture & Fixtures', type: 'Expenses', normalBalance: 'Debit', description: 'Periodic depreciation charged against Furniture & Fixtures', isActive: true },
  { code: '5100', name: 'Bank Charges', type: 'Expenses', normalBalance: 'Debit', description: 'Bank fees, service charges, and transaction fees', isActive: true },
  { code: '5110', name: 'General Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Miscellaneous operating expenses not covered by another category', isActive: true },
  { code: '5120', name: 'Award and Prizes Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Awards, prizes, and incentives given out during events and competitions', isActive: true },
  { code: '5130', name: 'Communication Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Phone, mobile load, and other communication costs', isActive: true },
  { code: '5140', name: 'Printing Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Printing, photocopying, and reproduction costs', isActive: true },
  { code: '5150', name: 'Delivery Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Freight, shipping, and delivery costs', isActive: true },
  { code: '5160', name: 'Event Supplies Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Supplies consumed specifically for an event or program', isActive: true },
  { code: '5170', name: 'Loss from Spoilage', type: 'Expenses', normalBalance: 'Debit', description: 'Donated food or supplies that expired, spoiled, or became unusable', isActive: true },
  { code: '5180', name: 'Uniform Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Uniforms and organization apparel for members and officers', isActive: true },
  { code: '5190', name: 'Tokens & Recognition Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Tokens, certificates, and recognition items for volunteers and participants', isActive: true },
  { code: '5200', name: 'Honoraria Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Honoraria paid to guest speakers and resource persons', isActive: true },
  { code: '5210', name: 'Membership Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Dues and fees the organization itself pays to join another association or federation', isActive: true },
  { code: '5220', name: 'Service Charge', type: 'Expenses', normalBalance: 'Debit', description: 'Third-party service charges (distinct from Bank Charges)', isActive: true },
  { code: '5230', name: 'Donations and Contributions Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Donations and contributions given by the organization', isActive: true },
  { code: '5240', name: 'Cost of Sales - Merchandise', type: 'Expenses', normalBalance: 'Debit', description: 'Cost carried in inventory for merchandise that has been sold', isActive: true },
  { code: '5250', name: 'Promotional and Advertising Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Tarpaulins, banners, brochures, and other promotional materials', isActive: true },
  { code: '5260', name: 'Recording and Production Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Recording sessions, station IDs, and production fees', isActive: true },
  { code: '5270', name: 'Food Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Food costs that are distinct from meals and refreshments', isActive: true },
  { code: '5280', name: 'Printing Supplies Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Paper, ink, and other supplies consumed for printing work', isActive: true },
  { code: '5290', name: 'Supplies and Materials Expense', type: 'Expenses', normalBalance: 'Debit', description: 'General supplies and materials consumed outside a specific event', isActive: true },
  { code: '5300', name: 'Event Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Event and program expenses recorded under one account when per-event expense breakdowns are unavailable', isActive: true },
  { code: '5300', name: 'Professional Fee Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Professional fees paid for specialized services', isActive: true },
  { code: '5310', name: 'Logistics and Venue Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Venue, logistics, and event coordination costs', isActive: true },
  { code: '5320', name: 'Assistance Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Financial or in-kind assistance provided by the organization', isActive: true },
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
export const DEFAULT_RULES: ClassificationRuleWithWorkflow[] = [
  { keyword: 'event/program expense', debitAccountCode: '5300', creditAccountCode: '1010', description: 'Event/Program Expense' },
  // Exact dropdown labels from the live expense-transactions working paper.
  // Keep these ahead of broad keywords so the document's wording always
  // resolves to its stated expense account.
  { keyword: 'delivery fees/ shipping fees', debitAccountCode: '5150', creditAccountCode: '1010', description: 'Delivery Fees/ Shipping Fees' },
  { keyword: 'load for event hosts', debitAccountCode: '5130', creditAccountCode: '1010', description: 'Load for Event Hosts' },
  { keyword: 'cash prizes given to event participants', debitAccountCode: '5120', creditAccountCode: '1010', description: 'Cash Prizes given to Event Participants', mayDeferPortion: true },
  { keyword: 'load given as prize to event participants', debitAccountCode: '5120', creditAccountCode: '1010', description: 'Load Given as Prize to Event Participants', mayDeferPortion: true },
  { keyword: 'printing/bookbinding of accomplishment reports and other documents', debitAccountCode: '5140', creditAccountCode: '1010', description: 'Printing/Bookbinding of Accomplishment Reports and Other Documents', mayDeferPortion: true },
  { keyword: 'mass offerings/donations', debitAccountCode: '5230', creditAccountCode: '1010', description: 'Mass Offerings/Donations' },
  { keyword: 'purchase of meals consumed by participants, speakers and organizers', debitAccountCode: '5080', creditAccountCode: '1010', description: 'Purchase of Meals consumed by participants, speakers and organizers', mayDeferPortion: true },
  { keyword: 'transportation fare', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Transportation Fare' },
  { keyword: 'transportation allowance to hosts, speaker and guests', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Transportation Allowance to hosts, speaker and guests' },
  { keyword: 'purchase/printing of tarpaulin, banners, brochures and other promotional materials', debitAccountCode: '5250', creditAccountCode: '1010', description: 'Purchase/Printing of Tarpaulin, banners, brochures and other promotional materials', mayDeferPortion: true },
  { keyword: 'honorarium/token – speaker, facilitator, or judge', debitAccountCode: '5200', creditAccountCode: '1010', description: 'Honorarium/Token – Speaker, Facilitator, or Judge' },
  { keyword: 'membership fees paid to national organization', debitAccountCode: '5210', creditAccountCode: '1010', description: 'Membership Fees paid to National Organization' },
  { keyword: 'recording session/station id fees', debitAccountCode: '5260', creditAccountCode: '1010', description: 'Recording Session/Station ID Fees' },
  { keyword: 'printer repairs', debitAccountCode: '5070', creditAccountCode: '1010', description: 'Small Printer Repairs' },
  { keyword: 'cash in/cash out fees', debitAccountCode: '5100', creditAccountCode: '1010', description: 'Cash In/Cash Out Fees' },

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
  { keyword: 'income from printing', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Income from Printing Services' },
  { keyword: 'received from printing', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Income from Printing Services' },
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
  { keyword: 'depreciation of laptop', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Laptop' },
  { keyword: 'depreciation of projector', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Projector' },
  { keyword: 'depreciation of printer', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Printer' },
  { keyword: 'depreciation of ups', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of UPS (Uninterrupted Power System)' },
  { keyword: 'depreciation of cash box', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Cash Box' },
  { keyword: 'depreciation of hdmi', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of HDMI' },
  { keyword: 'depreciation of wifi box', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of WIFI Box' },
  { keyword: 'depreciation of microphone', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Microphone' },
  { keyword: 'depreciation of flash drive', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Flash Drive' },
  { keyword: 'depreciation of mouse', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Mouse' },
  { keyword: 'depreciation of speaker', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Speaker' },
  { keyword: 'depreciation of projector stand', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Projector Stand' },
  { keyword: 'depreciation of adaptor', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Adaptor' },
  { keyword: 'depreciation of computer hardware', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Computer Hardware' },
  { keyword: 'depreciation of extension wire', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Extension Wire' },
  { keyword: 'depreciation of other small equipment', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation of Other Small Equipment' },
  { keyword: 'depreciation', debitAccountCode: '5090', creditAccountCode: '1550', description: 'Depreciation Expense - Equipment' },

  // --- Equipment Expense -----------------------------------------------------
  { keyword: 'purchase of laptop', debitAccountCode: '1501', creditAccountCode: '1010', description: 'Purchase of Laptop' },
  { keyword: 'purchase of projector', debitAccountCode: '1502', creditAccountCode: '1010', description: 'Purchase of Projector' },
  { keyword: 'purchase of printer', debitAccountCode: '1503', creditAccountCode: '1010', description: 'Purchase of Printer' },
  { keyword: 'purchase of ups', debitAccountCode: '1504', creditAccountCode: '1010', description: 'Purchase of UPS (Uninterrupted Power System)' },
  { keyword: 'purchase of cash box', debitAccountCode: '1505', creditAccountCode: '1010', description: 'Purchase of Cash Box' },
  { keyword: 'purchase of hdmi', debitAccountCode: '1506', creditAccountCode: '1010', description: 'Purchase of HDMI' },
  { keyword: 'purchase of wifi box', debitAccountCode: '1507', creditAccountCode: '1010', description: 'Purchase of WIFI Box' },
  { keyword: 'purchase of microphone', debitAccountCode: '1508', creditAccountCode: '1010', description: 'Purchase of Microphone' },
  { keyword: 'purchase of flash drive', debitAccountCode: '1509', creditAccountCode: '1010', description: 'Purchase of Flash Drive' },
  { keyword: 'purchase of mouse', debitAccountCode: '1510', creditAccountCode: '1010', description: 'Purchase of Mouse' },
  { keyword: 'purchase of speaker', debitAccountCode: '1511', creditAccountCode: '1010', description: 'Purchase of Speaker' },
  { keyword: 'purchase of projector stand', debitAccountCode: '1512', creditAccountCode: '1010', description: 'Purchase of Projector Stand' },
  { keyword: 'purchase of adaptor', debitAccountCode: '1513', creditAccountCode: '1010', description: 'Purchase of Adaptor' },
  { keyword: 'purchase of computer hardware', debitAccountCode: '1514', creditAccountCode: '1010', description: 'Purchase of Computer Hardware' },
  { keyword: 'purchase of extension wire', debitAccountCode: '1515', creditAccountCode: '1010', description: 'Purchase of Extension Wire' },
  { keyword: 'purchase of other small equipment', debitAccountCode: '1516', creditAccountCode: '1010', description: 'Purchase of Other Small Equipment' },
  { keyword: 'purchase of cabinet', debitAccountCode: '1651', creditAccountCode: '1010', description: 'Purchase of Cabinet' },
  { keyword: 'purchase chairs', debitAccountCode: '1652', creditAccountCode: '1010', description: 'Purchase Chairs' },
  { keyword: 'purchase of tables/desks', debitAccountCode: '1653', creditAccountCode: '1010', description: 'Purchase of Tables/Desks' },
  { keyword: 'laptop', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Developer Laptop Purchase' },
  { keyword: 'computer', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Hardware Equipment Purchase' },
  { keyword: 'monitor', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Computer Monitor Purchase' },
  { keyword: 'printer', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Printer Equipment Purchase' },
  { keyword: 'equipment', debitAccountCode: '1500', creditAccountCode: '1010', description: 'General Equipment Purchase' },
  { keyword: 'hardware', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Computer Hardware' },
  { keyword: 'server', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Hosting Server Equipment' },
  { keyword: 'furniture', debitAccountCode: '1650', creditAccountCode: '1010', description: 'Furniture & Fixtures Purchase' },
  { keyword: 'receivable from custodian', debitAccountCode: '1330', creditAccountCode: '1010', description: 'Receivable from Custodian' },

  // --- Inventory (goods for resale) ---------------------------------------------
  { keyword: 'acquisition of merchandise', debitAccountCode: '1700', creditAccountCode: '1010', description: 'Acquisition of Merchandise for Sale - Goods Received and On Hand' },
  { keyword: 'downpayment for pre-ordered merchandise', debitAccountCode: '1270', creditAccountCode: '1010', description: 'Downpayment for Pre-ordered Merchandise' },
  { keyword: 'payment for unpaid merchandise', debitAccountCode: '2020', creditAccountCode: '1010', description: 'Payment for Unpaid Merchandise Purchased and Received in Previous Period/Semester' },
  { keyword: 'collection of receivables from suppliers', debitAccountCode: '1010', creditAccountCode: '1360', description: 'Collection of Receivables from Suppliers' },
  { keyword: 'inventory', debitAccountCode: '1700', creditAccountCode: '1010', description: 'Acquisition of Merchandise for Sale - Goods Received and On Hand' },

  // --- Inter-organization loans (working paper row 20) ---------------------------
  // Checked before bare 'loan' below (money the org itself borrows) — this
  // is the opposite direction, money the org lends OUT to another org.
  { keyword: 'loan to other organization', debitAccountCode: '1350', creditAccountCode: '1010', description: 'Loans to Other Organization' },
  { keyword: 'loans to other organization', debitAccountCode: '1350', creditAccountCode: '1010', description: 'Loans to Other Organization' },
  { keyword: 'collection of loan receivable from other organizations', debitAccountCode: '1010', creditAccountCode: '1350', description: 'Collection of Loan Receivable from Other Organizations' },
  { keyword: 'payment of previous-period expense payables', debitAccountCode: '2010', creditAccountCode: '1010', description: 'Payment of Previous-Period/Semester Expense Payables' },

  // --- Cash advance given to an officer (client note sheet, row 19) --------------
  // This is the ORIGINAL "give the advance" transaction — a pure asset
  // swap, no expense yet. It's what the REVIEW page's Advances to Officers
  // settlement (src/lib/reviewEngine.ts) resolves once the officer reports
  // back what it was actually used for.
  { keyword: 'advances to officers', debitAccountCode: '1250', creditAccountCode: '1010', description: 'Advances to Officers' },
  { keyword: 'cash advances given to organization officers', debitAccountCode: '1250', creditAccountCode: '1010', description: 'Cash Advances Given to Organization Officers' },
  { keyword: 'cash advance given to', debitAccountCode: '1250', creditAccountCode: '1010', description: 'Cash Advance Given to Officer' },
  // Settlement of an already-recorded Due to Officers balance.
  { keyword: 'reimbursement to officers', debitAccountCode: '2050', creditAccountCode: '1010', description: 'Reimbursement to Officers' },
  { keyword: 'reimbursement to officer', debitAccountCode: '2050', creditAccountCode: '1010', description: 'Reimbursement to Officer' },

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
  { keyword: 'previous school year', debitAccountCode: '1010', creditAccountCode: '1300', description: 'Collection of Unpaid Membership Fees from Previous Period (e.g. Previous Semester)' },
  // "Current school year" collection is the working paper's own accrual-
  // completion example (row 3-4): the cash-collected portion posted here
  // is only half the story — requiresAccrualCompletion drives the second
  // mandatory question on the Transactions form ("how much remains
  // unpaid?"), which posts the other half to Membership Dues Receivable so
  // full-period revenue is never understated. This is the whole year's
  // membership billing, done once at the start of the school year — 1st
  // Semester only; anyone who joins later in the year uses the
  // new/additional-members type below instead.
  { keyword: 'current school year', debitAccountCode: '1010', creditAccountCode: '4040', description: 'Collection and Accrual of Membership Fees (Current School Year)', requiresAccrualCompletion: true, accrualAudience: 'all', availableInSemester: '1st Semester' },
  // Same accrual mechanics as the type above (Repeat Process, per the
  // client's own note) for whoever joins mid-year instead of at the start
  // — 2nd Semester only, the mirror restriction of the type above.
  { keyword: 'new additional members', debitAccountCode: '1010', creditAccountCode: '4040', description: 'Membership Fees From New/Additional Members - 2nd Semester', requiresAccrualCompletion: true, accrualAudience: 'new', availableInSemester: '2nd Semester' },
  { keyword: 'excess membership fee collection', debitAccountCode: '2130', creditAccountCode: '1010', description: 'Excess Membership Fee Collection - Status' },
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
  // "membership fee", so the more specific keyword avoids ever colliding
  // with a revenue-side membership rule, same ordering principle as
  // 'donation expense'/'service charge' above.
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
  { keyword: 'sponsorships and donations', debitAccountCode: '1010', creditAccountCode: '4100', description: 'Sponsorships and Donations', sponsorshipKind: 'cash' },
  { keyword: 'donation', debitAccountCode: '1010', creditAccountCode: '4100', description: 'Sponsorships and Donations', sponsorshipKind: 'cash' },
  { keyword: 'sponsor', debitAccountCode: '1010', creditAccountCode: '4100', description: 'Sponsorships and Donations', sponsorshipKind: 'cash' },
  // Inter-org loans (above, in the Inventory section) are checked first —
  // this bare 'loan' is money the org itself borrows, the opposite
  // direction.
  { keyword: 'loan', debitAccountCode: '1010', creditAccountCode: '2200', description: 'Bank Loan Capital Funding' },
  // Generic ad-hoc "Membership Dues Collected" (and its duplicate,
  // "Membership Fees Collected") used to exist here — both removed per
  // client feedback, since every real membership collection now belongs
  // to one of three purpose-specific structured types instead: current
  // school year (accrual, 1st Semester), previous period unpaid dues, or
  // new/additional members (accrual, 2nd Semester).
  { keyword: 'other income', debitAccountCode: '1010', creditAccountCode: '4050', description: 'Other Income Received' },
  { keyword: 'interest', debitAccountCode: '1010', creditAccountCode: '4060', description: 'Interest Income Received' },
  { keyword: 'sale of merchandise', debitAccountCode: '1010', creditAccountCode: '4070', description: 'Sale of Merchandise' },
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
  workspaceStatus: 'idle' | 'loading' | 'ready' | 'error';
  workspaceError: string | null;
  accounts: Account[];
  journalEntries: JournalEntry[];
  projects: Project[];
  auditLogs: AuditLog[];
  settings: AppSettings;
  classificationRules: ClassificationRuleWithWorkflow[];
  customClassificationRules: CustomClassificationRule[];
  closedFiscalYears: ClosingRecord[];
  receiptAttachments: ReceiptAttachment[];
  activityFeeRecords: ActivityFeeRecord[];
  draftTransactions: TransactionDraft[];
  financialStatementHistory: FinancialStatementHistoryRecord[];
  reportingPeriodWorkspaces: ReportingPeriodWorkspace[];
  openingBalances: OpeningBalances;

  addJournalEntry: (date: string, description: string, project: string, lines: JournalLine[], eventName?: string, settlesEntryId?: string, transactionMeta?: TransactionMetadata, isDraft?: boolean, draftId?: string, replaceDraftEntryId?: string) => JournalEntry;
  updateJournalEntry: (entry: JournalEntry) => void;
  finalizeDraftJournalEntry: (id: string) => void;
  finalizeJournalEntry: (id: string) => void;
  reverseJournalEntry: (id: string) => void;
  deleteJournalEntry: (id: string) => void;
  postClosingStage: (fiscalYear: string, closingDate: string, stage: 'revenue' | 'expense' | 'income-summary') => void;
  attachReceiptsToEntry: (entryId: string, receipts: ReceiptAttachmentDraft[]) => void;
  addCustomClassificationRule: (description: string, debitAccountCode: string, creditAccountCode: string) => void;
  updateCustomClassificationRule: (id: string, updated: Partial<Pick<CustomClassificationRule, 'description' | 'debitAccountCode' | 'creditAccountCode' | 'isActive'>>) => void;
  createActivityFeeRecord: (input: { eventName: string; eventOccursThisPeriod: boolean; eventDate?: string; totalExpected?: number; priorPeriodCollected?: number; collections: DatedAmountRecord[]; reportingPeriod: string }) => ActivityFeeRecord;
  recognizeScheduledActivityFee: (id: string, totalExpected: number, eventDate: string, collections: DatedAmountRecord[], reportingPeriod: string) => ActivityFeeRecord;
  collectActivityFeeReceivable: (id: string, collections: DatedAmountRecord[], reportingPeriod: string) => ActivityFeeRecord;
  updateActivityFeeRecord: (id: string, followUp: ActivityFeeFollowUp, date: string, reportingPeriod: string) => ActivityFeeRecord;
  postActivityFeeReviewCollections: (id: string, collections: DatedAmountRecord[], reportingPeriod: string) => ActivityFeeRecord;
  postActivityFeeReviewPayments: (id: string, payments: DatedAmountRecord[], reportingPeriod: string) => ActivityFeeRecord;
  markActivityFeeReviewComplete: (id: string, section: 'collections' | 'payments') => void;
  finalizePrepaidAssetForSemester: (entryId: string, semesterKey: string) => void;
  // Saves (or, when an id already exists, overwrites) an in-progress
  // Stores a balanced draft ledger entry and form state for later finalization.
  saveDraftTransaction: (draft: { id?: string; category: string | null; label: string; formState: Record<string, unknown>; journalEntryId?: string }) => string;
  deleteDraftTransaction: (id: string, preserveJournalEntryIds?: string[]) => void;
  recordFinancialStatementHistory: (record: Omit<FinancialStatementHistoryRecord, 'id' | 'generatedAt'>) => FinancialStatementHistoryRecord;
  deleteSemester: (key: string) => void;
  switchReportingPeriod: (schoolYear: string, semester: '1st Semester' | '2nd Semester', reportingYear: number) => void;

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
    sponsorshipKind?: 'cash';
    accrualAudience?: 'all' | 'new';
  } | null;
  // Whether a rule's availableInSemester (if any) matches the org's
  // currently active semester — the single check both the searchable
  // dropdown and suggestTransactionClassification use, so a restricted
  // type can't be reached either way once it's the wrong semester.
  isRuleAvailable: (rule: ClassificationRuleWithWorkflow) => boolean;
  
  accountBalances: Record<string, number>;
  totals: Record<string, number>; // Assets, Liabilities, etc.
  netIncome: number;
  isBalanced: boolean;
  clearAllData: () => void;
  resetFinancialWorkspace: () => void;
  loadSampleData: () => void;

  exportBackupData: () => BackupPayload;
  restoreBackupData: (payload: BackupPayload) => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [workspaceStatus, setWorkspaceStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const local = localStorage.getItem('ss_accounts');
    if (!local) return INITIAL_ACCOUNTS;

    // Backfill any default accounts (e.g. newly added ones like Cash in
    // Bank) that are missing from data already saved in this browser.
    // Additive only — never overwrites or removes an account the user
    // already has, so their own edits, custom accounts, and balances
    // (driven by journalEntries, saved separately) are untouched.
    const saved: Account[] = (JSON.parse(local) as Account[]).filter(account => !RETIRED_ACCOUNT_CODES.has(account.code)).map(account => {
      if (account.code === '1270') return { ...account, name: 'Advances to Suppliers', description: 'Downpayments and advances made to suppliers before related goods, services, or other assets are received' };
      if (account.code === '1360') return { ...account, name: 'Accounts Receivable - Suppliers', description: 'Payments made to suppliers in excess of the related merchandise, service, or asset cost' };
      if (account.code === '2020') return { ...account, name: 'Accounts Payable - Merchandise', description: 'Unpaid cost of merchandise acquired for resale' };
      if (account.code === '4035' && account.name === 'Contributions Revenue - Restricted') return { ...account, name: 'Contributions Revenue - Temporarily Restricted' };
      if (account.code === '1200' && account.name === 'Receivables') return { ...account, name: 'Accounts Receivable', description: 'Amounts earned or billed but not yet collected from customers, sponsors, or partners' };
      if (account.code === '2110' && account.name === 'Deferred Activity Fees') return { ...account, name: 'Unearned Activity Fees', description: 'Activity or event fees collected before the event date' };
      const workingPaperExpense = INITIAL_ACCOUNTS.find(defaultAccount => defaultAccount.code === account.code && ['1350', '2010', '5050', '5070', '5080', '5120', '5150', '5160', '5230'].includes(account.code));
      if (workingPaperExpense) return { ...account, name: workingPaperExpense.name, description: workingPaperExpense.description };
      return account;
    });
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
    return local ? migrateRetiredAccountLines(JSON.parse(local) as JournalEntry[]) : [];
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
    if (local) {
      const saved = JSON.parse(local) as AppSettings;
      if (saved.fiscalYear.startsWith('FY ')) {
        const existingRange = saved.fiscalYear.match(/FY\s+(\d{4})-(\d{4})(.*)/);
        const singleYear = saved.fiscalYear.match(/^FY\s+(\d{4})$/);
        if (existingRange) saved.fiscalYear = `SY ${existingRange[1]}-${existingRange[2]}${existingRange[3]}`;
        else if (singleYear) saved.fiscalYear = `SY ${singleYear[1]}-${Number(singleYear[1]) + 1}`;
      }
      return saved;
    }
    return {
      fiscalYear: 'SY 2026-2027',
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
    return local ? (JSON.parse(local) as ClosingRecord[]).map(record => record.completed === undefined && record.journalEntryId ? { ...record, completed: true } : record) : [];
  });

  const [receiptAttachments, setReceiptAttachments] = useState<ReceiptAttachment[]>(() => {
    const local = localStorage.getItem('ss_receipts');
    return local ? JSON.parse(local) : [];
  });

  const [activityFeeRecords, setActivityFeeRecords] = useState<ActivityFeeRecord[]>(() => {
    const local = localStorage.getItem('ss_activity_fees');
    return local ? JSON.parse(local) : [];
  });

  const [draftTransactions, setDraftTransactions] = useState<TransactionDraft[]>(() => {
    const local = localStorage.getItem('ss_drafts');
    return local ? JSON.parse(local) : [];
  });

  const [financialStatementHistory, setFinancialStatementHistory] = useState<FinancialStatementHistoryRecord[]>(() => {
    const local = localStorage.getItem('ss_fs_history');
    return local ? JSON.parse(local) : [];
  });

  const [reportingPeriodWorkspaces, setReportingPeriodWorkspaces] = useState<ReportingPeriodWorkspace[]>(() => {
    const local = localStorage.getItem('ss_period_workspaces');
    return local ? migrateReportingPeriodWorkspaces(JSON.parse(local) as ReportingPeriodWorkspace[]) : [];
  });

  const [openingBalances, setOpeningBalances] = useState<OpeningBalances>(() => {
    if (!settings.semester || !settings.reportingYear) return {};
    const schoolYear = `${settings.reportingYear}-${settings.reportingYear + 1}`;
    return migrateRetiredOpeningBalances(reportingPeriodWorkspaces.find(workspace => workspace.key === `${schoolYear}::${settings.semester}`)?.openingBalances || {});
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

  useEffect(() => {
    localStorage.setItem('ss_activity_fees', JSON.stringify(activityFeeRecords));
  }, [activityFeeRecords]);

  useEffect(() => {
    localStorage.setItem('ss_drafts', JSON.stringify(draftTransactions));
  }, [draftTransactions]);

  useEffect(() => {
    localStorage.setItem('ss_fs_history', JSON.stringify(financialStatementHistory));
  }, [financialStatementHistory]);

  useEffect(() => {
    localStorage.setItem('ss_period_workspaces', JSON.stringify(reportingPeriodWorkspaces));
  }, [reportingPeriodWorkspaces]);

  const workspaceSnapshot = useMemo<BackupPayload>(() => ({
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
    activityFeeRecords,
    draftTransactions,
    financialStatementHistory,
    reportingPeriodWorkspaces,
  }), [accounts, journalEntries, projects, auditLogs, settings, closedFiscalYears, receiptAttachments, customClassificationRules, activityFeeRecords, draftTransactions, financialStatementHistory, reportingPeriodWorkspaces]);

  // A Supabase workspace is the durable source of data. Local storage remains
  // a browser cache and supplies a one-time import for the former local-only app.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setWorkspaceStatus('idle');
      setWorkspaceError(null);
      return;
    }

    let active = true;
    setWorkspaceStatus('loading');
    setWorkspaceError(null);

    const loadWorkspace = async () => {
      const { data, error } = await supabase
        .from('user_workspaces')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setWorkspaceStatus('error');
        setWorkspaceError(error.message);
        return;
      }

      if (data) {
        const saved = data.data as unknown as BackupPayload;
        const validation = validateBackupPayload(saved);
        if (!validation.valid) {
          setWorkspaceStatus('error');
          setWorkspaceError('Your saved workspace could not be read safely.');
          return;
        }
        const activeSavedAccounts = saved.accounts.filter(account => !RETIRED_ACCOUNT_CODES.has(account.code)).map(account => {
          const current = INITIAL_ACCOUNTS.find(defaultAccount => defaultAccount.code === account.code && ['1270', '1360', '2010', '2020'].includes(account.code));
          return current ? { ...account, name: current.name, description: current.description } : account;
        });
        setAccounts([...activeSavedAccounts, ...INITIAL_ACCOUNTS.filter(a => BACKFILLED_DEFAULT_ACCOUNT_CODES.has(a.code) && !activeSavedAccounts.some(existing => existing.code === a.code))]);
        setJournalEntries(migrateRetiredAccountLines(saved.journalEntries));
        setProjects(saved.projects || []);
        setAuditLogs(saved.auditLogs || []);
        setSettings(saved.settings);
        setClosedFiscalYears(saved.closedFiscalYears || []);
        setReceiptAttachments(saved.receiptAttachments || []);
        setCustomClassificationRules(saved.customClassificationRules || []);
        setActivityFeeRecords(saved.activityFeeRecords || []);
        setDraftTransactions(saved.draftTransactions || []);
        setFinancialStatementHistory(saved.financialStatementHistory || []);
        const savedWorkspaces = migrateReportingPeriodWorkspaces(saved.reportingPeriodWorkspaces || []);
        setReportingPeriodWorkspaces(savedWorkspaces);
        if (saved.settings.semester && saved.settings.reportingYear) {
          const schoolYear = `${saved.settings.reportingYear}-${saved.settings.reportingYear + 1}`;
          setOpeningBalances(savedWorkspaces.find(workspace => workspace.key === `${schoolYear}::${saved.settings.semester}`)?.openingBalances || {});
        } else {
          setOpeningBalances({});
        }
      } else {
        const legacyWorkspaceExists = Boolean(localStorage.getItem('orgAccount'));
        const organizationName = typeof user.user_metadata.organization_name === 'string'
          ? user.user_metadata.organization_name
          : workspaceSnapshot.organizationName;
        const initialWorkspace = legacyWorkspaceExists
          ? workspaceSnapshot
          : { ...workspaceSnapshot, organizationName, settings: { ...workspaceSnapshot.settings, organizationName } };
        if (!legacyWorkspaceExists) setSettings(previous => ({ ...previous, organizationName }));
        const { error: createError } = await supabase.from('user_workspaces').insert({ user_id: user.id, data: initialWorkspace });
        if (createError) {
          setWorkspaceStatus('error');
          setWorkspaceError(createError.message);
          return;
        }
      }
      if (active) setWorkspaceStatus('ready');
    };

    void loadWorkspace();
    return () => { active = false; };
  // The signed-in account decides when a remote workspace must be loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!user || workspaceStatus !== 'ready') return;
    const saveTimer = window.setTimeout(() => {
      void supabase.from('user_workspaces').upsert({ user_id: user.id, data: workspaceSnapshot, updated_at: new Date().toISOString() });
    }, 600);
    return () => window.clearTimeout(saveTimer);
  }, [user, workspaceStatus, workspaceSnapshot]);

  // Keep the active semester's complete editable books mirrored in the
  // workspace archive. Switching semesters therefore behaves like opening
  // another workbook instead of filtering one lifetime ledger.
  useEffect(() => {
    if (!settings.semester || !settings.reportingYear) return;
    const schoolYear = `${settings.reportingYear}-${settings.reportingYear + 1}`;
    const key = `${schoolYear}::${settings.semester}`;
    const now = new Date().toISOString();
    setReportingPeriodWorkspaces(previous => {
      const existing = previous.find(workspace => workspace.key === key);
      const snapshot: ReportingPeriodWorkspace = {
        key,
        schoolYear,
        semester: settings.semester as '1st Semester' | '2nd Semester',
        reportingYear: settings.reportingYear as number,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        journalEntries,
        projects,
        closedFiscalYears,
        receiptAttachments,
        activityFeeRecords,
        draftTransactions,
        openingBalances,
      };
      return existing
        ? previous.map(workspace => workspace.key === key ? snapshot : workspace)
        : [snapshot, ...previous];
    });
  }, [settings.semester, settings.reportingYear, journalEntries, projects, closedFiscalYears, receiptAttachments, activityFeeRecords, draftTransactions, openingBalances]);

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

  // A rule with no availableInSemester applies year-round. One that has it
  // only matches while settings.semester equals it — including when
  // settings.semester is still unset (a fresh org that hasn't used the
  // Navbar's fiscal year picker yet), which fails safe by hiding every
  // semester-restricted type rather than guessing which one applies.
  const isRuleAvailable = (rule: ClassificationRuleWithWorkflow): boolean => (
    !rule.availableInSemester || rule.availableInSemester === settings.semester
  );

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
    const exactDescMatch = classificationRules.find(rule => rule.description.toLowerCase() === lowerName && isRuleAvailable(rule));
    if (exactDescMatch) {
      return {
        debitAccountCode: exactDescMatch.debitAccountCode,
        creditAccountCode: exactDescMatch.creditAccountCode,
        defaultDesc: exactDescMatch.description,
        purposeOptions: exactDescMatch.purposeOptions,
        requiresAccrualCompletion: exactDescMatch.requiresAccrualCompletion,
        mayDeferPortion: exactDescMatch.mayDeferPortion,
        sponsorshipKind: exactDescMatch.sponsorshipKind,
        accrualAudience: exactDescMatch.accrualAudience
      };
    }

    for (const rule of classificationRules) {
      if (lowerName.includes(rule.keyword) && isRuleAvailable(rule)) {
        return {
          debitAccountCode: rule.debitAccountCode,
          creditAccountCode: rule.creditAccountCode,
          defaultDesc: rule.description,
          purposeOptions: rule.purposeOptions,
          requiresAccrualCompletion: rule.requiresAccrualCompletion,
          mayDeferPortion: rule.mayDeferPortion,
          sponsorshipKind: rule.sponsorshipKind,
          accrualAudience: rule.accrualAudience
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
    transactionMeta?: TransactionMetadata,
    isDraft = false,
    draftId?: string,
    replaceDraftEntryId?: string,
  ) => {
    const replaced = replaceDraftEntryId ? journalEntries.find(entry => entry.id === replaceDraftEntryId && entry.isDraft) : undefined;
    if (replaceDraftEntryId && !replaced) throw new Error('Draft journal entry not found.');
    const activeEntries = journalEntries.filter(entry => !entry.isDraft && entry.id !== replaced?.id);
    const nextBalances = computeAccountBalances([...activeEntries, { id: 'pending-validation', reference: 'PENDING', date, description, project, lines } as JournalEntry], accounts);
    Object.entries(openingBalances).forEach(([code, balance]) => { nextBalances[code] = (nextBalances[code] || 0) + balance; });
    const changedCodes = new Set(lines.map(line => line.accountCode));
    const negativeAccount = !isDraft && accounts.find(account => changedCodes.has(account.code) && (nextBalances[account.code] || 0) < -0.005);
    if (negativeAccount) throw new Error(`This transaction would give ${negativeAccount.name} a negative balance. Please check the previous transactions and available balance.`);
    const reference = replaced?.reference || generateNextReference(journalEntries);
    const newEntry: JournalEntry = {
      id: replaced?.id || `je-${Date.now()}`,
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
      } : {}),
      ...(isDraft ? { isDraft: true } : {}),
      ...(draftId ? { draftId } : {})
    };

    setJournalEntries(prev => replaced ? prev.map(entry => entry.id === replaced.id ? newEntry : entry) : [...prev, newEntry]);
    logAudit(isDraft ? (replaced ? 'Update Draft Journal Entry' : 'Create Draft Journal Entry') : 'Create Journal Entry', `${isDraft ? 'Saved draft' : 'Posted'} journal entry ${reference}: ${description} (${settings.currencySymbol}${lines.reduce((s, l) => s + l.debit, 0).toLocaleString()})`);
    return newEntry;
  };

  const updateJournalEntry = (entry: JournalEntry) => {
    const current = journalEntries.find(candidate => candidate.id === entry.id);
    if (!current || current.reversalOfEntryId || current.reversedByEntryId || current.transactionDetails?.carriedForward || current.transactionDetails?.reviewFinalized || current.description.startsWith('Closing Entries')) {
      throw new Error('This posted transaction can no longer be edited.');
    }
    setJournalEntries(previous => previous.map(candidate => candidate.id === entry.id ? entry : candidate));
    logAudit('Edit Journal Entry', `Updated posted journal entry ${entry.reference}: ${entry.description}.`);
  };

  const finalizeDraftJournalEntry = (id: string) => {
    const current = journalEntries.find(entry => entry.id === id);
    if (!current?.isDraft) throw new Error('Draft journal entry not found.');
    setJournalEntries(previous => previous.map(entry => entry.id === id ? { ...entry, isDraft: false } : entry));
    logAudit('Finalize Draft Journal Entry', `Finalized draft journal entry ${current.reference}: ${current.description}.`);
  };

  const finalizePrepaidAssetForSemester = (entryId: string, semesterKey: string) => {
    const entry = journalEntries.find(candidate => candidate.id === entryId);
    if (!entry) throw new Error('Prepaid-asset purchase not found.');
    setJournalEntries(previous => previous.map(candidate => candidate.id === entryId ? {
      ...candidate,
      transactionDetails: { ...(candidate.transactionDetails || { eventRelated: false, receiptAttachmentIds: [] }), prepaidSemesterFinalized: semesterKey },
    } : candidate));
    logAudit('Finalize Prepaid Review', `Finalized ${entry.reference} for ${semesterKey}.`);
  };

  const finalizeJournalEntry = (id: string) => {
    const current = journalEntries.find(candidate => candidate.id === id);
    if (!current?.transactionDetails?.customerOrder || current.transactionDetails.reviewFinalized) return;
    const issues = customerOrderFinalizationIssues(current);
    if (issues.length) throw new Error(issues.join('. '));
    setJournalEntries(previous => previous.map(candidate => candidate.id === id ? {
      ...candidate,
      transactionDetails: { ...candidate.transactionDetails!, reviewFinalized: true },
    } : candidate));
    logAudit('Finalize Journal Entry', `Finalized posted journal entry ${current.reference}: ${current.description}.`);
  };

  // Posted entries are never hard-deleted. Correcting one posts a new
  // entry with every line's debit/credit swapped (a standard reversing
  // entry) and marks the original as reversed, so both sides of the
  // correction stay in the permanent, audit-visible record.
  const reverseJournalEntry = (id: string) => {
    const entry = journalEntries.find(e => e.id === id);
    if (!entry || entry.reversedByEntryId || entry.description.startsWith('Closing Entries')) return;
    const orderBlock = customerOrderReversalBlock(entry, journalEntries);
    if (orderBlock) { window.alert(orderBlock); return; }

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
      ...prev.map(e => e.id === id
        ? { ...e, reversedByEntryId: reversalEntry.id }
        : entry.transactionType === 'Consumption of Prepaid Assets' && entry.settlesEntryId === e.id
          ? { ...e, transactionDetails: { ...e.transactionDetails!, prepaidSemesterFinalized: undefined } }
          : e),
      reversalEntry,
    ]);
    logAudit('Reverse Journal Entry', `Reversed ${entry.reference}: ${entry.description} (via new entry ${reference})`);
  };

  const deleteJournalEntry = (id: string) => {
    const entry = journalEntries.find(candidate => candidate.id === id);
    if (!entry || entry.description.startsWith('Closing Entries')) return;
    if (entry.transactionDetails?.carriedForward) return;
    if (!entry.transactionDetails?.customerOrder) {
      const orderBlock = customerOrderReversalBlock(entry, journalEntries);
      if (orderBlock) { window.alert(orderBlock); return; }
    }

    // Deleting an original also removes its linked reversal; deleting only a
    // reversal reactivates the original by clearing reversedByEntryId.
    const idsToDelete = new Set<string>([id]);
    // Remove the whole linked order, including reversals, so its inventory
    // releases and customer balances cannot survive without the original.
    if (entry.transactionDetails?.customerOrder) {
      journalEntries.filter(candidate => candidate.transactionDetails?.customerOrderId === id)
        .forEach(candidate => { idsToDelete.add(candidate.id); if (candidate.reversedByEntryId) idsToDelete.add(candidate.reversedByEntryId); });
    }
    if (entry.reversedByEntryId) idsToDelete.add(entry.reversedByEntryId);
    setJournalEntries(previous => previous
      .filter(candidate => !idsToDelete.has(candidate.id))
      .map(candidate => candidate.reversedByEntryId === id ? { ...candidate, reversedByEntryId: undefined } : candidate));
    setReceiptAttachments(previous => previous.filter(receipt => !idsToDelete.has(receipt.entryId)));
    setActivityFeeRecords(previous => previous.flatMap(record => {
      const removedLinkedHistory = record.history.some(item => item.journalEntryId && idsToDelete.has(item.journalEntryId));
      if (!removedLinkedHistory) return [record];
      const history = record.history.filter(item => !item.journalEntryId || !idsToDelete.has(item.journalEntryId));
      // A guided Activity Fee record exists only to track its submitted
      // journal entries. Once its final linked entry is deleted, retaining
      // an empty record leaves an orphaned red item in Review even though
      // the Ledger and Trial Balance are already zero.
      if (history.length === 0) return [];
      return [{ ...record, history, updatedAt: new Date().toISOString() }];
    }));
    logAudit('Delete Posted Transaction', `Permanently deleted ${entry.reference}${idsToDelete.size > 1 ? ' and its linked reversal' : ''}: ${entry.description}.`);
  };

  const commitActivityFeeSchedule = (schedule: ActivityFeeSchedule, eventName: string, reportingPeriod: string) => {
    const firstReferenceNumber = journalEntries.reduce((max, entry) => {
      const match = entry.reference.match(/^JE-(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const stamp = Date.now();
    const entries: JournalEntry[] = schedule.postings.map((posting, index) => ({
      id: `je-${stamp}-af-${index}`,
      reference: `JE-${String(firstReferenceNumber + index).padStart(4, '0')}`,
      date: posting.date,
      description: `${posting.description}: ${eventName}`,
      project: GENERAL_FUND_PROJECT,
      lines: posting.lines,
      eventName,
    }));
    if (entries.length > 0) setJournalEntries(previous => [...previous, ...entries]);
    return schedule.postings.map((posting, index) => ({
      id: `afh-${stamp}-${index}`,
      date: posting.date,
      reportingPeriod,
      action: posting.action,
      amount: posting.amount,
      journalEntryId: entries[index].id,
    }));
  };

  const createActivityFeeRecord = (input: { eventName: string; eventOccursThisPeriod: boolean; eventDate?: string; totalExpected?: number; priorPeriodCollected?: number; collections: DatedAmountRecord[]; reportingPeriod: string }): ActivityFeeRecord => {
    if (!input.eventName.trim()) throw new Error('Event name is required.');
    const schedule = buildInitialActivityFeeSchedule(input);
    const now = new Date().toISOString();
    const nextNumber = activityFeeRecords.reduce((max, record) => {
      const match = record.reference.match(/AF-(\d+)/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const eventName = input.eventName.trim();
    const history = commitActivityFeeSchedule(schedule, eventName, input.reportingPeriod);
    const record: ActivityFeeRecord = {
      id: `activity-fee-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      reference: `AF-${String(nextNumber).padStart(4, '0')}`,
      eventName,
      ...schedule.next,
      ...(input.eventDate ? { eventDate: input.eventDate } : {}),
      priorPeriodCollected: input.priorPeriodCollected || 0,
      collections: input.collections,
      ...(input.eventOccursThisPeriod ? { semesterCollectionsReviewed: false, semesterPaymentsReviewed: (schedule.next.refundLiabilityBalance || 0) <= 0 } : {}),
      createdAt: now,
      updatedAt: now,
      history,
    };
    setActivityFeeRecords(previous => [...previous, record]);
    logAudit('Activity Fee Event', `Created ${record.reference} for ${record.eventName}.`);
    return record;
  };

  const recognizeScheduledActivityFee = (id: string, totalExpected: number, eventDate: string, collections: DatedAmountRecord[], reportingPeriod: string): ActivityFeeRecord => {
    const current = activityFeeRecords.find(record => record.id === id);
    if (!current) throw new Error('Activity fee event not found.');
    const schedule = buildScheduledActivityFeeRecognition(current, totalExpected, eventDate, collections);
    const history = commitActivityFeeSchedule(schedule, current.eventName, reportingPeriod);
    const updated: ActivityFeeRecord = { ...current, ...schedule.next, eventDate, semesterCollectionsReviewed: false, semesterPaymentsReviewed: (schedule.next.refundLiabilityBalance || 0) <= 0, collections: [...(current.collections || []), ...collections], updatedAt: new Date().toISOString(), history: [...current.history, ...history] };
    setActivityFeeRecords(previous => previous.map(record => record.id === id ? updated : record));
    logAudit('Update Activity Fee Event', `${current.reference}: event held and activity fees recognized.`);
    return updated;
  };

  const collectActivityFeeReceivable = (id: string, collections: DatedAmountRecord[], reportingPeriod: string): ActivityFeeRecord => {
    const current = activityFeeRecords.find(record => record.id === id);
    if (!current) throw new Error('Activity fee event not found.');
    const schedule = buildActivityFeeReceivableCollections(current, collections);
    const history = commitActivityFeeSchedule(schedule, current.eventName, reportingPeriod);
    const updated: ActivityFeeRecord = { ...current, ...schedule.next, collections: [...(current.collections || []), ...collections], updatedAt: new Date().toISOString(), history: [...current.history, ...history] };
    setActivityFeeRecords(previous => previous.map(record => record.id === id ? updated : record));
    logAudit('Update Activity Fee Event', `${current.reference}: collected outstanding activity fees.`);
    return updated;
  };

  const updateActivityFeeRecord = (id: string, followUp: ActivityFeeFollowUp, date: string, reportingPeriod: string): ActivityFeeRecord => {
    const current = activityFeeRecords.find(record => record.id === id);
    if (!current) throw new Error('Activity fee event not found.');
    const posting = buildActivityFeeFollowUp(current, followUp);
    const entry = posting.lines.length > 0
      ? addJournalEntry(date, `${posting.description}: ${current.eventName}`, GENERAL_FUND_PROJECT, posting.lines, current.eventName)
      : undefined;
    const updated: ActivityFeeRecord = {
      ...current,
      ...posting.next,
      updatedAt: new Date().toISOString(),
      history: [...current.history, { id: `afh-${Date.now()}-${Math.floor(Math.random() * 1000)}`, date, reportingPeriod, action: posting.action, amount: posting.amount, ...(entry ? { journalEntryId: entry.id } : {}) }],
    };
    setActivityFeeRecords(previous => previous.map(record => record.id === id ? updated : record));
    logAudit('Update Activity Fee Event', `${current.reference}: ${posting.description}.`);
    return updated;
  };

  const reviewActivityFeeRows = (id: string, rows: DatedAmountRecord[], section: 'collections' | 'payments', reportingPeriod: string): ActivityFeeRecord => {
    const current = activityFeeRecords.find(record => record.id === id);
    if (!current) throw new Error('Activity fee event not found.');
    const activeSemester = settings.semester;
    const activeYear = settings.reportingYear;
    if (!activeSemester || !activeYear) throw new Error('Set the active semester and year first.');
    const cleanRows = rows.filter(row => Number(row.amount) > 0);
    if (cleanRows.length === 0) throw new Error(`Enter at least one ${section === 'collections' ? 'collection' : 'payment'} amount.`);
    if (cleanRows.some(row => !row.date || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0)) throw new Error('Each amount needs a date and must be greater than zero.');
    if (cleanRows.some(row => !isDateWithinReportingPeriod(row.date, activeSemester, activeYear))) throw new Error('Dates must be within the active reporting semester.');
    if (new Set(cleanRows.map(row => row.date)).size !== cleanRows.length) throw new Error('Combine amounts recorded on the same date into one row.');
    const total = cleanRows.reduce((sum, row) => sum + Number(row.amount), 0);
    const limit = section === 'collections'
      ? Math.max(0, current.totalExpected - current.totalCollected)
      : Math.max(0, current.refundLiabilityBalance || 0);
    if (total > limit + 0.005) throw new Error(`${section === 'collections' ? 'Collections' : 'Payments'} cannot exceed the remaining ${section === 'collections' ? 'Activity Fees Revenue amount' : 'Refund Liability'} of ${settings.currencySymbol}${limit.toLocaleString()}.`);
    const lines: JournalLine[] = cleanRows.flatMap(row => {
      const amount = Number(row.amount);
      return section === 'collections'
        ? [{ accountCode: '1010', debit: amount, credit: 0, date: row.date }, { accountCode: '4090', debit: 0, credit: amount, date: row.date }]
        : [{ accountCode: '2120', debit: amount, credit: 0, date: row.date }, { accountCode: '1010', debit: 0, credit: amount, date: row.date }];
    });
    const entry = addJournalEntry(cleanRows[0].date, section === 'collections' ? `Additional activity-fee collection: ${current.eventName}` : `Activity-fee refund-liability payment: ${current.eventName}`, GENERAL_FUND_PROJECT, lines, current.eventName);
    const nextHistory = [...current.history, ...cleanRows.map(row => ({ id: `afh-${Date.now()}-${Math.floor(Math.random() * 10000)}`, date: row.date, reportingPeriod, action: section === 'collections' ? 'additional-collection' as const : 'additional-payment' as const, amount: Number(row.amount), journalEntryId: entry.id }))];
    const updated: ActivityFeeRecord = {
      ...current,
      ...(section === 'collections' ? { totalCollected: current.totalCollected + total, semesterCollectionsReviewed: true } : { totalRefunded: current.totalRefunded + total, refundLiabilityBalance: Math.max(0, (current.refundLiabilityBalance || 0) - total), semesterPaymentsReviewed: true, status: Math.max(0, (current.refundLiabilityBalance || 0) - total) === 0 ? (current.receivableBalance > 0 ? 'receivable' as const : 'complete' as const) : current.status }),
      updatedAt: new Date().toISOString(), history: nextHistory,
    };
    setActivityFeeRecords(previous => previous.map(record => record.id === id ? updated : record));
    logAudit('Update Activity Fee Event', `${current.reference}: ${section === 'collections' ? 'additional collections' : 'refund-liability payments'} recorded.`);
    return updated;
  };

  const postActivityFeeReviewCollections = (id: string, rows: DatedAmountRecord[], reportingPeriod: string) => reviewActivityFeeRows(id, rows, 'collections', reportingPeriod);
  const postActivityFeeReviewPayments = (id: string, rows: DatedAmountRecord[], reportingPeriod: string) => reviewActivityFeeRows(id, rows, 'payments', reportingPeriod);
  const markActivityFeeReviewComplete = (id: string, section: 'collections' | 'payments') => {
    setActivityFeeRecords(previous => previous.map(record => record.id === id ? {
      ...record,
      ...(section === 'collections' ? { semesterCollectionsReviewed: true } : { semesterPaymentsReviewed: true }),
      updatedAt: new Date().toISOString(),
    } : record));
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

  const postClosingStage = (fiscalYear: string, closingDate: string, stage: 'revenue' | 'expense' | 'income-summary') => {
    const current = closedFiscalYears.find(record => record.fiscalYear === fiscalYear);
    if (current?.completed) throw new Error(`${fiscalYear} has already been closed.`);
    const requiredPrevious = stage === 'expense' ? current?.revenueClosingEntryId : stage === 'income-summary' ? current?.expenseClosingEntryId : true;
    if (!requiredPrevious) throw new Error('Complete the previous closing step first.');
    if (stage === 'revenue' && findFiscalCloseBlockers(journalEntries, accounts).length > 0) throw new Error('Complete all Review items before posting closing entries.');
    const balances = computeAccountBalances(journalEntries.filter(entry => entry.date <= closingDate), accounts);
    const lines = computeClosingStageLines(balances, accounts, stage, GENERAL_FUND_BALANCE_CODE);
    if (!lines.length) throw new Error(stage === 'income-summary' ? 'Income Summary has no balance to close.' : `No ${stage} balances remain to close.`);
    const label = stage === 'revenue' ? 'Close Revenues to Income Summary' : stage === 'expense' ? 'Close Expenses to Income Summary' : 'Close Income Summary to Accumulated Net Surplus (Deficit)';
    const entry = addJournalEntry(closingDate, `${label} — ${fiscalYear}`, GENERAL_FUND_PROJECT, lines);
    setClosedFiscalYears(previous => {
      const record: ClosingRecord = current || { id: `closing-${Date.now()}`, fiscalYear, closingDate, netIncome: 0, journalEntryId: '', closedAt: '' };
      const next = stage === 'revenue' ? { ...record, revenueClosingEntryId: entry.id } : stage === 'expense' ? { ...record, expenseClosingEntryId: entry.id } : { ...record, incomeSummaryClosingEntryId: entry.id, journalEntryId: entry.id, closedAt: new Date().toISOString(), completed: true, netIncome: balances[INCOME_SUMMARY_ACCOUNT_CODE] || 0 };
      return current ? previous.map(item => item.fiscalYear === fiscalYear ? next : item) : [...previous, next];
    });
    logAudit('Closing Entries', `${label} posted for ${fiscalYear} via ${entry.reference}.`);
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

  const saveDraftTransaction = (draft: { id?: string; category: string | null; label: string; formState: Record<string, unknown>; journalEntryId?: string }): string => {
    const id = draft.id || `draft-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const savedAt = new Date().toISOString();
    setDraftTransactions(prev => {
      const next: TransactionDraft = { id, savedAt, category: draft.category, label: draft.label, formState: draft.formState, ...(draft.journalEntryId ? { journalEntryId: draft.journalEntryId } : {}) };
      const existingIndex = prev.findIndex(d => d.id === id);
      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = next;
        return copy;
      }
      return [next, ...prev];
    });
    logAudit('Save Draft Transaction', `Saved "${draft.label}" as a draft to finish later in Review.`);
    return id;
  };

  const deleteDraftTransaction = (id: string, preserveJournalEntryIds: string[] = []) => {
    const preserved = new Set(preserveJournalEntryIds);
    setDraftTransactions(prev => {
      const existing = prev.find(d => d.id === id);
      if (existing) logAudit('Discard Draft Transaction', `Discarded draft "${existing.label}".`);
      if (existing?.journalEntryId && !preserved.has(existing.journalEntryId)) {
        setJournalEntries(entries => entries.filter(entry => entry.id !== existing.journalEntryId));
        setReceiptAttachments(receipts => receipts.filter(receipt => receipt.entryId !== existing.journalEntryId));
      }
      return prev.filter(d => d.id !== id);
    });
  };

  const recordFinancialStatementHistory = (record: Omit<FinancialStatementHistoryRecord, 'id' | 'generatedAt'>): FinancialStatementHistoryRecord => {
    const saved: FinancialStatementHistoryRecord = {
      ...record,
      id: `fs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      generatedAt: new Date().toISOString(),
    };
    setFinancialStatementHistory(previous => [saved, ...previous]);
    logAudit('Save Financial Statement Snapshot', `Saved ${record.semester} ${record.schoolYear} final ledger balances and financial statements.`);
    return saved;
  };

  const switchReportingPeriod = (schoolYear: string, semester: '1st Semester' | '2nd Semester', reportingYear: number) => {
    const targetKey = `${schoolYear}::${semester}`;
    const current = settings.semester && settings.reportingYear
      ? `${settings.reportingYear}-${settings.reportingYear + 1}::${settings.semester}`
      : null;
    if (current === targetKey) return;

    const target = reportingPeriodWorkspaces.find(workspace => workspace.key === targetKey);
    const predecessor = precedingSemester(reportingPeriodWorkspaces, reportingYear, semester);
    const nextOpeningBalances = migrateRetiredOpeningBalances(target?.openingBalances || (predecessor
      ? carryForwardOpeningBalances(
        predecessor.key === current ? openingBalances : predecessor.openingBalances || {},
        predecessor.key === current ? journalEntries : predecessor.journalEntries, accounts)
      : {}));
    const now = new Date().toISOString();
    if (current) {
      setReportingPeriodWorkspaces(previous => {
        const existing = previous.find(workspace => workspace.key === current);
        const currentSnapshot: ReportingPeriodWorkspace = {
          key: current,
          schoolYear: `${settings.reportingYear}-${(settings.reportingYear as number) + 1}`,
          semester: settings.semester as '1st Semester' | '2nd Semester',
          reportingYear: settings.reportingYear as number,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          journalEntries,
          projects,
          closedFiscalYears,
          receiptAttachments,
          activityFeeRecords,
          draftTransactions,
          openingBalances,
        };
        return existing ? previous.map(workspace => workspace.key === current ? currentSnapshot : workspace) : [currentSnapshot, ...previous];
      });
    }

    setJournalEntries(migrateRetiredAccountLines(target?.journalEntries || carryForwardCustomerOrders(predecessor ? (predecessor.key === current ? journalEntries : predecessor.journalEntries) : [], reportingPeriodBounds(semester, reportingYear).startDate)));
    setProjects(target?.projects || DEFAULT_PROJECTS.map(project => ({ ...project })));
    setClosedFiscalYears(target?.closedFiscalYears || []);
    setReceiptAttachments(target?.receiptAttachments || []);
    setActivityFeeRecords(target?.activityFeeRecords || []);
    setDraftTransactions(target?.draftTransactions || []);
    setOpeningBalances(nextOpeningBalances);
    setSettings(previous => ({ ...previous, fiscalYear: `SY ${schoolYear} • ${semester}`, semester, reportingYear }));
    logAudit(target ? 'Open Semester Workspace' : 'Add Semester Workspace', `${target ? 'Opened' : 'Created'} ${semester} ${schoolYear}.`);
  };

  const deleteSemester = (key: string) => {
    const result = deleteSemesterRecords(reportingPeriodWorkspaces, financialStatementHistory, key);
    const activeKey = settings.semester && settings.reportingYear
      ? `${settings.reportingYear}-${settings.reportingYear + 1}::${settings.semester}` : null;
    setReportingPeriodWorkspaces(result.workspaces);
    setFinancialStatementHistory(result.history);
    if (activeKey === key) {
      // Clear the selection in the same update so the archive effect cannot
      // recreate the deleted semester from the active books.
      setSettings(previous => ({ ...previous, fiscalYear: '', semester: '', reportingYear: undefined }));
      setJournalEntries([]);
      setProjects(DEFAULT_PROJECTS.map(project => ({ ...project })));
      setClosedFiscalYears([]);
      setReceiptAttachments([]);
      setActivityFeeRecords([]);
      setDraftTransactions([]);
      setOpeningBalances({});
    }
    logAudit('Delete Semester', `Deleted ${result.target.semester} ${result.target.schoolYear} and its financial records.`);
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
    setActivityFeeRecords([]);
    setDraftTransactions([]);
    logAudit('Clear Data', 'All journal entries, receipt attachments, and activity-fee records have been cleared.');
  };

  const resetFinancialWorkspace = () => {
    const resetLogEntry: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action: 'Reset Financial Workspace',
      details: 'Removed all financial records while preserving organization settings and the Chart of Accounts.',
      user: settings.organizationName,
    };

    setJournalEntries([]);
    setReceiptAttachments([]);
    setProjects(DEFAULT_PROJECTS.map(project => ({ ...project })));
    setClosedFiscalYears([]);
    setCustomClassificationRules([]);
    setActivityFeeRecords([]);
    setDraftTransactions([]);
    setFinancialStatementHistory([]);
    setOpeningBalances({});
    setAuditLogs([resetLogEntry]);
  };

  const loadSampleData = () => {
    setAccounts(INITIAL_ACCOUNTS);
    setJournalEntries(INITIAL_JOURNALS);
    setProjects(INITIAL_PROJECTS);
    setReceiptAttachments([]);
    setActivityFeeRecords([]);
    setDraftTransactions([]);
    setFinancialStatementHistory([]);
    setOpeningBalances({});
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
    activityFeeRecords,
    draftTransactions,
    financialStatementHistory,
    reportingPeriodWorkspaces,
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

    const restoredAccounts = payload.accounts.filter(account => !RETIRED_ACCOUNT_CODES.has(account.code)).map(account => {
      const current = INITIAL_ACCOUNTS.find(defaultAccount => defaultAccount.code === account.code && ['1270', '1360', '2010', '2020'].includes(account.code));
      return current ? { ...account, name: current.name, description: current.description } : account;
    });
    setAccounts([...restoredAccounts, ...INITIAL_ACCOUNTS.filter(a => BACKFILLED_DEFAULT_ACCOUNT_CODES.has(a.code) && !restoredAccounts.some(existing => existing.code === a.code))]);
    setJournalEntries(migrateRetiredAccountLines(payload.journalEntries));
    setProjects(Array.isArray(payload.projects) ? payload.projects : []);
    setAuditLogs([restoreLogEntry, ...restoredLogs].slice(0, 100));
    setSettings(payload.settings);
    setClosedFiscalYears(Array.isArray(payload.closedFiscalYears) ? payload.closedFiscalYears : []);
    setReceiptAttachments(Array.isArray(payload.receiptAttachments) ? payload.receiptAttachments : []);
    setCustomClassificationRules(Array.isArray(payload.customClassificationRules) ? payload.customClassificationRules : []);
    setActivityFeeRecords(Array.isArray(payload.activityFeeRecords) ? payload.activityFeeRecords : []);
    setDraftTransactions(Array.isArray(payload.draftTransactions) ? payload.draftTransactions : []);
    setFinancialStatementHistory(Array.isArray(payload.financialStatementHistory) ? payload.financialStatementHistory : []);
    const restoredWorkspaces = migrateReportingPeriodWorkspaces(Array.isArray(payload.reportingPeriodWorkspaces) ? payload.reportingPeriodWorkspaces : []);
    setReportingPeriodWorkspaces(restoredWorkspaces);
    if (payload.settings.semester && payload.settings.reportingYear) {
      const schoolYear = `${payload.settings.reportingYear}-${payload.settings.reportingYear + 1}`;
      setOpeningBalances(restoredWorkspaces.find(workspace => workspace.key === `${schoolYear}::${payload.settings.semester}`)?.openingBalances || {});
    } else {
      setOpeningBalances({});
    }
  };

  // Computations
  const accountBalances = useMemo(
    () => combineOpeningAndPeriodBalances(openingBalances, computeAccountBalances(journalEntries, accounts), accounts),
    [openingBalances, journalEntries, accounts]
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
      workspaceStatus,
      workspaceError,
      accounts,
      journalEntries,
      projects,
      auditLogs,
      settings,
      classificationRules,
      customClassificationRules,
      closedFiscalYears,
      receiptAttachments,
      activityFeeRecords,
      draftTransactions,
      financialStatementHistory,
      reportingPeriodWorkspaces,
      openingBalances,
      addJournalEntry,
      updateJournalEntry,
      finalizeDraftJournalEntry,
      finalizePrepaidAssetForSemester,
      finalizeJournalEntry,
      reverseJournalEntry,
      deleteJournalEntry,
      postClosingStage,
      attachReceiptsToEntry,
      addCustomClassificationRule,
      updateCustomClassificationRule,
      createActivityFeeRecord,
      recognizeScheduledActivityFee,
      collectActivityFeeReceivable,
      updateActivityFeeRecord,
      postActivityFeeReviewCollections,
      postActivityFeeReviewPayments,
      markActivityFeeReviewComplete,
      saveDraftTransaction,
      deleteDraftTransaction,
      recordFinancialStatementHistory,
      switchReportingPeriod,
      deleteSemester,
      addAccount,
      updateAccount,
      addProject,
      updateProject,
      updateSettings,
      formatCurrency,
      suggestTransactionClassification,
      isRuleAvailable,
      accountBalances,
      totals,
      netIncome,
      isBalanced,
      clearAllData,
      resetFinancialWorkspace,
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
