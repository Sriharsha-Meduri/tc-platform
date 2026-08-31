import {
  resolveTransactionSide,
  resolveTransactionSideFromTransaction,
  TRANSACTION_SIDE_SPECS,
} from './transaction-side';

describe('transaction-side config', () => {
  beforeEach(() => sessionStorage.clear());

  it('defaults to BUYER when nothing is stored', () => {
    expect(resolveTransactionSide()).toBe('BUYER');
  });

  it('returns SELLER when tc_transaction_side=SELLER is stored', () => {
    sessionStorage.setItem('tc_transaction_side', 'SELLER');
    expect(resolveTransactionSide()).toBe('SELLER');
  });

  it('defaults persisted transactions without transactionSide to BUYER (backward compatibility)', () => {
    expect(resolveTransactionSideFromTransaction(null)).toBe('BUYER');
    expect(resolveTransactionSideFromTransaction(undefined)).toBe('BUYER');
    expect(resolveTransactionSideFromTransaction('BUYER')).toBe('BUYER');
    expect(resolveTransactionSideFromTransaction('SELLER')).toBe('SELLER');
  });

  it('keeps the buyer-side upload copy identical to the pre-existing strings', () => {
    const buyer = TRANSACTION_SIDE_SPECS.BUYER;
    expect(buyer.label).toBe('Buyer Side Transaction');
    expect(buyer.uploadTitle).toBe('Upload Contract Documents');
    expect(buyer.uploadDescription).toContain('Upload the signed purchase agreement and any addendum PDFs.');
    expect(buyer.rpaRequiredTitle).toBe('Residential Purchase Agreement (RPA) required');
    expect(buyer.roles.principal).toBe('buyers');
    expect(buyer.uploadLinkOwners).toEqual(['buyer_agent']);
    expect(buyer.emailRecipients).toEqual(['buyer', 'buyer_agent']);
  });

  it('provides a mirrored seller-side spec with placeholder configuration', () => {
    const seller = TRANSACTION_SIDE_SPECS.SELLER;
    expect(seller.value).toBe('SELLER');
    expect(seller.label).toBe('Seller Side Transaction');
    expect(seller.roles.principal).toBe('sellers');
    expect(seller.roles.agents).toBe('listingAgents');
    expect(seller.uploadLinkOwners).toEqual(['seller_agent']);
    expect(seller.emailRecipients).toEqual(['seller', 'seller_agent']);
  });
});
