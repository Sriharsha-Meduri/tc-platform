'use client';

import { useState, useActionState, useEffect } from 'react';
import { registerWithInviteAction, getInviteInfoAction } from '@/lib/auth-actions';
import { PasswordInput } from '@/components/PasswordInput';
import Link from 'next/link';

export function InviteRegisterForm({ token }: { token: string }) {
  const [info, setInfo] = useState<{ email: string; organizationName: string } | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  useEffect(() => {
    getInviteInfoAction(token).then((result) => {
      if (result.error) setInfoError(result.error);
      else if (result.info) setInfo(result.info);
    });
  }, [token]);

  const [state, formAction, isPending] = useActionState(
    async (_prev: { status: string; error?: string } | null, formData: FormData) => {
      const password = formData.get('password') as string;
      const confirm = formData.get('confirmPassword') as string;
      if (password !== confirm) return { status: 'error', error: 'Passwords do not match' };
      if (password.length < 8) return { status: 'error', error: 'Password must be at least 8 characters' };

      const result = await registerWithInviteAction({
        token,
        password,
        firstName: formData.get('firstName') as string,
        lastName: formData.get('lastName') as string,
        cellPhone: formData.get('cellPhone') as string,
      });
      if (result.error) return { status: 'error', error: result.error };
      return { status: 'success' };
    },
    null,
  );

  if (infoError) {
    return (
      <div className="text-center py-6">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Invalid or Expired Invitation</h2>
        <p className="text-sm text-gray-500 mb-4">{infoError}</p>
        <Link href="/login" className="text-sm font-medium text-blue-700 hover:text-blue-800">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state?.status === 'success') {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-2">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Account Created!</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Your account is ready. You can now sign in.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
          Sign in
        </Link>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-500">Loading invitation details\u2026</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        You&apos;ve been invited to join <strong>{info.organizationName}</strong>
        <br />as <strong>{info.email}</strong>
      </div>
      <input type="hidden" name="token" value={token} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input
            id="firstName" name="firstName" required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Jane"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            id="lastName" name="lastName" required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Smith"
          />
        </div>
      </div>
      <div>
        <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700 mb-1">
          Cell phone <span className="text-red-500">*</span>
        </label>
        <input
          id="cellPhone" name="cellPhone" type="tel" required
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="+1 (555) 000-0000"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password <span className="text-red-500">*</span>
          </label>
          <PasswordInput
            id="password" name="password" required
            autoComplete="new-password"
            placeholder="Min. 8 characters"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm password <span className="text-red-500">*</span>
          </label>
          <PasswordInput
            id="confirmPassword" name="confirmPassword" required
            autoComplete="new-password"
            placeholder="Re-enter password"
          />
        </div>
      </div>
      {state?.status === 'error' && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {isPending ? 'Setting up account\u2026' : 'Accept invitation & set password'}
      </button>
    </form>
  );
}