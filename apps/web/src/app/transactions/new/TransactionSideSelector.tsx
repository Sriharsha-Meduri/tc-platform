'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, HandCoins, Lock, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRANSACTION_FEATURES } from '@tc/shared';
import {
  storeTransactionSide,
  TRANSACTION_SIDE_SPECS,
  TRANSACTION_SIDE_VALUES,
  type TransactionSideValue,
} from '@/lib/transaction-side';

/**
 * Step 0 of transaction creation — the user must pick which side of the
 * transaction they are coordinating (Buyer or Seller) before the existing
 * upload/review workflow begins. The selection is persisted to sessionStorage
 * (tc_transaction_side) and carried through to the API at extract time.
 */
export default function TransactionSideSelector() {
  const router = useRouter();

  function choose(side: TransactionSideValue) {
    storeTransactionSide(side);
    router.push('/transactions/new/contract');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Dashboard
        </Link>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-700 flex items-center justify-center">
            <span className="text-white text-xs font-bold">TC</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">New Transaction</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Which side of the transaction are you coordinating?</h1>
          <p className="text-sm text-gray-500 mt-2">
            Your selection determines the workflow, documents, and parties TC manages on your behalf.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {TRANSACTION_SIDE_VALUES.map((side) => {
            const spec = TRANSACTION_SIDE_SPECS[side];
            const isBuyer = side === 'BUYER';
            const isLocked =
              side === 'SELLER' && !TRANSACTION_FEATURES.sellerSideEnabled;

            if (isLocked) {
              return (
                <div
                  key={side}
                  className="text-left bg-gray-50 rounded-2xl border-2 border-gray-200 p-6 cursor-not-allowed"
                  aria-disabled="true"
                  aria-label={`${spec.label} (locked)`}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-gray-200 text-gray-400">
                    <HandCoins size={22} />
                  </div>
                  <p className="text-base font-semibold text-gray-400">{spec.label}</p>
                  <p className="text-sm text-gray-400 mt-1.5">{spec.description}</p>
                  <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-400">
                    <Lock size={13} />
                    Coming soon
                  </p>
                </div>
              );
            }

            return (
              <button
                key={side}
                type="button"
                onClick={() => choose(side)}
                className={cn(
                  'group text-left bg-white rounded-2xl border-2 p-6 shadow-sm transition-all',
                  'hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2',
                  isBuyer
                    ? 'border-gray-200 hover:border-blue-500 focus:ring-blue-300'
                    : 'border-gray-200 hover:border-emerald-500 focus:ring-emerald-300',
                )}
                aria-label={spec.label}
              >
                <div
                  className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center mb-4',
                    isBuyer ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700',
                  )}
                >
                  {isBuyer ? <UserRound size={22} /> : <HandCoins size={22} />}
                </div>
                <p className="text-base font-semibold text-gray-900">{spec.label}</p>
                <p className="text-sm text-gray-500 mt-1.5">{spec.description}</p>
                <p
                  className={cn(
                    'mt-4 inline-flex items-center gap-1 text-sm font-medium',
                    isBuyer ? 'text-blue-700' : 'text-emerald-700',
                  )}
                >
                  Continue
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </p>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">
          {TRANSACTION_FEATURES.sellerSideEnabled
            ? 'Buyer Side preserves the current transaction experience exactly. Seller Side runs the same workflow mirrored for seller-side coordination — seller-specific behavior will be refined incrementally.'
            : 'Seller Side Transaction is coming soon and is not yet available to start.'}
        </p>
      </div>
    </div>
  );
}
