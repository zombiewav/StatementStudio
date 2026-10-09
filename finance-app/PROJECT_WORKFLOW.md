# StatementStudio Project Workflow

Use this workflow for every request made in the StatementStudio project. Follow the steps in order. If a step does not apply, say why instead of silently skipping it.

## 1. Plan before changing code

- Restate the requested outcome in concrete terms.
- List the files, references, screenshots, and app areas that need inspection.
- Define what counts as complete, including the browser-visible result when the request affects the UI.
- Share this short plan before editing application source. If the user asks for a plan document, create that document before coding.

## 2. Inspect the files and references

- Read the relevant project instructions, TODOs, specs, and current source before editing.
- Check whether the referenced files exist and whether their contents are accessible.
- Find supplied screenshots and open them to confirm they are viewable. Identify whether each image is an app screenshot, a design reference, or unrelated material.
- Compare the requested behavior and visual details against the full relevant source material, not just the first visible requirement.
- If a file, screenshot, or referenced source cannot be accessed, name it and explain the resulting limit.

## 3. Check what already exists

- Inspect the current implementation, tests, app behavior, and relevant documentation before adding anything.
- Build a requirement-by-requirement checklist with evidence for what is already implemented, partly implemented, and missing.
- Inspect `git status` and the diff first. Preserve the user's uncommitted, newly added, or concurrently edited work; do not overwrite, revert, or claim those edits as yours.
- Check for conflicts or contradictory requirements and call them out before making assumptions that affect accounting behavior.

## 4. Review new or changed material

- Inspect newly supplied files, screenshots, TODO items, and worktree changes that relate to the request.
- Separate confirmed requirements from assumptions. Use the smallest reasonable interpretation when safe; ask only when ambiguity changes accounting meaning, user-visible behavior, or data handling.
- Do not invent accounts, balances, organizations, transactions, or other financial data for examples or browser checks.

## 5. Implement only the confirmed gaps

- Make the smallest change that closes a documented gap.
- Keep accounting calculations in the existing pure `src/lib/*.ts` pattern when appropriate, and add or update focused tests for non-trivial accounting logic.
- Preserve unrelated layout, workflows, saved data, and user changes.
- Re-read the exact code before context-sensitive edits. Do not make broad cleanup or speculative improvements.

## 6. Verify in the browser

- Start the app using the project instructions and use the actual port reported by Vite.
- Navigate through the affected page and exercise each requested flow. Compare the result with supplied screenshots or design references where applicable.
- Check both relevant theme states, controls, tables, empty/error/success states, and responsive layouts when they are in scope.
- Verify changes in the UI rather than assuming that source code or a successful build proves the flow works.
- Use an authorized existing workspace for signed-in financial flows. Do not fabricate records to get past login. If no authorized session is available, identify exactly what could not be checked and leave browser completion open.

## 7. Audit completion before reporting

- Revisit every acceptance criterion and mark it complete only when supported by source, automated checks, or browser evidence appropriate to that criterion.
- Run the checks required by `AGENTS.md` after code changes. Report each command's actual result, including pre-existing or concurrent failures.
- Review the final diff and `git diff --check`; keep unrelated user changes intact and identify them separately.
- Report completed, partially completed, missing, and blocked items with concise evidence. Never describe the work as fully done when a required browser flow, screenshot comparison, or other acceptance check remains unverified.

## Completion report format

For substantive work, finish with:

1. What changed and where.
2. What already existed and what gaps were fixed.
3. Checks that passed or failed.
4. What was actually verified in the browser and any remaining limitation.
5. Whether every acceptance criterion is complete.
