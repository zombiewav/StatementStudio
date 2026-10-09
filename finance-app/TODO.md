# Dark Mode Completion

Detailed scope, audit evidence, and verification sequence: [`DARK_MODE_IMPLEMENTATION_PLAN.md`](./DARK_MODE_IMPLEMENTATION_PLAN.md).

## Source review

- [x] Shared dark-mode tokens and reusable app surfaces, inputs, filters, tables, and chips exist in `src/index.css`.
- [x] Transactions, Journal Entries, General Ledger, Trial Balance, Financial Statements, Analytics, and Settings already had broad dark-mode styling.
- [x] Add missing dark styling to the Projects form, error state, icons, and progress border.
- [x] Add dark styling to the Journal Entries expanded breakdown and the General Ledger supplier/payee table.
- [x] Financial Statements keeps the accounting logic unchanged; its title, controls, report navigation, and report content have dark variants.

## Verification still needed

- [x] `npm run test` — 30 files and 304 tests passed.
- [ ] `npm run type-check` — currently blocked by two errors in concurrently edited `src/context/FinanceContext.tsx` (incompatible `transactionDetails` at line 1352; empty string is not assignable to `Semester` at line 1539).
- [x] `npm run build` — passed against the latest shared worktree with an existing large-chunk warning.
- [ ] Sign in to an authorized local workspace and inspect each affected page in dark mode, then check representative pages in light mode. The current browser reaches `/login`; no signed-in workspace is available in this browser profile.
- [ ] Mark the dark-mode task fully complete after browser review and a clean type check.

## Scope rule

Keep this pass limited to theme styling. Preserve accounting calculations, posting behavior, navigation, and Financial Statements print/export behavior. Do not create fabricated financial records for browser verification.
