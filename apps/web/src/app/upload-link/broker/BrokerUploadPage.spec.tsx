import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BrokerUploadPage from './BrokerUploadPage';
import type { UploadPageContext, TransactionInfoDto, PublicCdaDto } from '../shared/uploadLinkTypes';
import type { DocumentChecklistStatus } from '../shared/checklist.types';

const CONTEXT: UploadPageContext = {
  propertyAddress: '123 Main St, Chino, CA',
  recipientName: 'Bobby Broker',
  purpose: 'broker_document_upload',
  expiresAt: '2026-12-01T00:00:00.000Z',
  fileLimits: { maxFiles: 20, maxFileSizeBytes: 26214400, allowedMimeTypes: ['application/pdf'] },
};

const EMPTY_INFO: TransactionInfoDto = {
  lender: { lenderName: null, lenderEmail: null },
  escrow: { escrowContactName: null, escrowEmail: null },
  hoa: { hasHoa: null },
  buyerSide: {
    brokerageName: null, brokerFullName: null, brokerEmail: null, buyerAgentPaymentAddress: null, clientCredits: null,
    buyerCommissionType: null, buyerCommissionValue: null, grossCommission: null,
  },
  broker: {
    finalSalesPrice: null, grossCommission: null, brokerPaymentAddress: null,
    brokerCommissionType: null, brokerCommissionValue: null, brokerCommissionAmount: null, buyerAgentCommissionAmount: null,
  },
};

const EMPTY_CHECKLIST: DocumentChecklistStatus = {
  items: [], optionalItems: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true, transactionCompleted: false,
};

const CDA: PublicCdaDto = { id: 'cda-1', fileName: 'CDA.pdf', generatedAt: '2026-01-05T00:00:00.000Z', versionNo: 1, viewUrl: '/api/v1/upload-links/token/broker-token/documents/cda-1/file' };

function requiredChecklist(status: 'required' | 'submitted'): DocumentChecklistStatus {
  return {
    items: [{ formCode: 'signed_cda', formName: 'Sign CDA', category: 'commission', status, matchedDocument: null, uploaded: status === 'submitted', validationStatus: null } as never],
    optionalItems: [], unmatchedDocuments: [], requiredCount: 1, submittedCount: status === 'submitted' ? 1 : 0, allRequiredSubmitted: status === 'submitted', transactionCompleted: false,
  };
}

