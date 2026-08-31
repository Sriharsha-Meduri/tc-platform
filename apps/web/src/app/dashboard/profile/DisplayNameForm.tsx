'use client';

import { useActionState, useState } from 'react';
import { updateDisplayNameAction } from '@/lib/auth-actions';
import { Pencil } from 'lucide-react';

export function DisplayNameForm({ currentDisplayName }: { currentDisplayName: string }) {
  const [state, formAction, pending] = useActionState(updateDisplayNameAction, null);
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-lg font-semibold text-gray-900 truncate">{currentDisplayName}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="displayName"
        defaultValue={currentDisplayName}
        className="flex-1 text-lg font-semibold text-gray-900 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-sm font-medium text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && <p className="text-xs text-green-600">Saved</p>}
    </form>
  );
}
