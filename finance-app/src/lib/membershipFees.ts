import { DatedAmountRecord, JournalLine } from '../types';

export const MEMBERSHIP_CASH_CODE = '1010';
export const MEMBERSHIP_RECEIVABLE_CODE = '1300';
export const MEMBERSHIP_REVENUE_CODE = '4040';
export const MEMBERSHIP_REFUND_LIABILITY_CODE = '2130';
export const OTHER_INCOME_CODE = '4050';

export interface MembershipFeePosting {
  lines: JournalLine[];
  collections: DatedAmountRecord[];
  totalCollected: number;
  amountStillReceivable: number;
  refundLiability: number;
}

const money = (value: number): number => Math.round(value * 100) / 100;

export function normalizeMembershipCollections(
  collections: DatedAmountRecord[],
  dateOne: string,
): DatedAmountRecord[] {
  if (!dateOne) throw new Error('Enter Date 1 before posting membership fees.');
  return collections
    .filter(collection => collection.amount > 0)
    .map(collection => ({
      date: collection.date || dateOne,
      amount: money(collection.amount),
    }));
}

export function buildCurrentMembershipFeePosting(input: {
  totalFees: number;
  dateOne: string;
  collections: DatedAmountRecord[];
}): MembershipFeePosting {
  const totalFees = money(input.totalFees);
  if (totalFees <= 0) throw new Error('Total membership fees collectible must be greater than zero.');

  const collections = normalizeMembershipCollections(input.collections, input.dateOne);
  const totalCollected = money(collections.reduce((sum, collection) => sum + collection.amount, 0));

  const sameDayCollections = collections.filter(collection => collection.date === input.dateOne);
  const laterCollections = collections.filter(collection => collection.date !== input.dateOne);
  const sameDayTotal = money(sameDayCollections.reduce((sum, collection) => sum + collection.amount, 0));
  const initiallyReceivable = money(Math.max(0, totalFees - sameDayTotal));
  const sameDayExcess = money(Math.max(0, sameDayTotal - totalFees));
  let amountStillReceivable = initiallyReceivable;
  let refundLiability = sameDayExcess;
  const lines: JournalLine[] = [];

  for (const collection of sameDayCollections) {
    lines.push({ accountCode: MEMBERSHIP_CASH_CODE, debit: collection.amount, credit: 0, date: collection.date });
  }
  if (initiallyReceivable > 0) {
    lines.push({ accountCode: MEMBERSHIP_RECEIVABLE_CODE, debit: initiallyReceivable, credit: 0, date: input.dateOne });
  }
  lines.push({ accountCode: MEMBERSHIP_REVENUE_CODE, debit: 0, credit: totalFees, date: input.dateOne });
  if (sameDayExcess > 0) lines.push({ accountCode: MEMBERSHIP_REFUND_LIABILITY_CODE, debit: 0, credit: sameDayExcess, date: input.dateOne });

  for (const collection of laterCollections) {
    const receivablePortion = money(Math.min(amountStillReceivable, collection.amount));
    const excessPortion = money(collection.amount - receivablePortion);
    lines.push(
      { accountCode: MEMBERSHIP_CASH_CODE, debit: collection.amount, credit: 0, date: collection.date },
      ...(receivablePortion > 0 ? [{ accountCode: MEMBERSHIP_RECEIVABLE_CODE, debit: 0, credit: receivablePortion, date: collection.date }] : []),
      ...(excessPortion > 0 ? [{ accountCode: MEMBERSHIP_REFUND_LIABILITY_CODE, debit: 0, credit: excessPortion, date: collection.date }] : []),
    );
    amountStillReceivable = money(amountStillReceivable - receivablePortion);
    refundLiability = money(refundLiability + excessPortion);
  }

  return { lines, collections, totalCollected, amountStillReceivable, refundLiability };
}

export function buildPriorMembershipCollectionPosting(input: {
  availableReceivable: number;
  collections: DatedAmountRecord[];
}): MembershipFeePosting {
  const availableReceivable = money(input.availableReceivable);
  const collections = input.collections
    .filter(collection => collection.amount > 0)
    .map(collection => ({ date: collection.date, amount: money(collection.amount) }));
  if (collections.some(collection => !collection.date)) {
    throw new Error('Enter a date for each membership-fee collection.');
  }
  const totalCollected = money(collections.reduce((sum, collection) => sum + collection.amount, 0));
  if (totalCollected <= 0) throw new Error('Add at least one membership-fee collection greater than zero.');
  if (totalCollected > availableReceivable) throw new Error('Total collections cannot exceed Membership Dues Receivable.');

  const lines = collections.flatMap<JournalLine>(collection => [
    { accountCode: MEMBERSHIP_CASH_CODE, debit: collection.amount, credit: 0, date: collection.date },
    { accountCode: MEMBERSHIP_RECEIVABLE_CODE, debit: 0, credit: collection.amount, date: collection.date },
  ]);

  return {
    lines,
    collections,
    totalCollected,
    amountStillReceivable: money(availableReceivable - totalCollected),
    refundLiability: 0,
  };
}

export type MembershipRefundStatus = 'current' | 'next' | 'nonrefundable';

export function buildMembershipRefundResolution(input: {
  availableLiability: number;
  status: MembershipRefundStatus;
  amount: number;
  date?: string;
}): JournalLine[] {
  if (input.status === 'next') return [];
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (amount > money(input.availableLiability)) throw new Error('Amount cannot exceed Refund Liability - Membership Fees.');
  if (input.status === 'current' && !input.date) throw new Error('Enter the refund date.');
  return [
    { accountCode: MEMBERSHIP_REFUND_LIABILITY_CODE, debit: amount, credit: 0, date: input.date },
    { accountCode: input.status === 'current' ? MEMBERSHIP_CASH_CODE : OTHER_INCOME_CODE, debit: 0, credit: amount, date: input.date },
  ];
}
