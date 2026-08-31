'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { registerAgentAction } from '@/lib/auth-actions';
import { PasswordInput } from '@/components/PasswordInput';
import Link from 'next/link';

function Field({ label, id, type = 'text', required = false, placeholder, autoComplete }: {
  label: string; id: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {type === 'password' ? (
        <PasswordInput id={id} name={id} required={required} placeholder={placeholder} autoComplete={autoComplete} />
      ) : (
        <input
          id={id} name={id} type={type} required={required}
          placeholder={placeholder} autoComplete={autoComplete}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}
    </div>
  );
}

export function AgentRegisterForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { status: string; error?: string } | null, formData: FormData) => {
      const password = formData.get('password') as string;
      const confirm = formData.get('confirmPassword') as string;
      if (password !== confirm) return { status: 'error', error: 'Passwords do not match' };
      if (password.length < 8) return { status: 'error', error: 'Password must be at least 8 characters' };

      const result = await registerAgentAction({
        firstName: formData.get('firstName') as string,
        lastName: formData.get('lastName') as string,
        email: formData.get('email') as string,
        password,
        cellPhone: formData.get('cellPhone') as string,
        officePhone: (formData.get('officePhone') as string) || undefined,
        dreLicenseNumber: (formData.get('dreLicenseNumber') as string) || undefined,
      });
      if (result.error) return { status: 'error', error: result.error };
      return { status: 'success' };
    },
    null,
  );

  if (state?.status === 'success') {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-2">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Check your email</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          We sent a verification link to your email address. Click it to activate your account and sign in.
        </p>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Your account will be created as an Independent Agent. Start creating transactions immediately after verification.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="First name" id="firstName" required placeholder="Jane" />
        <Field label="Last name" id="lastName" required placeholder="Smith" />
        <Field label="Email address" id="email" type="email" required placeholder="jane@example.com" autoComplete="email" />
        <Field label="Cell phone" id="cellPhone" type="tel" required placeholder="+1 (555) 000-0000" />
        <Field label="Office phone" id="officePhone" type="tel" placeholder="+1 (555) 000-0000" />
        <Field label="DRE #" id="dreLicenseNumber" placeholder="e.g. 01234567" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Password" id="password" type="password" required placeholder="Min. 8 characters" autoComplete="new-password" />
        <Field label="Confirm password" id="confirmPassword" type="password" required placeholder="Re-enter password" autoComplete="new-password" />
      </div>

      {state?.status === 'error' && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {isPending ? 'Creating account\u2026' : 'Create Independent Agent Account'}
      </button>
    </form>
  );
}
