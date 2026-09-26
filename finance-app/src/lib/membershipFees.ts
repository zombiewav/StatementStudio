import { DatedAmountRecord, JournalLine } from '../types';

export const MEMBERSHIP_CASH_CODE = '1010';
export const MEMBERSHIP_RECEIVABLE_CODE = '1300';
export const MEMBERSHIP_REVENUE_CODE = '4040';

export interface MembershipFeePosting {
  lines: JournalLine[];
  collections: DatedAmountRecord[];
  totalCollected: number;
  amountStillReceivable: number;
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
  if (totalCollected > totalFees) throw new Error('Total collections cannot exceed total membership fees collectible.');

  const sameDayCollections = collections.filter(collection => collection.date === input.dateOne);
  const laterCollections = collections.filter(collection => collection.date !== input.dateOne);
  const sameDayTotal = money(sameDayCollections.reduce((sum, collection) => sum + collection.amount, 0));
  const initiallyReceivable = money(totalFees - sameDayTotal);
  const amountStillReceivable = money(totalFees - totalCollected);
  const lines: JournalLine[] = [];

  for (const collection of sameDayCollections) {
    lines.push({ accountCode: MEMBERSHIP_CASH_CODE, debit: collection.amount, credit: 0, date: collection.date });
  }
  if (initiallyReceivable > 0) {
    lines.push({ accountCode: MEMBERSHIP_RECEIVABLE_CODE, debit: initiallyReceivable, credit: 0, date: input.dateOne });
  }
  lines.push({ accountCode: MEMBERSHIP_REVENUE_CODE, debit: 0, credit: totalFees, date: input.dateOne });

  for (const collection of laterCollections) {
    lines.push(
      { accountCode: MEMBERSHIP_CASH_CODE, debit: collection.amount, credit: 0, date: collection.date },
      { accountCode: MEMBERSHIP_RECEIVABLE_CODE, debit: 0, credit: collection.amount, date: collection.date },
    );
  }

  return { lines, collections, totalCollected, amountStillReceivable };
}

export function buildPriorMembershipCollectionPosting(input: {
  availableReceivable: number;
  dateOne: string;
  collections: DatedAmountRecord[];
}): MembershipFeePosting {
  const availableReceivable = money(input.availableReceivable);
  const collections = normalizeMembershipCollections(input.collections, input.dateOne);
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
  };
}
