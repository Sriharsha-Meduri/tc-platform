import { render, screen, waitFor } from '@testing-library/react';
import BrokerTokenPage from './page';

jest.mock('next/navigation', () => ({ useParams: () => ({ token: 'broker-token' }) }));

const CONTEXT_RESPONSE = {
  propertyAddress: '123 Main St, Chino, CA',
  recipientName: 'Bobby Broker',
  purpose: 'broker_document_upload',
  expiresAt: '2026-12-01T00:00:00.000Z',
  fileLimits: { maxFiles: 20, maxFileSizeBytes: 26214400, allowedMimeTypes: ['application/pdf'] },
};

describe('Broker [token] page', () => {
  it('renders the broker placeholder once context loads', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => CONTEXT_RESPONSE }) as jest.Mock;
    render(<BrokerTokenPage />);
    await waitFor(() => expect(screen.getByText(/Hello Bobby Broker/)).toBeInTheDocument());
  });

  it('shows the generic invalid-link message when the resolved purpose is not broker', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...CONTEXT_RESPONSE, purpose: 'document_upload' }),
    }) as jest.Mock;
    render(<BrokerTokenPage />);
    await waitFor(() => expect(screen.getByText('This upload link is invalid or has expired.')).toBeInTheDocument());
  });

  it('shows the server error message when the token fails to validate', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'This upload link is invalid or has expired.' }),
    }) as jest.Mock;
    render(<BrokerTokenPage />);
    await waitFor(() => expect(screen.getByText('This upload link is invalid or has expired.')).toBeInTheDocument());
  });
});
