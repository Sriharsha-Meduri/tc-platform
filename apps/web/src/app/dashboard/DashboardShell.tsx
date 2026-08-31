'use client';

import { useTransition } from 'react';
import { logoutAction } from '@/lib/auth-actions';
import Sidebar from '@/components/Sidebar';

interface DashboardShellProps {
  displayName: string;
  email: string;
  initials: string;
  firstName: string;
  role: string;
  roles?: string[];
  showUtils: boolean;
  membershipRole?: string;
  children: React.ReactNode;
}

export default function DashboardShell({
  displayName,
  email,
  initials,
  firstName,
  role,
  roles,
  showUtils,
  membershipRole,
  children,
}: DashboardShellProps) {
  const [isLoggingOut, startLogout] = useTransition();

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      <Sidebar
        displayName={displayName}
        email={email}
        initials={initials}
        role={role}
        roles={roles}
        membershipRole={membershipRole}
        onLogout={() => startLogout(() => logoutAction())}
        isLoggingOut={isLoggingOut}
        showUtils={showUtils}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
          <div className="ml-auto text-sm text-gray-500">
            Welcome back, {firstName}
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
