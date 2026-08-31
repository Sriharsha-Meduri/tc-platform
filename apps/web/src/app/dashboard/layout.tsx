import { redirect } from 'next/navigation';
import { getSession, getAccountMembershipsAction } from '@/lib/auth-actions';
import DashboardShell from './DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { user, account } = session;
  const displayName = account?.displayName ?? user.email;
  const initials =
    account?.firstName && account?.lastName
      ? `${account.firstName[0]}${account.lastName[0]}`.toUpperCase()
      : displayName.slice(0, 2).toUpperCase();

  const showUtils = process.env.NEXT_PUBLIC_APP_ENV !== 'production';

  const { memberships } = await getAccountMembershipsAction();

  const primaryMembership = memberships?.find((m) => m.isPrimary && m.status === 'active');
  const membershipRole = primaryMembership?.role ?? undefined;

  return (
    <DashboardShell
      displayName={displayName}
      email={user.email}
      initials={initials}
      firstName={account?.firstName ?? displayName}
      role={user.role}
      roles={user.roles}
      membershipRole={membershipRole}
      showUtils={showUtils}
    >
      {children}
    </DashboardShell>
  );
}
