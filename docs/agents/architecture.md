# Architecture guide

Read this for runtime boundaries and data flow. Domain and database rules live
in their focused guides.

## Runtime shape

The application uses Next.js App Router, React, TypeScript, Supabase, Tailwind,
next-intl, and Recharts.

```text
request
  -> src/proxy.ts (cookie-aware auth routing)
  -> dashboard server layout/bootstrap
  -> client page and selected-club context
  -> Supabase query/RPC
  -> pure src/lib/calculations functions
  -> translated UI
```

`src/proxy.ts` avoids a duplicate remote `getUser()` when an auth cookie exists;
the protected dashboard layout performs the authoritative validation. Do not
move authorization entirely into cookie presence.

## Supabase clients

| Module | Use |
|---|---|
| `src/lib/supabase/client.ts` | Browser components. Singleton client with a safe read cache. |
| `src/lib/supabase/server.ts` | Server components and authenticated server reads. Uses cookies and `auth.getUser()`. |
| `src/lib/supabase/service.ts` | Trusted server-only jobs such as Telegram delivery. Bypasses RLS. |

Never import the service client into a client component. Its key is privileged.

## Authentication and club context

`getDashboardBootstrap()` authenticates the user and loads profile,
memberships, clubs, per-club feature access, business-day start, and enabled
payment methods. React `cache()` shares that work inside one server request.

`DashboardShell` owns the selected-club client context and refreshes membership
data. The selected club is remembered in the
`game-club-finance-selected-club-id` cookie. Treat that selection as UI state,
not authorization: queries still require `club_id`, and RLS must authorize it.

Navigation visibility and redirects use `src/lib/permissions.ts`. Database RLS
in migration 033 mirrors those feature gates. A new feature or route may require
changes in both places.

## Page and calculation boundaries

- Pages fetch rows and coordinate interactions.
- Pure calculations belong under `src/lib/calculations` and have colocated
  Vitest coverage.
- Cross-page data shapes live in `src/types/index.ts`.
- Data sets that may exceed 1,000 rows use `fetchAllRows` from
  `src/lib/supabase/pagination.ts`.
- The dashboard prefers `get_dashboard_snapshot`; closing stock prefers
  `get_latest_stock_closings`. Both retain temporary direct-query fallbacks for
  deployments where the application arrives before the database migration.

Do not copy a financial formula into a page to avoid importing a calculation.
That creates divergent dashboard, report, and Telegram totals.

## Localization

`next-intl` uses `src/messages/en.json`, `ru.json`, and `uz.json`. The application
time zone is `Asia/Tashkent`. Add the same key and compatible interpolation
arguments to all three locale files in one change.

## Telegram pipeline

The scheduled server route is separate from browser auth and uses the service
client:

```text
Supabase rows -> financial calculations -> localized report -> SVG/PNG
  -> Telegram sendPhoto (or pre-dispatch text fallback) -> delivery ledger
```

Read `docs/runbooks/telegram-report.md` before changing this pipeline.

