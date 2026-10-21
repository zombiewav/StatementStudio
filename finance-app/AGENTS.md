# StatementStudio — Agent Handoff

Fund-accounting web app for a student organization thesis project. React 18 + TypeScript + Vite,
Tailwind CSS, **localStorage only — no backend, no database**. All state lives in one React
Context and is per-browser (nothing syncs across devices).

This file exists so another coding agent (or a future session) can pick up work without
re-deriving context. Read it before making changes.

## Required workflow for project requests

Before starting any StatementStudio request, read [`PROJECT_WORKFLOW.md`](./PROJECT_WORKFLOW.md) and follow its sequence: plan first, inspect the files and screenshots, check what already exists and what is new, implement only confirmed gaps, verify in the browser, and audit every acceptance criterion before reporting completion. Preserve ongoing user changes and state any verification limits plainly.

## Commands

```bash
npm run dev          # vite dev server, http://localhost:5173
npm run type-check   # tsc --noEmit — run after every change
npm run test         # vitest run — run after every change
npm run build         # production build (what Vercel runs)
```

There is no lint-clean guarantee enforced pre-commit; always run `type-check` + `test` yourself
before considering a change done. Both must be clean.

## Architecture

- **`src/context/FinanceContext.tsx`** — the single source of truth. Holds `accounts`,
  `journalEntries`, `projects`, `auditLogs`, `settings`, `classificationRules`,
  `closedFiscalYears`, plus every mutator (`addJournalEntry`, `updateAccount`, `closeFiscalYear`,
  etc.). Every page reads through `useFinance()`. Each piece of state has its own
  `localStorage` key and its own `useEffect` that persists it on change (see below) — there is
  no single "save" action.
- **`src/lib/*.ts`** — pure, framework-free computation, each paired with a `*.test.ts` file.
  This is the pattern to follow for any new non-trivial logic: don't inline accounting math
  into a component, extract it here and unit-test it first.
  - `journalEngine.ts` — funding-source resolution, compound journal-line builders.
  - `reviewEngine.ts` — the REVIEW workflow: detects open obligations (Due to Officers/Supplier,
    Advances to Officers, Prepaid Expenses) by normal-balance polarity, builds settlement lines.
  - `accountTotals.ts` — per-account balances and per-type totals, correctly netting
    contra-accounts (e.g. Accumulated Depreciation) by comparing an account's `normalBalance`
    against its type's natural polarity.
  - `closingEntries.ts` — year-end closing: zeroes Revenue/Expenses into Fund Balance.
  - `activitiesBreakdown.ts` — Event-Related vs General & Administrative expense split for the
    Statement of Activities.
  - `cashAccounts.ts` — which account codes count as "cash" for cash-flow purposes.
  - `backupValidation.ts` — validates a parsed JSON backup before `restoreBackupData` applies it.
  - `workingPaper.fixtures.ts` + `workingPaper.conformance.test.ts` — regression suite that
    checks the posting engine against the source "Working Paper for StatementStudio.xlsx"
    reference doc's own worked examples. **Not shipped in the app bundle** — test-only. Currently
    covers 7/79 of the paper's rows (the rest are excluded with a documented reason — see
    `EXCLUDED_ROWS`); expanding coverage means adding Chart of Accounts entries the paper uses
    that the app doesn't have yet (Bank Charges, Honoraria, etc. — see `ExclusionReason`).
- **`src/pages/*.tsx`** — one file per sidebar section (Dashboard, Transactions, Review, Journal
  Entries, General Ledger, Trial Balance, Financial Statements, Analytics, Activities & Programs
  (`ProjectsPage.tsx`), Settings). All read the same `journalEntries`/`accounts` from context, so
  posting a transaction anywhere reflects everywhere immediately.

## localStorage keys

| Key | Holds |
|---|---|
| `orgAccount` | `{ organizationName, password, createdAt }` — the one shared org login. |
| `isLoggedIn` | `"true"` while signed in. |
| `ss_accounts` | Chart of Accounts. |
| `ss_journals` | All journal entries (empty by default for a new org). |
| `ss_projects` | Activities/Programs. New orgs default to just `General Fund Operations` at
  ₱0 budget (`DEFAULT_PROJECTS` in FinanceContext.tsx) — **existing saved data is never
  migrated**, so an account created before a given fix keeps whatever it already has. |
| `ss_audit_logs` | Activity feed / audit trail. |
| `ss_settings` | `{ fiscalYear, organizationName, currencySymbol, currencyCode }` — note
  `organizationName` here is a separate copy from `orgAccount.organizationName`; Settings' save
  handler keeps them in sync manually, so any new place that renames the org must update both. |
