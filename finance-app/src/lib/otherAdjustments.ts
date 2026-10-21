import { Account, JournalEntry, PpeClassification, SemesterAdjustments } from '../types';
import { CASH_ACCOUNT_CODES } from './cashAccounts';
import { buildPpeReferences, PPE_ITEMS, PpeReference, ppeItemForDepreciation, RETIREMENT_TYPE } from './ppeItems';
import { PREPAID_ASSET_ACCOUNT_CODES } from './prepaidAssets';
import { isDateWithinReportingPeriod, Semester } from './reportingPeriod';
import { computePendingObligations, PREPAID_EXPENSE_CODE } from './reviewEngine';

// Client (Oct 21 2026): Other Adjustments is the end-of-semester reminder tab. Everything here is derived from the
// transactions and the answers saved for the semester, so the red tab, the section badges and the Financial
// Statements gate always agree.
export const OTHER_ADJUSTMENTS_NOTE = 'NOTE: Answer these questions only when the semester is about to end.';
export const ADJUSTMENTS_GATE_MESSAGE = 'Some required end-of-semester adjustments have not been completed. Please update your adjustments before generating your financial statements.';
export const ADJUSTMENTS_PROCEED_PROMPT = "You still haven't updated all your required adjustments. Are you sure you want to proceed?";
export const UNADJUSTED_WARNING = 'NOTE: THESE FINANCIAL STATEMENTS ARE UNADJUSTED. Some required end-of-semester adjustments have not been completed. The reported balances may not reflect the final adjusted balances.';
export const PPE_QUESTIONS = [
  'How many of these units will you continue to use next semester and/or in the future?',
  'How many of these units will not be used this semester but will be used again next school year?',
  'How many of these units will no longer be used this semester or in the future?',
] as const;

const EPSILON = 0.005;
const money = (value: number) => Math.round(value * 100) / 100;

export const adjustmentSemesterKey = (reportingYear: number | undefined, semester: string | undefined): string => `${reportingYear}::${semester}`;

// ---- PPE: classify every group still held ----

export interface PpeClassificationCheck {
  total: number;
  quantities: PpeClassification;
  error: string;
}

/**
 * The three answers must be whole numbers, never negative, none above the group's available quantity, and add up to exactly
 * that quantity. `alreadyRetired` is how many units of the group were retired this semester: they count towards the third answer.
 */
export function checkPpeClassification(available: number, input: { continueQuantity: string; nextYearQuantity: string; retireQuantity: string }, alreadyRetired = 0): PpeClassificationCheck {
  const read = (value: string) => (value.trim() === '' ? 0 : Number(value));
  const quantities: PpeClassification = { continueQuantity: read(input.continueQuantity), nextYearQuantity: read(input.nextYearQuantity), retireQuantity: read(input.retireQuantity) };
  const values = [quantities.continueQuantity, quantities.nextYearQuantity, quantities.retireQuantity];
  const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const base = { total, quantities };
  if (values.some(value => !Number.isFinite(value))) return { ...base, error: 'Enter a number in every answer.' };
  if (values.some(value => value < 0)) return { ...base, error: 'Quantities cannot be negative.' };
  if (values.some(value => !Number.isInteger(value))) return { ...base, error: 'Quantities must be whole numbers.' };
  if (values.some(value => value > available)) return { ...base, error: `A quantity cannot be greater than the available quantity of ${available}.` };
  if (quantities.retireQuantity < alreadyRetired) return { ...base, error: `${alreadyRetired} unit${alreadyRetired === 1 ? ' was' : 's were'} already retired this semester, so the third answer cannot be lower than that.` };
  if (total > available) return { ...base, error: `The total (${total}) cannot exceed the available quantity of ${available}.` };
  if (total < available) return { ...base, error: `The total (${total}) cannot be less than the available quantity of ${available}.` };
  return { ...base, error: '' };
}

export interface PpeGroupStatus {
  reference: PpeReference;
  /** 1-based number of the group within its item (cheapest-to-dearest as listed). */
  groupNumber: number;
  /** The saved answers, only while they still account for every unit of the group. */
  classification?: PpeClassification;
  /** Units of the group already retired this semester (retirements saved as drafts count). */
  retiredThisSemester: number;
  /** Units still to be retired to match the third answer. */
  retirementPending: number;
  /** Depreciation still to be recorded for the units kept (Net Book Value above zero and nothing saved this semester). */
  depreciationPending: boolean;
  needsClassification: boolean;
  outstanding: boolean;
}

