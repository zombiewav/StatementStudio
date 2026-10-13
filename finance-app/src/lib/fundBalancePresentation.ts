export interface AccumulatedNetPosition {
  label: 'Accumulated Net Surplus' | 'Accumulated Net Deficit';
  /** Positive for a surplus, negative for a deficit, as it reads on the Statement of Financial Position. */
  amount: number;
}

/**
 * Revenue less Expenses as it sits in Net Assets before (or without) a closing
 * entry: a surplus is a credit balance and adds to Net Assets; a deficit is a
 * debit balance and is shown as a negative.
 */
export function accumulatedNetPosition(netIncome: number): AccumulatedNetPosition {
  const amount = Math.round(netIncome * 100) / 100;
  return amount < 0
    ? { label: 'Accumulated Net Deficit', amount }
    : { label: 'Accumulated Net Surplus', amount };
}
