import React, { useState, useEffect, useMemo } from 'react';
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
import { JournalLine, ReceiptAttachmentDraft } from '../types';
import { FUNDING_SOURCE_OPTIONS, buildJournalLines, buildCompoundJournalLines, projectJournalLineImpacts, computeStatementImpact } from '../lib/journalEngine';
import { CASH_ACCOUNT_CODES } from '../lib/cashAccounts';
import { PREPAID_EXPENSE_CODE } from '../lib/reviewEngine';
import { formatReceiptSize, prepareReceiptAttachment, validateReceiptCount } from '../lib/receiptAttachments';
import { ActivityFeeEntry } from '../components/ActivityFeeEntry';
import { InventorySummaryCard } from '../components/InventorySummaryCard';
import { DatedAmountInputRow, DatedAmountRows } from '../components/DatedAmountRows';
import { NewFeatureBadge } from '../components/NewFeatureBadge';
import { categorizeTransactionRule, TRANSACTION_CATEGORIES, TransactionCategoryId } from '../lib/transactionCategories';
import { merchandiseSaleCostError, MERCHANDISE_INVENTORY_CODE } from '../lib/transactionHistory';
import {
  buildMerchandiseAcquisitionPosting,
  MerchandisePaymentMethod,
} from '../lib/merchandiseAcquisition';
import {
  buildMerchandiseBatchBalances,
  buildMerchandiseSalePosting,
  MerchandiseCollectionMethod,
} from '../lib/merchandiseSale';
import {
  buildCurrentMembershipFeePosting,
  buildPriorMembershipCollectionPosting,
} from '../lib/membershipFees';

const GENERAL_FUND_PROJECT = 'General Fund Operations';
// Working paper's Situation 5.1/5.2/5.3 branch: a donor-restricted
// contribution whose event hasn't happened yet this period.
const RESTRICTED_REVENUE_CODE = '4035';
const UNRESTRICTED_REVENUE_CODE = '4030';
const MEMBERSHIP_DUES_RECEIVABLE_CODE = '1300';
const MERCHANDISE_ITEM_OPTIONS = ['Lanyard', 'Pins', 'Tote Bag', 'Mugs', 'Shirt', 'Others'] as const;
const sumDatedAmounts = (rows: DatedAmountInputRow[]): number => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