| `ss_closings` | `ClosingRecord[]` — completed fiscal-year closes (see Closing Entries below). |
| `ss_receipts` | Compressed JPG receipt/supporting-photo records linked to journal-entry IDs. |
| `ss_custom_rules` | User-created automatic transaction types; built-in rules remain source-controlled and protected. |
| `ss_activity_fees` | Activity/Event Fee workflow records, prior-period collections, receivables, deferrals, and refunds. |
| `ss_theme` | `'light' \| 'dark'`. |

`INITIAL_ACCOUNTS`/`INITIAL_JOURNALS`/`INITIAL_PROJECTS` in `FinanceContext.tsx` are the
fabricated **demo** dataset, used only by the explicit `loadSampleData()` action (the "Load
Sample Data" sidebar button). A brand-new org must never see fabricated numbers before it does
anything itself — that was a real bug (Program Profitability chart showing demo budgets) fixed
this session; keep that invariant when adding new seed data.

## Auth model

One shared password per organization, not per-person. `RegisterPage.tsx` only renders when no
`orgAccount` exists yet (redirects to `/login` otherwise); `LoginPage.tsx` only renders when one
does (redirects to `/register` otherwise). There is no per-user identity anywhere in the app —
the Navbar, Dashboard greeting, and every audit-log `user` field show the **organization's**
name, not a person's. Do not reintroduce individual accounts/roles without being asked; that was
deliberately removed.

Database-free auth is centralized in `src/lib/localAuth.ts`. New registrations save an organization
email as well as the shared password; legacy browser accounts without an email remain password-only
and continue to work. `ProtectedRoute` requires both a valid stored organization account and the
login flag. This is still local-browser authentication, not secure multi-device authentication.

## Accounting features built this session (verify before assuming these are complete)

- **Prepaid Expenses / universal REVIEW / FS gate**: `mayDeferPortion` flag on a classification
  rule (FinanceContext.tsx) generalizes "how much of this is not yet used" into a
  Dr-Expense/Cr-Prepaid-Expenses split, settled later in Review against a real expense account.
  Financial Statements is hard-blocked (statements hidden, export/print disabled) while any
  REVIEW item is open — computed over **all** journal entries, not the selected date range.
  Exception (client, Oct 2026): an unused Prepaid Expenses / Other Assets balance stays Incomplete in
  Review but does not block the statements or Closing Entries (`blocksStatements` on the review state).
- **Contra-accounts**: `accountTotals.ts` nets a contra-account (normalBalance opposing its
  type's natural polarity, e.g. Accumulated Depreciation) by subtracting instead of adding.
  Rendered as `(₱X)` in the Balance Sheet via `isContraAccount()`.
- **Depreciation**: accounts `1550`/`1660` (Accumulated Depreciation) and `5090`/`5095`
  (Depreciation Expense) exist; `'depreciation'` keyword rules route to them.
- **Closing Entries**: Settings → "Close Fiscal Year" posts one real balanced journal entry
  zeroing Revenue/Expenses into Fund Balance (`closingEntries.ts` +
  `FinanceContext.closeFiscalYear`). Permanent accounts (Assets/Liabilities/Fund Balance) need
  no separate "carry forward" step — they're already a running total across all entries.
  **Important**: this only works correctly because `FinancialStatements.tsx`'s Balance Sheet
  uses `cumulativeToEndBalances`/`cumulativeToEndTotals` (entries with `date <= endDate`, no
  lower bound) — NOT the range-filtered `filteredBalances`/`filteredTotals`, which is correct
  only for Revenue/Expenses (a period's activity). If you touch Financial Statements, keep this
  split: Balance Sheet = cumulative-to-end-date, Income Statement = date-range period.
- **"Accounts determined automatically"**: Transactions.tsx no longer lets a user hand-pick the
  debit/credit account — they're read-only, driven entirely by `suggestTransactionClassification`.
  Posting is blocked (with a message) if the typed transaction name matches no known rule. Don't
  reintroduce manual account selects without being asked; that was deliberately removed too.
- **Fiscal Year selector (Navbar)**: still mostly a label — picking a year updates
  `settings.fiscalYear` for display but does **not** filter/switch which entries the app shows.
  Only `closeFiscalYear` + Financial Statements' own Statement Period date range make fiscal
  years actually mean something. Don't assume the Navbar dropdown does more than that.
- **Sponsorship workflow**: cash, donated food, and donated event supplies have distinct automatic
  rules. In-kind goods first post to holding assets (`1710`/`1720`); Review records the used and
  spoiled portions. Temporarily restricted sponsorship revenue uses `4035` and remains incomplete
  until the event-based release is posted.
- **Receipt/supporting photos**: Transactions accepts up to three JPG/PNG/WebP images, compresses
  them before saving, and links them to the original journal entry. Review can attach a missing
  receipt later; Review and Journal Entries show the saved images. Backups include receipt data.
- **Custom transaction types**: Settings → Manage Transaction Types can add, edit, search, enable,
  and disable custom types with fixed debit/credit accounts. Built-in types are visible but cannot
  be edited. Historical entries keep their original journal lines when a custom type later changes.
- **Custom Financial Statements and year-end gate**: Financial Statements lets the user choose
  which reports are available, keeps at least one selected, and calculates beginning cash from the
  cumulative cash balance immediately before the chosen period. Closing is blocked in both the UI
  and FinanceContext while Review has incomplete items; closing entries are permanent.
- **Backup feedback and workspace reset**: Settings shows the exported backup filename after a
  download starts. A separate two-step "Reset Financial Workspace" action removes journals,
  receipts, programs (restoring only General Fund Operations), closings, custom transaction
  types, and prior audit history while preserving the shared organization login, settings,
  currency, and Chart of Accounts.
- **Chart of Accounts pagination**: Settings shows 10 accounts per page with numbered previous/next
  controls, avoiding a very tall account table while preserving add, edit, and status actions.
- **Activity/Event Fees (final client rule)**: Transactions asks whether the event happens in the
  current reporting period and accepts repeatable dated collections. Collections before the event
  credit Unearned Activity Fees (2110); on the event date the system releases prior/current
  unearned collections, recognizes the full Activity Fees Revenue (4090), and creates Activity
  Fees Receivable (1310) for the unpaid balance. Event-date cash is included in that recognition
  entry; each post-event collection separately debits Cash and credits the receivable. A future-
  period event may be saved without a known total, remains incomplete in Review, and is recognized
  there once its total and event date are known. Ledger and Transaction History rows show the
  specific event name. The Review tab no longer has an Activity Fee History panel (client, Oct 2026) and activity-fee records no longer block Financial Statements or closing.
  The Activity Fees category also has a separate **Collection of Activity Fees Receivable** dropdown
  choice. It selects an event with an outstanding receivable and accepts one Date/Collection pair
  per submission, posting Dr Cash / Cr Activity Fees Receivable; the same follow-up remains available
  in Review. The main collection list reminds users to include every collection from the reporting
  period, including collections received before the event. Both Activity Fees choices can be saved
  as drafts and resumed from Review.
- **Transaction categories**: Transactions first presents Activity Fees, Merchandise Transactions,
  Membership Fees, Purchases, and Miscellaneous Transactions. Choosing a category opens the existing form
  with its searchable type list filtered to that category; account selection remains automatic.
  The optional Custom Transaction Name field was removed from the entry form at the client's request.
  `transactionCategories.ts` owns the tested grouping.
  Cash advances and non-membership income from the latest client note belong to Miscellaneous.
  Every category shows the general reminder that incomplete information can be updated later in Review.
- **Transaction History / inventory summary**: The sidebar Transaction History page selects one
  account at a time and shows its lifetime postings and running balance. Merchandise Inventory
  (1700) also has a lifetime summary on that page and inside the Merchandise category. Merchandise
  sales require the inventory cost sold and automatically add Dr Cost of Sales - Merchandise (5240)
  / Cr Inventory - Merchandise (1700), so inventory carries across years until fully released.
- **Merchandise acquisition (first-period rules)**: Merchandise Transactions includes a guided
  acquisition form for Lanyards, Pins, Tote Bags, Mugs, Shirts, and an Other title. Each posted
  batch saves its quantity, full cost, payment method, officer/advance/reimbursement breakdown,
  dated payment details, and receipts. Payment, advance, officer-paid, and reimbursement questions
  use repeatable date-plus-amount rows with automatic totals. The posting engine supports organization cash, officer personal funds, an existing
  organization advance, a combination of advance and personal funds, or not-yet-paid purchases;
  it omits zero-value lines and leaves unsettled supplier amounts in Merchandise Payable (2020),
  which the normal Review settlement flow clears later. The client's second-year unit movement
  and batch-depletion rules are intentionally not guessed and remain pending their follow-up.
- **Merchandise sales and dated collections** (client's Oct 13 design): Sale of Merchandise takes the
  Name of Item, the Batch Reference (any acquisition batch that still has inventory cost; a
  quantity is not required), the Cost of All Items Sold (cannot exceed the batch's remaining cost;
  Dr Cost of Sales / Cr Inventory) and a typed Total Sales. Buyer downpayments recorded for the same
  item and batch (`Downpayment by Buyer for Pre-Ordered Merchandise`, Cr Unearned Merchandise
  Revenue 2140) are applied automatically: Dr Accounts Receivable (Total Sales - Downpayments),
  Dr Unearned Merchandise Revenue, Cr Sales. Collections (directly by the organization, or by an
  officer who remits) use repeatable date-plus-amount rows; collections plus downpayments beyond the
  total sales are credited to Refund Liability - Merchandise (2150), resolved later with
  `Excess Merchandise Collection - Status`. Uncollected buyer balances post to Accounts Receivable
  (1200); collections still held by an officer post to Due from Officers (1320). Inventory Summary
  shows each batch's cost, cost of sales and net inventory (units purchased only, since sales are
  recorded by cost). Drafts saved with the older Quantity sold x Selling price still resume.
- **Line-level posting dates**: Repeatable merchandise payments, collections, reimbursements, and
  remittances create separate journal lines carrying the date entered for that specific amount.
  Journal Entries shows each line's Posting Date, while General Ledger and Transaction History sort
  and calculate running balances from that line date. Older journal lines without a date continue
  to use their journal entry's main date.
- **Membership Fees collection schedule**: Current-school-year fees now ask for Date 1, total fees
  collectible, and repeatable dated collections. The system automatically handles same-day, later,
  and mixed collections, recognizes the full fee on Date 1, and computes the remaining Membership
  Dues Receivable. Earlier-period unpaid-fee collections use the same dated-row format and cannot
  exceed the receivable on the books. A blank Date 2, Date 3, or later collection date inherits
  Date 1; each resolved date is saved on its journal lines for the ledger.

- **Year-end closing (client design, Oct 2026)**: the sidebar has Closing Entries, Post-Closing General
  Ledger and Post-Closing Trial Balance (switch: `CLOSING_PAGES_ENABLED` in `lib/featureFlags.ts`).
  Closing Entries is **automatic** (no Post button): a FinanceContext effect (`planClosingSync`) posts one entry once
  Review has nothing open, dated the semester's last day and covering every Revenue/Expense of the whole semester
  (not up to today). It is updated in place when the books change and withdrawn while Review has open items; it
  never locks the period's entries (`ClosingRecord.automatic`). Day-to-day views (`accountBalances`, Dashboard,
  Analytics, Programs, posting checks) read `operatingJournalEntries`, which leaves the closing entry out.
  The entry: every Revenue debited, every Expense
  credited, and the difference to **Fund Balance** (account 3010, renamed from General Fund Balance):
  credit for a surplus, debit for a deficit, which leaves Fund Balance negative on the Statement of
  Financial Position (a negative Fund Balance is allowed by the posting check and the statements gate).
  The General Ledger and Trial Balance ignore closing entries (`excludeClosingEntries`); the post-closing
  versions include them. The Statement of Activities and Functional Expenses always use the balances
  before closing. The old Accumulated Net Surplus/Deficit accounts (3040/3050) are retired and migrate
  onto 3010. Financial Statements are not blocked waiting for the close; before it, the Statement of
  Financial Position shows revenue less expenses as the accumulated net surplus/deficit.

- **Draft workflow (client design)**: every transaction form only ever offers **Save as Draft**. The
  general Transactions form writes a real draft journal entry to the ledger and re-saving replaces
  that same entry (never a duplicate); Activity Fee and Customer Order drafts store form
  state only. Review's draft card has **Continue / Post / Delete**: Post opens the draft and runs
  the form's own validation and posting (`autoPostDraft`), then returns to Review and removes the card.
  Because a saved draft is already in the ledger, the form reads every limit (officer payable,
  advances, cash, linked downpayment, inventory units, preview Before/After) from
  `ledgerWithoutDraftEntry` (`lib/draftLedger.ts`) so a draft never counts against itself. Drafts
  are kept out of Transaction Review. Reimbursement to Officer is limited by the **named officer's own** balance in
  Due to Officers and the name must be in the Amount Payable to Officers table, also for drafts (client, Oct 20 2026: `lib/officerReimbursement.ts`; before, it was the total balance). Journal lines are *displayed* debits
  first (`orderLinesDebitsFirst`); stored order is unchanged because batch splitting relies on it.

- **Prepaid Expenses and Other Assets drafts (client, Oct 22 2026)**: Save as Draft on Purchase, Downpayment and Consumption now writes one real draft ledger entry (all lines, dated payment batches are only split on Post) and re-saving replaces it; Post (form or Review) replaces the same entry id, so nothing doubles, and a draft purchase keeps `prepaidSemesterFinalized`. Limits (cash, advances, downpayments, purchases) read `ledgerWithoutDraftEntry`. `prepaidAdjustmentItems` counts drafts, so Other Adjustments > Consumption asks about a purchase before it is posted; a consumption is only finalized for the semester when posted.

- **No negative balances after the fact**: besides the posting check, deleting a posted entry, deleting a saved draft,
  reversing an entry and editing an entry are refused when they would push an account below zero because of later
  postings (e.g. deleting a payable that was already paid). `lib/negativeBalanceGuard.ts`; Fund Balance may go negative;
  an account already negative is only flagged if the change makes it worse.

- **PPE Item References (client, Oct 15 2026)**: PPE is tracked per Item Reference = one item at one amount per unit
  (`lib/ppeItems.ts`, internal only: the ledger and statements keep the official COA accounts). A PPE purchase is entered as
  Quantity (required, whole number) and Amount per Unit (required); the total posted = quantity x amount per unit. On posting, the
  purchase joins the existing reference with the same item and unit cost that has no depreciation yet (`findMatchingPpeReference`),
  otherwise it starts a new one; the choice is stored on the entry as `ppeReferenceId` (+ `ppeQuantity`, `ppeUnitCost`).
  Purchases saved before this get one reference each (unit cost = cost / quantity); depreciation saved without a reference goes to
  the item's oldest reference; an opening balance with no carried detail is one single-unit reference. **Depreciation**: the type
  list shows items that have a reference with Net Book Value > 0; the user then selects which purchase (auto when only one), sees its
  Available Quantity, Amount per Unit, Remaining Original Cost and its own accumulated depreciation, and the amount cannot exceed that
  reference's Net Book Value; the entry stores `ppeReferenceId`. New semesters carry every held reference forward as a zero-line
  "Beginning Balances — PPE detail" entry (`carryForwardPpeItems`).
  **Retirement of PPE** (own tab, `RetirementOfPpeEntry`): item, then purchase (reference); quantity to dispose takes cost = unit cost x
  quantity and accumulated depreciation = reference depreciation / available quantity x quantity; NBV > 0 posts Dr Accumulated
  Depreciation / Dr Loss on Disposal of PPE (5370, new expense account) / Cr asset with a confirm step, NBV = 0 posts without a loss
  (confirm step), accumulated depreciation above cost is refused (`planPpeRetirement`); only that reference is reduced and it
  disappears at zero. **Return of Advances** (own tab, `ReturnOfAdvancesEntry`): shows the per-officer advance table, limits the
  amount to that officer's remaining advance, posts Dr Cash / Cr Advances to Officers. Both tabs now follow the draft workflow (see the Oct 20 note below).

- **Sale of Merchandise / Prepaid cautions and receivable collections (client, Oct 15-16 2026)**: the payment shortfall Caution also appears on Sale of Merchandise
  (collected < Total Sales, worded as a receivable; `MERCHANDISE_SALE_SHORTFALL_CAUTION`) and on Prepaid Expenses and Other Assets purchases (paid < Purchase Price
  of Asset). The officer field on Sale of Merchandise is again a plain text field (the client withdrew the Advances to Officers link). Merchandise Transactions has
  three collection types sharing one form (`lib/receivableCollections.ts`): Collection of Receivables from Suppliers (Cr 1360), Collection of Receivables from
  Officers - Merchandise (Dr Cash / Cr Due from Officers 1320) and Collection of Unpaid Sold Merchandise (Dr Cash / Cr Accounts Receivable - Merchandise 1200, with a
  "Receivable remaining after all these collections" box). Each amount is capped at the ledger balance of its receivable.

- **Financial Statements gate (client, Oct 16 2026)**: besides open Review items and negative balances, the statements are not generated (and Print is disabled; the Export PDF / Export Excel buttons were removed at the client's request, only Print remains)
  while any draft transaction exists (`pendingDraftLabels` in `lib/statementReadiness.ts`: Review's drafts plus orphan draft entries). A note on the page always says all
  transactions must be posted first.

- **Financial Statements readability (client survey, Oct 2026)**: the statements use the sans font with tabular numbers at a larger size
  (15px lines, 13px totals/headings, 20px organization name) instead of 10-12px monospace. The Statement of Financial Position lists every
  Equipment item (1500-1516), Furniture and Fixtures item (1651-1653) and both accumulated depreciation accounts under Property and Equipment
  (`isPropertyAndEquipmentAccount`, accounts 1500-1699); before, only 1500/1550/1660 were grouped there and items such as Microphone or Chairs
  fell under Other Assets. Survey follow-ups, also done: Transactions scrolls smoothly to the type list / form after a category is clicked (`categoryContentRef`), and text is larger app-wide (`--text-xs`/`--text-sm` raised in the index.css theme; the arbitrary `text-[9-11px]` sizes were each moved up 2px).

- **Beginning Balances (client, Oct 2026)**: the first-sign-in welcome popup was removed at the client's request; the Beginning Balances form (`BeginningBalancesForm`) is only in the Settings card. `settings.beginningBalancesPrompted` is no longer used.

- **Revisions file "NEW REVISIONS_ADDITIONS" (client, Oct 19 2026)**: Sale of Merchandise is now "Sale of Merchandise / Delivery of Merchandise to Buyers (paid or unpaid)" and
  "Collection of Receivables from Suppliers" is "Collections from Suppliers - Merchandise" (the old rule stays, hidden, so saved drafts resolve). Supplier advances are two accounts:
  1270 "Advances to Suppliers - Merchandise" (merchandise downpayments) and the new 1275 "Advances to Suppliers - Others" (Prepaid Rent / Clothing-Uniform downpayments;
  earlier prepaid downpayment lines move from 1270 to 1275 in `migrateRetiredAccountLines`). Event/Program Expenses has no Transaction Type field (the single type is selected
  for the user; only Amount, Event Name and Date are asked). Transactions has a "Search all transaction types" box above the category picker (`lib/transactionSearch.ts`) that
  opens the right category / Activity Fees choice; a "Receivables carried forward - still to collect" card (`lib/carriedReceivables.ts`) lists 1200/1300/1310/1320/1360 balances that
  came in as opening balances until they reach zero. Logout offers "Log out anyway" when the workspace cannot be saved (save conflict): the browser copy stays and is offered at the next sign-in.

- **FINAL REVISIONS paper (client, Oct 20 2026)**: Membership Fees is the first category card, then Activity Fees. The Review-later note (`ReviewLaterNote`) has the new
  "Save this transaction as a draft and do not post it yet until all collections and payments made within the reporting period have been updated..." text, is large, and sits directly
  above Save as Draft in every form (general, Activity Fees, Prepaid, Customer Order), not under the type field. The Membership accrual form shows the "collected is less than / exceeds
  the fees due" notes (nothing when equal). **Collection of Unpaid Membership Fees from Previous Period** is capped by the *beginning balance* of Membership Dues Receivable (opening balance
  1300 less earlier Dr Cash / Cr 1300 collections, `remainingBeginningMembershipReceivable`), like Payables, with the "exceeds the beginning balance of PX" caution; no beginning balance means
  nothing to collect. Activity Fees buttons read "Yes - current semester" / "No - next semester".

- **Activity Fees drafts are linked (client, Oct 20 2026)**: an Activity Fees draft stores form fields only, so before this nothing linked to it until Review posted it. `lib/activityFeeDrafts.ts`
  (`activityFeeDraftEffects`) derives, from the saved drafts, what ActivityFeeEntry shows: an event saved as a draft appears in "Event with unpaid activity fees" (marked "saved draft") with its receivable,
  collection drafts lower the remaining balance, excess drafts do the same for the excess list, and advance collections in other drafts use up the Unearned Activity Fees beginning balance. The draft being
  edited never counts against itself. A collection drafted against a draft event posts only after that event is posted (it follows the event by name; otherwise it says to post the event first).

- **Merchandise Transactions dropdowns (client, Oct 20 2026)**: like PPE's PPE/F&F pair, the type picker is two selects: **Purchase** (Acquisition of Merchandise for Sale, Collections from Suppliers - Merchandise,
  Downpayment to Suppliers for Pre-Ordered Merchandise: `MERCHANDISE_PURCHASE_TYPES`) and **Sales** (every remaining merchandise type). Picking from one clears the other.

- **Tentative final revisions + additions (client, Oct 20-21 2026)**: *Reimbursement to Officers* is per officer (see above). *Merchandise*: "Collections from Suppliers - Merchandise" is now
  "Collection of Refund from Supplier for Excess Payment" (old rules stay, hidden) and the excess-payment caution says the excess goes to Accounts Receivable - Supplier and to use that dropdown
  choice for a refund. *Activity Fees*: "No - next semester" shows the advance-collections note in place of the "Include all current-semester..." note inside the Collections box (Yes keeps that note); **Collection of Activity Fees Receivable** has no event dropdown any more: it is capped by the
  BEGINNING balance of Activity Fees Receivable (1310) like Membership/Payables (`lib/activityFeeReceivable.ts`, `transactionDetails.activityFeePriorReceivableCollected` marks what was collected
  against it; saved receivable drafts count via `activityFeeDraftEffects().reservedBeginningReceivableCollected`) and posts Dr Cash / Cr 1310 directly. *Expense and PPE / F&F purchases*: the PPE form now
  has the same required Date of transaction at the top; the transaction date and every payment date are required, no payment before the transaction date, only Payment 1 may share it, payment dates
  cannot repeat, payments cannot exceed the cost (`lib/guidedPurchaseDates.ts`). *Depreciation / Retirement*: `buildPpeReferences` counts saved drafts (`includeDrafts`, default true; carry-forward
  passes false), so a draft purchase can be depreciated or retired and balances move on Save as Draft. *Return of Advances* and *Retirement of PPE* are draft forms like the rest: Save as Draft writes a
  real draft ledger entry (category `return-of-advances` / `retirement-of-ppe`), the review note sits above the button, Return has a Journal Entry Preview, Review's Continue/Post resumes them
  (Retirement still asks to confirm a loss when posted).

- **Other Adjustments tab (client, Oct 21 2026)**: the Event/Program Expenses, Depreciation and Retirement of PPE boxes are gone from the Transactions picker (drafts of those categories still resolve; Event Expense 5300
  can no longer be posted to from the UI). PPE Transactions shows Purchase / Depreciation / Retirement of PPE buttons, the last two disabled with "See Other Adjustments." The sidebar tab **Other Adjustments** (after Review,
  `pages/OtherAdjustments.tsx`) has three sections: **PPE** (groups = Item References; three questions that must total the available quantity, `checkPpeClassification`; Retirement form (`fixed` group mode) first, then
  `DepreciationEntry`, both draft forms; Depreciation/Retirement drafts resume here via `pageForDraft` in App.tsx), **Consumption of Prepaid Assets** (moved out of Review: amount consumed, 0 allowed, then the purchase is finalized
  for the semester via `finalizePrepaidAssetForSemester`; balances carried in from an earlier semester are rows without a purchase entry, kept in `prepaidCarried`) and **Cash** (balance = 1010 + 1015; the bank/e-wallet amount is
  informational: no entry, never above the balance). `lib/otherAdjustments.ts` derives everything (`computeOtherAdjustments`); the answers (PPE classification, cash amount, carried prepaid) live per semester in
  `settings.otherAdjustments[`${reportingYear}::${semester}`]`. The tab is red (count badge) while anything is outstanding, whatever the date; it is not red when nothing is required. Review no longer lists unused prepaid balances
  (`computeTransactionReviewStates` ignores them; the Review badge counts incomplete Review items). **Financial Statements** are held back while adjustments are outstanding (after the drafts/Review/negative-balance checks): message +
  "Go to Other Adjustments", or "View statements without adjusting" -> confirm -> YES shows them with the red UNADJUSTED note under every statement (also printed, history record `unadjusted`), NO returns to Other Adjustments;
  the exception never completes an adjustment and ends when nothing is outstanding or the semester changes.

## Known bugs / gaps, not yet fixed (flagged, intentionally left alone)

- **Activities & Programs**: budget is now editable inline (click the Budget Cap figure), but
  there's no way to delete a program, only toggle its status (Active/Completed/On Hold).
- Two items from the client's own working-paper sheet are unresolved **by the client**, not by
  code: "cashback from e-wallet" — row 20 says credit E-Wallet Rewards, row 77 says credit
  Miscellaneous Income, contradictory. Don't guess; ask the client (via the user) before changing it.

## Testing conventions

- Every new piece of non-trivial logic goes in `src/lib/*.ts` as a pure function, paired with a
  `*.test.ts` using Vitest (`describe`/`it`/`expect`, no mocking framework needed — everything
  here is pure data in, data out).
- Before trusting any UI change, actually drive it in a browser (dev server at `:5173`) rather
  than reading the JSX and assuming it works — several real bugs this session were only caught
  by clicking/scripting through the actual flow (e.g. a stale `filteredBalances` computation that
  looked correct in isolation but silently dropped carried-forward balances).
- `npm run type-check` and `npm run test` must both be clean before calling anything done.

## Deployment

Vercel, Root Directory = `finance-app`, Framework Preset = Vite, Output Directory = `dist`.
`finance-app/vercel.json` has the SPA-fallback rewrite (`/(.*)` → `/index.html`) — required
because Login/Register do a full `window.location.href` navigation (not React Router
`navigate()`) on purpose, since `FinanceProvider` only reads localStorage once at mount.
`node_modules/` and `dist/` are gitignored; if either shows as tracked, it was committed before
`.gitignore` existed and needs `git rm -r --cached`, not just adding to `.gitignore`.

## Current repo state (as of this handoff)

Last commit: `fa08c9f3` "Add Prepaid Expenses accrual workflow, fix depreciation conformance
coverage, switch to shared org login". **Everything below is uncommitted working-tree changes**
on top of that commit — confirm with the user before committing/pushing, don't assume it's
wanted:

- `src/lib/closingEntries.ts` + `.test.ts` (new) — Closing Entries feature.
- `src/context/FinanceContext.tsx`, `src/types.ts` — Closing Entries wiring (`ClosingRecord`,
  `closedFiscalYears`, `closeFiscalYear`).
- `src/pages/FinancialStatements.tsx` — cumulative-vs-period Balance Sheet fix (required for
  Closing Entries to actually show carried-forward balances).
- `src/pages/Settings.tsx` — "Close Fiscal Year" card; also has an "Organization Password" card
  and Chart-of-Accounts Description-column truncation fix (`max-w-[220px] truncate`) from
  earlier in this session.
- `src/pages/ProjectsPage.tsx` — inline Budget Cap editing (click the figure to edit).
- `src/pages/Transactions.tsx` — manual debit/credit account override removed.
- `src/components/ReceiptAttachments.tsx`, `src/lib/receiptAttachments.ts` + test — compressed
  receipt storage, validation, transaction linking, Review/Journal display, and backup coverage.
- `src/components/CustomTransactionTypesManager.tsx`, `src/lib/customTransactionRules.ts` + test,
  `src/context/FinanceContext.tsx`, `src/types.ts`, `src/pages/Settings.tsx` — persistent custom
  transaction types with protected built-ins and automatic fixed accounts.
- `src/lib/cashFlowStatement.ts` + test, `src/pages/FinancialStatements.tsx` — Statement of Cash
  Flows built from the client's "closing to SFP" rules: only entries touching a cash account
  (`cashAccounts.ts`) count; cash debited = receipt, cash credited = payment, for the actual cash
  line; the category is the related account, and with several related accounts the cash is split
  in proportion to their amounts; Operating by default, only cash paid for Equipment (1500-1516)
  and Furniture & Fixtures (1650-1653) is Investing (no Financing section); cash moves between
  cash accounts and a reversed entry plus its reversal in the period are skipped; ending cash is
  checked against the ledger cash balance. Beginning cash uses each cash line's posting date.
- `src/pages/FinancialStatements.tsx` — selectable custom FS set.
- `src/lib/closingEntries.ts` + test, `src/pages/FinancialStatements.tsx` — closing entries remain
  in ledger/point-in-time balances but are excluded from period-performance presentation, so a
  post-close Statement of Activities retains the original revenue/expense categories without
  double-counting the closed surplus on the Balance Sheet.
- `src/lib/reviewEngine.ts` + test, `src/pages/Review.tsx` — unified Review history plus donated
  sponsorship usage/spoilage and temporary-restriction release workflow.
- `src/components/Navbar.tsx` — the fiscal-year selector is a custom dropdown rather than a native
  `<select>`, so its popup reliably follows the light/dark theme instead of inheriting a white or
  blank-looking operating-system menu.

- **Opening balances (second semester onward)**: only permanent accounts carry forward: Assets, Liabilities and
  Fund Balance (`reportingPeriodBalances.ts`). Opening Fund Balance is whatever balances the opening Statement of
  Financial Position (`withCarriedFundBalance`), so a surplus not yet closed, or a semester created before this
  rule, still opens balanced. Revenue and Expenses always start at zero. The Trial Balance lists accounts
  Assets, Liabilities, Fund Balance, Revenue, Expenses.


- **Chart of Accounts follows the client's FORMAT FS list (Oct 2026)**: accounts not on it are retired through
  `RETIRED_REPLACEMENTS` in FinanceContext.tsx (old postings and opening balances move to the listed account; the
  automatic transaction rules post to the replacement). Still kept although unlisted, pending the client: Utilities
  5030 (electricity/water), Equipment & Tools 1500 (computer, monitor, server, hardware, equipment) and 1514-1516,
  the expense-item accounts 5330-5360, Prepaid Expenses 1260, Permanently Restricted Fund Balance 3030 and the
  restricted contribution revenues 4030/4035/4036. Not added: Due to Customers, Due to Suppliers. New semesters
  cannot be added before they start (`RESTRICT_FUTURE_SEMESTERS`, `newSemesterBlock`): only the semester right after the current one is blocked until the current one ends; later school years can be added so carry-forward can be tested.
