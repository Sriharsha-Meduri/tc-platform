import { redirect } from 'next/navigation';
import { getSession, getAccountMembershipsAction } from '@/lib/auth-actions';
import InviteMemberForm from './InviteMemberForm';

export const metadata = { title: 'Invite team member — TC' };

export default async function InviteMemberPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { memberships } = await getAccountMembershipsAction();
  const primaryMembership = memberships?.find((m) => m.isPrimary && m.status === 'active');

  const isBrokerAdmin = primaryMembership?.role === 'broker_admin';

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Invite team member</h1>
        <p className="mt-1 text-sm text-gray-500">
          Send an invitation to join your brokerage
        </p>
      </div>

      {!primaryMembership ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-6 text-center">
          <p className="font-medium text-amber-800">No active brokerage membership</p>
          <p className="mt-1 text-sm text-amber-700">
            You need to be a member of a brokerage before you can invite others.
          </p>
        </div>
      ) : !isBrokerAdmin ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-6 text-center">
          <p className="font-medium text-amber-800">Access restricted</p>
          <p className="mt-1 text-sm text-amber-700">
            Only broker administrators can invite new members.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <InviteMemberForm
            organizationId={primaryMembership.organizationId}
            organizationName="your brokerage"
          />
        </div>
      )}
    </div>
  );
}
