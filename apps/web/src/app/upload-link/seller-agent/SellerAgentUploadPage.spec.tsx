import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SellerAgentUploadPage from './SellerAgentUploadPage';
import type { UploadPageContext, UploadedDocument } from '../shared/uploadLinkTypes';
import type { ChecklistItemDto, DocumentChecklistStatus } from '../shared/checklist.types';

const CONTEXT: UploadPageContext = {
  propertyAddress: '123 Main St, Chino, CA',
  recipientName: 'Sally Seller Agent',
  purpose: 'seller_agent_document_upload',
  expiresAt: '2026-12-01T00:00:00.000Z',
  fileLimits: { maxFiles: 20, maxFileSizeBytes: 26214400, allowedMimeTypes: ['application/pdf'] },
};

const NOTICE_TEXT = 'Documents will not be sent via DocuSign until all required documents have been submitted.';

function checklist(overrides: Partial<DocumentChecklistStatus> = {}): DocumentChecklistStatus {
  return {
    items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 2, submittedCount: 0,
    allRequiredSubmitted: false, transactionCompleted: false,
    ...overrides,
  };
}

/** Routes each fetch call by its URL suffix so the endpoints this page (and its escrow-info child) load on mount can each return their own shape. */
function mockFetchByUrl(overrides: { documents?: UploadedDocument[]; checklist?: DocumentChecklistStatus } = {}) {
  global.fetch = jest.fn((url: string) => {
    if (url.includes('/documents')) return Promise.resolve({ ok: true, json: async () => ({ documents: overrides.documents ?? [] }) });
    if (url.includes('/checklist')) return Promise.resolve({ ok: true, json: async () => overrides.checklist ?? checklist() });
    if (url.includes('/transaction-info')) return Promise.resolve({ ok: true, json: async () => ({}) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as jest.Mock;
}

describe('SellerAgentUploadPage — DocuSign pending notification', () => {
  it('shows the notice while required checklist documents are still not completed', async () => {
    mockFetchByUrl({ checklist: checklist({ requiredCount: 2, submittedCount: 1, allRequiredSubmitted: false }) });
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);
    expect(await screen.findByText(NOTICE_TEXT)).toBeInTheDocument();
  });

  it('removes the notice automatically once allRequiredSubmitted is true', async () => {
    mockFetchByUrl({ checklist: checklist({ requiredCount: 2, submittedCount: 2, allRequiredSubmitted: true }) });
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument();
  });

  it('never shows the notice based on files merely being uploaded — only the checklist\'s own allRequiredSubmitted counts', async () => {
    // Two files are present in "Uploaded Documents", but the checklist itself still reports required items outstanding.
    mockFetchByUrl({
      documents: [
        { id: 'doc-1', fileName: 'a.pdf', formType: 'TDS', recipientRole: 'seller_agent', uploadedAt: '2026-01-01T00:00:00.000Z', fileSizeBytes: 1000, status: 'saved', category: 'general', viewUrl: null, uploadedByType: 'SELLER_AGENT', isOriginalPackage: false, sourceDocumentId: null },
      ],
      checklist: checklist({ allRequiredSubmitted: false }),
    });
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);
    expect(await screen.findByText(NOTICE_TEXT)).toBeInTheDocument();
  });

  it('shows neither banner before the checklist has loaded, and neither once loaded with allRequiredSubmitted true and transactionCompleted false', async () => {
    mockFetchByUrl({ checklist: checklist({ allRequiredSubmitted: true }) });
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);
    expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Transaction has finished.')).not.toBeInTheDocument();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText('Transaction has finished.')).not.toBeInTheDocument();
  });
});

describe('SellerAgentUploadPage — centralized "Send via DocuSign" action', () => {
  function tdsItem(overrides: Partial<ChecklistItemDto> = {}): ChecklistItemDto {
    return {
      formCode: 'TDS',
      formName: 'Transfer Disclosure Statement',
      category: 'disclosure',
      status: 'submitted',
      matchedDocument: { id: 'doc-1', fileName: 'tds.pdf', formType: 'TDS', uploadedAt: '2026-01-01T00:00:00.000Z' },
      uploaded: true,
      validationStatus: 'passed',
      docusign: { eligible: true, recipients: { signers: [{ name: 'Bob Buyer', email: 'bob@buyer.com' }], cc: [] }, envelope: null },
      ...overrides,
    };
  }

  it('does not show the "Send via DocuSign" button until all required documents are submitted', async () => {
    mockFetchByUrl({ checklist: checklist({ items: [tdsItem({ status: 'required', docusign: undefined })], allRequiredSubmitted: false }) });
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);
    await screen.findByText(NOTICE_TEXT);
    expect(screen.queryByRole('button', { name: /Send via DocuSign/i })).not.toBeInTheDocument();
  });

  it('shows the button once all required documents are submitted, and opens the multi-select modal listing the eligible document, preselected', async () => {
    const user = userEvent.setup();
    mockFetchByUrl({ checklist: checklist({ items: [tdsItem()], requiredCount: 1, submittedCount: 1, allRequiredSubmitted: true }) });
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);

    const openButton = await screen.findByRole('button', { name: /Send via DocuSign/i });
    await user.click(openButton);

    // Appears both in the checklist row (behind the modal) and in the modal's own document list.
    expect(screen.getAllByText('Transfer Disclosure Statement').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('sends only the confirmed selection to sendDocumentsDocusign and closes the modal on success', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.includes('/documents/docusign/send')) {
        expect(JSON.parse(init!.body as string)).toEqual({ documentIds: ['doc-1'] });
        return Promise.resolve({ ok: true, json: async () => ({ documentIds: ['doc-1'], envelopeId: 'env-1', status: 'sent' }) });
      }
      if (url.includes('/documents')) return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) });
      if (url.includes('/checklist')) return Promise.resolve({ ok: true, json: async () => checklist({ items: [tdsItem()], requiredCount: 1, submittedCount: 1, allRequiredSubmitted: true }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as jest.Mock;
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);

    await user.click(await screen.findByRole('button', { name: /Send via DocuSign/i }));
    await user.click(screen.getByRole('button', { name: /Send Selected via DocuSign/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Send Selected via DocuSign/i })).not.toBeInTheDocument());
  });

  it('shows the error inside the modal and keeps it open when the send fails', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/documents/docusign/send')) {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'Missing required recipient(s): buyer' }) });
      }
      if (url.includes('/documents')) return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) });
      if (url.includes('/checklist')) return Promise.resolve({ ok: true, json: async () => checklist({ items: [tdsItem()], requiredCount: 1, submittedCount: 1, allRequiredSubmitted: true }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as jest.Mock;
    render(<SellerAgentUploadPage token="seller-agent-token" context={CONTEXT} />);

    await user.click(await screen.findByRole('button', { name: /Send via DocuSign/i }));
    await user.click(screen.getByRole('button', { name: /Send Selected via DocuSign/i }));

    expect(await screen.findByText('Missing required recipient(s): buyer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Selected via DocuSign/i })).toBeInTheDocument();
  });
});
