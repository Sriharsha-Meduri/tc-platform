// Instant skeleton shown while the dashboard's data loads (Next.js streams this
// in place of the page content, inside the sidebar layout).
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-6 w-32 rounded bg-gray-200" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="mb-3 h-6 w-16 rounded-lg bg-gray-100" />
            <div className="h-8 w-12 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Transactions list */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-4 h-4 w-24 rounded bg-gray-200" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl border border-gray-200 p-5">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/2 rounded bg-gray-200" />
                <div className="h-3 w-1/3 rounded bg-gray-100" />
                <div className="h-3 w-2/3 rounded bg-gray-100" />
              </div>
              <div className="h-4 w-16 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
