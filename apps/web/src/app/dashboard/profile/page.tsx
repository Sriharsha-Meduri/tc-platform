import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession, logoutAction, getAccountMembershipsAction } from '@/lib/auth-actions';
import { ProfileTabBar } from './ProfileTabs';
import { ChangePasswordForm } from './ChangePasswordForm';
import { DisplayNameForm } from './DisplayNameForm';
import { DeleteAccountButton } from './DeleteAccountButton';
import DocuSignConnection from './DocuSignConnection';
import BrokerageSection from './BrokerageSection';
import { TitleContactsTab } from './TitleContactsTab';
import { EscrowContactsTab } from './EscrowContactsTab';
import { HomeWarrantyContactsTab } from './HomeWarrantyContactsTab';

export const metadata = { title: 'My Profile — TC' };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { user, account } = session;
  const displayName = account?.displayName ?? user.email;
  const initials =
    account?.firstName && account?.lastName
      ? `${account.firstName[0]}${account.lastName[0]}`.toUpperCase()
      : displayName.slice(0, 2).toUpperCase();
  const joinedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const { memberships } = await getAccountMembershipsAction();

  const { tab } = await searchParams;
  const activeTab = tab || 'profile';

  return (
    <div className="min-h-screen flex items-start justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-700 shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Suspense fallback={null}>
            <ProfileTabBar />
          </Suspense>

          {activeTab === 'profile' && (
            <>
              <div className="flex items-center gap-4 pb-6 mb-6 border-b border-gray-100">
                <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-xl font-bold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <DisplayNameForm currentDisplayName={displayName} />
                  <p className="text-sm text-gray-500 truncate">{user.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</p>
                  <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                    user.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : user.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user.status}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Role</p>
                  <p className="text-sm text-gray-900 capitalize">{user.role.replace('_', ' ')}</p>
                </div>

                {user.phone && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm text-gray-900">{user.phone}</p>
                  </div>
                )}

                {joinedDate && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</p>
                    <p className="text-sm text-gray-900">{joinedDate}</p>
                  </div>
                )}

                {account?.firstName && account?.lastName && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Name</p>
                    <p className="text-sm text-gray-900">{account.firstName} {account.lastName}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
                <BrokerageSection
                  isAgent={user.roles?.includes('agent')}
                  memberships={(memberships || []).map((m) => ({
                    id: m.id,
                    organizationId: m.organizationId,
                    role: m.role,
                    status: m.status,
                  }))}
                />

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Security</h3>
                  <ChangePasswordForm />
                </div>

                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                  >
                    Sign out
                  </button>
                </form>

                <DeleteAccountButton />
              </div>
            </>
          )}

          {activeTab === 'title' && (
            <TitleContactsTab />
          )}

          {activeTab === 'escrow' && (
            <EscrowContactsTab />
          )}

          {activeTab === 'home-warranty' && (
            <HomeWarrantyContactsTab />
          )}

          {activeTab === 'docusign' && (
            <DocuSignConnection />
          )}
        </div>
      </div>
    </div>
  );
}
