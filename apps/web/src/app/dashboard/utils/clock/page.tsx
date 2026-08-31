import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import ClockPageClient from './ClockPageClient';

export const dynamic = 'force-dynamic';

export default async function VirtualClockPage() {
  // Guard — hide in production
  if (process.env.NEXT_PUBLIC_APP_ENV === 'production') notFound();

  const transactions = await api.transactions.list();
  if (!transactions || transactions.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Virtual Clock</h1>
        <p className="text-sm text-gray-500">No transactions found. Create one first.</p>
      </div>
    );
  }

  // Fetch clock settings for all transactions in parallel
  const clockSettingsList = await Promise.all(
    transactions.map((tx) => api.clock.byTransaction(tx.id)),
  );

  const rows = transactions.map((tx, i) => ({
    transaction: tx,
    clockSettings: clockSettingsList[i],
  }));

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Virtual Clock</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Advance or reset the clock for any transaction to trigger time-sensitive features
          (reminders, deadlines) without waiting real calendar time. Not available in production.
        </p>
      </div>

      <ClockPageClient rows={rows} />
    </div>
  );
}
