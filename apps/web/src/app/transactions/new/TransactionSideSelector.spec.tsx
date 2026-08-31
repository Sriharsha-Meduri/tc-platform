import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionSideSelector from './TransactionSideSelector';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('TransactionSideSelector', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockClear();
  });

  it('renders Buyer Side as a clickable option', () => {
    render(<TransactionSideSelector />);

    expect(screen.getByRole('button', { name: /Buyer Side Transaction/ })).toBeInTheDocument();
  });

  it('renders Seller Side as visible but locked — no button role, Lock icon shown', () => {
    render(<TransactionSideSelector />);

    expect(screen.getByText('Seller Side Transaction')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Seller Side Transaction/ })).not.toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('persists BUYER and navigates to the contract upload flow when Buyer Side is chosen', async () => {
    const user = userEvent.setup();
    render(<TransactionSideSelector />);

    await user.click(screen.getByRole('button', { name: /Buyer Side Transaction/ }));

    expect(sessionStorage.getItem('tc_transaction_side')).toBe('BUYER');
    expect(mockPush).toHaveBeenCalledWith('/transactions/new/contract');
  });

  it('does not navigate or persist anything when the locked Seller Side card is clicked', async () => {
    const user = userEvent.setup();
    render(<TransactionSideSelector />);

    await user.click(screen.getByText('Seller Side Transaction'));

    expect(sessionStorage.getItem('tc_transaction_side')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
