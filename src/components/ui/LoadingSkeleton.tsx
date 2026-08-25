import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-gray-200', className)} />;
}

export function MetricGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-7 w-4/5" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-full bg-gray-100" />
          <Skeleton className="mt-2 h-3 w-3/4 bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm', className)} role="status" aria-label="Loading">
      <div className="grid gap-4 border-b border-gray-100 bg-gray-50 px-4 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-2/3 bg-gray-200" />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid gap-4 px-4 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-4 bg-gray-100', columnIndex === 0 ? 'w-4/5' : 'w-2/3')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-5 shadow-sm', className)} role="status" aria-label="Loading">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full bg-gray-100" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-24 bg-gray-100" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-24 w-full bg-gray-100" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function DetailListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-56 max-w-full" />
            <Skeleton className="h-3 w-4/5 bg-gray-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28 rounded-xl bg-gray-100" />
            <Skeleton className="h-28 rounded-xl bg-gray-100" />
          </div>
        </div>
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
