// Client (Oct 21 2026): the red "Reminder" about unremitted collections is shown on these forms only.
//  - Membership Fees: every type except the Membership Fee Collection Status one
//  - Activity Fees: both Yes - current semester and No - next semester (placed in ActivityFeeEntry)
//  - Miscellaneous Transactions: every type
//  - Merchandise Transactions: the Purchase type "Collection of Refund from Supplier for Excess Payment" and the Sales types
//    "Collection of Receivables from Officers - Merchandise" and "Collection of Unpaid Sold Merchandise"
export const MEMBERSHIP_COLLECTION_STATUS_TYPE = 'Excess Membership Fee Collection - Status';

const MERCHANDISE_NOTE_TYPES = [
  'Collection of Refund from Supplier for Excess Payment',
  'Collection of Receivables from Officers - Merchandise',
  'Collection of Unpaid Sold Merchandise',
];

export function showsUnremittedCollectionNote(categoryId: string | undefined, typeDescription: string | undefined): boolean {
  if (!categoryId || !typeDescription) return false;
  if (categoryId === 'membership-fees') return typeDescription !== MEMBERSHIP_COLLECTION_STATUS_TYPE;
  if (categoryId === 'other') return true;
  if (categoryId === 'merchandise') return MERCHANDISE_NOTE_TYPES.includes(typeDescription);
  return false;
}
