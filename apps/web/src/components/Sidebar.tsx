'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  PenLine,
  ShieldCheck,
  Clock,
  Wrench,
  Trash2,
  FileSearch,
  ClipboardList,
  Shield,
  UserPlus,
  Building2,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard',              href: '/dashboard',                     icon: LayoutDashboard },
  { label: 'Transaction Management', href: '/dashboard/transaction-management', icon: ShieldCheck },
  { label: 'Tasks',                  href: '/tasks',                         icon: CheckSquare },
  { label: 'My Profile',            href: '/dashboard/profile',              icon: User },
];

const CREATE_ITEMS_BASE: Array<{ label: string; href: string; icon: typeof Upload; description: string }> = [
  { label: 'Upload PDFs', href: '/transactions/new/contract', icon: Upload, description: 'Upload PDFs' },
  { label: 'Fill in details', href: '/transactions/new/manual', icon: PenLine, description: 'Manual entry' },
];

const UTILS_ITEMS = [
  { label: 'Virtual Clock',  href: '/dashboard/utils/clock',          icon: Clock         },
  { label: 'Delete for QA',  href: '/dashboard/utils/qa-delete',      icon: Trash2        },
  { label: 'Extract Docs',   href: '/dashboard/utils/extract',        icon: FileSearch    },
];

interface SidebarProps {
  displayName: string;
  email: string;
  initials: string;
  role: string;
  roles?: string[];
  membershipRole?: string;
  onLogout: () => void;
  isLoggingOut?: boolean;
  showUtils?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  broker_admin: 'Broker Admin',
  transaction_coordinator: 'Transaction Coordinator',
  support_admin: 'Support Admin',
};

export default function Sidebar({ displayName, email, initials, role, roles, membershipRole, onLogout, isLoggingOut, showUtils }: SidebarProps) {
  const isAgent = roles?.includes('agent') ?? false;
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('tc_sidebar_collapsed');
    if (stored !== null) setCollapsed(stored === 'true');
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('tc_sidebar_collapsed', String(next));
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-white border-r border-gray-200 shrink-0 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Brand */}
      <div className="h-16 flex items-center px-4 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">TC</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-gray-900 text-sm whitespace-nowrap">
              Transaction Coordinator
            </span>
          )}
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-[4.5rem] z-10 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-700 hover:shadow-md transition-shadow"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Create Transaction */}
      <div className={cn('px-3 pt-4 pb-2', collapsed && 'flex flex-col items-center')}>
        {collapsed ? (
          <div className="space-y-1">
            {CREATE_ITEMS_BASE.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-blue-700 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                )}
              >
                <Icon size={15} />
              </Link>
            ))}
          </div>
        ) : (
          <div>
            <Link
              href={'/transactions/new'}
              className="flex items-center gap-2 px-3 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg"
            >
              <Plus size={15} className="shrink-0" />
              Create Transaction
            </Link>
            <div className="mt-1 ml-2 space-y-0.5">
            {CREATE_ITEMS_BASE.map(({ label, href, icon: Icon, description }) => {
                const active = pathname.startsWith(href);
                const desc = isAgent && href === '/transactions/new/contract'
                  ? 'Start new transaction' : description;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    )}
                  >
                    <Icon size={15} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{label}</p>
                      <p className="text-xs text-gray-400 leading-tight">{desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-hidden">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                collapsed && 'justify-center',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Brokerage — for all brokerage members */}
        {membershipRole && (
          <div className={cn('pt-3', collapsed ? 'border-t border-gray-100 mt-2' : '')}>
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-2 pb-1">
                <Building2 size={11} className="text-teal-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-400">Brokerage</span>
              </div>
            )}
            <Link
              href="/dashboard/brokerage/templates"
              title="Brokerage Templates"
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                collapsed && 'justify-center',
                pathname.startsWith('/dashboard/brokerage/templates')
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <ClipboardList size={17} className="shrink-0" />
              {!collapsed && <span>Brokerage Templates</span>}
            </Link>
            {membershipRole === 'broker_admin' && (
              <>
                <Link
                  href="/dashboard/team/members"
                  title="Team Members"
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                    collapsed && 'justify-center',
                    pathname === '/dashboard/team/members'
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Users size={17} className="shrink-0" />
                  {!collapsed && <span>Team Members</span>}
                </Link>
                <Link
                  href="/dashboard/team/invite"
                  title="Invite Member"
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                    collapsed && 'justify-center',
                    pathname === '/dashboard/team/invite'
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <UserPlus size={17} className="shrink-0" />
                  {!collapsed && <span>Invite Member</span>}
                </Link>
              </>
            )}
          </div>
        )}

        {/* Admin — only for support_admin */}
        {role === 'support_admin' && (
          <div className={cn('pt-3', collapsed ? 'border-t border-gray-100 mt-2' : '')}>
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-2 pb-1">
                <Shield size={11} className="text-purple-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">Admin</span>
              </div>
            )}
            <Link
              href="/admin"
              title="Admin Panel"
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                collapsed && 'justify-center',
                'text-purple-600 hover:bg-purple-50 hover:text-purple-700',
              )}
            >
              <Shield size={17} className="shrink-0" />
              {!collapsed && <span>Admin Panel</span>}
            </Link>
          </div>
        )}

        {/* Utils — hidden in production */}
        {showUtils && (
          <div className={cn('pt-3', collapsed ? 'border-t border-gray-100 mt-2' : '')}>
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-2 pb-1">
                <Wrench size={11} className="text-gray-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Utils</span>
              </div>
            )}
            {UTILS_ITEMS.map(({ label, href, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors',
                    collapsed && 'justify-center',
                    active
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon size={17} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className={cn('p-3 border-t border-gray-200', collapsed && 'flex flex-col items-center gap-2')}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-semibold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              {(ROLE_LABELS[membershipRole ?? role] || ROLE_LABELS[role]) && (
                <p className="text-[11px] text-gray-400 truncate leading-tight">{ROLE_LABELS[membershipRole ?? role] || ROLE_LABELS[role]}</p>
              )}
              <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                {email}
                {role === 'support_admin' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                    Admin
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center" title={displayName}>
            <span className="text-white text-xs font-semibold">{initials}</span>
          </div>
        )}
        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          title="Sign out"
          className={cn(
            'flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors rounded-lg px-2 py-1.5',
            collapsed ? 'justify-center w-full' : 'w-full',
          )}
        >
          <LogOut size={15} className="shrink-0" />
          {!collapsed && <span>{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>}
        </button>
      </div>
    </aside>
  );
}
