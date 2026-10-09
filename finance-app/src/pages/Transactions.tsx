import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  PlusCircle,
  Sparkles,
  ArrowRightLeft,
  Scale,
  Layers,
  TrendingDown,
  TrendingUp,
  Undo2,
  Paperclip,
  X,
  CalendarDays,
  ShoppingBag,
  Users,
  ShoppingCart,
  LayoutGrid
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFinance, PurposeOption } from '../context/FinanceContext';
import { JournalLine, ReceiptAttachmentDraft, TransactionDraft } from '../types';
import { FUNDING_SOURCE_OPTIONS, buildJournalLines, buildCompoundJournalLines, projectJournalLineImpacts, computeStatementImpact } from '../lib/journalEngine';
import { PREPAID_EXPENSE_CODE } from '../lib/reviewEngine';
import { formatReceiptSize, prepareReceiptAttachment, validateReceiptCount } from '../lib/receiptAttachments';
import { ActivityFeeEntry } from '../components/ActivityFeeEntry';
import { CustomerOrderEntry, CUSTOMER_ORDER_DRAFT } from '../components/CustomerOrderEntry';
import { InventorySummaryCard } from '../components/InventorySummaryCard';
import { DatedAmountInputRow, DatedAmountRows, hasDuplicateEnteredDates } from '../components/DatedAmountRows';
import { NewFeatureBadge } from '../components/NewFeatureBadge';
import { ReviewLaterNote } from '../components/ReviewLaterNote';
import { PrepaidAssetEntry } from '../components/PrepaidAssetEntry';
import { PayablesEntry } from '../components/PayablesEntry';
import { categorizeTransactionRule, TRANSACTION_CATEGORIES, TransactionCategoryId } from '../lib/transactionCategories';
import { merchandiseSaleCostError } from '../lib/transactionHistory';
import {
  buildMerchandiseAcquisitionPosting,
  splitMerchandiseAcquisitionPosting,
  buildMerchandisePrepaymentPosting,
  buildSupplierReceivableCollectionPosting,
  aggregateAvailableMerchandisePrepayments,
  MerchandisePaymentMethod,
} from '../lib/merchandiseAcquisition';
import {
  buildMerchandiseBatchBalances,
  buildMerchandiseSalePosting,
  MerchandiseCollectionMethod,
} from '../lib/merchandiseSale';
import {
  buildCurrentMembershipFeePosting,
  buildMembershipRefundResolution,
  buildPriorMembershipCollectionPosting,
  MEMBERSHIP_REFUND_LIABILITY_CODE,
  MembershipRefundStatus,
} from '../lib/membershipFees';
import { buildOutrightExpensePosting, splitBalancedJournalLinesByDate, OutrightExpensePaymentMethod } from '../lib/outrightExpense';
import { counterpartyBalance, counterpartyBalances } from '../lib/counterpartyBalances';
import { isDateWithinReportingPeriod, periodForSemester, reportingPeriodBounds } from '../lib/reportingPeriod';

const GENERAL_FUND_PROJECT = 'General Fund Operations';
// Working paper's Situation 5.1/5.2/5.3 branch: a donor-restricted
// contribution whose event hasn't happened yet this period.
const RESTRICTED_REVENUE_CODE = '4035';
const PERMANENTLY_RESTRICTED_REVENUE_CODE = '4036';
const UNRESTRICTED_REVENUE_CODE = '4030';
const MEMBERSHIP_DUES_RECEIVABLE_CODE = '1300';
const MERCHANDISE_ITEM_OPTIONS = ['Lanyard', 'Pins', 'Tote Bag', 'Mug', 'Shirt', 'Stickers', 'Others'] as const;
const sumDatedAmounts = (rows: DatedAmountInputRow[]): number => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
const EXPENSE_TYPES_HIDDEN_FROM_PICKER = new Set([
  'Flight Ticket Fare', 'Freight Expense', 'Gasoline Expense', 'General Staff Payroll', 'Honoraria Expense',
  'Hourly Wages Pay', 'Miscellaneous Operating Expense', 'Monthly Office Rental Payment', 'Notebooks and Writing Pads',
  'Office Administrative Supplies', 'Office Space Lease', 'Office Supplies Billed by Vendor', 'Office Supplies Purchase',
  'Office Supplies Stationary', 'Power Bill Payment', 'Printer Ink Supplies', 'Printer Paper and Ink',
  'Event & Operational Supplies', 'Printing Expense', 'Electricity Utility Bill', 'Awards & Prizes Expense', 'Ballpen and Writing Supplies',
  'Business Travel Reimbursement', 'Communication Expense', 'Document Folders and Filing Supplies',
]);
const MERCHANDISE_TYPES_HIDDEN_FROM_PICKER = new Set([
  'Acquisition of Merchandise for Sale - Goods Received and On Hand',
  'Downpayment for Pre-ordered Merchandise',
]);
const MISC_TYPES_HIDDEN_FROM_PICKER = new Set([
  'Bank Loan Capital Funding', 'Client Consulting Services', 'Customer Invoice Billed',
  'Customer Milestone Invoice', 'Professional Services Rendered', 'Public Funding Grant Receipt',
  'Release from Custodian - Restricted Contribution Now Unrestricted',
  'Release from Restriction — Restricted Contribution Now Unrestricted',
]);

const localDateInputValue = (): string => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
};

// The generic bag saved as a draft's TransactionDraft.formState — mirrors
// every field of the general transaction form that's worth resuming later.
// ActivityFeeEntry owns and restores its own draft snapshot separately.
interface TransactionFormSnapshot {
  txName: string;
  selectedCategory: TransactionCategoryId | null;
  selectedExpenseAccountCode: string;
  description: string;
  amount: number;
  date: string;
  purposeIndex: number;
  pendingReceipts: ReceiptAttachmentDraft[];
  fundingSourceId: string;
  counterpartyName: string;
  restrictionAnswer: '' | 'no' | 'yes' | 'permanent';
  samePeriodAnswer: '' | 'yes' | 'no';
  contributionPurpose: '' | 'donations' | 'sponsorships';
  membershipCollections: DatedAmountInputRow[];
  membershipRefundStatus: MembershipRefundStatus;
  notYetUsedAmount: string;
  expectedUsePeriod: 'within' | 'next';
  merchandiseCost: string;
  merchandiseItem: string;
  merchandiseOtherTitle: string;
  merchandiseQuantity: string;
  merchandiseBatch: string;
  merchandisePrepaymentEntryId: string;
  merchandisePaymentMethod: MerchandisePaymentMethod;
  merchandiseOrganizationPayments: DatedAmountInputRow[];
  merchandiseOfficerPayments: DatedAmountInputRow[];
  merchandiseAdvancePayments: DatedAmountInputRow[];
  merchandiseSaleItem: string;
  merchandiseSaleBatchId: string;
  merchandiseQuantitySold: string;
  merchandiseSellingPrice: string;
  merchandiseCollectionMethod: MerchandiseCollectionMethod;
  merchandiseCollections: DatedAmountInputRow[];
  merchandiseRemittances: DatedAmountInputRow[];
  merchandiseCollectionOfficer: string;
}

interface TransactionsProps {
  // The draft to load into the form, or null/undefined for a fresh entry.
  // Owned by App.tsx (Review's "Continue" sets it, this component consumes
  // it once via a ref guard, then calls onDraftResumed to clear it).
  draftToResume?: TransactionDraft | null;
  onDraftResumed?: () => void;
  onDraftSaved?: () => void;
}

