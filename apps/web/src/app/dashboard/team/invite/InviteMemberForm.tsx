'use client';

import { useState, useTransition } from 'react';
import { inviteMemberAction } from '@/lib/auth-actions';

const ROLES = [
  { value: 'agent', label: 'Agent' },
  { value: 'transaction_coordinator', label: 'Transaction Coordinator' },
  { value: 'manager', label: 'Manager' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'viewer', label: 'Viewer' },
];

interface Props {
  organizationId: string;
  organizationName: string;
}

export default function InviteMemberForm({ organizationId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const get = (name: string) => (f.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value.trim();

    const email = get('email');
    if (!email) { setError('Email is required'); return; }

    setError(null);
    startTransition(async () => {
      const result = await inviteMemberAction({
        email,
        role: get('role'),
        organizationId,
      });

      if (result.error) { setError(result.error); return; }
      setInvitedEmail(email);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-2">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Invitation sent</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          An invitation has been sent to <strong>{invitedEmail}</strong>. They will appear as pending once they accept.
        </p>
        <button
          onClick={() => { setSubmitted(false); setInvitedEmail(''); }}
          className="mt-4 text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Invite another person
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="colleague@example.com"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
          Role <span className="text-red-500">*</span>
        </label>
        <select
          id="role"
          name="role"
          required
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Members will inherit the permissions associated with this role.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Sending invitation…' : 'Send invitation'}
      </button>
    </form>
  );
}
