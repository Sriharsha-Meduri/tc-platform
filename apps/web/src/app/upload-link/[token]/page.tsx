'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getContext } from '../shared/uploadLinkApi';
import { UploadLinkLoading, UploadLinkErrorCard } from '../shared/UploadLinkStates';
import { isBuyerAgentPurpose, isSellerAgentPurpose, isEscrowOfficerPurpose } from '../shared/uploadLinkAuth';
import type { UploadPageContext } from '../shared/uploadLinkTypes';
import BuyerAgentUploadPage from '../buyer-agent/BuyerAgentUploadPage';
import SellerAgentUploadPage from '../seller-agent/SellerAgentUploadPage';
import EscrowUploadPage from '../escrow/EscrowUploadPage';

const GENERIC_INVALID_LINK_MESSAGE = 'This upload link is invalid or has expired.';

/**
 * Thin dispatcher — fetches the link's context once, then renders whichever
 * purpose's own page component owns everything else. The Broker purpose has
 * its own dedicated route (upload-link/broker/[token]/) and is never
 * expected to reach here; if it somehow does, it falls through to the
 * generic invalid-link state below rather than crashing.
 */
export default function UploadLinkTokenPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';

  const [context, setContext] = useState<UploadPageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    getContext(token)
      .then(setContext)
      .catch((err) => setLoadError((err as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <UploadLinkLoading />;
  if (loadError || !context) {
    return <UploadLinkErrorCard message={loadError ?? GENERIC_INVALID_LINK_MESSAGE} />;
  }

  if (isBuyerAgentPurpose(context.purpose)) return <BuyerAgentUploadPage token={token} context={context} />;
  if (isSellerAgentPurpose(context.purpose)) return <SellerAgentUploadPage token={token} context={context} />;
  if (isEscrowOfficerPurpose(context.purpose)) return <EscrowUploadPage token={token} context={context} />;

  return <UploadLinkErrorCard message={GENERIC_INVALID_LINK_MESSAGE} />;
}
