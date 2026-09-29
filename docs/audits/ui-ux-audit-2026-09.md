# UI/UX audit and PresentationFoundation refactor (September 2026)

Scope: every page, every button, loading behaviour, reuse, and dead code.
No database records were read for writing purposes and no data was changed;
the audit was performed on the code, followed by a refactor that keeps every
query, RPC, and calculation exactly as it was.

## 1. How pages load

**Answer to "does it load once or when I tap a drawer button?": it loads
when you tap.** Every dashboard route is a client component that fetches its
own data in a mount effect. Navigating with the sidebar unmounts the previous
page and mounts the next one, so each tap triggers that page's reads.

| Layer | Behaviour |
|---|---|
| Shell (`DashboardShell`) | Server layout bootstraps the user, memberships, clubs and feature access once per request. The shell keeps club/date context and never refetches on navigation. |
| Dashboard `/` | Server component runs `get_dashboard_snapshot` and hands the result to the client; the client skips its own fetch when the snapshot matches the club and range. Below-the-fold charts wait for an IntersectionObserver. |
| Every other page | Client `useEffect` fetch on mount, on club change, and on date/range change. |
| Cache | `src/lib/supabase/readCache.ts`: a 15-second in-memory cache for GET reads and whitelisted read-only RPCs, cleared on any mutation. Returning to a page within 15 seconds reuses the response; after that it refetches. |
| Sidebar prefetch | Links prefetch on hover/focus/touch except `/` (its server response embeds live totals). |

Findings fixed in this pass:

- Stale-request guards were missing on Closing Stock, Products, Debts, Team and
  Stock Purchase; a fast club switch could paint another club's rows. All
  fetchers now carry a request sequence and ignore late responses.
- Daily Cash cleared its own success message inside the refetch, so "saved"
  was never visible, and every save swapped the page for a skeleton. Saves now
  refetch silently and confirm with a toast.
- Owner Profit, Products, Reports, Team and Salaries also refetched with a full
  skeleton after each mutation; they now keep the previous data on screen.
- Stock Purchase searched on every keystroke and refetched three times after
  one save; search is debounced (300 ms) and the post-save reload is one pass.
- The expense dialog re-read every expense row each time it opened; the report
  page now loads custom categories once per club and passes them down.
- Money-details pages did not clamp `from > to` and their back button used
  browser history; they now share one component with an on-page range picker.
- Report pickers had no `max`, allowing future dates; all pickers are capped at
  the business date.

Not changed (documented for a later decision): pages still refetch on every
navigation after the 15-second cache window. A shared client cache (SWR or
React Query) would remove that but is a dependency and architecture decision.

## 2. PresentationFoundation

All reusable presentational components now live in
`src/components/PresentationFoundation` (see its `README.md`). The old
`src/components/ui` folder, `components/dashboard/MetricCard`, the unused
`LowStockTable`, `StatCard`, `FormSection`, and the global `.btn-*`,
`.input-field`, `.label`, `.card`, `.badge-*`, `.stat-card` CSS classes are
gone. Every page composes:

- `Button`, `ButtonLink`, `IconButton`, `Stepper`
- `Field`, `Input`, `CurrencyInput`, `Select`, `Textarea`, `Checkbox`, `SearchInput`, `SegmentedControl`
- `DatePicker`, `DateRangePicker`, `MonthPicker`
- `Card`, `CardHeader/Body/Footer`, `SectionHeading`, `PageHeader`
- `InlineAlert`, `Toast`/`useToast`, `Modal`, `ConfirmDialog`/`useConfirm`, `EmptyState`, `Badge`, `Money`
- `MetricCard`, `AmountCard`, `StatTile`, `DataTable`, skeletons

Duplicated code merged: the two money-details pages (~800 lines) into one
`MoneyDetailsPage`; four pie charts into `PieBreakdownChart`; horizontal bar
lists, chart legends, axis formatting into `ChartCard`; whole-number input
guards into `src/lib/closingStock.ts`; the expense category list is exported
once from `ExpensesPanel`.

## 3. Per-page UX changes

