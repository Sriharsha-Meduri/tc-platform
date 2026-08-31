'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'title', label: 'Title' },
  { id: 'escrow', label: 'Escrow' },
  { id: 'home-warranty', label: 'Home Warranty' },
  { id: 'docusign', label: 'DocuSign' },
];

export function ProfileTabBar() {
  const searchParams = useSearchParams();
  const active = searchParams.get('tab') || 'profile';

  return (
    <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.id === 'profile' ? '/dashboard/profile' : `/dashboard/profile?tab=${tab.id}`}
          className={cn(
            'px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
            active === tab.id
              ? 'border-blue-700 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
