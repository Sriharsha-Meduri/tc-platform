import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, logoutAction } from '@/lib/auth-actions';
import { LayoutDashboard, Users, Building2, ClipboardList, LogOut, FlaskConical } from 'lucide-react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user || !session.user.roles?.includes('support_admin')) redirect('/admin-login');

  const initials = (session.account?.displayName ?? session.user.email).charAt(0).toUpperCase();

  const NAV = [
    { label: 'Dashboard',      href: '/admin',            icon: LayoutDashboard },
    { label: 'Users',          href: '/admin/users',      icon: Users },
    { label: 'Organizations',  href: '/admin/organizations', icon: Building2 },
    { label: 'Audit Logs',    href: '/admin/audit-logs',  icon: ClipboardList },
    ...(process.env.NEXT_PUBLIC_APP_ENV !== 'production'
      ? [{ label: 'Testing', href: '/admin/testing/buyer-transaction', icon: FlaskConical }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <nav className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between">
        <Link href="/admin" className="text-lg font-semibold tracking-tight">
          <span className="text-blue-400">TC</span> Admin
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">{session.user.email}</span>
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-xs font-bold">
            {initials}
          </span>
          <form action={logoutAction}>
            <input type="hidden" name="redirectTo" value="/admin-login" />
            <button type="submit" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </div>
      </nav>
      <div className="flex">
        <aside className="w-48 bg-white border-r border-slate-200 min-h-[calc(100vh-52px)] p-4 shrink-0">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
