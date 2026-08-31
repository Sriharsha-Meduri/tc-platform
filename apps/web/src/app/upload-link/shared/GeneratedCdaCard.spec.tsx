import { render, screen } from '@testing-library/react';
import GeneratedCdaCard from './GeneratedCdaCard';
import type { PublicCdaDto } from './uploadLinkTypes';

const CDA: PublicCdaDto = {
  id: 'cda-1',
  fileName: 'CDA-Commission-Disbursement-Authorization.pdf',
  generatedAt: '2026-08-10T22:51:12.763Z',
  versionNo: 1,
  viewUrl: '/api/v1/upload-links/token/tok-1/documents/cda-1/file',
};

describe('GeneratedCdaCard', () => {
  it('renders nothing when there is no CDA yet', () => {
    const { container } = render(<GeneratedCdaCard cda={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the CDA with a working View / Download link once one exists', () => {
    render(<GeneratedCdaCard cda={CDA} />);
    expect(screen.getByText('Commission Disbursement Authorization (CDA)')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View \/ Download/i });
    expect(link).toHaveAttribute('href', CDA.viewUrl);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows a version number only when the CDA has been regenerated (version > 1)', () => {
    const { rerender } = render(<GeneratedCdaCard cda={CDA} />);
    expect(screen.queryByText(/version 1/)).not.toBeInTheDocument();

    rerender(<GeneratedCdaCard cda={{ ...CDA, versionNo: 2 }} />);
    expect(screen.getByText(/version 2/)).toBeInTheDocument();
  });

  it('renders an overridden title/description — reused for the Signed CDA card on the Broker and Escrow links', () => {
    render(<GeneratedCdaCard cda={CDA} title="Signed CDA" description="Your signed CDA has been received." />);
    expect(screen.getByText('Signed CDA')).toBeInTheDocument();
    expect(screen.getByText('Your signed CDA has been received.')).toBeInTheDocument();
    expect(screen.queryByText('Commission Disbursement Authorization (CDA)')).not.toBeInTheDocument();
  });
});