export function Transactions(): React.ReactElement {
  const {
    accounts,
    journalEntries,
    projects,
    addJournalEntry,
    attachReceiptsToEntry,
    reverseJournalEntry,
    suggestTransactionClassification,
    classificationRules,
    accountBalances,
    formatCurrency,
    settings
  } = useFinance();

  // Form State
  const [txName, setTxName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TransactionCategoryId | null>(null);
  const [customName, setCustomName] = useState('');
  // Transaction Name search dropdown: open while the field has focus,
  // filtered live as you type. Selecting an option fills txName with its
  // description and applies that exact rule (see the exact-description
  // match in suggestTransactionClassification). Known types keep their
  // accounts automatic. A separate optional customName lets the user label
  // a known type without bypassing its accounting rule.
  const [showTxDropdown, setShowTxDropdown] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedProject, setSelectedProject] = useState(GENERAL_FUND_PROJECT);
  // Program/Project Allocation only matters for a transaction that's
  // actually tied to a specific program or event — most entries (a
  // utility bill, a bank charge) aren't, and stay under General Fund
  // Operations without ever showing this field.
  const [isProgramSpecific, setIsProgramSpecific] = useState(false);
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
  const [merchandisePaymentMethod, setMerchandisePaymentMethod] = useState<MerchandisePaymentMethod>('organization-funds');
  const [merchandiseOrganizationPayments, setMerchandiseOrganizationPayments] = useState<DatedAmountInputRow[]>([{ id: 'org-payment-1', date, amount: '' }]);
  const [merchandiseOfficerPayments, setMerchandiseOfficerPayments] = useState<DatedAmountInputRow[]>([{ id: 'officer-payment-1', date, amount: '' }]);
  const [merchandiseAdvancePayments, setMerchandiseAdvancePayments] = useState<DatedAmountInputRow[]>([{ id: 'advance-payment-1', date, amount: '' }]);
  const [merchandiseReimbursements, setMerchandiseReimbursements] = useState<DatedAmountInputRow[]>([{ id: 'reimbursement-1', date, amount: '' }]);
  const [merchandiseSaleBatchId, setMerchandiseSaleBatchId] = useState('');
  const [merchandiseQuantitySold, setMerchandiseQuantitySold] = useState('');
  const [merchandiseSellingPrice, setMerchandiseSellingPrice] = useState('');
  const [merchandiseCollectionMethod, setMerchandiseCollectionMethod] = useState<MerchandiseCollectionMethod>('not-yet-collected');
  const [merchandiseCollections, setMerchandiseCollections] = useState<DatedAmountInputRow[]>([{ id: 'collection-1', date, amount: '' }]);
  const [merchandiseRemittances, setMerchandiseRemittances] = useState<DatedAmountInputRow[]>([{ id: 'remittance-1', date, amount: '' }]);
  const [merchandiseCollectionOfficer, setMerchandiseCollectionOfficer] = useState('');

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
  const [restrictionAnswer, setRestrictionAnswer] = useState<'' | 'no' | 'yes'>('');
  const [samePeriodAnswer, setSamePeriodAnswer] = useState<'' | 'yes' | 'no'>('');

  const [membershipCollections, setMembershipCollections] = useState<DatedAmountInputRow[]>([
    { id: 'membership-collection-1', date: '', amount: '' },
  ]);

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

  const [classificationPreview, setClassificationPreview] = useState<{
    debitAccountCode: string;
    creditAccountCode: string;
    defaultDesc: string;
    purposeOptions?: PurposeOption[];
    requiresAccrualCompletion?: boolean;
    mayDeferPortion?: boolean;
    sponsorshipKind?: 'cash' | 'food' | 'supplies';
  } | null>(null);

  // active accounts
  const activeAccounts = accounts.filter(a => a.isActive);
  const realPrograms = projects.filter(p => p.name !== GENERAL_FUND_PROJECT);

  // Deduped, alphabetized list of known transaction types (two rules —
  // 'award'/'prize' — share the description "Awards & Prizes Expense",
  // since they're the same category under two different trigger words).
  const transactionTypeOptions = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'activity-fees') return [];
    return Array.from(new Set(
      classificationRules
        .filter(rule => categorizeTransactionRule(rule) === selectedCategory)
        .map(rule => rule.description)
    )).sort();
  }, [classificationRules, selectedCategory]);
  const filteredTxTypeOptions = txName.trim()
    ? transactionTypeOptions.filter(d => d.toLowerCase().includes(txName.trim().toLowerCase()))
    : transactionTypeOptions;
  const selectedTransactionType = transactionTypeOptions.find(d => d.toLowerCase() === txName.trim().toLowerCase());
  const hasUnmatchedSearch = txName.trim().length > 0 && !classificationPreview;

  const selectCategory = (category: TransactionCategoryId) => {
    setSelectedCategory(category);
    setTxName('');
    setCustomName('');
    setShowTxDropdown(false);
    setErrorMessage('');
  };

  // The funding-source question only makes sense while the credit side is
  // still a cash account — once it points at a revenue, loan, or accounts
  // payable account, "whose money paid for it?" no longer applies.
  const isMerchandiseAcquisition = selectedCategory === 'merchandise' && debitCode === '1700';
  const showFundingSource = !!classificationPreview && CASH_ACCOUNT_CODES.includes(creditCode) && !isMerchandiseAcquisition;

  // Only a cash contribution matched to Contributions Revenue - Unrestricted
  // can raise the restriction question — a release-from-restriction entry
  // (which also credits 4030, but debits 4035, not cash) is a different
  // transaction and must not ask it again.
  const showRestrictionQuestion = !!classificationPreview?.sponsorshipKind && creditCode === UNRESTRICTED_REVENUE_CODE;
  const showSamePeriodQuestion = showRestrictionQuestion && restrictionAnswer === 'yes';
  const isRestricted = showRestrictionQuestion && restrictionAnswer === 'yes' && samePeriodAnswer === 'no';
  const effectiveCreditCode = isRestricted ? RESTRICTED_REVENUE_CODE : creditCode;
  const merchandiseUsesOfficer = isMerchandiseAcquisition && (merchandisePaymentMethod === 'officer-personal' || merchandisePaymentMethod === 'advance-and-personal');
  const needsCounterpartyName = !!classificationPreview && ((effectiveCreditCode === '2050' || effectiveCreditCode === '2010' || debitCode === '1250') || merchandiseUsesOfficer);
  const counterpartyLabel = merchandiseUsesOfficer
    ? 'Accountable Officer Name'
    : effectiveCreditCode === '2010'
    ? 'Supplier / Payee Name'
    : 'Officer / Accountable Person Name';

  // Membership Fees for the current school year recognizes the full fee on
  // Date 1, then routes same-day cash and later dated collections correctly.
  // Prior-period collections clear an existing receivable instead.
  const requiresAccrualCompletion = !!classificationPreview?.requiresAccrualCompletion;
  const isPriorMembershipCollection = !!classificationPreview && debitCode === '1010' && creditCode === MEMBERSHIP_DUES_RECEIVABLE_CODE;

  // The general "not yet used" question — see mayDeferPortion's doc
  // comment in FinanceContext.tsx. officer-cash-advance is excluded: that
  // funding source already resolves "was it used" in REVIEW.
  const showDeferPortionQuestion = !!classificationPreview?.mayDeferPortion && fundingSourceId !== 'officer-cash-advance';

  // Trigger classification suggestion on Name input change
  useEffect(() => {
    const match = selectedTransactionType ? suggestTransactionClassification(selectedTransactionType) : null;
    if (match) {
      setDebitCode(match.debitAccountCode);
      setCreditCode(match.creditAccountCode);
      setIsSmartMatched(true);
      setClassificationPreview(match);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setMembershipCollections([{ id: `membership-collection-${Date.now()}`, date: '', amount: '' }]);
      setNotYetUsedAmount('');
      setExpectedUsePeriod('within');
      setCounterpartyName('');
      setMerchandiseCost('');
      setMerchandiseItem('');
      setMerchandiseOtherTitle('');
      setMerchandiseQuantity('');
      setMerchandisePaymentMethod('organization-funds');
      setMerchandiseOrganizationPayments([{ id: `org-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseOfficerPayments([{ id: `officer-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseAdvancePayments([{ id: `advance-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseReimbursements([{ id: `reimbursement-${Date.now()}`, date, amount: '' }]);
      setMerchandiseSaleBatchId('');
      setMerchandiseQuantitySold('');
      setMerchandiseSellingPrice('');
      setMerchandiseCollectionMethod('not-yet-collected');
      setMerchandiseCollections([{ id: `collection-${Date.now()}`, date, amount: '' }]);
      setMerchandiseRemittances([{ id: `remittance-${Date.now()}`, date, amount: '' }]);
      setMerchandiseCollectionOfficer('');

      // Keep the funding-source dropdown in sync with whichever cash
      // account the matched rule assumed, so the two controls never
      // silently disagree about who's paying.
      const matchingSource = FUNDING_SOURCE_OPTIONS.find(o => o.creditAccountCode === match.creditAccountCode);
      if (matchingSource) {
        setFundingSourceId(matchingSource.id);
      }

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
      setNotYetUsedAmount('');
      setExpectedUsePeriod('within');
      setCounterpartyName('');
      setMerchandiseCost('');
      setMerchandiseItem('');
      setMerchandiseOtherTitle('');
      setMerchandiseQuantity('');
      setMerchandisePaymentMethod('organization-funds');
      setMerchandiseOrganizationPayments([{ id: `org-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseOfficerPayments([{ id: `officer-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseAdvancePayments([{ id: `advance-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseReimbursements([{ id: `reimbursement-${Date.now()}`, date, amount: '' }]);
      setMerchandiseSaleBatchId('');
      setMerchandiseQuantitySold('');
      setMerchandiseSellingPrice('');
      setMerchandiseCollectionMethod('not-yet-collected');
      setMerchandiseCollections([{ id: `collection-${Date.now()}`, date, amount: '' }]);
      setMerchandiseRemittances([{ id: `remittance-${Date.now()}`, date, amount: '' }]);
      setMerchandiseCollectionOfficer('');
    }
  }, [txName]);

  // When the funding source is changed by hand, apply it to the credit
  // account immediately — same "user override" behavior as changing the
  // Credit Account select manually.
  const handleFundingSourceChange = (id: string) => {
    setFundingSourceId(id);
    const option = FUNDING_SOURCE_OPTIONS.find(o => o.id === id);
    if (option) {
      setCreditCode(option.creditAccountCode);
      setIsSmartMatched(false);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
    }
  };

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
  const showCashAdvanceWarning = fundingSourceId === 'officer-cash-advance' && amount > advancesOutstanding;

  // Same sequencing idea, for the other direction (client note sheet row
  // 17): collecting previous-period membership fees against the
  // receivable requires that receivable to actually exist first — the
  // fee must have been billed (via the current-school-year accrual
  // question) before there's anything to collect.
  const membershipReceivableOutstanding = accountBalances[MEMBERSHIP_DUES_RECEIVABLE_CODE] || 0;
  const membershipCollectionTotal = sumDatedAmounts(membershipCollections);
  const showMembershipReceivableWarning = isPriorMembershipCollection && membershipCollectionTotal > membershipReceivableOutstanding;
  const isMerchandiseSale = effectiveCreditCode === '4070';
  const merchandiseInventoryBalance = accountBalances[MERCHANDISE_INVENTORY_CODE] || 0;
  const merchandiseBatches = useMemo(() => buildMerchandiseBatchBalances(journalEntries), [journalEntries]);
  const selectedMerchandiseBatch = merchandiseBatches.find(batch => batch.entryId === merchandiseSaleBatchId);
  const merchandiseSaleTotal = Math.round((Number(merchandiseQuantitySold) || 0) * (Number(merchandiseSellingPrice) || 0) * 100) / 100;
  const merchandiseCollectionTotal = sumDatedAmounts(merchandiseCollections);
  const merchandiseRemittanceTotal = sumDatedAmounts(merchandiseRemittances);
  const merchandiseItemLabel = merchandiseItem === 'Others' ? merchandiseOtherTitle.trim() : merchandiseItem;
  const merchandiseOrganizationPaymentTotal = sumDatedAmounts(merchandiseOrganizationPayments);
  const merchandiseOfficerPaymentTotal = sumDatedAmounts(merchandiseOfficerPayments);
  const merchandiseAdvancePaymentTotal = sumDatedAmounts(merchandiseAdvancePayments);
  const merchandiseReimbursementTotal = sumDatedAmounts(merchandiseReimbursements);

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
        return { posting: buildPriorMembershipCollectionPosting({ availableReceivable: membershipReceivableOutstanding, dateOne: date, collections }), error: '' };
      }
      return { posting: null, error: '' };
    } catch (error) {
      return { posting: null, error: error instanceof Error ? error.message : 'The membership-fee amounts are invalid.' };
    }
  }, [requiresAccrualCompletion, isPriorMembershipCollection, amount, date, membershipCollections, membershipCollectionTotal, membershipReceivableOutstanding]);

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
          reimbursement: merchandiseReimbursementTotal,
          reimbursements: merchandiseReimbursements.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })),
          availableAdvance: advancesOutstanding,
          cashAccountCode: '1010',
        }),
        error: '',
      };
    } catch (error) {
      return { posting: null, error: error instanceof Error ? error.message : 'The acquisition amounts are invalid.' };
    }
  }, [isMerchandiseAcquisition, amount, merchandisePaymentMethod, date, merchandiseOrganizationPaymentTotal, merchandiseOrganizationPayments, merchandiseOfficerPaymentTotal, merchandiseOfficerPayments, merchandiseAdvancePaymentTotal, merchandiseAdvancePayments, merchandiseReimbursementTotal, merchandiseReimbursements, advancesOutstanding]);

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
    if (!classificationPreview || amount <= 0 || !debitCode || !effectiveCreditCode) return [];
    if (isMerchandiseAcquisition) return merchandiseAcquisitionResult.posting?.lines || [];
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
  }, [classificationPreview, amount, debitCode, effectiveCreditCode, isMerchandiseAcquisition, merchandiseAcquisitionResult, requiresAccrualCompletion, isPriorMembershipCollection, membershipPostingResult, isMerchandiseSale, merchandiseSaleResult, showDeferPortionQuestion, notYetUsedAmount]);

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

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setLastPostedEntry(null);

    if (!classificationPreview) {
      setErrorMessage('Please select a transaction type from the list so its accounts can be determined automatically.');
      return;
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
    if (amount <= 0) {
      setErrorMessage('Please enter a valid amount greater than zero.');
      return;
    }
    if (isMerchandiseAcquisition && !merchandiseItemLabel) {
      setErrorMessage('Please select the merchandise purchased and enter a title when choosing Others.');
      return;
    }
    if (isMerchandiseAcquisition && (!Number.isInteger(Number(merchandiseQuantity)) || Number(merchandiseQuantity) <= 0)) {
      setErrorMessage('Please enter a whole-number quantity greater than zero for this merchandise batch.');
      return;
    }
    if (isMerchandiseAcquisition && merchandiseAcquisitionResult.error) {
      setErrorMessage(merchandiseAcquisitionResult.error);
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
    if (showSamePeriodQuestion && samePeriodAnswer === '') {
      setErrorMessage('Please answer: will the event happen in the same reporting period the donation is received?');
      return;
    }
    if ((requiresAccrualCompletion || isPriorMembershipCollection) && membershipPostingResult.error) {
      setErrorMessage(membershipPostingResult.error);
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
    if (showCashAdvanceWarning) {
      setErrorMessage('Caution: please record the cash advance transaction first before recording expenses paid using a cash advance — the amount given exceeds what’s currently outstanding.');
      return;
    }
    if (showMembershipReceivableWarning) {
      setErrorMessage('Caution: this exceeds the Membership Dues Receivable currently on the books — make sure the fee was billed this school year (via the accrual question) before collecting it.');
      return;
    }
    if (isMerchandiseSale) {
      const merchandiseError = merchandiseSaleCostError(Number(merchandiseCost), merchandiseInventoryBalance);
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
      // Post Journal Entry
      const deferredAmount = showDeferPortionQuestion ? (Number(notYetUsedAmount) || 0) : 0;
      const lines = previewLines;
      if (lines.length === 0) throw new Error('Complete the required acquisition amounts before posting.');

      const usePeriodNote = deferredAmount > 0
        ? ` (${formatCurrency(deferredAmount)} not yet used — expected ${expectedUsePeriod === 'within' ? 'within this period' : 'next period'})`
        : '';

      const entryDescription = isMerchandiseAcquisition
        ? (customName.trim() || `${description || txName} - ${merchandiseItemLabel}`)
        : isMerchandiseSale
          ? (customName.trim() || `Sale of Merchandise - ${selectedMerchandiseBatch?.item || 'Merchandise'}`)
        : (customName.trim() || description || txName) + usePeriodNote;

      const je = addJournalEntry(
        date,
        entryDescription,
        isProgramSpecific ? selectedProject : GENERAL_FUND_PROJECT,
        lines,
        isProgramSpecific ? selectedProject : undefined,
        undefined,
        {
          transactionType: txName,
          ...(customName.trim() ? { customName: customName.trim() } : {}),
          details: {
            memo: description.trim() || undefined,
            purpose: classificationPreview.purposeOptions?.[purposeIndex]?.label,
            fundingSourceId: showFundingSource ? fundingSourceId : undefined,
            sponsorshipKind: classificationPreview.sponsorshipKind,
            counterpartyName: isMerchandiseSale && merchandiseCollectionMethod === 'officer-to-remit'
              ? merchandiseCollectionOfficer.trim()
              : counterpartyName.trim() || undefined,
            eventRelated: isProgramSpecific,
            donorRestriction: showRestrictionQuestion
              ? restrictionAnswer === 'no'
                ? 'none'
                : samePeriodAnswer === 'yes'
                  ? 'satisfied-in-period'
                  : 'temporary'
              : undefined,
            restrictionEventPeriod: restrictionAnswer === 'yes'
              ? samePeriodAnswer === 'yes' ? 'same-period' : 'future'
              : undefined,
            membershipUnpaidAmount: requiresAccrualCompletion ? membershipPostingResult.posting?.amountStillReceivable : undefined,
            membershipTotalFees: requiresAccrualCompletion ? amount : undefined,
            membershipPeriodStartDate: (requiresAccrualCompletion || isPriorMembershipCollection) ? date : undefined,
            membershipCollections: (requiresAccrualCompletion || isPriorMembershipCollection) ? membershipPostingResult.posting?.collections : undefined,
            deferredAmount: showDeferPortionQuestion ? deferredAmount : undefined,
            expectedUsePeriod: deferredAmount > 0 ? expectedUsePeriod : undefined,
            inventoryCost: isMerchandiseSale ? Number(merchandiseCost) : undefined,
            merchandiseQuantity: isMerchandiseAcquisition ? Number(merchandiseQuantity) : undefined,
            merchandisePaymentMethod: isMerchandiseAcquisition ? merchandisePaymentMethod : undefined,
            merchandiseOrganizationPayment: isMerchandiseAcquisition ? merchandiseOrganizationPaymentTotal : undefined,
            merchandiseOrganizationPayments: isMerchandiseAcquisition ? merchandiseOrganizationPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseOfficerPayment: isMerchandiseAcquisition ? merchandiseOfficerPaymentTotal : undefined,
            merchandiseOfficerPayments: isMerchandiseAcquisition ? merchandiseOfficerPayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseAdvancePayment: isMerchandiseAcquisition ? merchandiseAdvancePaymentTotal : undefined,
            merchandiseAdvancePayments: isMerchandiseAcquisition ? merchandiseAdvancePayments.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseReimbursement: isMerchandiseAcquisition ? merchandiseReimbursementTotal : undefined,
            merchandiseReimbursements: isMerchandiseAcquisition ? merchandiseReimbursements.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandisePayableAmount: isMerchandiseAcquisition ? merchandiseAcquisitionResult.posting?.merchandisePayable : undefined,
            merchandiseItem: isMerchandiseSale ? selectedMerchandiseBatch?.item : isMerchandiseAcquisition ? merchandiseItemLabel : undefined,
            merchandiseBatchEntryId: isMerchandiseSale ? merchandiseSaleBatchId : undefined,
            merchandiseQuantitySold: isMerchandiseSale ? Number(merchandiseQuantitySold) : undefined,
            merchandiseSellingPrice: isMerchandiseSale ? Number(merchandiseSellingPrice) : undefined,
            merchandiseTotalSales: isMerchandiseSale ? merchandiseSaleTotal : undefined,
            merchandiseCollectionMethod: isMerchandiseSale ? merchandiseCollectionMethod : undefined,
            merchandiseCollections: isMerchandiseSale ? merchandiseCollections.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseRemittances: isMerchandiseSale ? merchandiseRemittances.filter(row => Number(row.amount) > 0).map(row => ({ date: row.date, amount: Number(row.amount) })) : undefined,
            merchandiseAccountsReceivable: isMerchandiseSale ? merchandiseSaleResult.posting?.accountsReceivable : undefined,
            merchandiseDueFromOfficer: isMerchandiseSale ? merchandiseSaleResult.posting?.dueFromOfficer : undefined,
            receiptAttachmentIds: [],
          },
        }
      );
      attachReceiptsToEntry(je.id, pendingReceipts);

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
      setCustomName('');
      setDescription('');
      setAmount(0);
      setIsSmartMatched(false);
      setPurposeIndex(0);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setMembershipCollections([{ id: `membership-collection-${Date.now()}`, date: '', amount: '' }]);
      setNotYetUsedAmount('');
      setExpectedUsePeriod('within');
      setCounterpartyName('');
      setMerchandiseCost('');
      setMerchandiseItem('');
      setMerchandiseOtherTitle('');
      setMerchandiseQuantity('');
      setMerchandisePaymentMethod('organization-funds');
      setMerchandiseOrganizationPayments([{ id: `org-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseOfficerPayments([{ id: `officer-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseAdvancePayments([{ id: `advance-payment-${Date.now()}`, date, amount: '' }]);
      setMerchandiseReimbursements([{ id: `reimbursement-${Date.now()}`, date, amount: '' }]);
      setMerchandiseSaleBatchId('');
      setMerchandiseQuantitySold('');
      setMerchandiseSellingPrice('');
      setMerchandiseCollectionMethod('not-yet-collected');
      setMerchandiseCollections([{ id: `collection-${Date.now()}`, date, amount: '' }]);
      setMerchandiseRemittances([{ id: `remittance-${Date.now()}`, date, amount: '' }]);
      setMerchandiseCollectionOfficer('');
      setIsProgramSpecific(false);
      setSelectedProject(GENERAL_FUND_PROJECT);
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
                  : category.id === 'purchases'
                    ? ShoppingCart
                    : LayoutGrid;
            const selected = selectedCategory === category.id;
            const isNewCategory = ['activity-fees', 'merchandise', 'membership-fees'].includes(category.id);
            const optionCount = category.id === 'activity-fees'
              ? null
              : new Set(classificationRules.filter(rule => categorizeTransactionRule(rule) === category.id).map(rule => rule.description)).size;
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

      {selectedCategory === 'activity-fees' && <ActivityFeeEntry defaultOpen />}

      {selectedCategory === 'merchandise' && <InventorySummaryCard compact />}

      {selectedCategory && selectedCategory !== 'activity-fees' && (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Entry Form */}
        <form onSubmit={handlePost} className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-8 space-y-5">
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

          {errorMessage && (
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
              <input
                type="text"
                value={txName}
                onChange={(e) => { setTxName(e.target.value); setShowTxDropdown(true); }}
                onFocus={() => setShowTxDropdown(true)}
                onBlur={() => setTimeout(() => setShowTxDropdown(false), 150)}
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

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Custom Transaction Name <span className="normal-case text-slate-400">(optional)</span></label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={classificationPreview ? `Example: September ${classificationPreview.defaultDesc}` : 'Select a transaction type first'}
                disabled={!classificationPreview}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-3 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500 dark:focus:border-blue-500"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">This label identifies the transaction; it does not change its accounting rule.</p>
            </div>

            <div className="sm:col-span-2">
              <label className={`flex items-center gap-2 select-none ${realPrograms.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={isProgramSpecific}
                  disabled={realPrograms.length === 0}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsProgramSpecific(checked);
                    setSelectedProject(checked ? realPrograms[0].name : GENERAL_FUND_PROJECT);
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-500 dark:border-slate-600"
                />
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">This is for a specific Program / Event</span>
              </label>
              {realPrograms.length === 0 && (
                <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Create a program on Activities &amp; Programs first.</p>
              )}

              {isProgramSpecific && (
                <div className="mt-2">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Program / Project Allocation</label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                  >
                    {realPrograms.map((proj) => (
                      <option key={proj.id} value={proj.name}>{proj.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Which budget this counts against — shows as Event-Related on the Statement of Activities.</p>
                </div>
              )}
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

            {isMerchandiseAcquisition && (
              <div className="sm:col-span-2 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">Merchandise batch information <NewFeatureBadge /></h4>
                  <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Record each purchase batch separately so its item, quantity, cost, and settlement remain traceable.</p>
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
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Quantity purchased</label>
                    <input type="number" min="1" step="1" value={merchandiseQuantity} onChange={event => setMerchandiseQuantity(event.target.value)} placeholder="Number of units" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  </div>
                </div>

                {merchandiseItem === 'Others' && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Other merchandise title</label>
                    <input type="text" value={merchandiseOtherTitle} onChange={event => setMerchandiseOtherTitle(event.target.value)} placeholder="Enter the merchandise name" className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Total cost of this batch</label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500">{settings.currencySymbol}</span>
                    <input type="number" min="0.01" step="0.01" value={amount || ''} onChange={event => setAmount(Number(event.target.value))} placeholder="Full cost whether paid or unpaid" className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 pl-8 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">How will the merchandise be paid?</label>
                  <select value={merchandisePaymentMethod} onChange={event => setMerchandisePaymentMethod(event.target.value as MerchandisePaymentMethod)} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100">
                    <option value="organization-funds">Paid directly from organization funds</option>
                    <option value="officer-personal">Paid by an officer using personal money</option>
                    <option value="organization-advance">Paid using an organization advance</option>
                    <option value="advance-and-personal">Combination of advance and officer personal money</option>
                    <option value="not-yet-paid">Not yet paid</option>
                  </select>
                </div>

                {merchandisePaymentMethod === 'organization-funds' && (
                  <DatedAmountRows label="How much was paid by the organization to the supplier?" rows={merchandiseOrganizationPayments} onChange={setMerchandiseOrganizationPayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={amount} addLabel="Add payment" />
                )}

                {(merchandisePaymentMethod === 'organization-advance' || merchandisePaymentMethod === 'advance-and-personal') && (
                  <div>
                    <DatedAmountRows label="How much was paid using the organization advance?" rows={merchandiseAdvancePayments} onChange={setMerchandiseAdvancePayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={Math.min(amount || advancesOutstanding, advancesOutstanding)} addLabel="Add advance payment" />
                    <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Available recorded advance: {formatCurrency(advancesOutstanding)}.</p>
                  </div>
                )}

                {(merchandisePaymentMethod === 'officer-personal' || merchandisePaymentMethod === 'advance-and-personal') && (
                  <div className="space-y-4">
                    <DatedAmountRows label="How much was paid personally by the officer?" rows={merchandiseOfficerPayments} onChange={setMerchandiseOfficerPayments} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={Math.max(0, amount - (merchandisePaymentMethod === 'advance-and-personal' ? merchandiseAdvancePaymentTotal : 0))} addLabel="Add officer payment" />
                    <DatedAmountRows label="How much was reimbursed to the officer?" rows={merchandiseReimbursements} onChange={setMerchandiseReimbursements} currencySymbol={settings.currencySymbol} defaultDate={date} maxTotal={merchandiseOfficerPaymentTotal} addLabel="Add reimbursement" />
                  </div>
                )}

                {merchandisePaymentMethod === 'not-yet-paid' && <p className="rounded-lg bg-white/80 p-3 text-[10px] font-semibold text-indigo-800 dark:bg-slate-900/60 dark:text-indigo-200">The full batch cost will remain in Merchandise Payable and appear in Review until settled.</p>}
                {merchandiseAcquisitionResult.error && amount > 0 && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{merchandiseAcquisitionResult.error}</p>}
              </div>
            )}

            {showFundingSource && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Whose Money Paid For This?</label>
                <select
                  value={fundingSourceId}
                  onChange={(e) => handleFundingSourceChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                >
                  {FUNDING_SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Determines which account this transaction is credited against.</p>
              </div>
            )}

            {needsCounterpartyName && (
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
              </div>
            )}

            {showRestrictionQuestion && (
              <div className="sm:col-span-2 space-y-3 p-3.5 bg-amber-50 border border-amber-100 rounded-xl dark:bg-amber-500/10 dark:border-amber-500/20">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">Did the donor impose a strict restriction that this sponsorship be used only for a specific event? <span className="text-amber-600">*required</span></label>
                  <select
                    value={restrictionAnswer}
                    onChange={(e) => { setRestrictionAnswer(e.target.value as '' | 'no' | 'yes'); setSamePeriodAnswer(''); }}
                    className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-semibold p-2.5 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                    required
                  >
                    <option value="" disabled>Select an answer…</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
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
                  {isRestricted
                    ? 'Recorded against Contributions Revenue - Temporarily Restricted. Once the event happens, complete it in REVIEW to reclassify it as Unrestricted.'
                    : 'Recorded against Contributions Revenue - Unrestricted.'}
                </p>
              </div>
            )}

            {requiresAccrualCompletion && (
              <div className="sm:col-span-2 space-y-4 p-3.5 bg-amber-50 border border-amber-100 rounded-xl dark:bg-amber-500/10 dark:border-amber-500/20">
                <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">Membership Fees collection schedule <NewFeatureBadge /></h4>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">When did the membership period start? (Date 1) <span className="text-amber-600">*required</span></label>
                  <input type="date" value={date} onChange={event => setDate(event.target.value)} className="w-full rounded-lg border border-amber-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-amber-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">Total membership fees collectible from all members <span className="text-amber-600">*required</span></label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">{settings.currencySymbol}</span>
                    <input type="number" step="0.01" min="0.01" value={amount || ''} onChange={event => setAmount(Number(event.target.value))} placeholder="0.00" className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-bold p-2.5 pl-8 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100" required />
                  </div>
                </div>
                <DatedAmountRows
                  label="How much of the membership fees has been collected?"
                  rows={membershipCollections}
                  onChange={setMembershipCollections}
                  currencySymbol={settings.currencySymbol}
                  defaultDate={date}
                  maxTotal={amount || undefined}
                  addLabel="Add collection"
                  allowBlankDates
                  allowEmptyAmounts
                  blankDateHelp={`Leave Date 2, Date 3, or another collection date blank to use Date 1 (${date || 'transaction date'}).`}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60"><span className="text-[9px] font-bold text-slate-500">TOTAL FEES</span><p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{formatCurrency(amount)}</p></div>
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60"><span className="text-[9px] font-bold text-slate-500">COLLECTED</span><p className="mt-1 text-xs font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(membershipCollectionTotal)}</p></div>
                  <div className="rounded-lg bg-white/80 p-3 dark:bg-slate-900/60"><span className="text-[9px] font-bold text-slate-500">STILL RECEIVABLE</span><p className="mt-1 text-xs font-black text-rose-700 dark:text-rose-300">{formatCurrency(Math.max(0, amount - membershipCollectionTotal))}</p></div>
                </div>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">The full fee is recognized on Date 1. Same-day collections go directly to Cash; later collections automatically reduce Membership Dues Receivable on their own ledger dates.</p>
                {membershipPostingResult.error && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{membershipPostingResult.error}</p>}
              </div>
            )}

            {isPriorMembershipCollection && (
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black text-violet-700 dark:text-violet-300">Collection of unpaid membership fees <NewFeatureBadge /></h4>
                  <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Use this for membership fees billed in an earlier period that remain in Membership Dues Receivable.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-200">Date 1 / default collection date</label>
                  <input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required />
                </div>
                <DatedAmountRows
                  label="How much was collected?"
                  rows={membershipCollections}
                  onChange={setMembershipCollections}
                  currencySymbol={settings.currencySymbol}
                  defaultDate={date}
                  maxTotal={membershipReceivableOutstanding}
                  addLabel="Add collection"
                  allowBlankDates
                  blankDateHelp={`A blank collection date uses Date 1 (${date || 'transaction date'}).`}
                />
                <div className="rounded-lg bg-white/80 p-3 text-[10px] dark:bg-slate-900/60"><span className="font-bold text-slate-500">Receivable remaining after these collections</span><p className="mt-1 font-black text-indigo-800 dark:text-indigo-200">{formatCurrency(Math.max(0, membershipReceivableOutstanding - membershipCollectionTotal))}</p></div>
                {membershipPostingResult.error && <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{membershipPostingResult.error}</p>}
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
                Caution: this exceeds the {formatCurrency(membershipReceivableOutstanding)} currently on the books as Membership Dues Receivable. Make sure the fee was billed this school year first.
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
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-indigo-900 dark:text-indigo-200">Merchandise / purchase batch</label>
                    <select value={merchandiseSaleBatchId} onChange={event => { setMerchandiseSaleBatchId(event.target.value); setMerchandiseQuantitySold(''); }} className="mt-1.5 w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required>
                      <option value="" disabled>Select an available batch…</option>
                      {merchandiseBatches.map(batch => <option key={batch.entryId} value={batch.entryId}>{batch.item} — {batch.reference} — {batch.remainingQuantity} units available</option>)}
                    </select>
                    {selectedMerchandiseBatch && <p className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Purchased {selectedMerchandiseBatch.purchasedQuantity} units for {formatCurrency(selectedMerchandiseBatch.acquisitionCost)} · reference unit cost {formatCurrency(selectedMerchandiseBatch.referenceUnitCost)}.</p>}
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
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-900 dark:text-indigo-200">Cost of all items sold <span title="Cost of sales is the total cost of the items sold. It may include the purchase price and other costs directly related to preparing or producing them, such as materials, design fees, or labor." className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-indigo-300 text-[9px] font-black">?</span></label>
                  <div className="relative mt-1.5"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500">{settings.currencySymbol}</span><input type="number" step="0.01" min="0.01" max={merchandiseInventoryBalance || undefined} value={merchandiseCost} onChange={event => setMerchandiseCost(event.target.value)} placeholder="Unit cost × units sold, including eligible direct costs" className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 pl-8 text-xs font-bold text-slate-900 outline-none dark:border-indigo-500/30 dark:bg-slate-800 dark:text-slate-100" required /></div>
                  <p className="mt-1.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">Available inventory value: {formatCurrency(merchandiseInventoryBalance)}. This automatically debits Cost of Sales and credits Merchandise Inventory.</p>
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

            {!isMerchandiseAcquisition && !isMerchandiseSale && !requiresAccrualCompletion && !isPriorMembershipCollection && <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Amount</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 dark:text-slate-400">{settings.currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-bold p-2.5 pl-8 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                  required
                />
              </div>
              {/* Remove accidental duplicate light-only amount control (was causing permanent light/dark mismatch) */}
              <div className="hidden" />
            </div>}

            {!requiresAccrualCompletion && !isPriorMembershipCollection && <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                required
              />
            </div>}

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

          <button
            type="submit"
            disabled={isProcessingReceipts}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-xs p-3.5 rounded-xl transition-all shadow-md shadow-blue-900/10 cursor-pointer text-center mt-2 flex items-center justify-center gap-2"
          >
            <ArrowRightLeft className="w-4 h-4" /> Post Double-Entry Transaction
          </button>
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
