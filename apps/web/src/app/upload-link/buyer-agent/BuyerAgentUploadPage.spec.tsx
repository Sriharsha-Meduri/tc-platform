import { render, screen, waitFor } from '@testing-library/react';
import BuyerAgentUploadPage from './BuyerAgentUploadPage';
import type { UploadPageContext } from '../shared/uploadLinkTypes';
import type { DocumentChecklistStatus } from '../shared/checklist.types';

const CONTEXT: UploadPageContext = {
  propertyAddress: '123 Main St, Chino, CA',
  recipientName: 'Bob Buyer Agent',
  purpose: 'document_upload',
  expiresAt: '2026-12-01T00:00:00.000Z',
  fileLimits: { maxFiles: 20, maxFileSizeBytes: 26214400, allowedMimeTypes: ['application/pdf'] },
};

const NOTICE_TEXT = 'Documents will be sent via DocuSign by the Seller Agent once all required seller documents have been submitted.';

const EMPTY_CHECKLIST: DocumentChecklistStatus = {
  items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true, transactionCompleted: false,
};

/** Routes each fetch call by its URL suffix so the several endpoints this page (and its transaction-info child) load on mount can each return their own shape. */
function mockFetchByUrl(overrides: { checklist?: DocumentChecklistStatus; sellerStatus?: { allRequiredSubmitted: boolean } } = {}) {
  global.fetch = jest.fn((url: string) => {
    if (url.includes('/seller-status')) return Promise.resolve({ ok: true, json: async () => overrides.sellerStatus ?? { allRequiredSubmitted: true } });
    if (url.includes('/documents')) return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) });
    if (url.includes('/checklist')) return Promise.resolve({ ok: true, json: async () => overrides.checklist ?? EMPTY_CHECKLIST });
    if (url.includes('/cda')) return Promise.resolve({ ok: true, json: async () => ({ cda: null }) });
    if (url.includes('/transaction-info')) return Promise.resolve({ ok: true, json: async () => ({}) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as jest.Mock;
}

describe('BuyerAgentUploadPage — Seller Agent status notification', () => {
  it('shows the notice while the Seller Agent has not submitted all required documents', async () => {
    mockFetchByUrl({ sellerStatus: { allRequiredSubmitted: false } });
    render(<BuyerAgentUploadPage token="buyer-agent-token" context={CONTEXT} />);
    expect(await screen.findByText(NOTICE_TEXT)).toBeInTheDocument();
  });

  it('removes the notice automatically once the Seller Agent status reports allRequiredSubmitted: true', async () => {
    mockFetchByUrl({ sellerStatus: { allRequiredSubmitted: true } });
    render(<BuyerAgentUploadPage token="buyer-agent-token" context={CONTEXT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument();
  });

  it('shows neither banner before the seller-status fetch resolves, nor once resolved with everything complete and the transaction not yet finished', async () => {
    mockFetchByUrl({ sellerStatus: { allRequiredSubmitted: true } });
    render(<BuyerAgentUploadPage token="buyer-agent-token" context={CONTEXT} />);
    expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Transaction has finished.')).not.toBeInTheDocument();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Transaction has finished.')).not.toBeInTheDocument();
  });
});