const isActive = (entry: JournalEntry) => !entry.reversalOfEntryId && !entry.reversedByEntryId;
const entryType = (entry: JournalEntry) => entry.transactionType ?? entry.description;

/** Units of one PPE group retired this semester (drafts count, reversed entries do not). */
export function retiredQuantityInSemester(entries: JournalEntry[], referenceId: string, semester: Semester, reportingYear: number): number {
  return entries
    .filter(entry => isActive(entry) && isDateWithinReportingPeriod(entry.date, semester, reportingYear)
      && entryType(entry) === RETIREMENT_TYPE && entry.transactionDetails?.ppeReferenceId === referenceId)
    .reduce((sum, entry) => sum + (entry.transactionDetails?.ppeRetiredQuantity || 0), 0);
}

export function ppeGroupStatuses(
  entries: JournalEntry[], openingBalances: Record<string, number>, semester: Semester, reportingYear: number, record?: SemesterAdjustments,
): PpeGroupStatus[] {
  const references = buildPpeReferences(entries, openingBalances);
  const inSemester = (entry: JournalEntry) => isActive(entry) && isDateWithinReportingPeriod(entry.date, semester, reportingYear);
  const statuses: PpeGroupStatus[] = [];
  PPE_ITEMS.forEach(item => {
    references.filter(reference => reference.item.code === item.code)
      .sort((left, right) => left.unitCost - right.unitCost)
      .forEach((reference, index) => {
        const retiredThisSemester = retiredQuantityInSemester(entries, reference.referenceId, semester, reportingYear);
        const saved = record?.ppe?.[reference.referenceId];
        const valid = !!saved && saved.continueQuantity + saved.nextYearQuantity + saved.retireQuantity === reference.quantity + retiredThisSemester;
        const classification = valid ? saved : undefined;
        const retirementPending = classification ? Math.max(0, classification.retireQuantity - retiredThisSemester) : 0;
        const depreciated = entries.some(entry => inSemester(entry)
          && ppeItemForDepreciation(entryType(entry))?.code === item.code && entry.transactionDetails?.ppeReferenceId === reference.referenceId);
        const keptUnits = classification ? classification.continueQuantity + classification.nextYearQuantity : 0;
        const depreciationPending = !!classification && keptUnits > 0 && reference.netBookValue > EPSILON && !depreciated;
        const needsClassification = !classification;
        statuses.push({
          reference, groupNumber: index + 1, classification, retiredThisSemester, retirementPending, depreciationPending, needsClassification,
          outstanding: needsClassification || retirementPending > 0 || depreciationPending,
        });
      });
  });
  return statuses;
}

// ---- Prepaid assets: how much was consumed this semester ----

export interface PrepaidAdjustmentItem {
  key: string;
  /** The purchase entry the consumption settles; absent for a balance carried in from an earlier semester. */
  entryId?: string;
  accountCode: string;
  label: string;
  remaining: number;
  /** Already answered for this semester. */
  updated: boolean;
}

export function prepaidAdjustmentItems(
  entries: JournalEntry[], accounts: Account[], accountBalances: Record<string, number>, semesterKey: string, record?: SemesterAdjustments,
): PrepaidAdjustmentItem[] {
  // Saved drafts count too (client, Oct 22 2026): a prepaid purchase or consumption saved as a draft already sits in the ledger,
  // so its consumption question shows up before it is posted.
  const posted = entries;
  const prepaidCodes = [PREPAID_EXPENSE_CODE, ...PREPAID_ASSET_ACCOUNT_CODES];
  const obligations = computePendingObligations(posted, accounts).filter(obligation => prepaidCodes.includes(obligation.accountCode));
  const items: PrepaidAdjustmentItem[] = obligations.map(obligation => {
    const entry = posted.find(candidate => candidate.id === obligation.entryId);
    return {
      key: obligation.entryId, entryId: obligation.entryId, accountCode: obligation.accountCode,
      label: entry?.transactionDetails?.prepaidAssetItem || obligation.description,
      remaining: money(obligation.remainingAmount),
      updated: entry?.transactionDetails?.prepaidSemesterFinalized === semesterKey,
    };
  });
  // What an asset account still holds beyond this semester's own purchases came in as a beginning balance.
  prepaidCodes.forEach(code => {
    const purchases = obligations.filter(obligation => obligation.accountCode === code).reduce((sum, obligation) => sum + obligation.remainingAmount, 0);
    const carried = money((accountBalances[code] || 0) - purchases);
    if (carried > EPSILON) {
      items.push({
        key: `carried-${code}`, accountCode: code, label: `${accounts.find(account => account.code === code)?.name || code} (beginning balance)`,
        remaining: carried, updated: !!record?.prepaidCarried?.[code],
      });
    }
  });
  return items;
}

