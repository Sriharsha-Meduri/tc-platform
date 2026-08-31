import { render, screen, waitFor } from '@testing-library/react';
import SideWorkspace from './SideWorkspace';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('tab=details'),
}));

const CHECKLIST_REQUIRED = {
  items: [{ formCode: 'signed_cda', formName: 'Sign CDA', category: 'commission', status: 'required', matchedDocument: null, uploaded: false, validationStatus: null }],
  optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: 0, allRequiredSubmitted: false,
};

const CDA = { id: 'cda-1', fileName: 'CDA.pdf', generatedAt: '2026-01-01T00:00:00.000Z', versionNo: 1, viewUrl: '/api/v1/transaction-documents/cda-1/file' };

function mockFetchOnce(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as jest.Mock;
}

describe('SideWorkspace side="broker" — the Broker tab\'s Details view', () => {
  it('renders no "Uploaded Documents" section — the Broker upload link has no general document list', async () => {
    mockFetchOnce({
      recipientName: 'Bob Broker', recipientEmail: 'bob@brokerhq.com',
      checklist: CHECKLIST_REQUIRED, linkStatus: { uploadLinkId: null, emailSentAt: null, expiresAt: null, linkStatus: null },
      transactionInfo: null, cda: null, signedCda: null,
    });
    render(<SideWorkspace transactionId="tx-1" side="broker" />);
    await waitFor(() => expect(screen.getByText('Bob Broker')).toBeInTheDocument());
    expect(screen.queryByText('Uploaded Documents')).not.toBeInTheDocument();
  });

  it('renders the exact "Sign CDA" checklist item once a CDA exists — mirroring the Broker upload-link page', async () => {
    mockFetchOnce({
      recipientName: 'Bob Broker', recipientEmail: 'bob@brokerhq.com',
      checklist: CHECKLIST_REQUIRED, linkStatus: { uploadLinkId: 'link-1', emailSentAt: '2026-01-01T00:00:00.000Z', expiresAt: null, linkStatus: 'active' },
      transactionInfo: null, cda: CDA, signedCda: null,
    });
    render(<SideWorkspace transactionId="tx-1" side="broker" />);
    await waitFor(() => expect(screen.getByText('Document Checklist')).toBeInTheDocument());
    expect(screen.getByText('Sign CDA')).toBeInTheDocument();
    expect(screen.getByText('Commission Disbursement Authorization (CDA)')).toBeInTheDocument();
  });

  it('renders the Signed CDA card once the broker has uploaded it', async () => {
    mockFetchOnce({
      recipientName: 'Bob Broker', recipientEmail: 'bob@brokerhq.com',
      checklist: { ...CHECKLIST_REQUIRED, items: [{ ...CHECKLIST_REQUIRED.items[0], status: 'submitted' }], submittedCount: 1, allRequiredSubmitted: true },
      linkStatus: { uploadLinkId: 'link-1', emailSentAt: '2026-01-01T00:00:00.000Z', expiresAt: null, linkStatus: 'active' },
      transactionInfo: null, cda: CDA, signedCda: { ...CDA, id: 'signed-1' },
    });
    render(<SideWorkspace transactionId="tx-1" side="broker" />);
    await waitFor(() => expect(screen.getByText('Signed CDA')).toBeInTheDocument());
  });

  it('renders the broker commission grid once transactionInfo is present, with no editable inputs (read-only mirror)', async () => {
    mockFetchOnce({
      recipientName: 'Bob Broker', recipientEmail: 'bob@brokerhq.com',
      checklist: CHECKLIST_REQUIRED, linkStatus: { uploadLinkId: 'link-1', emailSentAt: '2026-01-01T00:00:00.000Z', expiresAt: null, linkStatus: 'active' },
      transactionInfo: {
        finalSalesPrice: 1200000, grossCommission: 30000, brokerPaymentAddress: '456 Broker Blvd',
        brokerCommissionType: 'percentage', brokerCommissionValue: 10, brokerCommissionAmount: 3000, buyerAgentCommissionAmount: 27000,
      },
      cda: null, signedCda: null,
    });
    render(<SideWorkspace transactionId="tx-1" side="broker" />);
    await waitFor(() => expect(screen.getByText('Commission Type / Value')).toBeInTheDocument());
    expect(screen.getAllByText('Broker Commission').length).toBeGreaterThan(0);
    expect(screen.getByText('$1,200,000.00')).toBeInTheDocument();
    expect(screen.getByText('$3,000.00')).toBeInTheDocument();
    expect(screen.getByText('$27,000.00')).toBeInTheDocument();
    expect(document.querySelector('input')).not.toBeInTheDocument();
  });
});
