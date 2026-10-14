// Switches for the year-end closing feature. Flip these to change what ships
// without touching the pages themselves.

// false = Closing Entries, Post-Closing General Ledger and Post-Closing Trial Balance are
// hidden from the sidebar.
export const CLOSING_PAGES_ENABLED = true;

// Which Closing Entries page shows when the pages are enabled:
//  'direct'         — client's design: one entry closes Revenues and Expenses
//                     straight into Fund Balance (credit = surplus, debit = deficit).
//  'income-summary' — original 3-step flow through Income Summary (3000).
// Revert the client's design by changing this to 'income-summary'.
export const CLOSING_FLOW: 'direct' | 'income-summary' = 'direct';

// Client (Oct 2026): temporarily stop new semesters from being added before they start, so
// only one set of Financial Statements can be produced at a time. Set to false to lift it.
export const RESTRICT_FUTURE_SEMESTERS = true;
