import { redirect } from 'next/navigation';
import { getSession, getAccountMembershipsAction, getOrgMembersAction } from '@/lib/auth-actions';
import { MembersList } from './MembersList';

export const metadata = { title: 'Team Members — TC' };

export default async function MembersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { memberships } = await getAccountMembershipsAction();
  const primaryMembership = memberships?.find((m) => m.isPrimary && m.status === 'active');

  const isBrokerAdmin = primaryMembership?.role === 'broker_admin';

  const { members } = await getOrgMembersAction(session.account?.id ?? '');

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your brokerage team members
        </p>
      </div>

      {!primaryMembership ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-6 text-center">
          <p className="font-medium text-amber-800">No active brokerage membership</p>
        </div>
      ) : (
        <MembersList
          members={members ?? []}
          currentAccountId={session.account?.id ?? ''}
          isBrokerAdmin={isBrokerAdmin}
        />
      )}
    </div>
  );
}