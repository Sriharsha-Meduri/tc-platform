'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getContext } from '../../shared/uploadLinkApi';
import { UploadLinkLoading, UploadLinkErrorCard } from '../../shared/UploadLinkStates';
import { isBrokerPurpose } from '../../shared/uploadLinkAuth';
import type { UploadPageContext } from '../../shared/uploadLinkTypes';
import BrokerUploadPage from '../BrokerUploadPage';

const GENERIC_INVALID_LINK_MESSAGE = 'This upload link is invalid or has expired.';

/** Dedicated route for the broker's own link — kept separate from the shared [token] dispatcher since the broker page has no purpose-branching to do. */
export default function BrokerTokenPage() {
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
  if (loadError || !context || !isBrokerPurpose(context.purpose)) {
    return <UploadLinkErrorCard message={loadError ?? GENERIC_INVALID_LINK_MESSAGE} />;
  }

  return <BrokerUploadPage token={token} context={context} />;
}
