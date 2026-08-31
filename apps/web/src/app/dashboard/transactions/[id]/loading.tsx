import { Skeleton } from '@/components/Skeleton';

export default function TransactionLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3 w-40 bg-gray-100" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full bg-gray-100" />
          </div>
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full bg-gray-100" />
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-32 w-full bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
