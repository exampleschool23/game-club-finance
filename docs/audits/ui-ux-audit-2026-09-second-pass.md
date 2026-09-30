# UI/UX audit — second pass (30 September 2026)

Follow-up to `ui-ux-audit-2026-09.md`. Scope: every page, button and loading
path, reuse through `PresentationFoundation`, and unused code. Nothing was
written to any database: the audit is code review plus a local run of the app
with no Supabase connection (login page and redirects only). Every write still
goes to the same tables, RPCs and columns; some writes are now *blocked*
earlier (validation, confirmations, club-switch guards).

## 1. Loading: what happens when a drawer item is tapped

1. The tapped item highlights at once, a thin progress bar appears, and the
   drawer closes.
2. Next.js requests the route from the server (all dashboard routes are
   dynamic because the layout reads auth cookies). Links prefetch on
   hover/focus/touch only.
3. **New:** `src/app/(dashboard)/loading.tsx` shows the page skeleton inside
   the shell while that request runs (previously the old page stayed on
   screen with only the thin bar).
4. The page mounts and runs its own Supabase reads in a `useEffect`; the
   15-second `readCache` serves quick revisits.

So pages load **when you tap**, not once up front. Fixed in this pass:

| Problem | Fix |
|---|---|
| Saving in Settings/Team called `refreshClubs()`, which swapped the whole page for a skeleton (toast lost, form reset, full refetch) | Refreshes after the first load are silent |
| A network error while reading memberships showed "Pending approval" to existing members | Error is thrown; previous memberships kept; shell shows a retry message on first load |
| Server computed "today" in UTC, browsers in Tashkent → wrong server snapshot and a refetch for ~5 h a day | `serverTodayIso` (Asia/Tashkent) for server code |
| Browser Back to `/` showed pre-save totals | Server snapshot carries `generatedAt`; older than 15 s is refetched silently |
| Dashboard charts unmounted on every range change | Charts stay mounted with a busy state |
| Money-details range change did a server round trip; language change refetched | URL updated with `history.replaceState`; labels translated at render |
| Progress bar could stick after an aborted navigation | Clears after 10 s and on every route change |
| No `error.tsx` / `not-found.tsx` (Next's unstyled English page) | Translated boundaries that keep the shell |
| Closing stock: skeleton flash after save, double load on club switch, stale reload after changing date mid-save | Silent reload keyed on club+date; date picker locked while saving |
| Stock purchase: products list had no stale guard; duplicate fetch when searching from page 2 | Request sequence; page reset inside the debounce |

## 2. Bugs fixed (data safety first)

- **Closing stock:** a cleared count input saved "everything sold"; now blocked
  (`closing_required` / `sold_required`). Bulk-save errors were hidden behind
  the modal. Unsaved edits are confirmed before changing date and on leave.
- **Stock purchase:** after a club switch the form kept the previous club's
  product; viewers saw an active form the RPC rejects.
- **Products:** inactive (not archived) products could never be reactivated;
  an update matching 0 rows reported success; a low-stock threshold of 0 became 5;
  reorder wrote every product instead of the changed rows.
- **Debts, Reports expense form, Daily cash, Owner profit:** open dialogs
  survived a club switch and could write into the newly selected club; saves
  without try/finally could leave a locked modal; zero-row updates/deletes
  reported success.
- **Team:** "Add access" offered clubs the user does not own; promoting to or
  demoting an owner now asks for confirmation.
- **Salaries:** switching to "new employee" kept the selected employee's id
  (saving updated that employee); shared saving/error state across forms.
- **Login:** `?error=` rendered raw provider text; sign-in could spin forever;
  after login users now return to the page they opened (`?next=`, same-origin
  only, validated in `safeRedirectPath`).
- **Money input:** pasting `1 500,50` saved 150 050; the caret jumped to the end
  on every keystroke.
- **Modals:** Escape inside a date picker closed the form modal underneath and
  discarded it; no focus trap.

## 3. PresentationFoundation additions

`Avatar`, `Checkbox variant="card"`, a shared modal stack (`useModalLayer`,
`trapFocus`) used by `Modal`, the date/month pickers and the mobile drawer,
keyboard radio behaviour in `SegmentedControl`, `DataTable` scroll-region
`label` and keyboard rows, translated `Money`/`AmountCard` currency and
skeleton/metric loading labels, top-of-screen toasts on phones. Pages replaced
bespoke checkboxes, role pills, avatars, tiles and headings with these.

## 4. Other UX

Sidebar highlights the section for nested routes, is a proper dialog on
phones (focus, Escape, scroll lock), appears from 1024 px (`lg`) instead of
1280 px, has a skip link and translated role/app name. Sign-out is one hook
that hard-navigates to `/login`. Error states everywhere show translated text
with a Retry button and never alongside a misleading empty state. Delete
confirmations name what is being deleted. Wide tables have a sticky first
column. Quantities use thousands separators; unit costs keep fractions.

## 5. Unused code removed

- npm packages: `react-hook-form`, `@hookform/resolvers`, `notosans-fontface`.
- 91 unused translation keys in each locale (en/ru/uz kept identical).
- `DateContext` / `useDashboardDate` (no consumers) and its per-render state.
- Needless exports: `FEATURE_KEYS`, `APP_LOCALES`, `addDays` and the
  duplicate barMoney re-exports in `dashboardMetrics`.

Candidates left for a decision:

- Excel import in `src/lib/closingStock.ts` (`parseClosingStockImport*`,
  `selectClosingStockImportRows`, `applyClosingStockImport`) has no UI and is
  used only by tests; its types are shared with the draft code, so removal
  is a small refactor.
- Validation helpers used only by tests (`validateAmount`, `validateQuantity`,
  `validateDate`, `validateClosingStock`, `validateEditWindow`, `validateAll`).
- Redirect-only routes `/expense`, `/expenses`, `/balance`, `/income` are kept
  for old bookmarks.

## 6. Not done

- A visual pass in a signed-in browser (no Supabase credentials in this
  environment).
- A shared client cache (SWR/React Query) so revisiting a page after 15 s does
  not refetch — an architecture decision.
- Closing-stock sold-entry mode still depends on the club name containing
  "pixel"; a proper club setting needs a migration.

## 7. Verification

`npm run typecheck`, `npm run lint`, `npm test` (57 files, 494 tests) and
`npm run build` pass.
