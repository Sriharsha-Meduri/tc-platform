import { cn } from '@/lib/utils';

/** A single shimmer block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-gray-200', className)} aria-hidden="true" />;
}

/** A card of shimmer rows, matching the app's list pages. */
export function ListSkeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5" aria-hidden="true">
      {title && <Skeleton className="mb-4 h-4 w-32" />}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-200 p-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2 bg-gray-100" />
            </div>
            <Skeleton className="h-4 w-16 bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A page-level skeleton: a title plus a list card. */
export function PageListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <ListSkeleton rows={rows} />
    </div>
  );
}