export function Transactions({ draftToResume = null, onDraftResumed, onDraftSaved }: TransactionsProps = {}): React.ReactElement {
  const {
    accounts,
    journalEntries,
    draftTransactions,
    addJournalEntry,
    attachReceiptsToEntry,
    reverseJournalEntry,
    suggestTransactionClassification,
    classificationRules,
    isRuleAvailable,
    accountBalances,
    formatCurrency,
    settings,
    saveDraftTransaction,
    deleteDraftTransaction,
  } = useFinance();

  // Form State
  const [txName, setTxName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TransactionCategoryId | null>(null);
  const [customerOrdersOpen, setCustomerOrdersOpen] = useState(false);
  // Transaction Name search dropdown: open while the field has focus,
  // filtered live as you type. Selecting an option fills txName with its
  // description and applies that exact rule (see the exact-description
  // match in suggestTransactionClassification). Known types keep their
  // accounts automatic.
  const [showTxDropdown, setShowTxDropdown] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState('');
  // Semester/Period/Year are no longer asked per-transaction — every entry
  // inherits the org's currently active values (set once, org-wide, via
  // the Navbar's fiscal year picker) instead.
  const semester = settings.semester || '';
  const reportingPeriod = semester ? periodForSemester(semester) : '';
  const membershipPeriodBounds = settings.semester && settings.reportingYear
    ? reportingPeriodBounds(settings.semester, settings.reportingYear)
    : null;
  const [debitCode, setDebitCode] = useState('5030'); // default Utilities
  const [creditCode, setCreditCode] = useState('1010'); // default Cash
  const [isSmartMatched, setIsSmartMatched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [lastPostedEntry, setLastPostedEntry] = useState<{ id: string; reference: string } | null>(null);
  const [pendingReceipts, setPendingReceipts] = useState<ReceiptAttachmentDraft[]>([]);
  const [receiptMessage, setReceiptMessage] = useState('');
  const [isProcessingReceipts, setIsProcessingReceipts] = useState(false);
  const [merchandiseCost, setMerchandiseCost] = useState('');
  const [merchandiseItem, setMerchandiseItem] = useState('');
  const [merchandiseOtherTitle, setMerchandiseOtherTitle] = useState('');
  const [merchandiseQuantity, setMerchandiseQuantity] = useState('');
  const [merchandiseBatch, setMerchandiseBatch] = useState('');
  const [merchandisePrepaymentEntryId, setMerchandisePrepaymentEntryId] = useState('');
  const [merchandisePaymentMethod, setMerchandisePaymentMethod] = useState<MerchandisePaymentMethod>('organization-funds');
  const [merchandiseOrganizationPayments, setMerchandiseOrganizationPayments] = useState<DatedAmountInputRow[]>([{ id: 'org-payment-1', date, amount: '' }]);
  const [merchandiseOfficerPayments, setMerchandiseOfficerPayments] = useState<DatedAmountInputRow[]>([{ id: 'officer-payment-1', date, amount: '' }]);
  const [merchandiseAdvancePayments, setMerchandiseAdvancePayments] = useState<DatedAmountInputRow[]>([{ id: 'advance-payment-1', date, amount: '' }]);
  const [merchandiseSaleItem, setMerchandiseSaleItem] = useState('');
  const [merchandiseSaleBatchId, setMerchandiseSaleBatchId] = useState('');
  const [merchandiseQuantitySold, setMerchandiseQuantitySold] = useState('');
  const [merchandiseSellingPrice, setMerchandiseSellingPrice] = useState('');
  const [merchandiseCollectionMethod, setMerchandiseCollectionMethod] = useState<MerchandiseCollectionMethod>('not-yet-collected');
  const [merchandiseCollections, setMerchandiseCollections] = useState<DatedAmountInputRow[]>([{ id: 'collection-1', date, amount: '' }]);
  const [merchandiseRemittances, setMerchandiseRemittances] = useState<DatedAmountInputRow[]>([{ id: 'remittance-1', date, amount: '' }]);
  const [merchandiseCollectionOfficer, setMerchandiseCollectionOfficer] = useState('');
  const [outrightPaymentMethod, setOutrightPaymentMethod] = useState<OutrightExpensePaymentMethod>('organization-funds');
  const [outrightOrganizationPayments, setOutrightOrganizationPayments] = useState<DatedAmountInputRow[]>([{ id: 'expense-org-1', date, amount: '' }]);
  const [outrightOfficerPayments, setOutrightOfficerPayments] = useState<DatedAmountInputRow[]>([{ id: 'expense-officer-1', date, amount: '' }]);
  const [outrightAdvancePayments, setOutrightAdvancePayments] = useState<DatedAmountInputRow[]>([{ id: 'expense-advance-1', date, amount: '' }]);
  const [outrightOfficer, setOutrightOfficer] = useState('');
  const [expenseEvent, setExpenseEvent] = useState<'' | 'yes' | 'no'>('');
  const [expenseEventName, setExpenseEventName] = useState('');

  const changeMerchandisePaymentMethod = (next: MerchandisePaymentMethod) => {
    setMerchandisePaymentMethod(next);
    if (next !== 'organization-funds' && next !== 'advance-and-personal') setMerchandiseOrganizationPayments([{ id: `org-payment-${Date.now()}`, date: '', amount: '' }]);
    if (next !== 'officer-personal' && next !== 'advance-and-personal') setMerchandiseOfficerPayments([{ id: `officer-payment-${Date.now()}`, date: '', amount: '' }]);
    if (next !== 'organization-advance' && next !== 'advance-and-personal') setMerchandiseAdvancePayments([{ id: `advance-payment-${Date.now()}`, date: '', amount: '' }]);
    if (next === 'organization-funds' || next === 'not-yet-paid') {
      setCounterpartyName('');
      setOutrightOfficer('');
    }
  };

  // "Whose money paid for it?" (Question B from the posting-engine build
  // plan). Only meaningful when the credit side is a cash account — for a
  // revenue, loan, or on-account match the money isn't coming out of the
  // org's cash at all, so this question doesn't apply and stays hidden.
  const [fundingSourceId, setFundingSourceId] = useState<string>(FUNDING_SOURCE_OPTIONS[0].id);
  const [counterpartyName, setCounterpartyName] = useState('');

  // Donation/Restriction branching (working paper Situations 5.1/5.2/5.3):
  // two mandatory, chained questions, shown only for a cash contribution
  // (Dr Cash / Cr Contributions Revenue - Unrestricted). The first
  // ("restricted?") is asked whenever the question applies; the second
  // ("same period?") only branches out once the first is answered "yes" —
  // both must be answered before the transaction can post.
  const [restrictionAnswer, setRestrictionAnswer] = useState<'' | 'no' | 'yes' | 'permanent'>('');
  const [samePeriodAnswer, setSamePeriodAnswer] = useState<'' | 'yes' | 'no'>('');
  const [contributionPurpose, setContributionPurpose] = useState<'' | 'donations' | 'sponsorships'>('');

  const [membershipCollections, setMembershipCollections] = useState<DatedAmountInputRow[]>([
    { id: 'membership-collection-1', date: '', amount: '' },
  ]);
  const [membershipRefundStatus, setMembershipRefundStatus] = useState<MembershipRefundStatus>('current');

  // "How much of this is not yet used?" (client's flowchart Q4/Q5) — the
  // general matching-principle question, shown on categories flagged
  // mayDeferPortion. The not-yet-used portion defers into Prepaid Expenses
  // (1260) instead of being expensed now; REVIEW reclassifies it once it's
  // actually used. Doesn't apply when paid via an existing cash advance —
  // that funding source already has its own "was it used" resolution in
  // REVIEW, and stacking this on top would ask the same thing twice.
  const [notYetUsedAmount, setNotYetUsedAmount] = useState<string>('');
  const [expectedUsePeriod, setExpectedUsePeriod] = useState<'within' | 'next'>('within');

  // "What was it for?" (Question A). Only shown when the matched category
  // is genuinely ambiguous — see purposeOptions on the classification rule
  // in FinanceContext.tsx. Unlike the funding-source question, this does
  // not change the debit account (the keyword match already fixed that);
  // it only changes the description and whether the expense defaults to
  // Event-Related.
  const [purposeIndex, setPurposeIndex] = useState(0);

  // Non-null while this form is resuming/re-saving a specific draft rather
  // than starting a fresh entry — "Save as Draft" updates this same draft
  // instead of creating a duplicate, and a successful Post deletes it.
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [selectedExpenseAccountCode, setSelectedExpenseAccountCode] = useState('5010');
  // Set for exactly one effect pass right after a draft is hydrated, so the
  // classification-match effect below (keyed on txName, which hydration
  // also sets) doesn't immediately wipe the just-restored fields back to
  // their blank defaults.
  const justHydratedDraftRef = useRef(false);
  const appliedDraftIdRef = useRef<string | null>(null);

  const [classificationPreview, setClassificationPreview] = useState<{
    debitAccountCode: string;
    creditAccountCode: string;
    defaultDesc: string;
    purposeOptions?: PurposeOption[];
    requiresAccrualCompletion?: boolean;
    mayDeferPortion?: boolean;
    sponsorshipKind?: 'cash';
    accrualAudience?: 'all' | 'new';
  } | null>(null);

  // active accounts
  const activeAccounts = accounts.filter(a => a.isActive);

  // Deduped, alphabetized list of known transaction types (two rules —
  // 'award'/'prize' — share the description "Awards & Prizes Expense",
  // since they're the same category under two different trigger words).
  const transactionTypeOptions = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'activity-fees') return [];
    if (selectedCategory === 'expense-transactions') return ['Outright Expense Payment'];
    return Array.from(new Set(
      classificationRules
        .filter(rule => categorizeTransactionRule(rule) === selectedCategory && isRuleAvailable(rule)
          && !(selectedCategory === 'merchandise' && MERCHANDISE_TYPES_HIDDEN_FROM_PICKER.has(rule.description))
          && !(selectedCategory === 'other' && MISC_TYPES_HIDDEN_FROM_PICKER.has(rule.description))
          && (selectedCategory !== 'ppe-transactions' || rule.description === 'Purchase Chairs' || rule.description.toLowerCase().startsWith('purchase of ')))
        .map(rule => rule.description)
    )).sort();
  }, [classificationRules, selectedCategory, isRuleAvailable]);
  const filteredTxTypeOptions = txName.trim()
    ? transactionTypeOptions.filter(d => d.toLowerCase().includes(txName.trim().toLowerCase()))
    : transactionTypeOptions;
  const selectedTransactionType = transactionTypeOptions.find(d => d.toLowerCase() === txName.trim().toLowerCase());
  const hasUnmatchedSearch = txName.trim().length > 0 && !classificationPreview;

  const selectCategory = (category: TransactionCategoryId) => {
    setSelectedCategory(category);
    if (category === 'expense-transactions') {
      const firstExpense = activeAccounts.find(account => account.type === 'Expenses' && account.isActive && account.code !== '5090' && account.code !== '5095');
      setSelectedExpenseAccountCode(firstExpense?.code || '5010');
      setTxName('Outright Expense Payment');
    }
    const fixedOfficerType = category === 'advances-to-officers'
      ? 'Advances to Officers'
      : category === 'reimbursements-to-officers' ? 'Reimbursement to Officer' : '';
    const matchingRule = fixedOfficerType
      ? classificationRules.find(rule => rule.description === fixedOfficerType && categorizeTransactionRule(rule) === category && isRuleAvailable(rule))
      : undefined;
    setTxName(matchingRule?.description || '');
    setShowTxDropdown(false);
    setErrorMessage('');
  };

  // The funding-source question only makes sense while the credit side is
  // still a cash account — once it points at a revenue, loan, or accounts
  // payable account, "whose money paid for it?" no longer applies.
  const isMerchandiseAcquisition = selectedCategory === 'merchandise' && debitCode === '1700';
  const isMerchandisePrepayment = selectedCategory === 'merchandise' && debitCode === '1270';

  // Only a cash contribution matched to Contributions Revenue - Unrestricted
  // can raise the restriction question — a release-from-restriction entry
  // (which also credits 4030, but debits 4035, not cash) is a different
  // transaction and must not ask it again.
  const isCashSponsorshipDonation = classificationPreview?.defaultDesc === 'Sponsorships and Donations';
  const showRestrictionQuestion = !!classificationPreview?.sponsorshipKind && (creditCode === UNRESTRICTED_REVENUE_CODE || isCashSponsorshipDonation);
  const showSamePeriodQuestion = showRestrictionQuestion && restrictionAnswer === 'yes';
  const isRestricted = showRestrictionQuestion && restrictionAnswer === 'yes' && samePeriodAnswer === 'no';
  const isPermanentlyRestricted = showRestrictionQuestion && restrictionAnswer === 'permanent';
  const isMembershipRefundStatus = classificationPreview?.defaultDesc === 'Excess Membership Fee Collection - Status';
  const effectiveCreditCode = isPermanentlyRestricted
    ? PERMANENTLY_RESTRICTED_REVENUE_CODE
    : isRestricted
    ? RESTRICTED_REVENUE_CODE
    : isCashSponsorshipDonation
      ? contributionPurpose === 'sponsorships' ? '4110' : '4100'
    : isMembershipRefundStatus && membershipRefundStatus === 'nonrefundable'
      ? '4050'
      : creditCode;
  const isSupplierReceivableCollection = selectedCategory === 'merchandise' && debitCode === '1010' && effectiveCreditCode === '1360';
  const merchandiseUsesOfficer = isMerchandiseAcquisition && (merchandisePaymentMethod === 'officer-personal' || merchandisePaymentMethod === 'organization-advance' || merchandisePaymentMethod === 'advance-and-personal');
  const isOfficerAdvance = debitCode === '1250';
  const isOfficerReimbursement = debitCode === '2050';
  const isFixedOfficerTransactionType = selectedCategory === 'advances-to-officers' || selectedCategory === 'reimbursements-to-officers';
  const isLoanToOrganization = debitCode === '1350';
  const isLoanCollection = effectiveCreditCode === '1350';
  const isPriorExpensePayablePayment = debitCode === '2010';
  const needsCounterpartyName = !!classificationPreview && ((effectiveCreditCode === '2050' || effectiveCreditCode === '2010' || isOfficerAdvance || isOfficerReimbursement || isLoanToOrganization || isLoanCollection || isPriorExpensePayablePayment) || merchandiseUsesOfficer);
  const counterpartyLabel = merchandiseUsesOfficer
    ? 'Accountable Officer Name'
    : isLoanToOrganization || isLoanCollection
    ? 'Organization Name'
    : effectiveCreditCode === '2010' || isPriorExpensePayablePayment
    ? 'Supplier / Payee Name'
    : 'Officer / Accountable Person Name';

  // Membership Fees for the current school year recognizes the full fee on
  // Date 1, then routes same-day cash and later dated collections correctly.
  // Prior-period collections clear an existing receivable instead.
  const requiresAccrualCompletion = !!classificationPreview?.requiresAccrualCompletion;
  const isPriorMembershipCollection = !!classificationPreview && debitCode === '1010' && creditCode === MEMBERSHIP_DUES_RECEIVABLE_CODE;
  // Same accrual mechanics either way — only the question's wording
  // differs, for whichever pool of members this particular type is
  // billing (see accrualAudience's doc comment in FinanceContext.tsx).
  const isNewMembersAccrual = classificationPreview?.accrualAudience === 'new';

  // The general "not yet used" question — see mayDeferPortion's doc
  // comment in FinanceContext.tsx. officer-cash-advance is excluded: that
  // funding source already resolves "was it used" in REVIEW.
  const showDeferPortionQuestion = !!classificationPreview?.mayDeferPortion && fundingSourceId !== 'officer-cash-advance';

  // Trigger classification suggestion on Name input change
  useEffect(() => {
    if (justHydratedDraftRef.current) {
      // A draft-resume effect just set every field directly (including
      // txName, which is this effect's own dependency) — skip this one
      // pass so its destructive "clear everything else" branch below
      // doesn't immediately undo what was just restored.
      justHydratedDraftRef.current = false;
      return;
    }
    const match = selectedTransactionType === 'Outright Expense Payment' && selectedCategory === 'expense-transactions'
      ? { debitAccountCode: selectedExpenseAccountCode, creditAccountCode: '1010', defaultDesc: 'Outright Expense Payment' }
      : selectedTransactionType ? suggestTransactionClassification(selectedTransactionType) : null;
    if (match) {
      setDebitCode(match.debitAccountCode);
      setCreditCode(match.creditAccountCode);
      setIsSmartMatched(true);
      setClassificationPreview(match);
      // Receipt fields are hidden for these types, so leftover values from
      // a previously selected type must not silently carry into this entry.
      if (match.requiresAccrualCompletion || (match.debitAccountCode === '1010' && match.creditAccountCode === MEMBERSHIP_DUES_RECEIVABLE_CODE)) {
        setPendingReceipts([]);
      }
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setMembershipCollections([{ id: `membership-collection-${Date.now()}`, date: '', amount: '' }]);
      setMembershipRefundStatus('current');
      setNotYetUsedAmount('');
      setExpectedUsePeriod('within');
      setCounterpartyName('');
      setMerchandiseCost('');
      setMerchandiseItem('');
      setMerchandiseOtherTitle('');
      setMerchandiseQuantity('');
      setMerchandiseBatch('');
      setMerchandisePrepaymentEntryId('');
      setMerchandisePaymentMethod('organization-funds');
      setMerchandiseOrganizationPayments([{ id: `org-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseOfficerPayments([{ id: `officer-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseAdvancePayments([{ id: `advance-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseSaleItem('');
      setMerchandiseSaleBatchId('');
      setMerchandiseQuantitySold('');
      setMerchandiseSellingPrice('');
      setMerchandiseCollectionMethod('not-yet-collected');
      setMerchandiseCollections([{ id: `collection-${Date.now()}`, date, amount: '' }]);
      setMerchandiseRemittances([{ id: `remittance-${Date.now()}`, date, amount: '' }]);
      setMerchandiseCollectionOfficer('');
      setOutrightPaymentMethod('organization-funds');
      setOutrightOrganizationPayments([{ id: `expense-org-${Date.now()}`, date, amount: '' }]);
      setOutrightOfficerPayments([{ id: `expense-officer-${Date.now()}`, date, amount: '' }]);
      setOutrightAdvancePayments([{ id: `expense-advance-${Date.now()}`, date, amount: '' }]);
      setOutrightOfficer('');
      setExpenseEvent('');
      setExpenseEventName('');

      // Keep the funding-source state in sync with whichever cash account
      // the matched rule assumed. When the new type has no funding-source
      // mapping (e.g. it credits Membership Dues, not a cash account),
      // reset to the default rather than leaving it at whatever the
      // previously selected transaction type left behind — otherwise a
      // stale 'officer-cash-advance' from an earlier entry can silently
      // trigger the cash-advance warning on an unrelated transaction.
      const matchingSource = FUNDING_SOURCE_OPTIONS.find(o => o.creditAccountCode === match.creditAccountCode);
      setFundingSourceId(matchingSource ? matchingSource.id : FUNDING_SOURCE_OPTIONS[0].id);

      if (match.purposeOptions && match.purposeOptions.length > 0) {
        // Ambiguous category — default to its first purpose, same as
        // every other auto-filled field, but leave the dropdown editable.
        setPurposeIndex(0);
        setDescription(match.purposeOptions[0].description);
      } else {
        setDescription(match.defaultDesc);
      }
    } else {
      setClassificationPreview(null);
      setIsSmartMatched(false);
      setDebitCode('');
      setCreditCode('');
      setDescription('');
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setMembershipCollections([{ id: `membership-collection-${Date.now()}`, date: '', amount: '' }]);
      setMembershipRefundStatus('current');
      setNotYetUsedAmount('');
      setExpectedUsePeriod('within');
      setCounterpartyName('');
      setMerchandiseCost('');
      setMerchandiseItem('');
      setMerchandiseOtherTitle('');
      setMerchandiseQuantity('');
      setMerchandiseBatch('');
      setMerchandisePrepaymentEntryId('');
      setMerchandisePaymentMethod('organization-funds');
      setMerchandiseOrganizationPayments([{ id: `org-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseOfficerPayments([{ id: `officer-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseAdvancePayments([{ id: `advance-payment-${Date.now()}`, date, amount: '' }]);
      setOutrightOfficer('');
      setMerchandiseSaleItem('');
      setMerchandiseSaleBatchId('');
      setMerchandiseQuantitySold('');
      setMerchandiseSellingPrice('');
      setMerchandiseCollectionMethod('not-yet-collected');
      setMerchandiseCollections([{ id: `collection-${Date.now()}`, date, amount: '' }]);
      setMerchandiseRemittances([{ id: `remittance-${Date.now()}`, date, amount: '' }]);
      setMerchandiseCollectionOfficer('');
    }
  }, [txName]);

  // Resume a draft: applies every saved field in one shot, once per draft
  // id. Recomputes debitCode/creditCode/classificationPreview fresh from
  // suggestTransactionClassification (rather than trusting stale saved
  // values) so a rule renamed or resemestered since the draft was saved is
  // reflected correctly; every other field is restored as saved.
  useEffect(() => {
    if (!draftToResume || appliedDraftIdRef.current === draftToResume.id) return;
    if (draftToResume.category === CUSTOMER_ORDER_DRAFT) {
      appliedDraftIdRef.current = draftToResume.id;
      setSelectedCategory('merchandise');
      setCustomerOrdersOpen(true);
      setEditingDraftId(null);
      return;
    }
    if (draftToResume.category === 'activity-fees') {
      appliedDraftIdRef.current = draftToResume.id;
      setSelectedCategory('activity-fees');
      return;
    }
    if (draftToResume.category === 'prepaid-assets') {
      appliedDraftIdRef.current = draftToResume.id;
      setSelectedCategory('prepaid-assets');
      setEditingDraftId(null);
      return;
    }
    appliedDraftIdRef.current = draftToResume.id;
    justHydratedDraftRef.current = true;

    const snapshot = draftToResume.formState as Partial<TransactionFormSnapshot>;
    const fallbackDate = snapshot.date || '';
    setEditingDraftId(draftToResume.id);
    setSelectedCategory((draftToResume.category as TransactionCategoryId) || null);
    setTxName(snapshot.txName || '');
    setSelectedExpenseAccountCode(snapshot.selectedExpenseAccountCode || '5010');
    setDescription(snapshot.description || '');
    setAmount(snapshot.amount || 0);
    setDate(fallbackDate);
    setPurposeIndex(snapshot.purposeIndex || 0);
    setPendingReceipts(snapshot.pendingReceipts || []);
    setFundingSourceId(snapshot.fundingSourceId || FUNDING_SOURCE_OPTIONS[0].id);
    setCounterpartyName(snapshot.counterpartyName || '');
    setRestrictionAnswer(snapshot.restrictionAnswer || '');
    setSamePeriodAnswer(snapshot.samePeriodAnswer || '');
    setContributionPurpose(snapshot.contributionPurpose || '');
    setMembershipCollections(snapshot.membershipCollections?.length ? snapshot.membershipCollections : [{ id: `membership-collection-${Date.now()}`, date: '', amount: '' }]);
    setMembershipRefundStatus(snapshot.membershipRefundStatus || 'current');
    setNotYetUsedAmount(snapshot.notYetUsedAmount || '');
    setExpectedUsePeriod(snapshot.expectedUsePeriod || 'within');
    setMerchandiseCost(snapshot.merchandiseCost || '');
    setMerchandiseItem(snapshot.merchandiseItem || '');
    setMerchandiseOtherTitle(snapshot.merchandiseOtherTitle || '');
    setMerchandiseQuantity(snapshot.merchandiseQuantity || '');
    setMerchandiseBatch(snapshot.merchandiseBatch || '');
    setMerchandisePrepaymentEntryId(snapshot.merchandisePrepaymentEntryId || '');
    setMerchandisePaymentMethod(snapshot.merchandisePaymentMethod || 'organization-funds');
    setMerchandiseOrganizationPayments(snapshot.merchandiseOrganizationPayments?.length ? snapshot.merchandiseOrganizationPayments : [{ id: `org-payment-${Date.now()}`, date: fallbackDate, amount: '' }]);
    setMerchandiseOfficerPayments(snapshot.merchandiseOfficerPayments?.length ? snapshot.merchandiseOfficerPayments : [{ id: `officer-payment-${Date.now()}`, date: fallbackDate, amount: '' }]);
    setMerchandiseAdvancePayments(snapshot.merchandiseAdvancePayments?.length ? snapshot.merchandiseAdvancePayments : [{ id: `advance-payment-${Date.now()}`, date: fallbackDate, amount: '' }]);
    setMerchandiseSaleItem(snapshot.merchandiseSaleItem || '');
    setMerchandiseSaleBatchId(snapshot.merchandiseSaleBatchId || '');
    setMerchandiseQuantitySold(snapshot.merchandiseQuantitySold || '');
    setMerchandiseSellingPrice(snapshot.merchandiseSellingPrice || '');
    setMerchandiseCollectionMethod(snapshot.merchandiseCollectionMethod || 'not-yet-collected');
    setMerchandiseCollections(snapshot.merchandiseCollections?.length ? snapshot.merchandiseCollections : [{ id: `collection-${Date.now()}`, date: fallbackDate, amount: '' }]);
    setMerchandiseRemittances(snapshot.merchandiseRemittances?.length ? snapshot.merchandiseRemittances : [{ id: `remittance-${Date.now()}`, date: fallbackDate, amount: '' }]);
    setMerchandiseCollectionOfficer(snapshot.merchandiseCollectionOfficer || '');

    const genericExpenseDraft = snapshot.selectedCategory === 'expense-transactions' && snapshot.txName === 'Outright Expense Payment';
    const match = genericExpenseDraft
      ? { debitAccountCode: snapshot.selectedExpenseAccountCode || '5010', creditAccountCode: '1010', defaultDesc: 'Outright Expense Payment' }
      : snapshot.txName ? suggestTransactionClassification(snapshot.txName) : null;
    if (match) {
      setDebitCode(match.debitAccountCode);
      setCreditCode(match.creditAccountCode);
      setIsSmartMatched(true);
      setClassificationPreview(match);
    } else {
      setDebitCode('');
      setCreditCode('');
      setIsSmartMatched(false);
      setClassificationPreview(null);
    }
    onDraftResumed?.();
  }, [draftToResume]);

  // When the purpose is changed by hand, apply its description. It never
  // touches the debit/credit accounts — the keyword match already fixed
  // those.
  const handlePurposeChange = (index: number) => {
    setPurposeIndex(index);
    const option = classificationPreview?.purposeOptions?.[index];
    if (option) {
      setDescription(option.description);
    }
  };

  // Cash-advance sequencing check (working paper: "Caution: Please record
  // the cash advance transaction first before recording expenses paid
  // using a cash advance"). Spending more than the org currently has
  // outstanding as advances means the underlying cash-advance-given
  // transaction was never recorded — or was already fully spent — so this
  // expense would silently understate what's actually owed.
  const advancesOutstanding = accountBalances['1250'] || 0;
  const cashAvailable = Math.max(0, accountBalances['1010'] || 0);
  const officerAdvanceBalances = useMemo(() => counterpartyBalances(journalEntries, '1250', 'Debit'), [journalEntries]);
  const officerPayableBalances = useMemo(() => counterpartyBalances(journalEntries, '2050', 'Credit'), [journalEntries]);
  const organizationLoanBalances = useMemo(() => counterpartyBalances(journalEntries, '1350', 'Debit'), [journalEntries]);
  const supplierPayableBalances = useMemo(() => counterpartyBalances(journalEntries, '2010', 'Credit'), [journalEntries]);
  const merchandiseOfficerName = isMerchandiseAcquisition ? counterpartyName : outrightOfficer;
  const selectedOfficerAdvanceBalance = counterpartyBalance(journalEntries, '1250', 'Debit', merchandiseOfficerName);
  const selectedOfficerPayableBalance = counterpartyBalance(journalEntries, '2050', 'Credit', counterpartyName);
  const selectedOrganizationLoanBalance = counterpartyBalance(journalEntries, '1350', 'Debit', counterpartyName);
  const selectedSupplierPayableBalance = counterpartyBalance(journalEntries, '2010', 'Credit', counterpartyName);
  const visibleCounterpartyBalances = isOfficerAdvance ? officerAdvanceBalances
    : isOfficerReimbursement ? officerPayableBalances
      : (isLoanToOrganization || isLoanCollection) ? organizationLoanBalances
        : isPriorExpensePayablePayment ? supplierPayableBalances : [];
  const counterpartyBalanceHeading = isLoanToOrganization || isLoanCollection
    ? 'Outstanding loans by organization'
    : isOfficerAdvance ? 'Available advances to officers'
      : isOfficerReimbursement ? 'Amount payable to officers'
        : 'Outstanding expense payables by supplier / payee';
  const reimbursementAmountError = isOfficerReimbursement && amount > selectedOfficerPayableBalance
    ? 'Reimbursement cannot exceed the amount currently payable to this accountable officer.'
    : '';
  // Membership Fees collections are never paid via an officer's cash
  // advance (they're money coming in from members, not an expense paid
  // out), so this warning must never apply there regardless of whatever
  // fundingSourceId happens to hold.
  const showCashAdvanceWarning = !requiresAccrualCompletion && fundingSourceId === 'officer-cash-advance' && amount > advancesOutstanding;

  // Same sequencing idea, for the other direction (client note sheet row
  // 17): collecting previous-period membership fees against the
  // receivable requires that receivable to actually exist first — the
  // fee must have been billed (via the current-school-year accrual
  // question) before there's anything to collect.
  const membershipReceivableOutstanding = accountBalances[MEMBERSHIP_DUES_RECEIVABLE_CODE] || 0;
  const membershipRefundLiabilityOutstanding = Math.max(0, accountBalances[MEMBERSHIP_REFUND_LIABILITY_CODE] || 0);
  const membershipCollectionTotal = sumDatedAmounts(membershipCollections);
  const showMembershipReceivableWarning = isPriorMembershipCollection && membershipCollectionTotal > membershipReceivableOutstanding;
  const isMerchandiseSale = effectiveCreditCode === '4070';
  const merchandiseBatches = useMemo(() => buildMerchandiseBatchBalances(journalEntries), [journalEntries]);
  const merchandiseItemLabel = merchandiseItem === 'Others' ? merchandiseOtherTitle.trim() : merchandiseItem;
  const matchingMerchandisePrepayment = useMemo(
    () => aggregateAvailableMerchandisePrepayments(journalEntries, merchandiseItemLabel, merchandiseBatch.trim()),
    [journalEntries, merchandiseItemLabel, merchandiseBatch]
  );
  const selectedMerchandisePrepayment = merchandisePrepaymentEntryId && matchingMerchandisePrepayment.entryIds.length > 0
    ? matchingMerchandisePrepayment
    : undefined;
  const selectedMerchandiseBatch = merchandiseBatches.find(batch => batch.entryId === merchandiseSaleBatchId);
  const merchandiseSaleItems = useMemo(() => [...new Set(merchandiseBatches.map(batch => batch.item))].sort((a, b) => a.localeCompare(b)), [merchandiseBatches]);
  const effectiveMerchandiseSaleItem = merchandiseSaleItem || selectedMerchandiseBatch?.item || '';
  const merchandiseBatchesForSelectedItem = useMemo(() => merchandiseBatches.filter(batch => batch.item === effectiveMerchandiseSaleItem), [merchandiseBatches, effectiveMerchandiseSaleItem]);
  const merchandiseSaleTotal = Math.round((Number(merchandiseQuantitySold) || 0) * (Number(merchandiseSellingPrice) || 0) * 100) / 100;
  const merchandiseCollectionTotal = sumDatedAmounts(merchandiseCollections);
  const merchandiseRemittanceTotal = sumDatedAmounts(merchandiseRemittances);
  const merchandiseOrganizationPaymentTotal = sumDatedAmounts(merchandiseOrganizationPayments);
  const merchandiseOfficerPaymentTotal = sumDatedAmounts(merchandiseOfficerPayments);
  const merchandiseAdvancePaymentTotal = sumDatedAmounts(merchandiseAdvancePayments);
  const merchandisePrepaymentAmount = Math.round((merchandiseOrganizationPaymentTotal + merchandiseOfficerPaymentTotal + merchandiseAdvancePaymentTotal) * 100) / 100;
  const merchandisePrepaymentPaymentRows = merchandisePaymentMethod === 'organization-funds'
    ? merchandiseOrganizationPayments
    : merchandisePaymentMethod === 'officer-personal'
      ? merchandiseOfficerPayments
      : merchandisePaymentMethod === 'organization-advance'
        ? merchandiseAdvancePayments
        : [...merchandiseOrganizationPayments, ...merchandiseOfficerPayments, ...merchandiseAdvancePayments];
  const merchandisePrepaymentDate = merchandisePrepaymentPaymentRows.find(row => Number(row.amount) > 0 && row.date)?.date || localDateInputValue();
  const transactionAmount = isMerchandisePrepayment ? merchandisePrepaymentAmount : amount;
  const draftSupplierReceivable = journalEntries.filter(entry => entry.isDraft)
    .reduce((sum, entry) => sum + entry.lines.filter(line => line.accountCode === '1360').reduce((lineSum, line) => lineSum + line.debit - line.credit, 0), 0);
  const supplierReceivableOutstanding = Math.max(0, Math.round(((accountBalances['1360'] || 0) - draftSupplierReceivable) * 100) / 100);

  useEffect(() => {
    if (isPriorMembershipCollection) setAmount(membershipCollectionTotal);
  }, [isPriorMembershipCollection, membershipCollectionTotal]);

  const membershipPostingResult = useMemo(() => {
    try {
      const collections = membershipCollections.map(row => ({ date: row.date, amount: Number(row.amount) || 0 }));
      if (requiresAccrualCompletion) {
        if (amount <= 0) return { posting: null, error: '' };
        return { posting: buildCurrentMembershipFeePosting({ totalFees: amount, dateOne: date, collections }), error: '' };
      }
      if (isPriorMembershipCollection) {
        if (membershipCollectionTotal <= 0) return { posting: null, error: '' };
        return { posting: buildPriorMembershipCollectionPosting({ availableReceivable: membershipReceivableOutstanding, collections }), error: '' };
      }
      return { posting: null, error: '' };
    } catch (error) {
      return { posting: null, error: error instanceof Error ? error.message : 'The membership-fee amounts are invalid.' };
    }
  }, [requiresAccrualCompletion, isPriorMembershipCollection, amount, date, membershipCollections, membershipCollectionTotal, membershipReceivableOutstanding]);

  const membershipRefundResolutionResult = useMemo(() => {
    if (!isMembershipRefundStatus) return { lines: [] as JournalLine[], error: '' };
    try {
      return {
        lines: buildMembershipRefundResolution({
          status: membershipRefundStatus,
          amount,
          date,
          availableLiability: membershipRefundLiabilityOutstanding,
        }),
        error: '',
      };
    } catch (error) {
      return { lines: [] as JournalLine[], error: error instanceof Error ? error.message : 'The refund-liability amount is invalid.' };
    }
  }, [isMembershipRefundStatus, membershipRefundStatus, amount, date, membershipRefundLiabilityOutstanding]);

  const merchandiseAcquisitionResult = useMemo(() => {
    if (!isMerchandiseAcquisition || amount <= 0) return { posting: null, error: '' };
    try {
      return {
        posting: buildMerchandiseAcquisitionPosting({
          totalCost: amount,
          paymentMethod: merchandisePaymentMethod,
          transactionDate: date,
          organizationPayment: merchandiseOrganizationPaymentTotal,
          organizationPayments: merchandiseOrganizationPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
          officerPayment: merchandiseOfficerPaymentTotal,
          officerPayments: merchandiseOfficerPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
          advancePayment: merchandiseAdvancePaymentTotal,
          advancePayments: merchandiseAdvancePayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
          availableAdvance: selectedOfficerAdvanceBalance,
          availableCash: cashAvailable,
          prepaymentAmount: selectedMerchandisePrepayment?.amount || 0,
          cashAccountCode: '1010',
        }),
        error: '',
      };
    } catch (error) {
      return { posting: null, error: error instanceof Error ? error.message : 'The acquisition amounts are invalid.' };
    }
  }, [isMerchandiseAcquisition, amount, merchandisePaymentMethod, date, merchandiseOrganizationPaymentTotal, merchandiseOrganizationPayments, merchandiseOfficerPaymentTotal, merchandiseOfficerPayments, merchandiseAdvancePaymentTotal, merchandiseAdvancePayments, selectedOfficerAdvanceBalance, cashAvailable, selectedMerchandisePrepayment]);

  const merchandisePrepaymentResult = useMemo(() => {
    if (!isMerchandisePrepayment || transactionAmount <= 0 || merchandisePaymentMethod === 'not-yet-paid') return { lines: [] as JournalLine[], error: '' };
    try {
      return { lines: buildMerchandisePrepaymentPosting({
        amount: transactionAmount,
        paymentMethod: merchandisePaymentMethod,
        transactionDate: merchandisePrepaymentDate,
        organizationPayments: merchandiseOrganizationPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        officerPayments: merchandiseOfficerPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        advancePayments: merchandiseAdvancePayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        availableCash: cashAvailable,
        availableAdvance: selectedOfficerAdvanceBalance,
      }), error: '' };
    } catch (error) {
      return { lines: [] as JournalLine[], error: error instanceof Error ? error.message : 'The supplier downpayment amounts are invalid.' };
    }
  }, [isMerchandisePrepayment, transactionAmount, merchandisePaymentMethod, merchandisePrepaymentDate, merchandiseOrganizationPayments, merchandiseOfficerPayments, merchandiseAdvancePayments, cashAvailable, selectedOfficerAdvanceBalance]);

  const isDepreciationEntry = debitCode === '5090' || debitCode === '5095';
  const isEventProgramExpense = selectedCategory === 'event-program-expenses' && debitCode === '5300';
  const isOutrightExpense = !!classificationPreview && activeAccounts.find(account => account.code === debitCode)?.type === 'Expenses' && !isMerchandiseAcquisition && !isDepreciationEntry && !isEventProgramExpense;
  const debitCodeNumber = Number(debitCode);
  const isPpeAcquisition = selectedCategory === 'ppe-transactions' && ((debitCodeNumber >= 1500 && debitCodeNumber <= 1516) || (debitCodeNumber >= 1650 && debitCodeNumber <= 1653));
  const isGuidedPurchase = isOutrightExpense || isPpeAcquisition;
  const guidedPayableAccountCode = debitCodeNumber >= 1650 && debitCodeNumber <= 1653 ? '2040' : isPpeAcquisition ? '2030' : '2010';
  const outrightOfficerTotal = sumDatedAmounts(outrightOfficerPayments);
  const outrightAdvanceTotal = sumDatedAmounts(outrightAdvancePayments);
  const outrightExpenseResult = useMemo(() => {
    if (!isGuidedPurchase || amount <= 0) return { posting: null, error: '' };
    try {
      return { posting: buildOutrightExpensePosting({
        expenseAccountCode: debitCode, totalAmount: amount, paymentMethod: outrightPaymentMethod, transactionDate: date || localDateInputValue(),
        organizationPayments: outrightOrganizationPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        officerPayments: outrightOfficerPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        advancePayments: outrightAdvancePayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
        availableAdvance: selectedOfficerAdvanceBalance, availableCash: cashAvailable,
        payableAccountCode: guidedPayableAccountCode,
      }), error: '' };
    } catch (error) {
      return { posting: null, error: error instanceof Error ? error.message : 'The expense payments are invalid.' };
    }
  }, [isGuidedPurchase, amount, debitCode, outrightPaymentMethod, date, outrightOrganizationPayments, outrightOfficerPayments, outrightAdvancePayments, selectedOfficerAdvanceBalance, cashAvailable, guidedPayableAccountCode]);
  const requiresExpenseDraftReview = isOutrightExpense && (outrightExpenseResult.posting?.dueToSupplier || 0) > 0;

  useEffect(() => {
    if (isMerchandiseSale) setAmount(merchandiseSaleTotal);
  }, [isMerchandiseSale, merchandiseSaleTotal]);

  const merchandiseSaleResult = useMemo(() => {
    if (!isMerchandiseSale || merchandiseSaleTotal <= 0 || Number(merchandiseCost) <= 0) return { posting: null, error: '' };
    try {
      return {
        posting: buildMerchandiseSalePosting({
          totalSales: merchandiseSaleTotal,
          inventoryCost: Number(merchandiseCost),
          collectionMethod: merchandiseCollectionMethod,
          transactionDate: date,
          totalCollected: merchandiseCollectionMethod === 'not-yet-collected' ? 0 : merchandiseCollectionTotal,
          collections: merchandiseCollectionMethod === 'not-yet-collected' ? [] : merchandiseCollections.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
          totalRemitted: merchandiseCollectionMethod === 'officer-to-remit' ? merchandiseRemittanceTotal : 0,
          remittances: merchandiseCollectionMethod === 'officer-to-remit' ? merchandiseRemittances.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : [],
        }),
        error: '',
      };
    } catch (error) {
      return { posting: null, error: error instanceof Error ? error.message : 'The merchandise sale amounts are invalid.' };
    }
  }, [isMerchandiseSale, merchandiseSaleTotal, merchandiseCost, merchandiseCollectionMethod, date, merchandiseCollectionTotal, merchandiseCollections, merchandiseRemittanceTotal, merchandiseRemittances]);

  // Derived Account lookups
  const debitAccount = activeAccounts.find(a => a.code === debitCode);
  const creditAccount = activeAccounts.find(a => a.code === effectiveCreditCode);

  const previewLines = useMemo<JournalLine[]>(() => {
    if (!classificationPreview || !debitCode || !effectiveCreditCode) return [];
    if (isMembershipRefundStatus) return membershipRefundResolutionResult.lines;
    if (transactionAmount <= 0) return [];
    if (isMerchandiseAcquisition) return merchandiseAcquisitionResult.posting?.lines || [];
    if (isMerchandisePrepayment) return merchandisePrepaymentResult.lines;
    if (isSupplierReceivableCollection) {
      try { return buildSupplierReceivableCollectionPosting(amount, date, supplierReceivableOutstanding); } catch { return []; }
    }
    if (isGuidedPurchase) return outrightExpenseResult.posting?.lines || [];
    const deferredAmount = showDeferPortionQuestion ? (Number(notYetUsedAmount) || 0) : 0;
    if (requiresAccrualCompletion || isPriorMembershipCollection) return membershipPostingResult.posting?.lines || [];
    if (isMerchandiseSale) {
      return merchandiseSaleResult.posting?.lines || [];
    }
    if (deferredAmount > 0) {
      return buildCompoundJournalLines([
        { debitAccountCode: debitCode, creditAccountCode: effectiveCreditCode, amount: amount - deferredAmount },
        { debitAccountCode: PREPAID_EXPENSE_CODE, creditAccountCode: effectiveCreditCode, amount: deferredAmount },
      ]);
    }
    return buildJournalLines(debitCode, effectiveCreditCode, amount);
  }, [classificationPreview, transactionAmount, amount, date, debitCode, effectiveCreditCode, isMembershipRefundStatus, membershipRefundResolutionResult, isMerchandiseAcquisition, merchandiseAcquisitionResult, isMerchandisePrepayment, merchandisePrepaymentResult, isSupplierReceivableCollection, supplierReceivableOutstanding, isGuidedPurchase, outrightExpenseResult, requiresAccrualCompletion, isPriorMembershipCollection, membershipPostingResult, isMerchandiseSale, merchandiseSaleResult, showDeferPortionQuestion, notYetUsedAmount]);

  const projectedImpacts = useMemo(
    () => projectJournalLineImpacts(previewLines, activeAccounts, accountBalances),
    [previewLines, activeAccounts, accountBalances]
  );
  const { assetChange: assetImpact, netIncomeChange: netIncomeImpact } = useMemo(
    () => computeStatementImpact(previewLines, activeAccounts),
    [previewLines, activeAccounts]
  );

  const handleReceiptFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const countError = validateReceiptCount(pendingReceipts.length, files.length);
    if (countError) {
      setReceiptMessage(countError);
      return;
    }

    setIsProcessingReceipts(true);
    setReceiptMessage('');
    try {
      const prepared: ReceiptAttachmentDraft[] = [];
      for (const file of Array.from(files)) prepared.push(await prepareReceiptAttachment(file));
      setPendingReceipts(previous => [...previous, ...prepared]);
    } catch (error) {
      setReceiptMessage(error instanceof Error ? error.message : 'The receipt image could not be prepared.');
    } finally {
      setIsProcessingReceipts(false);
    }
  };

  const buildFormSnapshot = (): TransactionFormSnapshot => ({
    txName,
    selectedCategory,
    selectedExpenseAccountCode,
    description,
    amount,
    date,
    purposeIndex,
    pendingReceipts,
    fundingSourceId,
    counterpartyName,
    restrictionAnswer,
    samePeriodAnswer,
    contributionPurpose,
    membershipCollections,
    membershipRefundStatus,
    notYetUsedAmount,
    expectedUsePeriod,
    merchandiseCost,
    merchandiseItem,
    merchandiseOtherTitle,
    merchandiseQuantity,
    merchandiseBatch,
    merchandisePrepaymentEntryId,
    merchandisePaymentMethod,
    merchandiseOrganizationPayments,
    merchandiseOfficerPayments,
    merchandiseAdvancePayments,
    merchandiseSaleItem,
    merchandiseSaleBatchId,
    merchandiseQuantitySold,
    merchandiseSellingPrice,
    merchandiseCollectionMethod,
    merchandiseCollections,
    merchandiseRemittances,
    merchandiseCollectionOfficer,
  });

  const handleSaveDraft = () => handlePost(undefined, true);

  const handleDiscardDraft = () => {
    if (!editingDraftId) return;
    deleteDraftTransaction(editingDraftId);
    setEditingDraftId(null);
    appliedDraftIdRef.current = null;
  };

  const handlePost = (e?: React.FormEvent, savingDraft = false) => {
    e?.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setLastPostedEntry(null);

    if (!savingDraft && requiresExpenseDraftReview) {
      setErrorMessage('Save this as a draft so its balanced journal entry is recorded in the ledger. Complete the remaining payment in Review before final posting.');
      return;
    }

    if (!classificationPreview) {
      setErrorMessage('Please select a transaction type from the list so its accounts can be determined automatically.');
      return;
    }
    if (!semester || !reportingPeriod || !settings.reportingYear) {
      setErrorMessage('Set your organization\'s Semester and Year first — top right, next to the org name.');
      return;
    }
    const parsedReportingYear = settings.reportingYear;
    if (requiresAccrualCompletion && (settings.semester === '1st Semester' || settings.semester === '2nd Semester') && settings.reportingYear) {
      const activeSemester = settings.semester;
      const activeReportingYear = settings.reportingYear;
      const datesToValidate = [date, ...membershipCollections.filter(row => Number(row.amount) > 0 && row.date).map(row => row.date)];
      if (datesToValidate.some(candidate => !isDateWithinReportingPeriod(candidate, activeSemester, activeReportingYear))) {
        const periodYear = activeSemester === '1st Semester' ? activeReportingYear : activeReportingYear + 1;
        setErrorMessage(`Membership-fee dates must be within ${reportingPeriod} ${periodYear}.`);
        return;
      }
    }
    if (isMerchandiseSale) {
      if (!selectedMerchandiseBatch) {
        setErrorMessage('Please select a merchandise purchase batch with units still available.');
        return;
      }
      if (!Number.isInteger(Number(merchandiseQuantitySold)) || Number(merchandiseQuantitySold) <= 0 || Number(merchandiseQuantitySold) > selectedMerchandiseBatch.remainingQuantity) {
        setErrorMessage(`Quantity sold must be a whole number from 1 to ${selectedMerchandiseBatch.remainingQuantity}.`);
        return;
      }
    }
    if (isMerchandiseSale && Number(merchandiseSellingPrice) <= 0) {
      setErrorMessage('Please enter a selling price greater than zero.');
      return;
    }
    if (isMerchandiseSale && merchandiseCollectionMethod !== 'not-yet-collected' && merchandiseCollectionTotal <= 0) {
      setErrorMessage('Add at least one dated collection amount greater than zero.');
      return;
    }
    if (isMerchandiseSale && merchandiseCollectionMethod === 'officer-to-remit' && !merchandiseCollectionOfficer.trim()) {
      setErrorMessage('Please enter the accountable officer who collected the merchandise payments.');
      return;
    }
    if (transactionAmount <= 0 && !(isMembershipRefundStatus && membershipRefundStatus === 'next')) {
      setErrorMessage('Please enter a valid amount greater than zero.');
      return;
    }
    if ((isMerchandiseAcquisition || isMerchandisePrepayment) && !merchandiseItemLabel) {
      setErrorMessage('Please select the merchandise purchased and enter a title when choosing Others.');
      return;
    }
    if ((isMerchandiseAcquisition || isMerchandisePrepayment) && !merchandiseBatch.trim()) {
      setErrorMessage('Please enter the merchandise batch or pre-order reference.');
      return;
    }
    if (isMerchandiseAcquisition && merchandiseQuantity.trim() && (!Number.isInteger(Number(merchandiseQuantity)) || Number(merchandiseQuantity) <= 0)) {
      setErrorMessage('If entered, quantity must be a whole number greater than zero.');
      return;
    }
    if (isMerchandiseAcquisition && merchandiseAcquisitionResult.error) {
      setErrorMessage(merchandiseAcquisitionResult.error);
      return;
    }
    if (isMerchandisePrepayment && merchandisePrepaymentResult.error) {
      setErrorMessage(merchandisePrepaymentResult.error);
      return;
    }
    if (isMerchandisePrepayment && (merchandisePaymentMethod === 'officer-personal' || merchandisePaymentMethod === 'organization-advance' || merchandisePaymentMethod === 'advance-and-personal') && !outrightOfficer.trim()) {
      setErrorMessage('Please enter the accountable officer for this supplier downpayment.');
      return;
    }
    if (isSupplierReceivableCollection && amount > supplierReceivableOutstanding) {
      setErrorMessage('Collection cannot exceed the outstanding Accounts Receivable - Suppliers balance.');
      return;
    }
    if (isGuidedPurchase && outrightExpenseResult.error) {
      setErrorMessage(outrightExpenseResult.error);
      return;
    }
    const hasRepeatedPaymentDate = [outrightOrganizationPayments, outrightOfficerPayments, outrightAdvancePayments]
      .some(rows => hasDuplicateEnteredDates(rows));
    if (isGuidedPurchase && hasRepeatedPaymentDate) {
      setErrorMessage('Each entered payment date can only be used once. Clear a date or choose a different date.');
      return;
    }
    if (isOutrightExpense && expenseEvent === '') {
      setErrorMessage('Please state whether this expense is for an event.');
      return;
    }
    if (isOutrightExpense && expenseEvent === 'yes' && !expenseEventName.trim()) {
      setErrorMessage('Please enter the event name for this expense.');
      return;
    }
    if (isGuidedPurchase && (outrightPaymentMethod === 'officer-personal' || outrightPaymentMethod === 'officer-advance' || outrightPaymentMethod === 'combination') && (outrightOfficerTotal > 0 || outrightAdvanceTotal > 0) && !outrightOfficer.trim()) {
      setErrorMessage('Please enter the accountable officer for this payment.');
      return;
    }
    if (debitCode === effectiveCreditCode) {
      setErrorMessage('Debit and Credit accounts must be different for double-entry matching.');
      return;
    }
    if (showRestrictionQuestion && restrictionAnswer === '') {
      setErrorMessage('Please answer whether the donor imposed a strict restriction for a specific event.');
      return;
    }
    if (isCashSponsorshipDonation && contributionPurpose === '') {
      setErrorMessage('Please choose whether the amount received is a Donation or Sponsorship.');
      return;
    }
    if (showSamePeriodQuestion && samePeriodAnswer === '') {
      setErrorMessage('Please answer: will the event happen in the same reporting period the donation is received?');
      return;
    }
    if ((requiresAccrualCompletion || isPriorMembershipCollection) && membershipPostingResult.error) {
      setErrorMessage(membershipPostingResult.error);
      return;
    }
    if (isMembershipRefundStatus && membershipRefundResolutionResult.error) {
      setErrorMessage(membershipRefundResolutionResult.error);
      return;
    }
    if (isPriorMembershipCollection && membershipCollectionTotal <= 0) {
      setErrorMessage('Add at least one membership-fee collection greater than zero.');
      return;
    }
    if (needsCounterpartyName && !counterpartyName.trim()) {
      setErrorMessage(`Please enter the ${counterpartyLabel.toLowerCase()} for this transaction.`);
      return;
    }
    if (reimbursementAmountError) return;
    if (isLoanCollection && amount > selectedOrganizationLoanBalance) {
      setErrorMessage('Collection cannot exceed this organization’s outstanding loan balance.');
      return;
    }
    if (isPriorExpensePayablePayment && amount > selectedSupplierPayableBalance) {
      setErrorMessage('Payment cannot exceed this supplier or payee’s outstanding expense payable.');
      return;
    }
    if (showCashAdvanceWarning) {
      setErrorMessage('Caution: please record the cash advance transaction first before recording expenses paid using a cash advance — the amount given exceeds what’s currently outstanding.');
      return;
    }
    if (showMembershipReceivableWarning) {
      setErrorMessage('Caution: this exceeds the Membership Dues Receivable currently on the books — make sure the fee was billed this school year (via the accrual question) before collecting it.');
      return;
    }
    if (isMerchandiseSale) {
      const merchandiseError = merchandiseSaleCostError(Number(merchandiseCost), selectedMerchandiseBatch?.netInventoryBalance || 0);
      if (merchandiseError) {
        setErrorMessage(merchandiseError);
        return;
      }
      if (merchandiseSaleResult.error) {
        setErrorMessage(merchandiseSaleResult.error);
        return;
      }
    }
    if (showDeferPortionQuestion && notYetUsedAmount.trim() === '') {
      setErrorMessage('Please enter how much of this is not yet used, consumed, or benefited from (enter 0 if it’s all used already).');
      return;
    }
    if (showDeferPortionQuestion && Number(notYetUsedAmount) > amount) {
      setErrorMessage('The not-yet-used amount can’t exceed the total amount paid.');
      return;
    }
    try {
      if (isMembershipRefundStatus && membershipRefundStatus === 'next') {
        if (editingDraftId) {
          deleteDraftTransaction(editingDraftId);
          setEditingDraftId(null);
          appliedDraftIdRef.current = null;
        }
        setSuccessMessage('No journal entry was posted. The membership-fee refund liability remains payable in the next reporting period.');
        return;
      }
      // Post Journal Entry
      const deferredAmount = showDeferPortionQuestion ? (Number(notYetUsedAmount) || 0) : 0;
      const lines = previewLines;
      if (lines.length === 0) throw new Error('Complete the required acquisition amounts before posting.');

      const usePeriodNote = deferredAmount > 0
        ? ` (${formatCurrency(deferredAmount)} not yet used — expected ${expectedUsePeriod === 'within' ? 'within this period' : 'next period'})`
        : '';

      const entryDescription = isOutrightExpense
        ? `${description || txName}${expenseEvent === 'yes' ? ` - ${expenseEventName.trim()}` : ' - General and Administrative Expense'}`
        : isPpeAcquisition
        ? (description || txName)
        : isMerchandiseAcquisition
        ? `${description || txName} - ${merchandiseItemLabel} - ${merchandiseBatch.trim()}`
        : isMerchandisePrepayment
          ? `${description || txName} - ${merchandiseItemLabel} - ${merchandiseBatch.trim()}`
        : isSupplierReceivableCollection
          ? 'Collection of Receivables from Suppliers'
        : isMerchandiseSale
          ? `Sale of Merchandise - ${selectedMerchandiseBatch?.item || 'Merchandise'}`
        : isMembershipRefundStatus
          ? membershipRefundStatus === 'current'
            ? 'Refund of Excess Membership Fee Collection'
            : 'Non-refundable Excess Membership Fee Collection'
        : isCashSponsorshipDonation
          ? `${contributionPurpose === 'sponsorships' ? 'Sponsorship' : 'Donation'} Received`
          : (description || txName) + usePeriodNote;

      const journalDate = isPriorMembershipCollection
        ? membershipPostingResult.posting?.collections[0]?.date || date
        : isMerchandisePrepayment
          ? merchandisePrepaymentDate
          : (isOfficerReimbursement || isOutrightExpense) && !date ? localDateInputValue() : date;
      const draftEntryId = editingDraftId
        ? draftTransactions.find(draft => draft.id === editingDraftId)?.journalEntryId
        : undefined;
      const draftEntry = draftEntryId ? journalEntries.find(entry => entry.id === draftEntryId) : undefined;
      const merchandiseBatches = isMerchandiseAcquisition && merchandiseAcquisitionResult.posting
        ? splitMerchandiseAcquisitionPosting(merchandiseAcquisitionResult.posting, journalDate)
        : [];
      const datedPostingBatches = !savingDraft && merchandiseBatches.length === 0
        ? splitBalancedJournalLinesByDate(lines, journalDate)
        : [];
      const primaryJournalLines = merchandiseBatches.length > 0
        ? merchandiseBatches[0].lines
        : datedPostingBatches.length > 1 ? datedPostingBatches[0].lines : lines;
      const primaryJournalDate = datedPostingBatches.length > 1
        ? datedPostingBatches[0].date
        : journalDate;
      const posted = addJournalEntry(
        primaryJournalDate,
        entryDescription,
        GENERAL_FUND_PROJECT,
        savingDraft ? lines : primaryJournalLines,
        isEventProgramExpense ? 'Event/Program Expenses' : isOutrightExpense && expenseEvent === 'yes' ? expenseEventName.trim() : undefined,
        undefined,
        {
          transactionType: txName,
          details: {
            memo: description.trim() || undefined,
            purpose: isCashSponsorshipDonation
              ? contributionPurpose === 'sponsorships' ? 'Sponsorships' : 'Donations'
              : classificationPreview.purposeOptions?.[purposeIndex]?.label,
            semester,
            reportingPeriod,
            reportingYear: parsedReportingYear,
            fundingSourceId: undefined,
            sponsorshipKind: classificationPreview.sponsorshipKind,
            counterpartyName: (isGuidedPurchase || isMerchandisePrepayment) && outrightOfficer.trim()
              ? outrightOfficer.trim()
              : isMerchandiseSale && merchandiseCollectionMethod === 'officer-to-remit'
              ? merchandiseCollectionOfficer.trim()
              : counterpartyName.trim() || undefined,
            eventRelated: isEventProgramExpense || (isOutrightExpense && expenseEvent === 'yes'),
            donorRestriction: showRestrictionQuestion
              ? restrictionAnswer === 'no'
                ? 'none'
                : restrictionAnswer === 'permanent'
                  ? 'permanent'
                  : samePeriodAnswer === 'yes'
                  ? 'satisfied-in-period'
                  : 'temporary'
              : undefined,
            restrictionEventPeriod: restrictionAnswer === 'yes'
              ? samePeriodAnswer === 'yes' ? 'same-period' : 'future'
              : undefined,
            membershipUnpaidAmount: requiresAccrualCompletion ? membershipPostingResult.posting?.amountStillReceivable : undefined,
            membershipTotalFees: requiresAccrualCompletion ? amount : undefined,
            membershipPeriodStartDate: requiresAccrualCompletion ? date : undefined,
            membershipCollections: (requiresAccrualCompletion || isPriorMembershipCollection) ? membershipPostingResult.posting?.collections : undefined,
            deferredAmount: showDeferPortionQuestion ? deferredAmount : undefined,
            expectedUsePeriod: deferredAmount > 0 ? expectedUsePeriod : undefined,
            inventoryCost: isMerchandiseSale ? Number(merchandiseCost) : undefined,
            merchandiseQuantity: isMerchandiseAcquisition && merchandiseQuantity.trim() ? Number(merchandiseQuantity) : undefined,
            merchandiseBatch: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseBatch.trim() : undefined,
            merchandisePurchaseDate: isMerchandiseAcquisition ? date : undefined,
            merchandisePrepaymentEntryId: isMerchandiseAcquisition ? merchandisePrepaymentEntryId || undefined : undefined,
            merchandisePrepaymentEntryIds: isMerchandiseAcquisition ? selectedMerchandisePrepayment?.entryIds : undefined,
            merchandisePrepaymentAmount: isMerchandiseAcquisition ? selectedMerchandisePrepayment?.amount : undefined,
            merchandisePaymentMethod: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandisePaymentMethod : undefined,
            merchandiseOrganizationPayment: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseOrganizationPaymentTotal : undefined,
            merchandiseOrganizationPayments: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseOrganizationPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseOfficerPayment: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseOfficerPaymentTotal : undefined,
            merchandiseOfficerPayments: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseOfficerPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseAdvancePayment: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseAdvancePaymentTotal : undefined,
            merchandiseAdvancePayments: (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseAdvancePayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandisePayableAmount: isMerchandiseAcquisition ? merchandiseAcquisitionResult.posting?.merchandisePayable : undefined,
            merchandiseItem: isMerchandiseSale ? selectedMerchandiseBatch?.item : (isMerchandiseAcquisition || isMerchandisePrepayment) ? merchandiseItemLabel : undefined,
            merchandiseBatchEntryId: isMerchandiseSale ? merchandiseSaleBatchId : undefined,
            merchandiseQuantitySold: isMerchandiseSale ? Number(merchandiseQuantitySold) : undefined,
            merchandiseSellingPrice: isMerchandiseSale ? Number(merchandiseSellingPrice) : undefined,
            merchandiseTotalSales: isMerchandiseSale ? merchandiseSaleTotal : undefined,
            merchandiseCollectionMethod: isMerchandiseSale ? merchandiseCollectionMethod : undefined,
            merchandiseCollections: isMerchandiseSale ? merchandiseCollections.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseRemittances: isMerchandiseSale ? merchandiseRemittances.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseAccountsReceivable: isMerchandiseSale ? merchandiseSaleResult.posting?.accountsReceivable : undefined,
            merchandiseDueFromOfficer: isMerchandiseSale ? merchandiseSaleResult.posting?.dueFromOfficer : undefined,
            supplierReceivableCollectionAmount: isSupplierReceivableCollection ? amount : undefined,
            receiptAttachmentIds: [],
          },
        },
        savingDraft,
        editingDraftId || undefined,
        draftEntry?.id,
      );
      const je = posted;
      if (!savingDraft && merchandiseBatches.length > 1) {
        merchandiseBatches.slice(1).forEach((batch, index) => {
          addJournalEntry(
            batch.date,
            `${entryDescription} — Payment Batch ${index + 2}`,
            GENERAL_FUND_PROJECT,
            batch.lines,
            undefined,
            undefined,
            {
              transactionType: 'Merchandise Payment Batch',
              details: {
                eventRelated: false,
                receiptAttachmentIds: [],
                counterpartyName: counterpartyName.trim() || undefined,
                merchandiseItem: merchandiseItemLabel,
                merchandiseBatch: merchandiseBatch.trim(),
                merchandisePurchaseDate: date,
              },
            },
          );
        });
      }
      if (!savingDraft && datedPostingBatches.length > 1) {
        datedPostingBatches.slice(1).forEach((batch, index) => {
          addJournalEntry(
            batch.date,
            `${entryDescription} - ${isPriorMembershipCollection || isMerchandiseSale ? 'Collection' : 'Payment'} Batch ${index + 2}`,
            GENERAL_FUND_PROJECT,
            batch.lines,
            isEventProgramExpense ? 'Event/Program Expenses' : isOutrightExpense && expenseEvent === 'yes' ? expenseEventName.trim() : undefined,
            posted.id,
            {
              transactionType: `${txName} - Dated Batch`,
              details: {
                memo: description.trim() || undefined,
                eventRelated: isOutrightExpense ? expenseEvent === 'yes' : false,
                counterpartyName: (isGuidedPurchase && outrightOfficer.trim()) || counterpartyName.trim() || undefined,
                receiptAttachmentIds: [],
              },
            },
          );
        });
      }
      attachReceiptsToEntry(je.id, pendingReceipts);

      if (savingDraft) {
        const id = saveDraftTransaction({
          id: editingDraftId || undefined,
          category: selectedCategory,
          label: txName.trim() || description.trim() || 'Untitled draft',
          formState: buildFormSnapshot() as unknown as Record<string, unknown>,
          journalEntryId: je.id,
        });
        setEditingDraftId(id);
        onDraftSaved?.();
        setSuccessMessage(`${je.reference} saved as a draft. Its debit and credit are visible in the ledger and excluded from Financial Statements.`);
        return;
      }

      if (editingDraftId) {
        deleteDraftTransaction(editingDraftId, [je.id]);
        setEditingDraftId(null);
        appliedDraftIdRef.current = null;
      }

      // Trigger Confetti micro-animation!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#1e3a8a', '#3b82f6', '#10b981', '#f59e0b']
      });

      // Clear Form & Alert
      setSuccessMessage(`Successfully posted ${je.reference}!`);
      setLastPostedEntry({ id: je.id, reference: je.reference });
      setTxName('');
      setDescription('');
      setAmount(0);
      setIsSmartMatched(false);
      setPurposeIndex(0);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setContributionPurpose('');
      setMembershipCollections([{ id: `membership-collection-${Date.now()}`, date: '', amount: '' }]);
      setNotYetUsedAmount('');
      setExpectedUsePeriod('within');
      setCounterpartyName('');
      setMerchandiseCost('');
      setMerchandiseItem('');
      setMerchandiseOtherTitle('');
      setMerchandiseQuantity('');
      setMerchandiseBatch('');
      setMerchandisePrepaymentEntryId('');
      setMerchandisePaymentMethod('organization-funds');
      setMerchandiseOrganizationPayments([{ id: `org-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseOfficerPayments([{ id: `officer-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseAdvancePayments([{ id: `advance-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseSaleItem('');
      setMerchandiseSaleBatchId('');
      setMerchandiseQuantitySold('');
      setMerchandiseSellingPrice('');
      setMerchandiseCollectionMethod('not-yet-collected');
      setMerchandiseCollections([{ id: `collection-${Date.now()}`, date, amount: '' }]);
      setMerchandiseRemittances([{ id: `remittance-${Date.now()}`, date, amount: '' }]);
      setMerchandiseCollectionOfficer('');
      setDate('');
      setPendingReceipts([]);
      setReceiptMessage('');

    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while posting transaction.');
    }
  };

  const handleUndoLastPost = () => {
    if (!lastPostedEntry) return;
    reverseJournalEntry(lastPostedEntry.id);
    setSuccessMessage(`${lastPostedEntry.reference} was undone with a reversing entry.`);
    setLastPostedEntry(null);
    setTimeout(() => setSuccessMessage(''), 5000);
  };

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Smart Transaction Entry</h2>
        <p className="text-xs text-slate-700 dark:text-slate-400 mt-1 font-medium">Auto-classify transaction fields instantly using our rule-based accounting engine.</p>
      </div>

      {editingDraftId && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
          <span>Continuing a saved draft — missing details can still be completed below, then post it for real.</span>
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="shrink-0 rounded-lg border border-amber-300 bg-white/70 px-3 py-1.5 text-[10px] font-bold text-amber-800 transition-colors hover:bg-white dark:border-amber-500/40 dark:bg-slate-900/40 dark:text-amber-300 dark:hover:bg-slate-900"
          >
            Discard this draft
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Choose a transaction category</h3>
          <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">Pick a category first so you only see the transaction types relevant to your task.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {TRANSACTION_CATEGORIES.map(category => {
            const Icon = category.id === 'activity-fees'
              ? CalendarDays
              : category.id === 'merchandise'
                ? ShoppingBag
                : category.id === 'membership-fees'
                  ? Users
                  : category.id === 'expense-transactions' || category.id === 'ppe-transactions'
                    ? ShoppingCart
                    : category.id === 'prepaid-assets'
                      ? Layers
                    : category.id === 'payables'
                      ? Scale
                    : category.id === 'advances-to-officers'
                      ? TrendingUp
                      : category.id === 'reimbursements-to-officers'
                        ? ArrowRightLeft
                    : LayoutGrid;
            const selected = selectedCategory === category.id;
            const isNewCategory = ['activity-fees', 'merchandise', 'membership-fees', 'event-program-expenses', 'prepaid-assets', 'payables', 'advances-to-officers', 'reimbursements-to-officers'].includes(category.id);
            const optionCount = category.id === 'activity-fees' || category.id === 'prepaid-assets' || category.id === 'payables'
              || category.id === 'advances-to-officers' || category.id === 'reimbursements-to-officers'
              ? null
              : category.id === 'expense-transactions' ? 1
              : new Set(classificationRules.filter(rule => categorizeTransactionRule(rule) === category.id
                && !(category.id === 'merchandise' && MERCHANDISE_TYPES_HIDDEN_FROM_PICKER.has(rule.description))
                && !(category.id === 'other' && MISC_TYPES_HIDDEN_FROM_PICKER.has(rule.description))
                && (category.id !== 'ppe-transactions' || rule.description === 'Purchase Chairs' || rule.description.toLowerCase().startsWith('purchase of '))
                && !(category.id === 'expense-transactions' && EXPENSE_TYPES_HIDDEN_FROM_PICKER.has(rule.description)))
                .map(rule => rule.description)).size;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectCategory(category.id)}
                className={`rounded-xl border p-3 text-left transition-all ${selected
                  ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700/10 dark:border-blue-400 dark:bg-blue-500/10'
                  : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/5'}`}
              >
                <span className={`mb-2 inline-flex rounded-lg p-2 ${selected ? 'bg-blue-700 text-white dark:bg-blue-500' : 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'}`}><Icon className="h-4 w-4" /></span>
                <span className="flex items-center gap-1.5">
                  <span className={`block text-xs font-bold ${isNewCategory ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-slate-100'}`}>{category.label}</span>
                  {isNewCategory && <NewFeatureBadge />}
                </span>
                <span className="mt-1 block text-[9px] font-medium leading-4 text-slate-500 dark:text-slate-400">{category.description}</span>
                <span className="mt-2 block text-[9px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">{optionCount === null ? 'Guided workflow' : `${optionCount} type${optionCount === 1 ? '' : 's'}`}</span>
              </button>
            );
          })}
        </div>
      </section>

      {!selectedCategory && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <LayoutGrid className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">Select a category to start recording a transaction.</p>
        </div>
      )}

      {selectedCategory === 'activity-fees' && <ActivityFeeEntry defaultOpen draftToResume={draftToResume} onDraftResumed={onDraftResumed} onDraftSaved={onDraftSaved} />}
      {selectedCategory === 'prepaid-assets' && <div className="space-y-5">
        <PrepaidAssetEntry draftToResume={draftToResume} onDraftResumed={onDraftResumed} onDraftSaved={onDraftSaved} />
        <PayablesEntry allowedPayableCodes={['2061', '2062', '2063', '2064']} title="Payment of Prepaid and Other Asset Payables" />
      </div>}
      {selectedCategory === 'payables' && <PayablesEntry />}

      {selectedCategory === 'merchandise' && <InventorySummaryCard compact />}
      {selectedCategory === 'merchandise' && <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!customerOrdersOpen} onClick={() => setCustomerOrdersOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200">Purchases / ordinary sales</button>
        <button type="button" aria-pressed={customerOrdersOpen} onClick={() => setCustomerOrdersOpen(true)} className="rounded-lg border border-blue-300 px-4 py-2 text-xs font-bold text-blue-800 dark:text-blue-200">Customer pre-orders / actual sales</button>
      </div>}
      {selectedCategory === 'merchandise' && customerOrdersOpen && <CustomerOrderEntry draftToResume={draftToResume} onDraftResumed={onDraftResumed} onDraftSaved={onDraftSaved} />}

      {selectedCategory && selectedCategory !== 'activity-fees' && selectedCategory !== 'prepaid-assets' && selectedCategory !== 'payables' && !(selectedCategory === 'merchandise' && customerOrdersOpen) && (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Entry Form */}
        <form onSubmit={event => { event.preventDefault(); if (editingDraftId) handlePost(); else handleSaveDraft(); }} className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-200" /> New Transaction
            </h3>
            {isSmartMatched && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-900 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full animate-pulse dark:text-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20">
                <Sparkles className="w-3.5 h-3.5" /> Rule Suggestion Match
              </span>
            )}
          </div>

          {errorMessage && !(isOfficerReimbursement && errorMessage === 'Reimbursement cannot exceed the amount currently payable to this accountable officer.') && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              aria-live="polite"
              className="fixed bottom-5 right-5 z-[60] flex w-[min(24rem,calc(100vw-2.5rem))] items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 shadow-xl shadow-slate-950/15 dark:border-emerald-500/30 dark:bg-slate-800 dark:text-emerald-300"
            >
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                {successMessage}
              </span>
              {lastPostedEntry && (
                <button
                  type="button"
                  onClick={handleUndoLastPost}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-white dark:border-emerald-500/30 dark:bg-slate-900/40 dark:text-emerald-300 dark:hover:bg-slate-900"
                  title="Post a reversing entry for this transaction"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Undo
                </button>
              )}
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 relative">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Transaction Type</label>
              {isFixedOfficerTransactionType ? (
                <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {txName}
                </div>
              ) : selectedCategory === 'ppe-transactions' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">PPE Dropdown</label>
                    <select value={debitCodeNumber >= 1500 && debitCodeNumber <= 1599 ? txName : ''} onChange={event => { setTxName(event.target.value); setShowTxDropdown(false); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      <option value="">Select a PPE purchase</option>
                      {classificationRules.filter(rule => { const code = Number(rule.debitAccountCode); return categorizeTransactionRule(rule) === 'ppe-transactions' && code >= 1500 && code <= 1599 && (rule.description.toLowerCase().startsWith('purchase of ') || rule.description === 'Purchase Chairs'); }).map(rule => <option key={rule.description} value={rule.description}>{rule.description}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">F&amp;F Dropdown</label>
                    <select value={debitCodeNumber >= 1650 && debitCodeNumber <= 1699 ? txName : ''} onChange={event => { setTxName(event.target.value); setShowTxDropdown(false); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      <option value="">Select a furniture purchase</option>
                      {classificationRules.filter(rule => { const code = Number(rule.debitAccountCode); return categorizeTransactionRule(rule) === 'ppe-transactions' && code >= 1650 && code <= 1699 && (rule.description.toLowerCase().startsWith('purchase of ') || rule.description === 'Purchase Chairs'); }).map(rule => <option key={rule.description} value={rule.description}>{rule.description}</option>)}
                    </select>
                  </div>
                </div>
              ) : <>
              <input
                type="text"
                value={txName}
                onChange={(e) => { setTxName(e.target.value); setShowTxDropdown(true); }}
                onFocus={() => setShowTxDropdown(true)}
                onBlur={() => setTimeout(() => setShowTxDropdown(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showTxDropdown && filteredTxTypeOptions.length > 0) {
                    e.preventDefault();
                    setTxName(filteredTxTypeOptions[0]);
                    setShowTxDropdown(false);
                  }
                }}
                placeholder="Search a transaction type..."
                autoComplete="off"
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-3 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                required
              />

              {showTxDropdown && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1">
                  {filteredTxTypeOptions.length > 0 ? (
                    filteredTxTypeOptions.map((desc) => (
                      <button
                        key={desc}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setTxName(desc); setShowTxDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        {desc}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      No matching type. Select a known type so the accounts remain automatic.
                    </div>
                  )}
                </div>
              )}

              <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Select a known type. Its accounting rule determines the accounts automatically.</p>
              </>}
              <div className="mt-2"><ReviewLaterNote /></div>

              {isSmartMatched && (
                <div className="mt-2 text-xs font-semibold text-emerald-600">
                  Auto-classification applied successfully.
                </div>
              )}
              {hasUnmatchedSearch && (
                <div className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  No rule selected. Choose a transaction type from the list.
                </div>
              )}
            </div>

            <div className="sm:col-span-2 rounded-xl border border-violet-200 bg-violet-50 p-3.5 dark:border-violet-500/20 dark:bg-violet-500/10">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">Reporting Period</p>
              {semester && reportingPeriod && settings.reportingYear ? (
                <p className="mt-1 text-xs font-semibold text-violet-800 dark:text-violet-200">
                  SY {settings.reportingYear}-{settings.reportingYear + 1} • {semester} ({reportingPeriod})
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Not set — set it top right, next to the org name, before posting.
                </p>
              )}
              <p className="mt-1 text-[10px] text-violet-700 dark:text-violet-300">Set once for the whole organization; every transaction uses it automatically.</p>
            </div>

            {classificationPreview?.purposeOptions && classificationPreview.purposeOptions.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">What Was It For?</label>
                <select
                  value={purposeIndex}
                  onChange={(e) => handlePurposeChange(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                >
                  {classificationPreview.purposeOptions.map((opt, i) => (
                    <option key={opt.label} value={i}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Determines the memo for this transaction.</p>
              </div>
            )}

            {isMerchandisePrepayment && (
              <div className="sm:col-span-2 space-y-4 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/20 dark:bg-violet-500/10">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">Pre-ordered merchandise details <NewFeatureBadge /></h4>
                  <p className="mt-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">Record this downpayment separately before recording the acquisition. You can link it when the goods are received.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">Merchandise pre-ordered</label>
                    <select value={merchandiseItem} onChange={event => { setMerchandiseItem(event.target.value); if (event.target.value !== 'Others') setMerchandiseOtherTitle(''); }} className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100" required>
                      <option value="" disabled>Select merchandise…</option>
                      {MERCHANDISE_ITEM_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">Batch / pre-order reference</label>
                    <input type="text" value={merchandiseBatch} onChange={event => setMerchandiseBatch(event.target.value)} placeholder="Example: Lanyard Batch 1" className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  </div>
                </div>
                {merchandiseItem === 'Others' && <div><label className="block text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">Other merchandise title</label><input type="text" value={merchandiseOtherTitle} onChange={event => setMerchandiseOtherTitle(event.target.value)} placeholder="Enter the merchandise name" className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100" required /></div>}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">Payment method</label>
                  <select value={merchandisePaymentMethod} onChange={event => changeMerchandisePaymentMethod(event.target.value as MerchandisePaymentMethod)} className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100">
                    <option value="organization-funds">Paid directly by the organization</option>
                    <option value="officer-personal">Paid by an officer using personal money</option>
                    <option value="organization-advance">Paid using a cash advance previously given to the officer</option>
                    <option value="advance-and-personal">Combination of organization funds, officer personal money, and/or cash advance</option>
                  </select>
                </div>
                {(merchandisePaymentMethod === 'officer-personal' || merchandisePaymentMethod === 'organization-advance' || merchandisePaymentMethod === 'advance-and-personal') && <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">Accountable officer</label>
                  <input list="preorder-officers" value={outrightOfficer} onChange={event => setOutrightOfficer(event.target.value)} placeholder="Officer name" className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  <datalist id="preorder-officers">{officerAdvanceBalances.map(record => <option key={record.name} value={record.name} />)}</datalist>
                  {(merchandisePaymentMethod === 'organization-advance' || merchandisePaymentMethod === 'advance-and-personal') && <p className="mt-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">Available advance for this officer: {formatCurrency(selectedOfficerAdvanceBalance)}</p>}
                </div>}
                {(merchandisePaymentMethod === 'organization-funds' || merchandisePaymentMethod === 'advance-and-personal') && <DatedAmountRows label={`Organization payment (available cash: ${formatCurrency(cashAvailable)})`} rows={merchandiseOrganizationPayments} onChange={setMerchandiseOrganizationPayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={cashAvailable} allowBlankDates allowEmptyAmounts={merchandisePaymentMethod === 'advance-and-personal'} allowMultiple={false} blankDateHelp="Date is optional." />}
                {(merchandisePaymentMethod === 'officer-personal' || merchandisePaymentMethod === 'advance-and-personal') && <div>
                  <DatedAmountRows label="Amount paid personally by the officer" rows={merchandiseOfficerPayments} onChange={setMerchandiseOfficerPayments} currencySymbol={settings.currencySymbol} defaultDate={date} allowBlankDates allowEmptyAmounts={merchandisePaymentMethod === 'advance-and-personal'} allowMultiple={false} blankDateHelp="Date is optional." />
                  <p className="mt-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">Record reimbursement separately under Reimbursement to Officer.</p>
                </div>}
                {(merchandisePaymentMethod === 'organization-advance' || merchandisePaymentMethod === 'advance-and-personal') && <>
                  <DatedAmountRows label="Payment using the officer cash advance" rows={merchandiseAdvancePayments} onChange={setMerchandiseAdvancePayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={selectedOfficerAdvanceBalance} allowBlankDates allowEmptyAmounts={merchandisePaymentMethod === 'advance-and-personal'} allowMultiple={false} blankDateHelp="Date is optional." />
                  {outrightOfficer.trim() && selectedOfficerAdvanceBalance <= 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">No recorded cash advance is available for {outrightOfficer.trim()}. Record the advance first under Advances to Officers before using it for this supplier downpayment.</div>}
                {officerAdvanceBalances.length > 0 && <div className="overflow-hidden rounded-lg border border-violet-200 bg-white/70 text-[10px] dark:border-violet-500/30 dark:bg-slate-900/40"><p className="px-3 py-2 font-black uppercase tracking-wide text-violet-900 dark:text-violet-200">Available advances to officers</p>{officerAdvanceBalances.map(record => <div key={record.name} className="flex items-center justify-between border-t border-violet-100 px-3 py-2 dark:border-violet-500/20"><span className="font-semibold text-slate-700 dark:text-slate-200">{record.name}</span><span className="font-black text-violet-800 dark:text-violet-200">{formatCurrency(record.balance)}</span></div>)}</div>}
                </>}
                {merchandisePrepaymentResult.error && transactionAmount > 0 && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{merchandisePrepaymentResult.error}</p>}
              </div>
            )}

            {isMerchandiseAcquisition && (
              <div className="sm:col-span-2 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">Acquisition of Merchandise for Sale - Goods Received and On Hand <NewFeatureBadge /></h4>
                  <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Record each received batch separately so its item, optional quantity, full cost, downpayments, and supplier settlement remain traceable.</p>
                  <p className="mt-1 text-[10px] font-semibold text-indigo-800 dark:text-indigo-200"><strong>Date of Purchase:</strong> use the date when the organization actually received the purchased goods.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Merchandise purchased</label>
                    <select value={merchandiseItem} onChange={event => { setMerchandiseItem(event.target.value); if (event.target.value !== 'Others') setMerchandiseOtherTitle(''); }} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required>
                      <option value="" disabled>Select merchandise…</option>
                      {MERCHANDISE_ITEM_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Quantity purchased (optional)</label>
                    <input type="number" min="1" step="1" value={merchandiseQuantity} onChange={event => setMerchandiseQuantity(event.target.value)} placeholder="Number of units, if applicable" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>

                {merchandiseItem === 'Others' && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Other merchandise title</label>
                    <input type="text" value={merchandiseOtherTitle} onChange={event => setMerchandiseOtherTitle(event.target.value)} placeholder="Enter the merchandise name" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Batch</label>
                  <input type="text" value={merchandiseBatch} onChange={event => setMerchandiseBatch(event.target.value)} placeholder="Example: Lanyard Batch 1" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Previously recorded downpayment (if applicable)</label>
                  <select value={merchandisePrepaymentEntryId} onChange={event => setMerchandisePrepaymentEntryId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100">
                    <option value="">No linked downpayment</option>
                    {matchingMerchandisePrepayment.entryIds.length > 0 && <option value={matchingMerchandisePrepayment.entryIds[0]}>{merchandiseItemLabel || 'Merchandise'} — {merchandiseBatch.trim() || 'Batch'} — Total downpayments {formatCurrency(matchingMerchandisePrepayment.amount)}</option>}
                  </select>
                  <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">All unused downpayment transactions matching this merchandise and batch are combined into one total.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Total cost of this batch</label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500">{settings.currencySymbol}</span>
                    <input type="number" min="0.01" step="0.01" value={amount || ''} onChange={event => setAmount(Number(event.target.value))} placeholder="Full cost whether paid or unpaid" className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 pl-8 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">How will the merchandise be paid?</label>
                  <select value={merchandisePaymentMethod} onChange={event => changeMerchandisePaymentMethod(event.target.value as MerchandisePaymentMethod)} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100">
                    <option value="organization-funds">Paid directly by the organization</option>
                    <option value="officer-personal">Paid by an officer using personal money - to be reimbursed</option>
                    <option value="organization-advance">Paid using a cash advance previously given to the officer</option>
                    <option value="advance-and-personal">Combination of organization funds, officer personal money, and/or cash advance</option>
                    <option value="not-yet-paid">Not yet paid (payment will be made next period/semester/year)</option>
                  </select>
                </div>

                {merchandiseUsesOfficer && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">Accountable Officer Name</label>
                    <input
                      type="text"
                      value={counterpartyName}
                      onChange={event => setCounterpartyName(event.target.value)}
                      placeholder="Enter officer or accountable person name"
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                      required
                    />
                    <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">Saved with the transaction for Review and audit history.</p>
                  </div>
                )}

                {(merchandisePaymentMethod === 'organization-funds' || merchandisePaymentMethod === 'advance-and-personal') && (
                  <DatedAmountRows label={`Organization payments to supplier (available cash: ${formatCurrency(cashAvailable)})`} rows={merchandiseOrganizationPayments} onChange={setMerchandiseOrganizationPayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={cashAvailable} addLabel="Add payment" allowBlankDates blankDateHelp="Date can be cleared and is optional. A blank date uses the Date Merchandise Was Received." />
                )}

                {(merchandisePaymentMethod === 'organization-advance' || merchandisePaymentMethod === 'advance-and-personal') && (
                  <div className="space-y-2">
                    <DatedAmountRows label={`Payments using ${counterpartyName.trim() || 'the selected officer'}'s cash advance`} rows={merchandiseAdvancePayments} onChange={setMerchandiseAdvancePayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={selectedOfficerAdvanceBalance} addLabel="Add advance payment" allowBlankDates blankDateHelp="Date can be cleared and is optional. A blank date uses the Date Merchandise Was Received." />
                    <p className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Available advance for this officer: {formatCurrency(selectedOfficerAdvanceBalance)}.</p>
                    {officerAdvanceBalances.length > 0 ? <div className="overflow-hidden rounded-lg border border-indigo-200 bg-white/70 text-[10px] dark:border-indigo-500/30 dark:bg-slate-900/40"><p className="px-3 py-2 font-black uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Available advances to officers</p>{officerAdvanceBalances.map(record => <div key={record.name} className="flex items-center justify-between border-t border-indigo-100 px-3 py-2 dark:border-indigo-500/20"><span className="font-semibold text-slate-700 dark:text-slate-200">{record.name}</span><span className="font-black text-indigo-800 dark:text-indigo-200">{formatCurrency(record.balance)}</span></div>)}</div> : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">No accountable officer has an available cash advance. Record the advance first under Advances to Officers.</p>}
                  </div>
                )}

                {(merchandisePaymentMethod === 'officer-personal' || merchandisePaymentMethod === 'advance-and-personal') && (
                  <div className="space-y-2">
                    <DatedAmountRows label="Payments made personally by the officer" rows={merchandiseOfficerPayments} onChange={setMerchandiseOfficerPayments} currencySymbol={settings.currencySymbol} defaultDate={date} addLabel="Add officer payment" allowBlankDates blankDateHelp="Date can be cleared and is optional. A blank date uses the Date Merchandise Was Received." />
                    <p className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Record any reimbursement separately under Reimbursement to Officer.</p>
                  </div>
                )}

                {merchandisePaymentMethod === 'not-yet-paid' && <p className="rounded-lg bg-white/80 p-3 text-[10px] font-semibold text-indigo-800 dark:bg-slate-900/60 dark:text-indigo-200">The full batch cost will remain in Accounts Payable - Merchandise and appear in Review until settled.</p>}
                {merchandisePaymentMethod !== 'not-yet-paid' && <p className="rounded-lg bg-white/80 p-3 text-[10px] font-semibold text-indigo-800 dark:bg-slate-900/60 dark:text-indigo-200">Record only payments made on or after the merchandise was received and is already on hand. Exclude downpayments made before receipt.</p>}
                {merchandiseAcquisitionResult.posting && merchandiseAcquisitionResult.posting.merchandisePayable > 0 && <p className="rounded-lg bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">The unpaid {formatCurrency(merchandiseAcquisitionResult.posting.merchandisePayable)} will be recorded in Accounts Payable - Merchandise for Review.</p>}
                {merchandiseAcquisitionResult.posting && merchandiseAcquisitionResult.posting.supplierReceivable > 0 && <p className="rounded-lg bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">The excess {formatCurrency(merchandiseAcquisitionResult.posting.supplierReceivable)} will be recorded in Accounts Receivable - Suppliers.</p>}
                {merchandiseAcquisitionResult.error && amount > 0 && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{merchandiseAcquisitionResult.error}</p>}
              </div>
            )}

            {isSupplierReceivableCollection && (
              <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200">Collection of Receivables from Suppliers</h4>
                <p className="mt-1 text-[10px] font-medium text-emerald-800 dark:text-emerald-300">Record cash returned or collected from suppliers against prior excess payments.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/50"><span className="text-[9px] font-bold uppercase text-slate-500">Outstanding receivable</span><p className="mt-1 text-sm font-black text-emerald-800 dark:text-emerald-200">{formatCurrency(supplierReceivableOutstanding)}</p></div>
                  <div className="rounded-lg bg-white/80 p-3 text-[10px] font-semibold text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">Journal entry: Debit Cash on Hand, Credit Accounts Receivable - Suppliers. The collection cannot exceed the outstanding balance.</div>
                </div>
                {supplierReceivableOutstanding <= 0 && <p className="mt-3 text-[10px] font-bold text-amber-700 dark:text-amber-300">No Accounts Receivable - Suppliers balance is available to collect.</p>}
              </div>
            )}

            {needsCounterpartyName && !merchandiseUsesOfficer && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">{counterpartyLabel}</label>
                <input
                  type="text"
                  value={counterpartyName}
                  onChange={(e) => setCounterpartyName(e.target.value)}
                  placeholder={effectiveCreditCode === '2010' ? 'Enter supplier or payee name' : 'Enter officer or accountable person name'}
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-3 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Saved with the transaction for Review and audit history.</p>
                {(isOfficerAdvance || isOfficerReimbursement || isLoanToOrganization || isLoanCollection || isPriorExpensePayablePayment) && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{counterpartyBalanceHeading}</p>
                    {visibleCounterpartyBalances.length > 0 ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{visibleCounterpartyBalances.map(item => <div key={item.name.toLocaleLowerCase()} className="flex items-center justify-between px-3 py-2 text-[10px]"><span className="font-semibold text-slate-700 dark:text-slate-200">{item.name}</span><span className="font-black text-blue-800 dark:text-blue-200">{formatCurrency(item.balance)}</span></div>)}</div> : <p className="px-3 py-3 text-[10px] font-medium text-amber-700 dark:text-amber-300">No outstanding balance has been recorded yet.</p>}
                  </div>
                )}
              </div>
            )}

            {isCashSponsorshipDonation && (
              <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <label className="block text-[11px] font-bold text-emerald-900 dark:text-emerald-200">Purpose <span className="text-rose-600">*required</span></label>
                <select value={contributionPurpose} onChange={event => setContributionPurpose(event.target.value as '' | 'donations' | 'sponsorships')} className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-emerald-500/30 dark:bg-slate-800 dark:text-slate-100" required>
                  <option value="">Choose Donations or Sponsorships</option>
                  <option value="donations">Donations</option>
                  <option value="sponsorships">Sponsorships</option>
                </select>
                <p className="mt-1.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-300">The selected purpose determines whether the credit goes to Donations or Sponsorships.</p>
              </div>
            )}

            {showRestrictionQuestion && (
              <div className="sm:col-span-2 space-y-3 p-3.5 bg-amber-50 border border-amber-100 rounded-xl dark:bg-amber-500/10 dark:border-amber-500/20">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">Did the donor impose a strict restriction that this sponsorship be used only for a specific event? <span className="text-amber-600">*required</span></label>
                  <select
                    value={restrictionAnswer}
                    onChange={(e) => { setRestrictionAnswer(e.target.value as '' | 'no' | 'yes' | 'permanent'); setSamePeriodAnswer(''); }}
                    className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-semibold p-2.5 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                    required
                  >
                    <option value="" disabled>Select an answer…</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                    <option value="permanent">Yes — permanently restricted</option>
                  </select>
                </div>

                {showSamePeriodQuestion && (
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">Will the event happen in the same reporting period the donation is received? <span className="text-amber-600">*required</span></label>
                    <select
                      value={samePeriodAnswer}
                      onChange={(e) => setSamePeriodAnswer(e.target.value as '' | 'yes' | 'no')}
                      className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-semibold p-2.5 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                      required
                    >
                      <option value="" disabled>Select an answer…</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                )}

                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                  {isPermanentlyRestricted
                    ? 'Recorded as permanently restricted contribution revenue and closed into Permanently Restricted Fund Balance.'
                    : isRestricted
                    ? 'Recorded against Contributions Revenue - Temporarily Restricted. Once the event happens, complete it in REVIEW to reclassify it as Unrestricted.'
                    : isCashSponsorshipDonation
                      ? `Recorded against ${contributionPurpose === 'sponsorships' ? 'Sponsorships' : 'Donations'}.`
                      : 'Recorded against Contributions Revenue - Unrestricted.'}
                </p>
              </div>
            )}

            {requiresAccrualCompletion && (
              <div className="sm:col-span-2 space-y-4 p-3.5 bg-amber-50 border border-amber-100 rounded-xl dark:bg-amber-500/10 dark:border-amber-500/20">
                <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">{isNewMembersAccrual ? 'New/Additional Members fees collection schedule' : 'Membership Fees collection schedule'} <NewFeatureBadge /></h4>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">When did the membership period start? (Date 1) <span className="text-amber-600">*required</span></label>
                  <input type="date" min={membershipPeriodBounds?.startDate} max={membershipPeriodBounds?.endDate} value={date} onChange={event => setDate(event.target.value)} className="w-full rounded-lg border border-amber-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-amber-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">{isNewMembersAccrual ? 'How much is total fees collectible from new/additional members of the org?' : 'Total membership fees collectible from all members'} <span className="text-amber-600">*required</span></label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">{settings.currencySymbol}</span>
                    <input type="number" step="0.01" min="0.01" value={amount || ''} onChange={event => setAmount(Number(event.target.value))} placeholder="0.00" className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-bold p-2.5 pl-8 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100" required />
                  </div>
                </div>
                <DatedAmountRows
                  label="How much of the membership fees was collected during this period/semester?"
                  rows={membershipCollections}
                  onChange={setMembershipCollections}
                  currencySymbol={settings.currencySymbol}
                  defaultDate={date}
                  minDate={membershipPeriodBounds?.startDate}
                  maxDate={membershipPeriodBounds?.endDate}
                  addLabel="Add collection"
                  allowBlankDates
                  allowEmptyAmounts
                  blankDateHelp={`Leave Date 2, Date 3, or another collection date blank to use Date 1 (${date || 'transaction date'}).`}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60"><span className="text-[9px] font-bold text-slate-500">TOTAL FEES</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(amount)}</p></div>
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60"><span className="text-[9px] font-bold text-slate-500">COLLECTED</span><p className="mt-1 text-xs font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(membershipCollectionTotal)}</p></div>
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60"><span className="text-[9px] font-bold text-slate-500">STILL RECEIVABLE</span><p className="mt-1 text-xs font-black text-rose-700 dark:text-rose-300">{formatCurrency(membershipPostingResult.posting?.amountStillReceivable || 0)}</p></div>
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60"><span className="text-[9px] font-bold text-slate-500">REFUND LIABILITY</span><p className="mt-1 text-xs font-black text-amber-700 dark:text-amber-300">{formatCurrency(membershipPostingResult.posting?.refundLiability || 0)}</p></div>
                </div>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">Use dates within {reportingPeriod} {settings.semester === '1st Semester' ? settings.reportingYear : (settings.reportingYear || 0) + 1}. The full fee is recognized on Date 1. Later collections clear Membership Fees Receivable first; any collection above the total fees is recorded separately as Refund Liability - Membership Fees.</p>
                {membershipPostingResult.error && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{membershipPostingResult.error}</p>}
              </div>
            )}

            {isPriorMembershipCollection && (
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">Collection of unpaid membership fees <NewFeatureBadge /></h4>
                  <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Use this for membership fees that have not yet been paid (e.g. last semester).</p>
                </div>
                <DatedAmountRows
                  label="How much was collected?"
                  rows={membershipCollections}
                  onChange={setMembershipCollections}
                  currencySymbol={settings.currencySymbol}
                  defaultDate=""
                  maxTotal={membershipReceivableOutstanding}
                  addLabel="Add collection"
                  allowMultiple={false}
                />
                <div className="rounded-lg bg-white/80 p-3 text-[10px] dark:bg-slate-900/60"><span className="font-bold text-slate-500">Receivable remaining after these collections</span><p className="mt-1 font-black text-indigo-800 dark:text-indigo-200">{formatCurrency(Math.max(0, membershipReceivableOutstanding - membershipCollectionTotal))}</p></div>
                {membershipPostingResult.error && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{membershipPostingResult.error}</p>}
              </div>
            )}

            {isMembershipRefundStatus && (
              <div className="sm:col-span-2 space-y-4 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/20 dark:bg-violet-500/10">
                <div>
                  <h4 className="text-xs font-black text-violet-800 dark:text-violet-200">Excess Membership Fee Collection - Status</h4>
                  <p className="mt-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">Available Refund Liability - Membership Fees: {formatCurrency(membershipRefundLiabilityOutstanding)}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">How will the excess collection be handled?</label>
                  <select value={membershipRefundStatus} onChange={event => { setMembershipRefundStatus(event.target.value as MembershipRefundStatus); setAmount(0); setDate(''); }} className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100">
                    <option value="current">Refunded in the Current Reporting Period</option>
                    <option value="next">Will Be Refunded in the Next Reporting Period</option>
                    <option value="nonrefundable">Will Not Be Refunded (Non-refundable)</option>
                  </select>
                </div>
                {membershipRefundStatus === 'next' ? (
                  <p className="rounded-lg bg-white/80 p-3 text-[10px] font-semibold text-violet-700 dark:bg-slate-900/60 dark:text-violet-300">No journal entry will be posted. The liability will remain outstanding for the next reporting period.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold text-violet-900 dark:text-violet-200">Amount <span className="text-rose-600">*required</span></label>
                      <div className="relative mt-1.5"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-violet-500">{settings.currencySymbol}</span><input type="number" min="0.01" step="0.01" max={membershipRefundLiabilityOutstanding || undefined} value={amount || ''} onChange={event => setAmount(Number(event.target.value))} placeholder="0.00" className="w-full rounded-lg border border-violet-200 bg-white p-2.5 pl-8 text-xs font-bold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100" required /></div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-violet-900 dark:text-violet-200">Date {membershipRefundStatus === 'current' ? <span className="text-rose-600">*required</span> : <span className="font-medium text-slate-400">(optional)</span>}</label>
                      <input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-violet-500/30 dark:bg-slate-800 dark:text-slate-100" required={membershipRefundStatus === 'current'} />
                    </div>
                  </div>
                )}
                {membershipRefundResolutionResult.error && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{membershipRefundResolutionResult.error}</p>}
              </div>
            )}

            {showDeferPortionQuestion && (
              <div className="sm:col-span-2 space-y-3 p-3.5 bg-amber-50 border border-amber-100 rounded-xl dark:bg-amber-500/10 dark:border-amber-500/20">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">How much of this is NOT yet used, consumed, or benefited from this period? <span className="text-amber-600">*required</span></label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">{settings.currencySymbol}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={amount || undefined}
                      value={notYetUsedAmount}
                      onChange={(e) => setNotYetUsedAmount(e.target.value)}
                      placeholder="0.00 if fully used already"
                      className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-bold p-2.5 pl-8 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                      required
                    />
                  </div>
                </div>

                {Number(notYetUsedAmount) > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">When will it be used?</label>
                    <select
                      value={expectedUsePeriod}
                      onChange={(e) => setExpectedUsePeriod(e.target.value as 'within' | 'next')}
                      className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-semibold p-2.5 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                    >
                      <option value="within">Within this sem/period</option>
                      <option value="next">Next sem or a future period</option>
                    </select>
                  </div>
                )}

                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">Posted to Prepaid Expenses instead of expensed immediately — resolve it in REVIEW once it's actually used.</p>
              </div>
            )}

            {showCashAdvanceWarning && (
              <div className="sm:col-span-2 p-3 bg-rose-50 border border-rose-100 text-rose-700 text-[11px] font-semibold rounded-xl dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300">
                Caution: this amount exceeds the {formatCurrency(advancesOutstanding)} currently outstanding as cash advances. Record the cash-advance-given transaction first.
              </div>
            )}

            {showMembershipReceivableWarning && (
              <div className="sm:col-span-2 p-3 bg-rose-50 border border-rose-100 text-rose-700 text-[11px] font-semibold rounded-xl dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300">
                Caution: this exceeds the {formatCurrency(membershipReceivableOutstanding)} currently on the books as Membership Dues Receivable. Make sure the fee was accrued and recorded as a receivable in the previous reporting period/semester.
              </div>
            )}

            {isMerchandiseSale && (
              <div className="sm:col-span-2 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">Sale of merchandise <NewFeatureBadge /></h4>
                  <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Select the exact purchase batch so quantity sold and remaining units stay connected to Inventory Summary.</p>
                </div>

                {merchandiseBatches.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">No purchase batch with available units was found. Record an Acquisition of Merchandise first.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Name of item</label>
                      <select value={effectiveMerchandiseSaleItem} onChange={event => { setMerchandiseSaleItem(event.target.value); setMerchandiseSaleBatchId(''); setMerchandiseQuantitySold(''); setMerchandiseCost(''); }} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required>
                        <option value="" disabled>Select an inventory item…</option>
                        {merchandiseSaleItems.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Batch no.</label>
                      <select value={merchandiseSaleBatchId} onChange={event => { setMerchandiseSaleBatchId(event.target.value); setMerchandiseQuantitySold(''); setMerchandiseCost(''); }} disabled={!effectiveMerchandiseSaleItem} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/60" required>
                        <option value="" disabled>{effectiveMerchandiseSaleItem ? 'Select an available batch…' : 'Choose an item first'}</option>
                        {merchandiseBatchesForSelectedItem.map(batch => <option key={batch.entryId} value={batch.entryId}>{batch.batch} — {batch.remainingQuantity} units available</option>)}
                      </select>
                    </div>
                    {selectedMerchandiseBatch && <p className="sm:col-span-2 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Purchased {selectedMerchandiseBatch.purchasedQuantity} units for {formatCurrency(selectedMerchandiseBatch.acquisitionCost)}. {selectedMerchandiseBatch.remainingQuantity} units and {formatCurrency(selectedMerchandiseBatch.netInventoryBalance)} in cost remain in this batch.</p>}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-200">Quantity sold</label>
                    <input type="number" min="1" step="1" max={selectedMerchandiseBatch?.remainingQuantity} value={merchandiseQuantitySold} onChange={event => setMerchandiseQuantitySold(event.target.value)} placeholder="Number of units" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-200">Selling price per unit</label>
                    <div className="relative mt-1.5"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500">{settings.currencySymbol}</span><input type="number" min="0.01" step="0.01" value={merchandiseSellingPrice} onChange={event => setMerchandiseSellingPrice(event.target.value)} placeholder="0.00" className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 pl-8 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required /></div>
                  </div>
                </div>

                <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60">
                  <span className="text-[9px] font-bold uppercase text-slate-500">Total sales — automatically computed</span>
                  <p className="mt-1 text-lg font-black text-indigo-800 dark:text-indigo-200">{formatCurrency(merchandiseSaleTotal)}</p>
                  <p className="text-[9px] text-slate-500">Quantity sold × selling price</p>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-900 dark:text-indigo-200">Cost of all items sold <span title="Cost of sales is the total cost of the items sold. It includes the purchase price and any costs directly attributable to preparing or producing the merchandise, such as materials, design fees, printing, or labor." className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-indigo-300 text-[9px] font-black">?</span></label>
                  <div className="relative mt-1.5"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500">{settings.currencySymbol}</span><input type="number" step="0.01" min="0.01" max={selectedMerchandiseBatch?.netInventoryBalance || undefined} value={merchandiseCost} onChange={event => setMerchandiseCost(event.target.value)} placeholder="Enter the total cost of the items sold" className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 pl-8 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required /></div>
                  <p className="mt-1.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Include all costs attributable to the merchandise being sold, including purchase, materials, design, printing, and labor costs. The amount cannot exceed the {formatCurrency(selectedMerchandiseBatch?.netInventoryBalance || 0)} remaining for the selected batch. This automatically debits Cost of Sales and credits Merchandise Inventory.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">How was payment collected during this reporting period?</label>
                  <select value={merchandiseCollectionMethod} onChange={event => setMerchandiseCollectionMethod(event.target.value as MerchandiseCollectionMethod)} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100">
                    <option value="not-yet-collected">Not yet collected</option>
                    <option value="organization-direct">Collected directly by the organization</option>
                    <option value="officer-to-remit">Collected by an officer, to be remitted</option>
                  </select>
                </div>

                {merchandiseCollectionMethod !== 'not-yet-collected' && (
                  <DatedAmountRows label={merchandiseCollectionMethod === 'officer-to-remit' ? 'How much was collected by the officer?' : 'How much was collected by the organization?'} rows={merchandiseCollections} onChange={setMerchandiseCollections} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={merchandiseSaleTotal} addLabel="Add collection" />
                )}

                {merchandiseCollectionMethod === 'officer-to-remit' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-200">Accountable officer</label>
                      <input type="text" value={merchandiseCollectionOfficer} onChange={event => setMerchandiseCollectionOfficer(event.target.value)} placeholder="Officer who collected the payments" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                    </div>
                    <DatedAmountRows label="How much was remitted to the organization?" rows={merchandiseRemittances} onChange={setMerchandiseRemittances} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={merchandiseCollectionTotal} addLabel="Add remittance" />
                  </>
                )}

                {merchandiseSaleResult.posting && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-white/80 p-3 text-[10px] dark:bg-slate-900/60"><span className="font-bold text-slate-500">Still receivable from buyers</span><p className="mt-1 font-black text-rose-700 dark:text-rose-300">{formatCurrency(merchandiseSaleResult.posting.accountsReceivable)}</p></div>
                    {merchandiseCollectionMethod === 'officer-to-remit' && <div className="rounded-lg bg-white/80 p-3 text-[10px] dark:bg-slate-900/60"><span className="font-bold text-slate-500">Still held by officer</span><p className="mt-1 font-black text-amber-700 dark:text-amber-300">{formatCurrency(merchandiseSaleResult.posting.dueFromOfficer)}</p></div>}
                  </div>
                )}
                {merchandiseSaleResult.error && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{merchandiseSaleResult.error}</p>}
              </div>
            )}

            {isGuidedPurchase && (
              <div className="sm:col-span-2 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
              <div>
                  <h4 className="text-xs font-black text-violet-700 dark:text-violet-300">{isPpeAcquisition ? 'Property, Plant and Equipment purchase' : 'Outright expense payment'}</h4>
                  <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Record the full {isPpeAcquisition ? 'purchase price' : 'expense'} now. Each payment is posted separately; any unpaid balance remains in {activeAccounts.find(account => account.code === guidedPayableAccountCode)?.name || 'the related payable'} for Review.</p>
                </div>
                {isOutrightExpense && <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Expense account</label>
                  <select value={debitCode} onChange={event => { const code = event.target.value; setSelectedExpenseAccountCode(code); setDebitCode(code); setClassificationPreview(previous => previous ? { ...previous, debitAccountCode: code } : previous); }} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required>
                    {activeAccounts.filter(account => account.type === 'Expenses' && account.code !== '5090' && account.code !== '5095').map(account => <option key={account.code} value={account.code}>{account.code} - {account.name}</option>)}
                  </select>
                </div>}
                {isOutrightExpense && <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Date <span className="normal-case font-medium">(optional; clear to use today)</span></label>
                  <input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" />
                </div>}
                {isOutrightExpense && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Is this expense for an event?</label>
                    <select value={expenseEvent} onChange={event => setExpenseEvent(event.target.value as '' | 'yes' | 'no')} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100">
                      <option value="">Select Yes or No</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </div>
                  {expenseEvent === 'yes' && <div><label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Event name</label><input value={expenseEventName} onChange={event => setExpenseEventName(event.target.value)} placeholder="Name of event" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required /></div>}
                </div>}
                {isOutrightExpense && expenseEvent === 'no' && <p className="text-[10px] font-semibold text-indigo-800 dark:text-indigo-200">This will be classified as General and Administrative Expense.</p>}
                <div><label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">{isPpeAcquisition ? 'Purchase price' : 'Total expense amount'}</label><div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500">{settings.currencySymbol}</span><input type="number" min="0" step="0.01" value={amount || ''} onChange={event => setAmount(Number(event.target.value))} placeholder="0.00" className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 pl-8 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required /></div></div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Payment method</label>
                  <select value={outrightPaymentMethod} onChange={event => setOutrightPaymentMethod(event.target.value as OutrightExpensePaymentMethod)} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100">
                    <option value="organization-funds">Paid directly by the organization</option><option value="officer-personal">Paid by an officer using personal money</option><option value="officer-advance">Paid using an officer cash advance</option><option value="combination">Combination of organization funds, officer money, and/or advance</option><option value="not-yet-paid">Not yet paid — will be paid next reporting period</option>
                  </select>
                </div>
                {(outrightPaymentMethod === 'organization-funds' || outrightPaymentMethod === 'combination') && <DatedAmountRows label={`Organization payments (available cash: ${formatCurrency(cashAvailable)})`} rows={outrightOrganizationPayments} onChange={setOutrightOrganizationPayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={Math.min(amount || cashAvailable, cashAvailable)} addLabel="Add organization payment" allowBlankDates blankDateHelp="Date is optional and can be cleared. Entered dates cannot repeat." />}
                {(outrightPaymentMethod === 'officer-personal' || outrightPaymentMethod === 'combination') && <DatedAmountRows label="Officer personal payments" rows={outrightOfficerPayments} onChange={setOutrightOfficerPayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={amount || 0} addLabel="Add officer payment" allowBlankDates blankDateHelp="Date is optional and can be cleared. Entered dates cannot repeat." />}
                {(outrightPaymentMethod === 'officer-advance' || outrightPaymentMethod === 'combination') && <DatedAmountRows label={`Payments using ${outrightOfficer.trim() || 'this officer'}'s advance (available: ${formatCurrency(selectedOfficerAdvanceBalance)})`} rows={outrightAdvancePayments} onChange={setOutrightAdvancePayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={Math.min(amount || selectedOfficerAdvanceBalance, selectedOfficerAdvanceBalance)} addLabel="Add advance payment" allowBlankDates blankDateHelp="Date is optional and can be cleared. Entered dates cannot repeat." />}
                {(outrightPaymentMethod === 'officer-personal' || outrightPaymentMethod === 'officer-advance' || outrightPaymentMethod === 'combination') && <div><label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Accountable officer</label><input value={outrightOfficer} onChange={event => setOutrightOfficer(event.target.value)} placeholder="Officer who paid or used the advance" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" /></div>}
                {outrightPaymentMethod === 'not-yet-paid' && <p className="rounded-lg bg-white/80 p-3 text-[10px] font-semibold text-indigo-800 dark:bg-slate-900/60 dark:text-indigo-200">Posts Debit to the selected {isPpeAcquisition ? 'asset' : 'expense'} account and Credit to {activeAccounts.find(account => account.code === guidedPayableAccountCode)?.name || 'Accounts Payable'}. The payable carries into the next reporting period and remains in Review until paid.</p>}
                {outrightExpenseResult.posting && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><div className="rounded-lg bg-white/80 p-3 text-[10px] dark:bg-slate-900/60"><span className="font-bold text-slate-500">Due to supplier</span><p className="mt-1 font-black text-rose-700">{formatCurrency(outrightExpenseResult.posting.dueToSupplier)}</p></div><div className="rounded-lg bg-white/80 p-3 text-[10px] dark:bg-slate-900/60"><span className="font-bold text-slate-500">Due to officer</span><p className="mt-1 font-black text-amber-700">{formatCurrency(outrightExpenseResult.posting.dueToOfficer)}</p></div><div className="rounded-lg bg-white/80 p-3 text-[10px] dark:bg-slate-900/60"><span className="font-bold text-slate-500">Advance used</span><p className="mt-1 font-black text-indigo-700">{formatCurrency(outrightExpenseResult.posting.advanceUsed)}</p></div></div>}
                {requiresExpenseDraftReview && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Save as Draft to keep this balanced entry visible in the ledger. Add remaining payments from Review, then post the completed transaction.</p>}
                {outrightExpenseResult.error && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{outrightExpenseResult.error}</p>}
              </div>
            )}

            {!isGuidedPurchase && !isMerchandiseAcquisition && !isMerchandiseSale && !isMerchandisePrepayment && !requiresAccrualCompletion && !isPriorMembershipCollection && !isMembershipRefundStatus && <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">{isMerchandisePrepayment ? 'Payment' : isSupplierReceivableCollection ? 'Amount collected' : 'Amount'}</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 dark:text-slate-400">{settings.currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-bold p-2.5 pl-8 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                />
              </div>
              {/* Remove accidental duplicate light-only amount control (was causing permanent light/dark mismatch) */}
              <div className="hidden" />
            </div>}

            {!isMerchandisePrepayment && !requiresAccrualCompletion && !isPriorMembershipCollection && !isMembershipRefundStatus && !isOutrightExpense && <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">{isMerchandiseAcquisition ? 'Date of Purchase' : isSupplierReceivableCollection ? 'Collection date' : 'Date'}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                required={!isOfficerReimbursement}
              />
            </div>}

            {reimbursementAmountError && <p role="alert" className="sm:col-span-2 text-[10px] font-bold text-rose-700 dark:text-rose-300">{reimbursementAmountError}</p>}

            {!requiresAccrualCompletion && !isPriorMembershipCollection && !isMembershipRefundStatus && (
              <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3.5 dark:border-slate-700 dark:bg-slate-950/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      <Paperclip className="h-3.5 w-3.5" /> Receipt / Supporting Photo <span className="font-medium text-slate-400">(optional)</span>
                    </p>
                    <p className="mt-0.5 text-[9px] font-medium text-slate-500 dark:text-slate-400">JPG, PNG, or WebP. Up to 3 images; photos are compressed before saving.</p>
                  </div>
                  {pendingReceipts.length < 3 && (
                    <label className="cursor-pointer rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500">
                      {isProcessingReceipts ? 'Processing…' : pendingReceipts.length > 0 ? 'Add another' : 'Choose image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={isProcessingReceipts}
                        onChange={(event) => { void handleReceiptFiles(event.target.files); event.currentTarget.value = ''; }}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
                {pendingReceipts.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {pendingReceipts.map(receipt => (
                      <div key={receipt.id} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                        <img src={receipt.dataUrl} alt={`Receipt ${receipt.fileName}`} className="h-24 w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPendingReceipts(previous => previous.filter(candidate => candidate.id !== receipt.id))}
                          className="absolute right-1.5 top-1.5 rounded-full bg-slate-950/70 p-1 text-white hover:bg-rose-600"
                          aria-label={`Remove ${receipt.fileName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="flex gap-1 p-2 text-[9px]">
                          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">{receipt.fileName}</span>
                          <span className="text-slate-400">{formatReceiptSize(receipt.size)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {receiptMessage && <p className="mt-2 text-[10px] font-semibold text-rose-600 dark:text-rose-300">{receiptMessage}</p>}
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Memo / Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional bookkeeping notes..."
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-medium p-3 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              />
            </div>

            <div className="sm:col-span-2 pt-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Accounts (determined automatically)
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Debit Account (Increase Assets/Expenses)</label>
              <div className="w-full bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold p-2.5 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400">
                {debitAccount ? `${debitAccount.code} - ${debitAccount.name} (${debitAccount.type})` : 'Select a transaction type first'}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Credit Account (Increase Liabilities/Revenue)</label>
              <div className="w-full bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold p-2.5 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400">
                {creditAccount ? `${creditAccount.code} - ${creditAccount.name} (${creditAccount.type})` : 'Select a transaction type first'}
              </div>
            </div>

          </div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={isProcessingReceipts}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {editingDraftId ? 'Post Reviewed Transaction' : 'Save as Draft'}
            </button>
          </div>
        </form>

        {/* Right Column: Live Financial Preview */}
        <div className="xl:col-span-5 space-y-6">
          {/* 1. Double Entry Preview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">Journal Entry Preview</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 px-2">
                <span>Account & Details</span>
                <div className="flex gap-12 w-28 justify-between">
                  <span>Debit</span>
                  <span>Credit</span>
                </div>
              </div>

              {previewLines.length === 0 ? (
                <div className="p-4 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  Select a transaction type and enter an amount to preview its journal lines.
                </div>
              ) : previewLines.map((line, index) => {
                const account = activeAccounts.find(a => a.code === line.accountCode);
                return (
                  <div key={`${line.accountCode}-${index}`} className={`grid grid-cols-[1fr_7rem] items-center gap-3 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 rounded-xl ${line.credit > 0 ? 'pl-6' : ''}`}>
                    <div>
                      <p className="text-slate-900 dark:text-slate-100">{account?.name || line.accountCode}</p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400">Code: {line.accountCode} • Date: {line.date || date} • Normal: {account?.normalBalance}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-right">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{line.debit > 0 ? formatCurrency(line.debit) : '—'}</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{line.credit > 0 ? formatCurrency(line.credit) : '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-[10px] text-emerald-700 font-semibold flex justify-between items-center dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400">
              <span>Equation Status</span>
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Scale className="w-3.5 h-3.5" /> {previewLines.length > 0 ? 'Balanced Dr = Cr' : 'Waiting for transaction'}
              </span>
            </div>
          </div>

          {/* 2. Ledger Impact preview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">Projected Ledger Impact</h3>

            <div className="space-y-3.5">
              {projectedImpacts.length === 0 ? (
                <p className="py-3 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">No ledger movement to preview yet.</p>
              ) : projectedImpacts.map(item => (
                <div key={item.accountCode} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{item.account?.name || item.accountCode}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      {item.debit > 0 ? `Debit ${formatCurrency(item.debit)}` : `Credit ${formatCurrency(item.credit)}`} • Balance {item.normalBalanceDelta >= 0 ? 'increases' : 'decreases'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-semibold">Before {formatCurrency(item.before)}</p>
                    <p className={`text-xs font-bold ${item.normalBalanceDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>After {formatCurrency(item.after)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Statement Impact */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">Statement Impact Preview</h3>
            
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 dark:text-slate-400">Balance Sheet Impact</span>
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center justify-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> 
                  {assetImpact !== 0 ? `Assets: ${assetImpact > 0 ? '+' : ''}${formatCurrency(assetImpact)}` : 'No net Asset change'}
                </span>
              </div>
              <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 dark:text-slate-400">Income Statement Impact</span>
                <span className={`text-xs font-bold flex items-center justify-center gap-1 ${
                  netIncomeImpact < 0 ? 'text-rose-600 dark:text-rose-400' : netIncomeImpact > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {netIncomeImpact < 0
                    ? <TrendingDown className="w-3.5 h-3.5" /> 
                    : <TrendingUp className="w-3.5 h-3.5" />}
                  {netIncomeImpact !== 0 ? `Net Income: ${netIncomeImpact > 0 ? '+' : ''}${formatCurrency(netIncomeImpact)}` : 'No net income change'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