/** Routes each fetch call by its URL suffix so the 4 endpoints this page loads on mount can each return their own shape. */
function mockFetchByUrl(overrides: { cda?: PublicCdaDto | null; signedCda?: PublicCdaDto | null; checklist?: DocumentChecklistStatus; info?: TransactionInfoDto } = {}) {
  global.fetch = jest.fn((url: string) => {
    if (url.includes('/signed-cda')) return Promise.resolve({ ok: true, json: async () => ({ signedCda: overrides.signedCda ?? null }) });
    if (url.includes('/cda')) return Promise.resolve({ ok: true, json: async () => ({ cda: overrides.cda ?? null }) });
    if (url.includes('/checklist')) return Promise.resolve({ ok: true, json: async () => overrides.checklist ?? EMPTY_CHECKLIST });
    if (url.includes('/transaction-info')) return Promise.resolve({ ok: true, json: async () => overrides.info ?? EMPTY_INFO });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as jest.Mock;
}

describe('BrokerUploadPage', () => {
  it('shows the recipient name and property address', async () => {
    mockFetchByUrl();
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);
    expect(screen.getByText(/Hello Bobby Broker/)).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Chino, CA')).toBeInTheDocument();
  });

  it('renders no checklist or upload UI before the CDA has been generated', async () => {
    mockFetchByUrl();
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    expect(screen.queryByText('Document Checklist')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign CDA')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it('shows the "Sign CDA" checklist item and the upload control once the CDA exists', async () => {
    mockFetchByUrl({ cda: CDA, checklist: requiredChecklist('required') });
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);

    expect(await screen.findByText('Document Checklist')).toBeInTheDocument();
    expect(screen.getAllByText('Sign CDA').length).toBeGreaterThan(0);
    expect(screen.getByText('Upload Signed CDA')).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('shows the received Signed CDA and the submitted checklist state once uploaded', async () => {
    mockFetchByUrl({ cda: CDA, signedCda: { ...CDA, id: 'signed-cda-1' }, checklist: requiredChecklist('submitted') });
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);

    expect(await screen.findByText('Signed CDA')).toBeInTheDocument();
    expect(screen.getByText('Signed CDA received.')).toBeInTheDocument();
    expect(screen.getByText('Replace Signed CDA')).toBeInTheDocument();
  });

  it('displays the retrieved Final Sales Price and Gross Commission, and prefills the broker\'s own saved fields', async () => {
    mockFetchByUrl({
      info: {
        ...EMPTY_INFO,
        broker: {
          finalSalesPrice: 1200000, grossCommission: 30000, brokerPaymentAddress: '456 Broker Blvd',
          brokerCommissionType: 'percentage', brokerCommissionValue: 10, brokerCommissionAmount: 3000, buyerAgentCommissionAmount: 27000,
        },
      },
    });
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);

    await waitFor(() => expect(screen.getByDisplayValue('456 Broker Blvd')).toBeInTheDocument());
    expect(screen.getByText('$1,200,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('$30,000.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$3,000.00')).toBeInTheDocument();
    expect(screen.getByText('$27,000.00')).toBeInTheDocument();
  });

  it('saves the broker payment address and commission split, then displays the calculated result', async () => {
    mockFetchByUrl();
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        saved: {
          ...EMPTY_INFO,
          broker: {
            finalSalesPrice: 1200000, grossCommission: 30000, brokerPaymentAddress: '456 Broker Blvd',
            brokerCommissionType: 'percentage', brokerCommissionValue: 10, brokerCommissionAmount: 3000, buyerAgentCommissionAmount: 27000,
          },
        },
      }),
    }) as jest.Mock;

    fireEvent.change(screen.getByPlaceholderText('Broker Payment Address'), { target: { value: '456 Broker Blvd' } });
    fireEvent.change(screen.getByDisplayValue('Commission Type — not set'), { target: { value: 'percentage' } });
    fireEvent.change(screen.getByPlaceholderText(/Commission Percentage/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Information/i }));

    await waitFor(() => expect(screen.getByText('Broker information saved.')).toBeInTheDocument());
    expect(screen.getByText('$3,000.00')).toBeInTheDocument();
    expect(screen.getByText('$27,000.00')).toBeInTheDocument();
  });

  it('shows a validation error for a percentage commission value over 100 without saving', async () => {
    mockFetchByUrl();
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));

    const saveSpy = jest.fn();
    global.fetch = saveSpy.mockResolvedValue({ ok: true, json: async () => ({ saved: EMPTY_INFO }) });

    fireEvent.change(screen.getByDisplayValue('Commission Type — not set'), { target: { value: 'percentage' } });
    fireEvent.change(screen.getByPlaceholderText(/Commission Percentage/), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Information/i }));

    expect(await screen.findByText('Commission percentage cannot exceed 100.')).toBeInTheDocument();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('shows the "Transaction has finished." banner once the checklist reports transactionCompleted', async () => {
    mockFetchByUrl({ cda: CDA, signedCda: { ...CDA, id: 'signed-cda-1' }, checklist: { ...requiredChecklist('submitted'), transactionCompleted: true } });
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);
    expect(await screen.findByText('Transaction has finished.')).toBeInTheDocument();
  });

  it('never shows the completion banner while transactionCompleted is false', async () => {
    mockFetchByUrl({ checklist: EMPTY_CHECKLIST });
    render(<BrokerUploadPage token="broker-token" context={CONTEXT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    expect(screen.queryByText('Transaction has finished.')).not.toBeInTheDocument();
  });
});
