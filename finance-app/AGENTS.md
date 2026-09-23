# StatementStudio — Agent Handoff

Fund-accounting web app for a student organization thesis project. React 18 + TypeScript + Vite,
Tailwind CSS, **localStorage only — no backend, no database**. All state lives in one React
Context and is per-browser (nothing syncs across devices).

This file exists so another coding agent (or a future session) can pick up work without
re-deriving context. Read it before making changes.

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

## Known bugs / gaps, not yet fixed (flagged, intentionally left alone)

- **Cash Flow "beginning cash"** (`FinancialStatements.tsx`, `cashFlowDetails`): detected via a
  heuristic (first entry in the filtered range whose description contains "capital" or
  "initial"), not a real cumulative balance. Will silently show ₱0 beginning cash for any period
  that doesn't start with a matching entry. Needs the same cumulative-as-of-just-before-startDate
  treatment `beginningFundBalance` already got.
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
- `src/lib/cashFlow.ts` + test, `src/pages/FinancialStatements.tsx` — cumulative beginning cash,
  financing/investing classification, and selectable custom FS set.
- `src/lib/closingEntries.ts` + test, `src/pages/FinancialStatements.tsx` — closing entries remain
  in ledger/point-in-time balances but are excluded from period-performance presentation, so a
  post-close Statement of Activities retains the original revenue/expense categories without
  double-counting the closed surplus on the Balance Sheet.
- `src/lib/reviewEngine.ts` + test, `src/pages/Review.tsx` — unified Review history plus donated
  sponsorship usage/spoilage and temporary-restriction release workflow.
- `src/components/Navbar.tsx` — the fiscal-year selector is a custom dropdown rather than a native
  `<select>`, so its popup reliably follows the light/dark theme instead of inheriting a white or
  blank-looking operating-system menu.