- **Login**: labelled fields, one error style, spinner buttons, `useSearchParams` wrapped in Suspense (previously a build-time deopt risk), untranslated provider errors replaced by the translated login error.
- **Shell / sidebar**: translated aria labels on the menu buttons, sign-out is a labelled icon button with a pending state, focus rings on nav links.
- **Dashboard**: header uses `PageHeader` with the range picker in the action slot; range capped at today; error banner announces; section tints lightened; payment-method pie total now matches its slices (previously percentages could exceed 100%).
- **Daily Cash**: inputs are labelled, delete asks for confirmation, "Reports" link now goes to `/reports`, the no-op "Edit" button was removed, the saved-entry grid hides payment methods the club disabled, the countdown timer only runs for non-owners, hard-coded "Admin"/"UZS" strings removed.
- **Reports**: filter select has a chevron, delete uses a confirm dialog, success is a toast, rows no longer override `<tr>` semantics (the type badge is a real button), no-access state is explained.
- **Expense form**: one segmented-control style, focus moves to the custom-category input, comment counter, date capped at today.
- **Daily/Monthly report**: `DataTable` with totals row and sticky date column, pickers capped, debt income coloured as a warning rather than a loss.
- **Money details**: on-page date range, `Link` back to the dashboard, consistent `1 000 000` formatting (previously locale-dependent commas), total tiles use design tokens.
- **Closing Stock**: page header with actions, read-only/historical banner only when relevant, stepper controls with labels, category chips are a radio group, filtered empty state can clear filters, KPI "Total products" no longer changes with the search box.
- **Bulk update**: stepper component, footer inside the modal instead of negative margins, consistent clamping on plus/minus.
- **Stock Purchase**: dead "Filters" and per-row "+" buttons removed, second submit button removed, product select shows a loading placeholder and a proper prompt, labelled inputs with focus rings, delete confirm dialog, toast feedback, debounced search, status badge reflects real stock.
- **Products**: shared `Modal` (Escape, backdrop, focus), Enter submits, confirm dialog for delete, labelled inputs, category suggestions via datalist, hard-coded English hint translated, per-row move spinner.
- **Debts**: shared `Modal`, labelled fields, payment methods as a radio group, paid debts collapsed behind a toggle, outstanding total badge, toasts.
- **Owner Profit**: confirm dialog, silent refetch, inline validation for the amount, consistent money formatting.
- **Salaries**: readable component, skeletons for the employee grid and history, deactivate asks for confirmation, changing the entry kind no longer wipes the typed amount, `DataTable` for the monthly breakdown, translated formatting with the app locale.
- **Team**: toasts instead of persistent banners, confirm dialog for removal, protected-owner explanation next to the role field, search with clear button, stale-request guard, unused props/fields removed.
- **Settings**: business-day start is an hour `Select` (the native time input silently dropped minutes), account card shows a loading state, toasts for saves, list semantics on the club picker.
- **Test checklist**: fully translated, uses the selected-club cookie instead of the first membership, owner-only (matches the route permission), the always-true "net profit" check now validates the number.

## 4. Unused code removed

- `src/components/ui/*` (replaced), `components/dashboard/MetricCard.tsx`, `components/dashboard/LowStockTable.tsx` (never imported), `layout/DashboardContentLoading.tsx`, `settings/SettingsPage.tsx` wrapper.
- Global CSS component classes (all replaced by components).
- Dead exports with no references in app, tests or scripts: `getServerUser`, `getServerProfile`, `DEFAULT_PAGE_SIZE`, `DEFAULT_BUSINESS_DAY_START_HOUR`, `sumBarSales`, `parseLocalIsoDate`, `summarizeExpenseCategories`; `parseClosingStockNumber` and `createClosingStockDraft` are now module-private.
- Unused props: `TeamPageClient.currentUserId`, `SettingsPageClient.{email,fullName,role}`, `TeamMembership.createdAt/updatedAt`.

Kept on purpose: `src/lib/calculations` exports that are only referenced by
tests are canonical formulas per `AGENTS.md`; migration-compatibility fallback
paths in every page are required by invariant 8.

## 5. Verification

`npm run typecheck`, `npm run lint`, `npm test` (56 files, 464 tests) and
`npm run build` all pass. A live browser walkthrough was not possible in this
environment (no Supabase credentials), so the page changes were verified by
type checking, build, and code review.
