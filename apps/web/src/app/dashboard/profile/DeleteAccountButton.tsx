'use client';

import { useState } from 'react';
import { deleteAccountAction } from '@/lib/auth-actions';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export function DeleteAccountButton() {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  if (!confirmed) {
    return (
      <button
        type="button"
        onClick={() => setConfirmed(true)}
        className="w-full rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
      >
        <Trash2 size={14} />
        Delete account
      </button>
    );
  }

  const handleDelete = async () => {
    setPending(true);
    setError(null);
    const result = await deleteAccountAction();
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.push('/login');
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-medium text-red-800">
        Are you sure? This will permanently delete your account and all associated data.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Deleting...' : 'Yes, delete my account'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmed(false)}
          disabled={pending}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
