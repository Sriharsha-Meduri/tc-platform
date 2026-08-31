import { render, screen, waitFor } from '@testing-library/react';
import UploadLinkTokenPage from './page';

jest.mock('next/navigation', () => ({ useParams: () => ({ token: 'tok' }) }));

/** One merged mock response satisfies every GET call any of the three purpose pages might issue on mount — each consumer only reads the keys it cares about. */
const MERGED_RESPONSE = {
  documents: [],
  items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true,
  lender: { lenderName: null, lenderEmail: null },
  escrow: { escrowContactName: null, escrowEmail: null },
  hoa: { hasHoa: null },
  buyerSide: { brokerageName: null, brokerFullName: null, brokerEmail: null, buyerAgentPaymentAddress: null, clientCredits: null },
  sentAt: null, sentTo: null,
  willSendDocumentsToBuyer: null,
  escrowNumber: null,
  hasHoa: null,
};

function mockContextThen(purpose: string) {
  global.fetch = jest.fn((url: string) => {
    if (url.includes('/context')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          propertyAddress: '123 Main St, Chino, CA', recipientName: 'Alice Agent', purpose, expiresAt: '2026-12-01T00:00:00.000Z',
          fileLimits: { maxFiles: 20, maxFileSizeBytes: 26214400, allowedMimeTypes: ['application/pdf'] },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => MERGED_RESPONSE });
  }) as jest.Mock;
}

describe('[token] dispatcher', () => {
  it('renders the Buyer Agent page for document_upload', async () => {
    mockContextThen('document_upload');
    render(<UploadLinkTokenPage />);
    await waitFor(() => expect(screen.getByText('Upload Documents from Buyer Agent')).toBeInTheDocument());
  });

  it('renders the Seller Agent page for seller_agent_document_upload', async () => {
    mockContextThen('seller_agent_document_upload');
    render(<UploadLinkTokenPage />);
    await waitFor(() => expect(screen.getByText('Upload Documents from Seller Agent')).toBeInTheDocument());
  });

  it('renders the Escrow Officer page for escrow_officer_document_upload', async () => {
    mockContextThen('escrow_officer_document_upload');
    render(<UploadLinkTokenPage />);
    await waitFor(() => expect(screen.getByText('Upload Transaction Documents')).toBeInTheDocument());
  });

  it('shows the generic invalid-link message for the broker purpose — it has its own dedicated route, never this dispatcher', async () => {
    mockContextThen('broker_document_upload');
    render(<UploadLinkTokenPage />);
    await waitFor(() => expect(screen.getByText('This upload link is invalid or has expired.')).toBeInTheDocument());
  });
});
