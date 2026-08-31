'use client';

import { useActionState } from 'react';
import { createOrganizationAction, type CreateOrganizationData } from '@/lib/admin-actions';
import Link from 'next/link';

const ORG_TYPES = [
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'team', label: 'Team' },
  { value: 'transaction_coordination_co', label: 'Transaction Coordination Co' },
  { value: 'title_company', label: 'Title Company' },
  { value: 'escrow_company', label: 'Escrow Company' },
  { value: 'lender', label: 'Lender' },
  { value: 'law_firm', label: 'Law Firm' },
];

function inputClass(error?: string) {
  return `block w-full rounded-lg border ${error ? 'border-red-300' : 'border-gray-300'} px-3 py-2.5 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`;
}

export function CreateOrganizationForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { success?: boolean; error?: string; inviteUrl?: string; organization?: { name: string } } | null, formData: FormData) => {
      const data: CreateOrganizationData = {
        name: formData.get('name') as string,
        type: formData.get('type') as string,
        licenseNumber: (formData.get('licenseNumber') as string) || undefined,
        adminEmail: formData.get('adminEmail') as string,
        adminFirstName: formData.get('adminFirstName') as string,
        adminLastName: formData.get('adminLastName') as string,
        adminPhone: (formData.get('adminPhone') as string) || undefined,
        addressLine1: (formData.get('addressLine1') as string) || undefined,
        city: (formData.get('city') as string) || undefined,
        state: (formData.get('state') as string) || undefined,
        zipCode: (formData.get('zipCode') as string) || undefined,
      };
      const result = await createOrganizationAction(data);
      return result;
    },
    null,
  );

  if (state?.success && state.inviteUrl) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <strong>Organization created!</strong> {state.organization?.name}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invite URL</label>
          <div className="flex gap-2">
            <code className="flex-1 block rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm break-all">{state.inviteUrl}</code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(state.inviteUrl); }}
              className="shrink-0 rounded-lg bg-gray-100 border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Copy
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">Share this link with the brokerage admin to set up their account.</p>
        </div>
        <Link
          href="/admin/organizations"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Back to organizations
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Organization Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input id="name" name="name" required className={inputClass()} placeholder="Acme Realty" />
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Type <span className="text-red-500">*</span>
            </label>
            <select id="type" name="type" defaultValue="brokerage" required className={inputClass()}>
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value} disabled={t.value !== 'brokerage'}>{t.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Only Brokerage is supported currently.</p>
          </div>
          <div>
            <label htmlFor="licenseNumber" className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
            <input id="licenseNumber" name="licenseNumber" className={inputClass()} placeholder="Optional" />
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Admin User</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Admin Email <span className="text-red-500">*</span>
            </label>
            <input id="adminEmail" name="adminEmail" type="email" required className={inputClass()} placeholder="admin@acmerealty.com" />
          </div>
          <div>
            <label htmlFor="adminFirstName" className="block text-sm font-medium text-gray-700 mb-1">
              First Name <span className="text-red-500">*</span>
            </label>
            <input id="adminFirstName" name="adminFirstName" required className={inputClass()} placeholder="Jane" />
          </div>
          <div>
            <label htmlFor="adminLastName" className="block text-sm font-medium text-gray-700 mb-1">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input id="adminLastName" name="adminLastName" required className={inputClass()} placeholder="Smith" />
          </div>
          <div>
            <label htmlFor="adminPhone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input id="adminPhone" name="adminPhone" type="tel" className={inputClass()} placeholder="+1 (555) 000-0000" />
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Address (Optional)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label htmlFor="addressLine1" className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
            <input id="addressLine1" name="addressLine1" className={inputClass()} placeholder="123 Main St" />
          </div>
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input id="city" name="city" className={inputClass()} placeholder="Los Angeles" />
          </div>
          <div>
            <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input id="state" name="state" className={inputClass()} placeholder="CA" />
          </div>
          <div>
            <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
            <input id="zipCode" name="zipCode" className={inputClass()} placeholder="90001" />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isPending ? 'Creating\u2026' : 'Create Organization'}
        </button>
        <Link
          href="/admin/organizations"
          className="rounded-lg bg-gray-100 border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
