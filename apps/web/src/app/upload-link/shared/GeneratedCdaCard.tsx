'use client';

import { FileCheck2, Eye } from 'lucide-react';
import type { PublicCdaDto } from './uploadLinkTypes';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * The generated Commission Disbursement Authorization — shown on the Buyer
 * Agent and Broker upload-link pages once one exists (see
 * document-visibility.util.ts's BROKER exception for who can see it).
 * Renders nothing until a CDA is available; no "not ready yet" placeholder,
 * since a missing CDA is the normal, expected state before both sides have
 * finished their commission sections.
 *
 * Also reused, with an overridden title/description, for the Broker's own
 * signed-CDA upload confirmation and the Escrow link's "Signed CDA" card —
 * same generated-document-with-a-view-link shape, just a different document.
 */
export default function GeneratedCdaCard({
  cda,
  title = 'Commission Disbursement Authorization (CDA)',
  description = 'Your CDA has been generated and is ready to view.',
}: {
  cda: PublicCdaDto | null;
  title?: string;
  description?: string;
}) {
  if (!cda) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <FileCheck2 size={16} className="text-blue-700" />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-700">{description}</p>
          <p className="text-xs text-gray-400 mt-1">
            Generated {formatDateTime(cda.generatedAt)}
            {cda.versionNo > 1 ? ` · version ${cda.versionNo}` : ''}
          </p>
        </div>
        <a
          href={cda.viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Eye size={14} /> View / Download
        </a>
      </div>
    </div>
  );
}
