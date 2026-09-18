// Fixtures extracted from "Working Paper for StatementStudio.xlsx" — used
// ONLY by workingPaper.conformance.test.ts to prove the posting engine
// against the paper's own worked examples. This file is not imported by any
// application code and ships in no production bundle; the app's real
// Chart of Accounts and classification rules (FinanceContext.tsx) remain
// the only source of truth for what the product actually offers.
//
// Methodology: of the paper's 79 labelled rows (43 in Sheet1, 36 in
// ADDITIONAL), only 5 have BOTH a debit and a credit account that already
// exist in StatementStudio's Chart of Accounts (Phase 1 deliberately added
// just 4 new accounts, not the paper's full ~50-account vocabulary — see
// the build plan). Those 5 are asserted end-to-end below: debit account,
// credit account, and both Increase/Decrease effects, exactly as the paper
// states them.
//
// The other 74 rows are not silently dropped — EXCLUDED_ROWS documents
// every one of them, categorized by why the engine cannot yet check it.
// Nothing here guesses at an answer the paper doesn't give (e.g. treating
// a bare "Cash" as "Cash on Hand"): that guess is exactly the ambiguity
// the funding-source question exists to resolve, so rows that only say
// "Cash" are excluded, not silently normalized.

export interface CoveredRow {
  sheet: 'Sheet1' | 'ADDITIONAL';
  row: number;
  label: string;
  debitAccountCode: string;
  creditAccountCode: string;
  expectedDebitEffect: 'Increase' | 'Decrease';
  expectedCreditEffect: 'Increase' | 'Decrease';
}

// The 5 rows where both accounts already exist in the shipped Chart of
// Accounts. Account-name normalization applied (documented per row): the
// paper's wording differs cosmetically from ours, but names the same
// account.
export const COVERED_ROWS: CoveredRow[] = [
  {
    sheet: 'Sheet1',
    row: 5,
    label: 'Cash-in/cash-out of Cash on Hand to GCASH/MAYA and other banking apps',
    // Paper: "Cash in Bank" -> our 1015 Cash in Bank
    debitAccountCode: '1015',
    // Paper: "Cash on Hand" -> our 1010 Cash on Hand
    creditAccountCode: '1010',
    expectedDebitEffect: 'Increase',
    expectedCreditEffect: 'Decrease',
  },
  {
    sheet: 'Sheet1',
    row: 11,
    label: 'Cash Advances returned by Officers to the organization',
    // Paper: "Cash on Hand" -> our 1010
    debitAccountCode: '1010',
    // Paper: "Advances to Officer" (singular) -> our 1250 Advances to Officers
    creditAccountCode: '1250',
    expectedDebitEffect: 'Increase',
    expectedCreditEffect: 'Decrease',
  },
  {
    sheet: 'Sheet1',
    row: 12,
    label: 'Purchase of Laptop',
    // Paper: "Equipment" -> our 1500 Equipment & Tools
    debitAccountCode: '1500',
    creditAccountCode: '1010',
    expectedDebitEffect: 'Increase',
    expectedCreditEffect: 'Decrease',
  },
  {
    sheet: 'Sheet1',
    row: 17,
    label: 'Purchase of Flash Drive',
    // Paper: "Office Supplies Expense" -> our 5040 Office Supplies
    debitAccountCode: '5040',
    creditAccountCode: '1010',
    expectedDebitEffect: 'Increase',
    expectedCreditEffect: 'Decrease',
  },
  {
    sheet: 'Sheet1',
    row: 34,
    label: 'Cash Advances given to Officers',
    // Paper: "Advances to Officers" (plural) -> our 1250
    debitAccountCode: '1250',
    creditAccountCode: '1010',
    expectedDebitEffect: 'Increase',
    expectedCreditEffect: 'Decrease',
  },
];

export interface FundingSourceExample {
  sheet: 'Sheet2';
  rows: number[];
  fundingSourceAnswer: string;
  expectedCreditAccountCode: string;
}

// Sheet2's "Payment for Meals" worked example states the same funding-
// source answer twice each (rows 2-3 and 7-8; rows 12-13 and 17-18),
// always resolving to the same credit account regardless of the purpose
// or Event-Related/G&A tag attached to that block. That consistency is
// exactly what FUNDING_SOURCE_OPTIONS in journalEngine.ts is meant to
// capture as one general rule instead of one row per case. Sheet2 has no
// Increase/Decrease effect columns (unlike Sheet1/ADDITIONAL), so the
// conformance test derives the effect itself rather than checking it
// against a paper value that doesn't exist.
export const FUNDING_SOURCE_EXAMPLES: FundingSourceExample[] = [
  {
    sheet: 'Sheet2',
    rows: [2, 3],
    fundingSourceAnswer: 'Personal Money',
    expectedCreditAccountCode: '2050', // Due to Officers
  },
  {
    sheet: 'Sheet2',
    rows: [7, 8],
    fundingSourceAnswer: 'Personal Money',
    expectedCreditAccountCode: '2050',
  },
  {
    sheet: 'Sheet2',
    rows: [12, 13],
    fundingSourceAnswer: "Cash Advance from Organization's Fund",
    expectedCreditAccountCode: '1250', // Advances to Officers
  },
  {
    sheet: 'Sheet2',
    rows: [17, 18],
    fundingSourceAnswer: "Cash Advance from Organization's Fund",
    expectedCreditAccountCode: '1250',
  },
];

