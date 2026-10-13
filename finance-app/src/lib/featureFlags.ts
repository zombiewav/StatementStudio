// Switches for the year-end closing feature. Flip these to change what ships
// without touching the pages themselves.

// false = Closing Entries and Post-Closing Trial Balance are hidden from the
// sidebar and Financial Statements no longer waits for a completed close.
export const CLOSING_PAGES_ENABLED = false;

// Which Closing Entries page shows when the pages are enabled:
//  'direct'         — client's design: one entry closes Revenues and Expenses
//                     straight into Accumulated Net Surplus / Deficit.
//  'income-summary' — original 3-step flow through Income Summary (3000).
// Revert the client's design by changing this to 'income-summary'.
export const CLOSING_FLOW: 'direct' | 'income-summary' = 'direct';
