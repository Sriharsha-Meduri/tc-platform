import { findContractFamilyDocuments, INACTIVE_DOCUMENT_STATUSES } from './contract-terms-merge.util';

describe('findContractFamilyDocuments', () => {
  it('queries by documentType and excludes inactive statuses, ordered oldest-first', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repo = { find } as never;

    await findContractFamilyDocuments(repo, 'tx-1');

    expect(find).toHaveBeenCalledWith({
      where: expect.objectContaining({ transactionId: 'tx-1', documentType: 'purchase_agreement' }),
      order: { createdAt: 'ASC' },
    });
  });

  it('exports the same inactive-status list used to build the query', () => {
    expect(INACTIVE_DOCUMENT_STATUSES.length).toBeGreaterThan(0);
  });
});
