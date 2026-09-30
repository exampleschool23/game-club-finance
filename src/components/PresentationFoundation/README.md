# PresentationFoundation

The single home for reusable presentational components. Pages under
`src/app` compose these; they should not hand-write button, input, card,
alert, modal, badge or table markup.

Import from the barrel:

```tsx
import { Button, Card, Field, Input, InlineAlert, PageHeader } from '@/components/PresentationFoundation';
```

| Need | Use |
|---|---|
| Page title, description, actions, back link | `PageHeader` |
| White panel / section | `Card` (+ `SectionHeading`, `CardHeader`, `CardBody`, `CardFooter`) |
| Any clickable action | `Button` (`variant`: primary, outline, secondary, ghost, danger, dangerOutline, success), `ButtonLink` for navigation, `IconButton` for icon-only |
| Text / money / select / textarea | `Field` + `Input` / `CurrencyInput` / `Select` / `Textarea` / `Checkbox` |
| Multi-select option tiles (payment methods, page access) | `Checkbox variant="card"` |
| Person or product initials | `Avatar` (`tone`: primary for people, neutral for products) |
| Search box | `SearchInput` |
| Mutually exclusive choice (payment method, tabs, filters) | `SegmentedControl` (`variant`: solid, soft, chips) |
| Whole-number quantity | `Stepper` |
| Dates and months | `DatePicker`, `DateRangePicker`, `MonthPicker` |
| Save results, errors, notes | `InlineAlert` (inline) or `useToast` (transient) |
| Destructive confirmation | `useConfirm` / `ConfirmDialog` (never `window.confirm`) |
| Dialogs | `Modal` |
| KPI numbers | `MetricCard` (formatted value), `AmountCard` (money with comparison), `StatTile` (compact) |
| Tables | `DataTable` (supports totals row, sticky header, empty state; pass `label` so keyboard users can scroll wide tables) |
| Nothing to show | `EmptyState` |
| Loading | `Skeleton`, `MetricGridSkeleton`, `TableSkeleton`, `FormSkeleton`, `DetailListSkeleton`, `ChartSkeleton`, `PageSkeleton` |

Rules of thumb:

- Components take already formatted strings for money and dates; format with
  `src/lib/formatters.ts` at the call site.
- Every icon-only control needs a `label`; every field needs a `label` or an
  `aria-label`.
- Use the `danger` / `success` / `primary` / `warning` colour tokens rather
  than raw Tailwind reds and greens so the palette stays consistent.
- Money and prices: `Money` shows the translated currency (сум / so'm / UZS)
  by default; `CurrencyInput` keeps the caret in place while separators move
  and ignores a pasted decimal part ("1 500,50" → 1 500).
- Dialogs stack: `Modal`, `ConfirmDialog`, the date/month pickers and the
  mobile drawer register with one modal stack, so Escape and the Tab focus trap
  only act on the top dialog. A bespoke overlay must use `useModalLayer` +
  `trapFocus` from `./Modal` to join it.
- `SegmentedControl` is a radio group: one Tab stop, arrow keys move and select.
- Toasts appear at the top on phones (never over a bottom sheet's Save button)
  and bottom-right on larger screens; errors stay 8 s and pause on hover/focus.
