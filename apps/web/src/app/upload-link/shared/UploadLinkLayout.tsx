'use client';

import type { ReactNode } from 'react';

/**
 * Chrome shared by every purpose's page once its context has loaded — the
 * outer container, the optional checklist-sidebar layout, the "this link is
 * unique to you" footer line, and a slot for a full-screen modal. The Broker
 * link only gains a sidebar once a CDA exists (its one checklist item, "Sign
 * CDA" — see getBrokerChecklistStatus); before that it renders without one,
 * same as every other purpose with an empty checklist. Loading and error
 * states are handled by each route's own dispatcher before this ever
 * renders — see shared/UploadLinkStates.tsx.
 */
export default function UploadLinkLayout({ hasSidebar, sidebar, modal, banner, children }: {
  hasSidebar?: boolean;
  sidebar?: ReactNode;
  modal?: ReactNode;
  /** Rendered above everything else, full-width — e.g. the "Transaction has finished." completion notice. */
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className={hasSidebar ? 'max-w-5xl mx-auto' : 'max-w-lg mx-auto'}>
        {banner && <div className="mb-4">{banner}</div>}

        <div className={hasSidebar ? 'flex flex-col lg:flex-row gap-4 items-start' : ''}>
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {children}
            <p className="text-center text-xs text-gray-400">
              This link is unique to this transaction and intended only for you. Please do not forward it to others.
            </p>
          </div>

          {hasSidebar && sidebar && (
            <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-8">
              {sidebar}
            </div>
          )}
        </div>
      </div>

      {modal}
    </div>
  );
}
