# Dark Mode Completion Plan

## Goal

Finish the dark-mode pass described in the repository TODOs. Make the application shell and listed pages readable in dark mode while preserving accounting content, calculations, navigation, print/export behavior, and the existing light theme.

## Inputs checked

- `../TODO.md` narrows a task to `src/pages/FinancialStatements.tsx`: dark-theme classes only, with no logic, layout, export, print, or statement-format changes.
- `TODO.md` in this directory tracks the broader unfinished dark-mode pass for shared theme primitives and the Transactions, Journal Entries, General Ledger, Trial Balance, Financial Statements, Analytics, Projects, and Settings pages.
- The available PNGs under `../.codex-temp/format-fs-inspection/` are spreadsheet-reference screenshots (COA, SCF, SFP, SOA). They are viewable, but are not screenshots of the running app and do not establish UI completion.
- No application UI screenshots were found in the workspace files checked.

## Work sequence

1. **Baseline and inventory**
   - Read the app instructions and both TODOs.
   - Inspect the shared theme setup and each page listed below.
   - Record which light-only surfaces remain and which dark styles already work; do not infer completion from a TODO checkbox alone.
2. **Implement the scoped dark-mode styling**
   - Add or reuse the smallest set of shared card, input, table, and section styles needed by the listed pages.
   - Update only theme-related classes and chart/table theme colors. Keep page structure, accounting logic, report calculations, and actions intact.
   - Keep Financial Statements' printable report canvas white; make its surrounding application UI dark-aware.
3. **Static verification**
   - Run the repository's type check, test suite, and production build.
   - Review the diff for unintended logic, layout, export, print, or statement-format changes.
4. **Browser verification**
   - Run the app on the port Vite actually reports.
   - Open every affected page in dark mode and inspect the relevant surfaces and controls, including tables, forms, drawers, alerts, charts, and the Financial Statements report canvas.
   - Switch back to light mode on representative pages to catch regressions.
   - Use only an authorized existing workspace for any signed-in flow; do not fabricate financial records.
5. **Completion audit**
   - Revisit every checklist item and mark it complete only with code or browser evidence.
   - Report any inaccessible or unverified browser state explicitly instead of calling the work fully done.

## Page-by-page audit checklist

- [x] Shared theme primitives and app shell (source review)
- [x] Transactions: category selection, forms, inputs, tables, and previews (source review)
- [x] Journal Entries: filters, table headers/rows, and expanded breakdown (source review; expanded breakdown gaps fixed)
- [x] General Ledger: search, account cards, and nested tables (source review; supplier/payee table gaps fixed)
- [x] Trial Balance: status alert, table, and totals footer (source review)
- [x] Financial Statements: outer page and controls are dark-aware; print/report styling reviewed (source review)
- [x] Analytics: KPI cards, chart containers, legends, and chart labels (source review)
- [x] Activities & Programs: cards, add form/drawer, status chips, and progress (source review; missing form styles fixed)
- [x] Settings: forms, Chart of Accounts editor, and controls (source review)
- [x] Final contrast sweep of common light-only color classes across the listed pages (source sweep; browser review remains open)

## Success criteria

- Each listed page is checked in the browser with dark mode enabled, with no unreadable text, blank/light-only containers, or invisible controls in the reviewed surfaces.
- Financial Statements retains its existing white print/report canvas and unchanged accounting calculations and actions.
- Light mode remains usable after the styling changes.
- Type check, tests, and production build pass; task-specific edits are limited to intended theme styling and status documentation.
- The final report names any requirements that could not be verified and the evidence for each completed item.

## Progress

- [x] Plan written before application code changes.
- [x] Reference screenshots checked and identified as spreadsheet screenshots, not app UI screenshots.
- [x] Baseline source audit completed for the listed pages; most areas already had dark variants.
- [x] Added dark variants to the confirmed Projects form and Journal Entries/General Ledger nested-table gaps.
- [x] Tests passed: 30 files, 304 tests.
- [x] Production build passed against the latest shared worktree (with the existing large-chunk-size warning).
- [ ] Type check currently reports two errors in the concurrently edited `src/context/FinanceContext.tsx`: an incompatible `transactionDetails` object at line 1352 and an empty-string semester passed where `Semester` is required at line 1539.
- [ ] Browser review of authenticated accounting pages. The local browser reached `/login`, with no existing organization session available, so the protected pages could not be inspected without creating test financial data.
- [ ] Final completion audit.

## Concurrent worktree note

While this task was in progress, additional accounting changes appeared in `FinanceContext.tsx`, `transactionCategories.ts`, `Transactions.tsx`, and `Review.tsx`. They are outside this theme task and were preserved. They currently include two Chart of Accounts entries using code `5300` and the type-check errors listed above; resolve these before treating the combined working tree as verified.