// ---- Cash: where the cash is held ----

export interface CashAdjustment {
  balance: number;
  declared?: number;
  /** Nothing to answer when the organization holds no cash. */
  required: boolean;
  outstanding: boolean;
  /** Cash held outside bank accounts and e-wallets: Total Cash Balance - Bank/E-wallet Balance. */
  remainingCash: number;
}

export function checkBankAndEwallet(balance: number, input: string, formatCurrency: (value: number) => string): string {
  if (input.trim() === '') return 'Enter the amount held in bank accounts and/or e-wallets (0 if none).';
  const value = Number(input);
  if (!Number.isFinite(value)) return 'Enter a valid amount.';
  if (value < 0) return 'The amount cannot be negative.';
  if (value > balance + EPSILON) return `The amount cannot be greater than the Cash balance of ${formatCurrency(balance)}.`;
  return '';
}

export function cashAdjustment(accountBalances: Record<string, number>, record?: SemesterAdjustments): CashAdjustment {
  const balance = money(CASH_ACCOUNT_CODES.reduce((sum, code) => sum + (accountBalances[code] || 0), 0));
  const declared = record?.cashBankAndEwallet;
  const required = balance > EPSILON;
  // A saved amount that the cash balance has since fallen below no longer answers the question.
  const answered = declared !== undefined && declared >= 0 && declared <= balance + EPSILON;
  return { balance, declared, required, outstanding: required && !answered, remainingCash: answered ? money(balance - (declared as number)) : balance };
}

// ---- Everything together ----

export interface OtherAdjustmentsInput {
  /** Every entry of the active semester, drafts included. */
  entries: JournalEntry[];
  accounts: Account[];
  openingBalances: Record<string, number>;
  accountBalances: Record<string, number>;
  semester?: Semester | '';
  reportingYear?: number;
  record?: SemesterAdjustments;
}

export interface OtherAdjustmentsStatus {
  ppe: { groups: PpeGroupStatus[]; outstanding: number; updated: boolean };
  prepaid: { items: PrepaidAdjustmentItem[]; outstanding: number; updated: boolean };
  cash: CashAdjustment & { updated: boolean };
  outstanding: number;
  hasOutstanding: boolean;
}

export function computeOtherAdjustments(input: OtherAdjustmentsInput): OtherAdjustmentsStatus {
  const { entries, accounts, openingBalances, accountBalances, semester, reportingYear, record } = input;
  if (!semester || !reportingYear) {
    const cash = cashAdjustment({}, record);
    return { ppe: { groups: [], outstanding: 0, updated: true }, prepaid: { items: [], outstanding: 0, updated: true }, cash: { ...cash, updated: true }, outstanding: 0, hasOutstanding: false };
  }
  const groups = ppeGroupStatuses(entries, openingBalances, semester, reportingYear, record);
  const items = prepaidAdjustmentItems(entries, accounts, accountBalances, adjustmentSemesterKey(reportingYear, semester), record);
  const cash = cashAdjustment(accountBalances, record);
  const ppeOutstanding = groups.filter(group => group.outstanding).length;
  const prepaidOutstanding = items.filter(item => !item.updated).length;
  const cashOutstanding = cash.outstanding ? 1 : 0;
  const outstanding = ppeOutstanding + prepaidOutstanding + cashOutstanding;
  return {
    ppe: { groups, outstanding: ppeOutstanding, updated: ppeOutstanding === 0 },
    prepaid: { items, outstanding: prepaidOutstanding, updated: prepaidOutstanding === 0 },
    cash: { ...cash, updated: !cash.outstanding },
    outstanding,
    hasOutstanding: outstanding > 0,
  };
}
