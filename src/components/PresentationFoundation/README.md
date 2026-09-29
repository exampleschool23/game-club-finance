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
| Search box | `SearchInput` |
| Mutually exclusive choice (payment method, tabs, filters) | `SegmentedControl` (`variant`: solid, soft, chips) |
| Whole-number quantity | `Stepper` |
| Dates and months | `DatePicker`, `DateRangePicker`, `MonthPicker` |
| Save results, errors, notes | `InlineAlert` (inline) or `useToast` (transient) |
| Destructive confirmation | `useConfirm` / `ConfirmDialog` (never `window.confirm`) |
| Dialogs | `Modal` |
| KPI numbers | `MetricCard` (formatted value), `AmountCard` (money with comparison), `StatTile` (compact) |
| Tables | `DataTable` (supports totals row, sticky header, empty state) |
| Nothing to show | `EmptyState` |
| Loading | `Skeleton`, `MetricGridSkeleton`, `TableSkeleton`, `FormSkeleton`, `DetailListSkeleton`, `ChartSkeleton`, `PageSkeleton` |

Rules of thumb:

- Components take already formatted strings for money and dates; format with
  `src/lib/formatters.ts` at the call site.
- Every icon-only control needs a `label`; every field needs a `label` or an
  `aria-label`.
- Use the `danger` / `success` / `primary` / `warning` colour tokens rather
  than raw Tailwind reds and greens so the palette stays consistent.
