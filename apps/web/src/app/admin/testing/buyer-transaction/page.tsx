import { notFound } from 'next/navigation';
import BuyerTransactionTestCenterClient from './BuyerTransactionTestCenterClient';

export const dynamic = 'force-dynamic';

export default async function BuyerTransactionTestCenterPage() {
  // Guard — hide in production. Belt-and-suspenders alongside the API's own
  // NonProductionGuard and the conditional AdminTestingModule registration.
  if (process.env.NEXT_PUBLIC_APP_ENV === 'production') notFound();

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Buyer Transaction Test Center</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Drives the real buyer-side transaction lifecycle end to end using the exact same
          production services the app uses — never a separate test implementation. Not
          available in production.
        </p>
      </div>

      <BuyerTransactionTestCenterClient />
    </div>
  );
}
