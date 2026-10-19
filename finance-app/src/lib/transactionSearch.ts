import { TransactionCategoryId } from './transactionCategories';

// Client (Oct 2026): one search above "Choose a transaction category" that finds any transaction type or dropdown
// choice in every category, then opens that category with the type already selected.
export interface TransactionSearchEntry {
  /** Text shown and searched, e.g. "Collection of Activity Fees Receivable". */
  label: string;
  categoryId: TransactionCategoryId;
  categoryLabel: string;
  /** The transaction type to select inside the category (a rule description or expense item). */
  typeName?: string;
  /** For Activity Fees, which of its dropdown choices to open. */
  activityFeeChoice?: 'activity-fees' | 'receivable' | 'excess-refund';
}

export function searchTransactionTypes(query: string, entries: TransactionSearchEntry[], limit = 12): TransactionSearchEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const seen = new Set<string>();
  const scored = entries.flatMap(entry => {
    const label = entry.label.toLowerCase();
    const category = entry.categoryLabel.toLowerCase();
    const rank = label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : category.includes(needle) ? 2 : -1;
    const key = `${entry.categoryId}|${entry.label}`;
    if (rank < 0 || seen.has(key)) return [];
    seen.add(key);
    return [{ entry, rank }];
  });
  return scored.sort((left, right) => left.rank - right.rank || left.entry.label.localeCompare(right.entry.label)).slice(0, limit).map(item => item.entry);
}
