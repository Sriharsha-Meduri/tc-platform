'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { searchCoordinatorsAction, assignCoordinatorAction } from '@/lib/auth-actions';
import type { SearchCoordinatorResult } from '@/lib/auth-actions';

interface Props {
  transactionId: string;
  currentCoordinatorAccountId: string | null;
}

export function AssignCoordinatorForm({ transactionId, currentCoordinatorAccountId }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchCoordinatorResult[]>([]);
  const [selected, setSelected] = useState<SearchCoordinatorResult | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }

    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const result = await searchCoordinatorsAction(query);
        if (result.results) setResults(result.results);
      });
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function handleSelect(coordinator: SearchCoordinatorResult) {
    setSelected(coordinator);
    setQuery('');
    setResults([]);
  }

  function handleClear() {
    setSelected(null);
  }

  function handleSave() {
    setError(null);
    startSave(async () => {
      const result = await assignCoordinatorAction(transactionId, selected?.id ?? null);
      if (result.error) { setError(result.error); return; }
      setSuccess(true);
      setTimeout(() => { setSuccess(false); router.refresh(); }, 2000);
    });
  }

  return (
    <div className="space-y-5">
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Coordinator assigned successfully!
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Current Coordinator</label>
        {currentCoordinatorAccountId ? (
          <p className="text-sm text-gray-500">A coordinator is currently assigned (ID: {currentCoordinatorAccountId})</p>
        ) : (
          <p className="text-sm text-gray-500 italic">No coordinator assigned</p>
        )}
      </div>

      {!selected ? (
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
            Search for a Coordinator
          </label>
          <input
            id="search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type name or email (min. 2 characters)"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {isSearching && <p className="text-xs text-gray-400 mt-1">Searching&hellip;</p>}
          {results.length > 0 && (
            <ul className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{r.displayName}</span>
                    <span className="text-gray-500 ml-2">{r.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.length >= 2 && !isSearching && results.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No coordinators found</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">{selected.displayName}</p>
            <p className="text-xs text-blue-700">{selected.email}</p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Change
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
        >
          {isSaving ? 'Saving&hellip;' : selected ? 'Assign Coordinator' : 'Remove Coordinator (unassign)'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}