export type ExclusionReason =
  // One or both named accounts (e.g. Membership Dues, Bank Charges,
  // Furniture and Fixtures, Donation Expense) do not exist in the current
  // Chart of Accounts. The single largest category — expected, since
  // Phase 1 added 4 accounts, not the paper's full ~50.
  | 'missing-account'
  // The row's debit/credit cells were left blank by the paper's authors
  // (visually grouped under an earlier row, but never filled in) — there
  // is nothing to check.
  | 'incomplete'
  // The credit account is written as bare "Cash" rather than "Cash on
  // Hand" or "Cash in Bank" — the exact ambiguity the funding-source
  // question exists to resolve. Normalizing it ourselves would mean
  // guessing the answer instead of asking the question.
  | 'ambiguous-cash'
  // The author marked the row tentative/not final, or explicitly SKIP.
  | 'marked-skip'
  // Debit and credit accounts are both filled in, but the paper leaves the
  // Increase/Decrease effect columns blank, so there's no stated value to
  // check the engine's derivation against.
  | 'missing-effects'
  // The paper's own notes column (column H) flags the row as an open
  // question the authors never answered (e.g. "What materials?").
  | 'unresolved-in-paper';

// Every one of the paper's other 74 rows, categorized by why the engine
// can't check it yet — not silently dropped. Row numbers only (not full
// label text) to keep this file reviewable; cross-reference against the
// source workbook by sheet + row number.
export const EXCLUDED_ROWS: { sheet: 'Sheet1' | 'ADDITIONAL'; row: number; reason: ExclusionReason }[] = [
  // Sheet1 (38 excluded of 43 rows; 5 covered above)
  { sheet: 'Sheet1', row: 3, reason: 'missing-account' },   // Membership Dues
  { sheet: 'Sheet1', row: 4, reason: 'missing-account' },   // Membership Dues
  { sheet: 'Sheet1', row: 6, reason: 'missing-account' },   // Bank Charges
  { sheet: 'Sheet1', row: 7, reason: 'missing-account' },   // Bank Charges
  { sheet: 'Sheet1', row: 8, reason: 'missing-account' },   // Membership Dues Receivable, Membership Dues
  { sheet: 'Sheet1', row: 9, reason: 'missing-account' },   // Due from Other Organization
  { sheet: 'Sheet1', row: 10, reason: 'missing-account' },  // Due from Other Organization
  { sheet: 'Sheet1', row: 13, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 14, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 15, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 16, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 18, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 19, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 20, reason: 'missing-account' },  // Depreciation Expense / Accumulated Depreciation
  { sheet: 'Sheet1', row: 21, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 22, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 23, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 24, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 25, reason: 'missing-account' },  // Furniture and Fixtures
  { sheet: 'Sheet1', row: 26, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 27, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 28, reason: 'missing-account' },  // Depreciation accounts
  { sheet: 'Sheet1', row: 29, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 30, reason: 'incomplete' },
  { sheet: 'Sheet1', row: 31, reason: 'missing-account' },  // Other Income; also bare "Cash"
  { sheet: 'Sheet1', row: 32, reason: 'marked-skip' },      // Author-marked "SKIP (Tentative/Not final yet)"
  { sheet: 'Sheet1', row: 33, reason: 'missing-effects' },  // Transportation Expense/Due to Officers map fine; F/G blank
  { sheet: 'Sheet1', row: 35, reason: 'missing-account' },  // General Expense
  { sheet: 'Sheet1', row: 36, reason: 'missing-effects' },  // Transportation Expense/Advances to Officer map fine; F/G blank
  { sheet: 'Sheet1', row: 37, reason: 'missing-account' },  // Awards and Prizes Expense
  { sheet: 'Sheet1', row: 38, reason: 'missing-account' },  // Awards and Prizes Expense
  { sheet: 'Sheet1', row: 39, reason: 'missing-account' },  // Communication Expense
  { sheet: 'Sheet1', row: 40, reason: 'missing-account' },  // Awards and Prizes Expense
  { sheet: 'Sheet1', row: 41, reason: 'incomplete' },       // No debit account given at all
  { sheet: 'Sheet1', row: 42, reason: 'missing-account' },  // Printing Expense
  { sheet: 'Sheet1', row: 43, reason: 'missing-account' },  // Freight Expense
  { sheet: 'Sheet1', row: 44, reason: 'missing-account' },  // Freight Expense
  { sheet: 'Sheet1', row: 45, reason: 'incomplete' },

  // ADDITIONAL (36 excluded of 36 rows; 0 covered — every row credits bare
  // "Cash" or debits an account not yet in the Chart of Accounts)
  { sheet: 'ADDITIONAL', row: 3, reason: 'missing-account' },   // Supplies Expense
  { sheet: 'ADDITIONAL', row: 4, reason: 'missing-account' },   // Supplies Expense
  { sheet: 'ADDITIONAL', row: 5, reason: 'missing-account' },   // Supplies
  { sheet: 'ADDITIONAL', row: 6, reason: 'missing-account' },   // Food Expense
  { sheet: 'ADDITIONAL', row: 7, reason: 'ambiguous-cash' },    // Transportation Expense maps; credit "Cash" bare
  { sheet: 'ADDITIONAL', row: 8, reason: 'missing-account' },   // Uniform Expense
  { sheet: 'ADDITIONAL', row: 9, reason: 'missing-account' },   // Inventory - Merchandise
  { sheet: 'ADDITIONAL', row: 10, reason: 'missing-account' },  // Interest Income
  { sheet: 'ADDITIONAL', row: 11, reason: 'missing-account' },  // Merchandise Sales (also has its own Increase/Decrease typo)
  { sheet: 'ADDITIONAL', row: 12, reason: 'missing-account' },  // Merchandise Sales
  { sheet: 'ADDITIONAL', row: 13, reason: 'missing-account' },  // Inventory - Merchandise
  { sheet: 'ADDITIONAL', row: 14, reason: 'missing-account' },  // Awards and Prizes Expense
  { sheet: 'ADDITIONAL', row: 15, reason: 'missing-account' },  // Printing Expense / Miscellaneous Expense
  { sheet: 'ADDITIONAL', row: 16, reason: 'missing-account' },  // Tokens and Recognition Expense
  { sheet: 'ADDITIONAL', row: 17, reason: 'missing-account' },  // Awards and Prizes Expense
  { sheet: 'ADDITIONAL', row: 18, reason: 'missing-account' },  // Honararia Expense
  { sheet: 'ADDITIONAL', row: 19, reason: 'missing-account' },  // Token and Recognition Expense
  { sheet: 'ADDITIONAL', row: 20, reason: 'missing-account' },  // Membership Expense
  { sheet: 'ADDITIONAL', row: 21, reason: 'ambiguous-cash' },   // Office Supplies Expense maps; credit "Cash" bare
  { sheet: 'ADDITIONAL', row: 22, reason: 'unresolved-in-paper' }, // "Office Supplies /Office Supplies Expense" — asset-vs-expense left open
  { sheet: 'ADDITIONAL', row: 23, reason: 'missing-account' },  // Office Supplies as an asset isn't in the Chart of Accounts
  { sheet: 'ADDITIONAL', row: 24, reason: 'missing-account' },  // Printing Expense / Miscellaneous Expense
  { sheet: 'ADDITIONAL', row: 25, reason: 'missing-account' },  // Softbounding Expense
  { sheet: 'ADDITIONAL', row: 26, reason: 'missing-account' },  // Assistance / Communication Expense
  { sheet: 'ADDITIONAL', row: 27, reason: 'missing-account' },  // Service Charge
  { sheet: 'ADDITIONAL', row: 28, reason: 'missing-account' },  // Repair Expense (also has its own Increase/Increase typo)
  { sheet: 'ADDITIONAL', row: 29, reason: 'incomplete' },
  { sheet: 'ADDITIONAL', row: 30, reason: 'missing-account' },  // Printing Service; debit "Cash" bare too
  { sheet: 'ADDITIONAL', row: 31, reason: 'missing-account' },  // Other Income / Ticket Sales
  { sheet: 'ADDITIONAL', row: 32, reason: 'missing-account' },  // Donation Expense
  { sheet: 'ADDITIONAL', row: 33, reason: 'missing-account' },  // Donation Expense
  { sheet: 'ADDITIONAL', row: 34, reason: 'unresolved-in-paper' }, // Paper's own note: "What materials?"
  { sheet: 'ADDITIONAL', row: 35, reason: 'missing-account' },  // Food Expense
  { sheet: 'ADDITIONAL', row: 36, reason: 'missing-account' },  // Food Expense
  { sheet: 'ADDITIONAL', row: 37, reason: 'missing-account' },  // Donation Expense
  { sheet: 'ADDITIONAL', row: 38, reason: 'unresolved-in-paper' }, // Paper's own note (H39): breakdown left open
];

export const WORKING_PAPER_TOTAL_ROWS = 79;
