import { render, screen } from '@testing-library/react';
import UploadLinkLayout from './UploadLinkLayout';
import TransactionCompletedBanner from './TransactionCompletedBanner';

describe('UploadLinkLayout — banner slot', () => {
  it('renders nothing extra when no banner is passed', () => {
    render(<UploadLinkLayout><p>content</p></UploadLinkLayout>);
    expect(screen.queryByText('Transaction has finished.')).not.toBeInTheDocument();
  });

  it('renders the banner above the page content when provided', () => {
    render(
      <UploadLinkLayout banner={<TransactionCompletedBanner />}>
        <p>content</p>
      </UploadLinkLayout>,
    );
    expect(screen.getByText('Transaction has finished.')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders the banner above the sidebar layout too, not just the content column', () => {
    render(
      <UploadLinkLayout hasSidebar sidebar={<div>sidebar content</div>} banner={<TransactionCompletedBanner />}>
        <p>content</p>
      </UploadLinkLayout>,
    );
    expect(screen.getByText('Transaction has finished.')).toBeInTheDocument();
    expect(screen.getByText('sidebar content')).toBeInTheDocument();
  });
});
