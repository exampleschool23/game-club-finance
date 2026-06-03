export default function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Page title skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-lg bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-100" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-gray-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-7 w-32 rounded bg-gray-200" />
                <div className="h-3 w-16 rounded bg-gray-100" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content area skeleton */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-5/6 rounded bg-gray-100" />
          <div className="h-4 w-4/6 rounded bg-gray-100" />
          <div className="mt-4 h-48 w-full rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
