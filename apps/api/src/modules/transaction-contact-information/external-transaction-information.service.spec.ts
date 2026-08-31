import { ExternalTransactionInformationService, SaveTransactionInformationDto } from './external-transaction-information.service';

interface FakeRow {
  transactionId: string;
  [key: string]: unknown;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

/** In-memory stand-in for a real TypeORM-backed info service, faithfully mirroring upsertWithDiff's no-op/diff semantics. */
function makeFakeInfoService() {
  const store = new Map<string, FakeRow>();

  const findByTransaction = jest.fn(async (transactionId: string) => store.get(transactionId) ?? null);

  const upsert = jest.fn(async (transactionId: string, input: Record<string, unknown>) => {
    const existing = store.get(transactionId) ?? null;
    const changedFields: string[] = [];
    const previousValues: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const prev = existing ? existing[key] : null;
      if (!valuesEqual(prev, value)) {
        changedFields.push(key);
        previousValues[key] = prev ?? null;
      }
    }

    if (changedFields.length === 0) {
      return { entity: existing, changedFields: [], previousValues: {}, hadChanges: false };
    }

    const merged: FakeRow = { ...(existing ?? {}), transactionId, ...input };
    store.set(transactionId, merged);
    return { entity: merged, changedFields, previousValues, hadChanges: true };
  });

  return { store, findByTransaction, upsert };
}

const LINK = {
  id: 'link-1',
  purpose: 'document_upload',
  recipientRole: 'buyer_agent',
  recipientName: 'Alice Agent',
  recipientEmail: 'alice@brokerage.com',
  recipientPartyId: 'party-ba-1',
};
const SELLER_AGENT_LINK = {
  id: 'link-sa-1',
  purpose: 'seller_agent_document_upload',
  recipientRole: 'seller_agent',
  recipientName: 'Sam Seller Agent',
  recipientEmail: 'sam@brokerage.com',
  recipientPartyId: 'party-sa-1',
};
const BROKER_LINK = {
  id: 'link-broker-1',
  purpose: 'broker_document_upload',
  recipientRole: 'other',
  recipientName: 'Bobby Broker',
  recipientEmail: 'bobby@brokerhq.com',
  recipientPartyId: null,
};
const TRANSACTION = { id: 'tx-1', transactionNumber: 'TXN-1' };
const OTHER_TRANSACTION = { id: 'tx-2', transactionNumber: 'TXN-2' };

/** Default document fixture — not a gate (submission is never blocked on document uploads), just a reasonable default for extraction-fallback tests. */
const REQUIRED_DOCS_PRESENT = [
  { createdAt: new Date('2026-01-01'), documentType: 'lender_prequalification', metadataJson: null },
  { createdAt: new Date('2026-01-01'), documentType: 'proof_of_funds', metadataJson: null },
];

/** Default checklist fixture for getDocumentChecklist tests. */
const CHECKLIST_COMPLETE = { items: [], unmatchedDocuments: [], requiredCount: 0, submittedCount: 0, allRequiredSubmitted: true };

function buildService(overrides: {
  findActiveByTransactionImpl?: () => Promise<unknown[]>;
  getChecklistStatusImpl?: () => Promise<unknown>;
  getSellerAgentChecklistStatusImpl?: () => Promise<unknown>;
  getEscrowChecklistStatusImpl?: () => Promise<unknown>;
  getBrokerChecklistStatusImpl?: () => Promise<unknown>;
  findByTargetImpl?: () => Promise<unknown[]>;
} = {}) {
  const documentsService = { findActiveByTransaction: jest.fn(overrides.findActiveByTransactionImpl ?? (async () => REQUIRED_DOCS_PRESENT)) };
  const auditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
    findByTarget: jest.fn(overrides.findByTargetImpl ?? (async () => [])),
  };
  const lenderInformationService = makeFakeInfoService();
  const escrowInformationService = makeFakeInfoService();
  const hoaInformationService = makeFakeInfoService();
  const brokerCommissionService = makeFakeInfoService();
  const buyerSideInformationService = makeFakeInfoService();
  const brokerInformationService = makeFakeInfoService();
  const formTemplatesService = {
    getChecklistStatus: jest.fn(overrides.getChecklistStatusImpl ?? (async () => CHECKLIST_COMPLETE)),
    getSellerAgentChecklistStatus: jest.fn(overrides.getSellerAgentChecklistStatusImpl ?? (async () => CHECKLIST_COMPLETE)),
    getEscrowChecklistStatus: jest.fn(overrides.getEscrowChecklistStatusImpl ?? (async () => CHECKLIST_COMPLETE)),
    getBrokerChecklistStatus: jest.fn(overrides.getBrokerChecklistStatusImpl ?? (async () => CHECKLIST_COMPLETE)),
  };

  const service = new ExternalTransactionInformationService(
    documentsService as never,
    auditLogService as never,
    lenderInformationService as never,
    escrowInformationService as never,
    hoaInformationService as never,
    brokerCommissionService as never,
    buyerSideInformationService as never,
    brokerInformationService as never,
    formTemplatesService as never,
  );

  return { service, documentsService, auditLogService, lenderInformationService, escrowInformationService, hoaInformationService, brokerCommissionService, buyerSideInformationService, brokerInformationService, formTemplatesService };
}

describe('ExternalTransactionInformationService — lender information', () => {
  it('creates lender information on first save, then updates it on a later save', async () => {
    const { service } = buildService();

    const first = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith', lenderEmail: 'john@lending.com' },
    });
    expect(first.lender).toEqual({ lenderName: 'John Smith', lenderEmail: 'john@lending.com' });

    const second = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'Jane Doe', lenderEmail: 'jane@lending.com' },
    });
    expect(second.lender).toEqual({ lenderName: 'Jane Doe', lenderEmail: 'jane@lending.com' });
  });

  it('rejects an invalid lender email and saves nothing at all', async () => {
    const { service, lenderInformationService, auditLogService } = buildService();

    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith', lenderEmail: 'not-an-email' },
    })).rejects.toThrow('Lender email is not a valid email address.');

    expect(lenderInformationService.upsert).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });
});

describe('ExternalTransactionInformationService — escrow information', () => {
  it('saves escrow contact name and email', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      escrow: { escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' },
    });
    expect(result.escrow).toEqual({ escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' });
  });

  it('rejects an invalid escrow email', async () => {
    const { service, escrowInformationService } = buildService();
    await expect(service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      escrow: { escrowContactName: 'Pat Escrow', escrowEmail: 'bad-email' },
    })).rejects.toThrow('Escrow email is not a valid email address.');
    expect(escrowInformationService.upsert).not.toHaveBeenCalled();
  });

  it('rejects escrow submitted from the Buyer Agent link — escrow moved to the Seller Agent workflow', async () => {
    const { service, escrowInformationService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      escrow: { escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' },
    })).rejects.toThrow('Escrow and HOA information can only be submitted from the Seller Agent upload link.');
    expect(escrowInformationService.upsert).not.toHaveBeenCalled();
  });
});

describe('ExternalTransactionInformationService — HOA information', () => {
  it('saves hasHoa: true and persists it', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, { hoa: { hasHoa: true } });
    expect(result.hoa).toEqual({ hasHoa: true });
  });

  it('saves hasHoa: false and persists it', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, { hoa: { hasHoa: false } });
    expect(result.hoa).toEqual({ hasHoa: false });
  });

  it('saving hasHoa: true succeeds with no document uploaded — an HOA document is never required', async () => {
    const { service } = buildService();
    await expect(service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, { hoa: { hasHoa: true } })).resolves.toBeDefined();
  });

  it('leaves hasHoa unanswered (null) when never submitted', async () => {
    const { service } = buildService();
    const result = await service.getPrefillData(SELLER_AGENT_LINK as never, TRANSACTION as never);
    expect(result.hoa.hasHoa).toBeNull();
  });

  it('rejects HOA submitted from the Buyer Agent link — HOA moved to the Seller Agent workflow', async () => {
    const { service, hoaInformationService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION as never, { hoa: { hasHoa: true } }))
      .rejects.toThrow('Escrow and HOA information can only be submitted from the Seller Agent upload link.');
    expect(hoaInformationService.upsert).not.toHaveBeenCalled();
  });
});

describe('ExternalTransactionInformationService — per-field purpose gating', () => {
  it('rejects lender submitted from the Seller Agent link', async () => {
    const { service, lenderInformationService } = buildService();
    await expect(service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith', lenderEmail: 'john@lending.com' },
    })).rejects.toThrow('Lender and buyer broker commission information can only be submitted from the Buyer Agent upload link.');
    expect(lenderInformationService.upsert).not.toHaveBeenCalled();
  });
});

describe('ExternalTransactionInformationService — buyer broker commission information (merged section)', () => {
  it('saves brokerage name, broker full name, broker email, payment address, and buyer credits', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: {
        brokerageName: 'Sunset Realty', brokerFullName: 'Bob Broker', brokerEmail: 'bob@sunsetrealty.com',
        buyerAgentPaymentAddress: '123 Payment Ln, Los Angeles, CA 90001', clientCredits: 500.5,
      },
    });
    expect(result.buyerSide).toEqual({
      brokerageName: 'Sunset Realty', brokerFullName: 'Bob Broker', brokerEmail: 'bob@sunsetrealty.com',
      buyerAgentPaymentAddress: '123 Payment Ln, Los Angeles, CA 90001', clientCredits: 500.5,
      buyerCommissionType: null, buyerCommissionValue: null, grossCommission: null,
    });
  });

  it('prefills previously saved buyerSide values (including the payment address) on a later getPrefillData call', async () => {
    const { service } = buildService();
    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: {
        brokerageName: 'Sunset Realty', brokerFullName: 'Bob Broker', brokerEmail: 'bob@sunsetrealty.com',
        buyerAgentPaymentAddress: '123 Payment Ln, Los Angeles, CA 90001', clientCredits: 0,
      },
    });
    const prefill = await service.getPrefillData(LINK as never, TRANSACTION as never);
    expect(prefill.buyerSide).toEqual({
      brokerageName: 'Sunset Realty', brokerFullName: 'Bob Broker', brokerEmail: 'bob@sunsetrealty.com',
      buyerAgentPaymentAddress: '123 Payment Ln, Los Angeles, CA 90001', clientCredits: 0,
      buyerCommissionType: null, buyerCommissionValue: null, grossCommission: null,
    });
  });

  it('leaves buyerAgentPaymentAddress null when never saved — never "Not Specified"', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: { brokerageName: 'Sunset Realty' },
    });
    expect(result.buyerSide.buyerAgentPaymentAddress).toBeNull();
  });

  it('$0 buyer credits is a valid, distinct value from null (no credits answered)', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: { clientCredits: 0 },
    });
    expect(result.buyerSide.clientCredits).toBe(0);
  });

  it('rejects an invalid broker email and saves nothing at all', async () => {
    const { service, buyerSideInformationService, auditLogService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: { brokerEmail: 'not-an-email' },
    })).rejects.toThrow('Enter a valid broker email address.');
    expect(buyerSideInformationService.upsert).not.toHaveBeenCalled();
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it.each([
    ['negative', -5],
    ['more than 2 decimal places', 5.999],
    ['not finite', Infinity],
    ['NaN', NaN],
  ])('rejects buyer credits that is %s', async (_label, clientCredits) => {
    const { service, buyerSideInformationService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: { clientCredits },
    })).rejects.toThrow('Buyer Credit(s) must be a valid, non-negative dollar amount with at most 2 decimal places.');
    expect(buyerSideInformationService.upsert).not.toHaveBeenCalled();
  });

  it.each([0, 500, 500.5, 500.55, 1250.5])('accepts a valid buyer credits amount: %s', async (clientCredits) => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: { clientCredits },
    });
    expect(result.buyerSide.clientCredits).toBe(clientCredits);
  });

  it('rejects buyerSide submitted from the Seller Agent link', async () => {
    const { service, buyerSideInformationService } = buildService();
    await expect(service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      buyerSide: { brokerageName: 'Sunset Realty' },
    })).rejects.toThrow('Lender and buyer broker commission information can only be submitted from the Buyer Agent upload link.');
    expect(buyerSideInformationService.upsert).not.toHaveBeenCalled();
  });

  it('saving buyerSide from the Buyer Agent link never touches escrow/HOA (seller-side) data, and vice versa', async () => {
    const { service } = buildService();

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: {
        brokerageName: 'Sunset Realty', brokerFullName: 'Bob Broker', brokerEmail: 'bob@sunsetrealty.com',
        buyerAgentPaymentAddress: '123 Payment Ln, Los Angeles, CA 90001', clientCredits: 500,
      },
    });
    await service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      escrow: { escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' },
      hoa: { hasHoa: true },
    });

    const result = await service.getPrefillData(LINK as never, TRANSACTION as never);
    expect(result.buyerSide).toEqual({
      brokerageName: 'Sunset Realty', brokerFullName: 'Bob Broker', brokerEmail: 'bob@sunsetrealty.com',
      buyerAgentPaymentAddress: '123 Payment Ln, Los Angeles, CA 90001', clientCredits: 500,
      buyerCommissionType: null, buyerCommissionValue: null, grossCommission: null,
    });
    expect(result.escrow).toEqual({ escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' });
    expect(result.hoa).toEqual({ hasHoa: true });
  });

  it('preserves an existing brokerage name saved via the old (pre-merge) commission section when the merged section has never saved its own', async () => {
    const { service, brokerCommissionService } = buildService();
    // Simulates data saved before the two sections were merged — the old
    // commission table's own brokerageName, with nothing yet saved to the
    // new merged buyerSide table.
    await brokerCommissionService.upsert(TRANSACTION.id, { brokerageName: 'Legacy Realty Group' });

    const prefill = await service.getPrefillData(LINK as never, TRANSACTION as never);
    expect(prefill.buyerSide.brokerageName).toBe('Legacy Realty Group');
  });

  it('prefers the merged section\'s own brokerage name over the old commission table\'s value once it has been saved', async () => {
    const { service, brokerCommissionService } = buildService();
    await brokerCommissionService.upsert(TRANSACTION.id, { brokerageName: 'Legacy Realty Group' });

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: { brokerageName: 'Sunset Realty' },
    });

    const prefill = await service.getPrefillData(LINK as never, TRANSACTION as never);
    expect(prefill.buyerSide.brokerageName).toBe('Sunset Realty');
  });

  it('logs BUYER_SIDE_INFO_UPDATED only when a field actually changes', async () => {
    const { service, auditLogService } = buildService();
    const dto: SaveTransactionInformationDto = { buyerSide: { brokerageName: 'Sunset Realty' } };

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, dto);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'buyer_side_info_updated', targetType: 'buyer_side_information' }));

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, dto);
    expect(auditLogService.log).toHaveBeenCalledTimes(1); // no new entry for the identical resubmit
  });
});

describe('ExternalTransactionInformationService — buyer commission calculation', () => {
  const TRANSACTION_WITH_PRICE = { ...TRANSACTION, contractPrice: 500000 };

  it('computes grossCommission as contractPrice × percentage for a percentage commission', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 },
    });
    expect(result.buyerSide).toMatchObject({
      buyerCommissionType: 'percentage', buyerCommissionValue: 3, grossCommission: 15000,
    });
  });

  it('computes grossCommission as the flat amount itself for a flat-amount commission, ignoring contractPrice', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'flat_amount', buyerCommissionValue: 12000 },
    });
    expect(result.buyerSide).toMatchObject({
      buyerCommissionType: 'flat_amount', buyerCommissionValue: 12000, grossCommission: 12000,
    });
  });

  it('leaves grossCommission null when the transaction has no contractPrice yet', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 },
    });
    expect(result.buyerSide.grossCommission).toBeNull();
  });

  it('leaves grossCommission null when only one of type/value has been saved', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'percentage' },
    });
    expect(result.buyerSide.grossCommission).toBeNull();
  });

  it('recomputes grossCommission from the previously saved type/value when only one is resubmitted', async () => {
    const { service } = buildService();
    await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 },
    });
    // Resubmitting only the value should reuse the already-saved 'percentage' type.
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionValue: 4 },
    });
    expect(result.buyerSide).toMatchObject({ buyerCommissionType: 'percentage', buyerCommissionValue: 4, grossCommission: 20000 });
  });

  it('does not null out an already-computed grossCommission when saving an unrelated field', async () => {
    const { service } = buildService();
    await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 },
    });
    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { brokerageName: 'Sunset Realty' },
    });
    expect(result.buyerSide.grossCommission).toBe(15000);
  });

  it('rejects an invalid buyerCommissionType', async () => {
    const { service, buyerSideInformationService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'bogus' as never },
    })).rejects.toThrow("Buyer commission type must be 'percentage' or 'flat_amount'.");
    expect(buyerSideInformationService.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['negative', -5],
    ['more than 2 decimal places', 5.999],
    ['not finite', Infinity],
    ['NaN', NaN],
  ])('rejects a buyerCommissionValue that is %s', async (_label, buyerCommissionValue) => {
    const { service, buyerSideInformationService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'flat_amount', buyerCommissionValue },
    })).rejects.toThrow('Buyer commission value must be a valid, non-negative number with at most 2 decimal places.');
    expect(buyerSideInformationService.upsert).not.toHaveBeenCalled();
  });

  it('rejects a percentage commission value over 100', async () => {
    const { service, buyerSideInformationService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 150 },
    })).rejects.toThrow('Buyer commission percentage cannot exceed 100.');
    expect(buyerSideInformationService.upsert).not.toHaveBeenCalled();
  });

  it('logs BUYER_SIDE_INFO_UPDATED including the new commission fields in the diff', async () => {
    const { service, auditLogService } = buildService();
    await service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 3 },
    });
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'buyer_side_info_updated',
      targetType: 'buyer_side_information',
      details: expect.objectContaining({
        changedFields: expect.arrayContaining(['buyerCommissionType', 'buyerCommissionValue', 'grossCommission']),
      }),
    }));
  });
});

describe('ExternalTransactionInformationService — duplicate submissions', () => {
  it('resubmitting identical data writes no new audit entries', async () => {
    const { service, auditLogService } = buildService();
    const dto: SaveTransactionInformationDto = { lender: { lenderName: 'John Smith', lenderEmail: 'john@lending.com' } };

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, dto);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, dto);
    expect(auditLogService.log).toHaveBeenCalledTimes(1); // no new entry for the identical resubmit
  });

  it('resubmitting with one changed field writes exactly one new audit entry with the correct before/after diff', async () => {
    const { service, auditLogService } = buildService();

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith', lenderEmail: 'john@lending.com' },
    });
    auditLogService.log.mockClear();

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith', lenderEmail: 'john2@lending.com' },
    });

    expect(auditLogService.log).toHaveBeenCalledTimes(1);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'lender_info_updated',
      targetId: 'tx-1',
      details: expect.objectContaining({
        transactionId: 'tx-1',
        uploadLinkId: 'link-1',
        recipientPartyId: 'party-ba-1',
        recipientEmail: 'alice@brokerage.com',
        changedFields: ['lenderEmail'],
        previousValues: { lenderEmail: 'john@lending.com' },
        updatedValues: { lenderEmail: 'john2@lending.com' },
        updateSource: 'buyer_agent_secure_upload_link',
      }),
    }));
  });

  it('does not write an audit entry for a group that was not part of the submission', async () => {
    const { service, auditLogService } = buildService();
    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, { lender: { lenderName: 'John Smith' } });
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'lender_info_updated' }));
    expect(auditLogService.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'escrow_info_updated' }));
  });
});

describe('ExternalTransactionInformationService — purpose gate (expired/revoked links are rejected upstream)', () => {
  it('rejects getPrefillData with the generic message when the link purpose is not supported', async () => {
    const { service } = buildService();
    const unsupportedLink = { ...LINK, purpose: 'escrow_officer_document_upload' };
    await expect(service.getPrefillData(unsupportedLink as never, TRANSACTION as never)).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('rejects saveTransactionInformation with the generic message when the link purpose is not supported', async () => {
    const { service } = buildService();
    const unsupportedLink = { ...LINK, purpose: 'escrow_officer_document_upload' };
    await expect(service.saveTransactionInformation(unsupportedLink as never, TRANSACTION as never, { lender: { lenderName: 'X' } }))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('accepts saveTransactionInformation from a Seller Agent link (escrow/HOA fields)', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      escrow: { escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' },
    });
    expect(result.escrow).toEqual({ escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' });
  });
});

describe('ExternalTransactionInformationService — cross-transaction access prevention', () => {
  it('saved information for one transaction never appears when resolving a different transaction', async () => {
    const { service } = buildService();

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith', lenderEmail: 'john@lending.com' },
      buyerSide: { brokerageName: 'Sunset Realty', clientCredits: 500 },
    });
    await service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      escrow: { escrowContactName: 'Pat Escrow', escrowEmail: 'pat@escrowco.com' },
      hoa: { hasHoa: true },
    });

    const otherLink = { ...LINK, id: 'link-2', transactionId: 'tx-2' };
    const otherData = await service.getPrefillData(otherLink as never, OTHER_TRANSACTION as never);

    expect(otherData).toEqual({
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
    });
  });
});

describe('ExternalTransactionInformationService — prepopulation from LLM extraction', () => {
  it('falls back to extraction data for lender/escrow when no dedicated row has been saved yet', async () => {
    const { service } = buildService({
      findActiveByTransactionImpl: async () => [{
        createdAt: new Date('2026-01-01'),
        metadataJson: {
          extraction: {
            parties: {
              lenders: [{ contactName: 'Extracted Lender', email: 'extracted-lender@bank.com' }],
              escrowCompanies: [{ contactName: 'Extracted Escrow', email: 'extracted-escrow@title.com' }],
            },
          },
        },
      }],
    });

    const result = await service.getPrefillData(LINK as never, TRANSACTION as never);
    expect(result.lender).toEqual({ lenderName: 'Extracted Lender', lenderEmail: 'extracted-lender@bank.com' });
    expect(result.escrow).toEqual({ escrowContactName: 'Extracted Escrow', escrowEmail: 'extracted-escrow@title.com' });
  });

  it('stops falling back to extraction once the Buyer Agent has explicitly saved both lender and escrow values', async () => {
    const { service, documentsService } = buildService({
      findActiveByTransactionImpl: async () => [
        {
          createdAt: new Date('2026-01-01'),
          metadataJson: { extraction: { parties: { lenders: [{ contactName: 'Extracted Lender', email: 'extracted@bank.com' }] } } },
        },
        ...REQUIRED_DOCS_PRESENT,
      ],
    });

    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'Manually Entered', lenderEmail: 'manual@lending.com' },
    });
    await service.saveTransactionInformation(SELLER_AGENT_LINK as never, TRANSACTION as never, {
      escrow: { escrowContactName: 'Manual Escrow', escrowEmail: 'manual@escrowco.com' },
    });
    documentsService.findActiveByTransaction.mockClear();

    const result = await service.getPrefillData(LINK as never, TRANSACTION as never);
    expect(result.lender).toEqual({ lenderName: 'Manually Entered', lenderEmail: 'manual@lending.com' });
    expect(documentsService.findActiveByTransaction).not.toHaveBeenCalled(); // no fallback lookup needed once both real rows exist
  });

  it('never exposes internal database ids or raw extraction internals in the public prefill DTO', async () => {
    const { service } = buildService();
    await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith', lenderEmail: 'john@lending.com' },
    });
    const result = await service.getPrefillData(LINK as never, TRANSACTION as never);
    const flat = JSON.stringify(result);
    expect(flat).not.toContain('tx-1');
    expect(flat).not.toContain('link-1');
    expect(flat).not.toMatch(/storageKey|metadataJson|extraction|compliance/i);
  });
});

describe('ExternalTransactionInformationService — transaction-info submission is never gated on document uploads', () => {
  it('allows the submission when neither Lender Prequalification Letter nor Buyer Proof of Funds has been uploaded', async () => {
    const { service } = buildService({ findActiveByTransactionImpl: async () => [] });

    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, {
      lender: { lenderName: 'John Smith' },
    });
    expect(result.lender.lenderName).toBe('John Smith');
  });

  it('allows the submission when the CAR-forms checklist is incomplete', async () => {
    const { service } = buildService({
      getChecklistStatusImpl: async () => ({
        items: [{ formCode: 'RPA', formName: 'Residential Purchase Agreement', category: 'purchase_agreement', status: 'required', matchedDocument: null }],
        unmatchedDocuments: [],
        requiredCount: 1,
        submittedCount: 0,
        allRequiredSubmitted: false,
      }),
    });

    const result = await service.saveTransactionInformation(LINK as never, TRANSACTION as never, { lender: { lenderName: 'John Smith' } });
    expect(result.lender.lenderName).toBe('John Smith');
  });
});

describe('ExternalTransactionInformationService — document checklist sidebar', () => {
  it('exposes the checklist via getDocumentChecklist, gated by the same Buyer Agent purpose check', async () => {
    const checklist = {
      items: [{ formCode: 'RPA', formName: 'Residential Purchase Agreement', category: 'purchase_agreement', status: 'required', matchedDocument: null }],
      unmatchedDocuments: [],
      requiredCount: 1,
      submittedCount: 0,
      allRequiredSubmitted: false,
    };
    const { service, formTemplatesService } = buildService({ getChecklistStatusImpl: async () => checklist });

    const result = await service.getDocumentChecklist(LINK as never, TRANSACTION as never);
    expect(result).toEqual(checklist);
    expect(formTemplatesService.getChecklistStatus).toHaveBeenCalledWith(TRANSACTION, new Set());
  });

  it('rejects getDocumentChecklist with the generic message for a genuinely unsupported link purpose', async () => {
    const { service } = buildService();
    const unsupportedLink = { ...LINK, purpose: 'some_future_purpose' };
    await expect(service.getDocumentChecklist(unsupportedLink as never, TRANSACTION as never))
      .rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('routes an Escrow Officer link to the escrow-specific checklist computation instead of the Buyer Agent one', async () => {
    const escrowChecklist = {
      items: [{ formCode: 'RPA', formName: 'Signed RPA', category: 'purchase_agreement', status: 'required', matchedDocument: null }],
      unmatchedDocuments: [],
      requiredCount: 4,
      submittedCount: 0,
      allRequiredSubmitted: false,
    };
    const { service, formTemplatesService } = buildService({ getEscrowChecklistStatusImpl: async () => escrowChecklist });
    const escrowLink = { ...LINK, id: 'link-escrow-1', purpose: 'escrow_officer_document_upload' };

    const result = await service.getDocumentChecklist(escrowLink as never, TRANSACTION as never);

    expect(result).toEqual(escrowChecklist);
    expect(formTemplatesService.getEscrowChecklistStatus).toHaveBeenCalledWith(TRANSACTION);
    expect(formTemplatesService.getChecklistStatus).not.toHaveBeenCalled();
    expect(formTemplatesService.getSellerAgentChecklistStatus).not.toHaveBeenCalled();
  });

  it('routes a Seller Agent link to the seller-agent-specific, link-scoped checklist computation instead of the Buyer Agent one', async () => {
    const sellerChecklist = {
      items: [{ formCode: 'TDS', formName: 'Transfer Disclosure Statement', category: 'disclosure', status: 'required', matchedDocument: null }],
      unmatchedDocuments: [],
      requiredCount: 1,
      submittedCount: 0,
      allRequiredSubmitted: false,
    };
    const { service, formTemplatesService } = buildService({ getSellerAgentChecklistStatusImpl: async () => sellerChecklist });
    const sellerLink = { ...LINK, id: 'link-seller-1', purpose: 'seller_agent_document_upload' };

    const result = await service.getDocumentChecklist(sellerLink as never, TRANSACTION as never);

    expect(result).toEqual(sellerChecklist);
    expect(formTemplatesService.getSellerAgentChecklistStatus).toHaveBeenCalledWith(TRANSACTION, 'link-seller-1', new Set());
    expect(formTemplatesService.getChecklistStatus).not.toHaveBeenCalled();
  });

  it('passes the set of recently-rejected form codes (from the validation-failure audit trail for this link) into the seller-agent checklist computation', async () => {
    const events = [
      { action: 'seller_agent_document_validation_failed', detailsJson: { detectedFormCode: 'RPA' } },
      { action: 'seller_agent_document_validation_failed', detailsJson: { detectedFormCode: null } }, // pipeline couldn't identify a form — excluded
      { action: 'document_uploaded', detailsJson: { detectedFormCode: 'TDS' } }, // wrong action — excluded even though it has a form code
    ];
    const { service, formTemplatesService } = buildService({ findByTargetImpl: async () => events });
    const sellerLink = { ...LINK, id: 'link-seller-1', purpose: 'seller_agent_document_upload' };

    await service.getDocumentChecklist(sellerLink as never, TRANSACTION as never);

    expect(formTemplatesService.getSellerAgentChecklistStatus).toHaveBeenCalledWith(TRANSACTION, 'link-seller-1', new Set(['RPA']));
  });

  it('routes getDocumentChecklist from a Broker link to the "Sign CDA" checklist, not the generic Buyer Agent one', async () => {
    const brokerChecklist = {
      items: [{ formCode: 'signed_cda', formName: 'Sign CDA', category: 'commission', status: 'required', matchedDocument: null, uploaded: false, validationStatus: null }],
      unmatchedDocuments: [],
      requiredCount: 1,
      submittedCount: 0,
      allRequiredSubmitted: false,
    };
    const { service, formTemplatesService } = buildService({ getBrokerChecklistStatusImpl: async () => brokerChecklist });

    const result = await service.getDocumentChecklist(BROKER_LINK as never, TRANSACTION as never);

    expect(result).toEqual(brokerChecklist);
    expect(formTemplatesService.getBrokerChecklistStatus).toHaveBeenCalledWith(TRANSACTION);
    expect(formTemplatesService.getChecklistStatus).not.toHaveBeenCalled();
  });
});

describe('ExternalTransactionInformationService.getDocumentChecklistForPurpose — the no-link internal-caller entry point', () => {
  it('Buyer Agent purpose: same composition as the link-based path, with an empty rejected-form-codes set (no link id to look up)', async () => {
    const { service, formTemplatesService } = buildService({ getChecklistStatusImpl: async () => CHECKLIST_COMPLETE });
    const result = await service.getDocumentChecklistForPurpose('document_upload' as never, TRANSACTION as never);
    expect(result).toEqual(CHECKLIST_COMPLETE);
    expect(formTemplatesService.getChecklistStatus).toHaveBeenCalledWith(TRANSACTION, new Set());
  });

  it('Seller Agent purpose: composes with uploadLinkId: null and an empty rejected-form-codes set', async () => {
    const { service, formTemplatesService } = buildService({ getSellerAgentChecklistStatusImpl: async () => CHECKLIST_COMPLETE });
    const result = await service.getDocumentChecklistForPurpose('seller_agent_document_upload' as never, TRANSACTION as never);
    expect(result).toEqual(CHECKLIST_COMPLETE);
    expect(formTemplatesService.getSellerAgentChecklistStatus).toHaveBeenCalledWith(TRANSACTION, null, new Set());
  });

  it('Escrow purpose: composes exactly like the link-based path — getEscrowChecklistStatus never needed a link id anyway', async () => {
    const { service, formTemplatesService } = buildService({ getEscrowChecklistStatusImpl: async () => CHECKLIST_COMPLETE });
    const result = await service.getDocumentChecklistForPurpose('escrow_officer_document_upload' as never, TRANSACTION as never);
    expect(result).toEqual(CHECKLIST_COMPLETE);
    expect(formTemplatesService.getEscrowChecklistStatus).toHaveBeenCalledWith(TRANSACTION);
  });

  it('Broker purpose: composes exactly like the link-based path — getBrokerChecklistStatus never needed a link id anyway', async () => {
    const { service, formTemplatesService } = buildService({ getBrokerChecklistStatusImpl: async () => CHECKLIST_COMPLETE });
    const result = await service.getDocumentChecklistForPurpose('broker_document_upload' as never, TRANSACTION as never);
    expect(result).toEqual(CHECKLIST_COMPLETE);
    expect(formTemplatesService.getBrokerChecklistStatus).toHaveBeenCalledWith(TRANSACTION);
  });
});

describe('ExternalTransactionInformationService — broker commission section', () => {
  const TRANSACTION_WITH_PRICE = { ...TRANSACTION, contractPrice: 1200000 };

  async function saveBuyerCommission(service: ExternalTransactionInformationService, type: 'percentage' | 'flat_amount', value: number) {
    return service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { buyerCommissionType: type, buyerCommissionValue: value },
    });
  }

  it('saves brokerPaymentAddress, brokerCommissionType, and brokerCommissionValue', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerPaymentAddress: '456 Broker Blvd, Los Angeles, CA 90002', brokerCommissionType: 'percentage', brokerCommissionValue: 10 },
    });
    expect(result.broker).toMatchObject({
      brokerPaymentAddress: '456 Broker Blvd, Los Angeles, CA 90002', brokerCommissionType: 'percentage', brokerCommissionValue: 10,
    });
  });

  it('retrieves finalSalesPrice (the transaction contractPrice) and grossCommission (the Buyer Agent-calculated figure) as read-only values in the broker section', async () => {
    const { service } = buildService();
    await saveBuyerCommission(service, 'percentage', 2.5);

    const prefill = await service.getPrefillData(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never);
    expect(prefill.broker.finalSalesPrice).toBe(1200000);
    expect(prefill.broker.grossCommission).toBe(30000);
  });

  it('computes brokerCommissionAmount and buyerAgentCommissionAmount for a percentage broker commission', async () => {
    const { service } = buildService();
    await saveBuyerCommission(service, 'percentage', 2.5); // grossCommission = 30000

    const result = await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerCommissionType: 'percentage', brokerCommissionValue: 10 },
    });
    expect(result.broker.brokerCommissionAmount).toBe(3000);
    expect(result.broker.buyerAgentCommissionAmount).toBe(27000);
  });

  it('computes brokerCommissionAmount as the flat amount itself, and buyerAgentCommissionAmount as the remainder', async () => {
    const { service } = buildService();
    await saveBuyerCommission(service, 'percentage', 2.5); // grossCommission = 30000

    const result = await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerCommissionType: 'flat_amount', brokerCommissionValue: 5000 },
    });
    expect(result.broker.brokerCommissionAmount).toBe(5000);
    expect(result.broker.buyerAgentCommissionAmount).toBe(25000);
  });

  it('leaves brokerCommissionAmount and buyerAgentCommissionAmount null when the Buyer Agent has not saved a commission yet (no grossCommission available)', async () => {
    const { service } = buildService();
    const result = await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerCommissionType: 'percentage', brokerCommissionValue: 10 },
    });
    expect(result.broker.brokerCommissionAmount).toBeNull();
    expect(result.broker.buyerAgentCommissionAmount).toBeNull();
  });

  it('recomputes the split from the previously saved broker type/value when only the payment address is resubmitted', async () => {
    const { service } = buildService();
    await saveBuyerCommission(service, 'percentage', 2.5); // grossCommission = 30000
    await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerCommissionType: 'percentage', brokerCommissionValue: 10 },
    });

    const result = await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerPaymentAddress: '789 New Address, Los Angeles, CA 90003' },
    });
    expect(result.broker.brokerCommissionAmount).toBe(3000);
    expect(result.broker.buyerAgentCommissionAmount).toBe(27000);
  });

  it('rejects broker information submitted from the Buyer Agent link', async () => {
    const { service, brokerInformationService } = buildService();
    await expect(service.saveTransactionInformation(LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerPaymentAddress: '456 Broker Blvd' },
    })).rejects.toThrow('Broker commission information can only be submitted from the Broker upload link.');
    expect(brokerInformationService.upsert).not.toHaveBeenCalled();
  });

  it('rejects buyerSide submitted from the Broker link', async () => {
    const { service, buyerSideInformationService } = buildService();
    await expect(service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      buyerSide: { brokerageName: 'Sunset Realty' },
    })).rejects.toThrow('Lender and buyer broker commission information can only be submitted from the Buyer Agent upload link.');
    expect(buyerSideInformationService.upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid brokerCommissionType', async () => {
    const { service, brokerInformationService } = buildService();
    await expect(service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerCommissionType: 'bogus' as never },
    })).rejects.toThrow("Broker commission type must be 'percentage' or 'flat_amount'.");
    expect(brokerInformationService.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['negative', -5],
    ['more than 2 decimal places', 5.999],
    ['not finite', Infinity],
    ['NaN', NaN],
  ])('rejects a brokerCommissionValue that is %s', async (_label, brokerCommissionValue) => {
    const { service, brokerInformationService } = buildService();
    await expect(service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerCommissionType: 'flat_amount', brokerCommissionValue },
    })).rejects.toThrow('Broker commission value must be a valid, non-negative number with at most 2 decimal places.');
    expect(brokerInformationService.upsert).not.toHaveBeenCalled();
  });

  it('rejects a percentage broker commission value over 100', async () => {
    const { service, brokerInformationService } = buildService();
    await expect(service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, {
      broker: { brokerCommissionType: 'percentage', brokerCommissionValue: 150 },
    })).rejects.toThrow('Broker commission percentage cannot exceed 100.');
    expect(brokerInformationService.upsert).not.toHaveBeenCalled();
  });

  it('logs BROKER_INFO_UPDATED only when a field actually changes', async () => {
    const { service, auditLogService } = buildService();
    const dto: SaveTransactionInformationDto = { broker: { brokerPaymentAddress: '456 Broker Blvd' } };

    await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, dto);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'broker_info_updated', targetType: 'broker_information' }));

    await service.saveTransactionInformation(BROKER_LINK as never, TRANSACTION_WITH_PRICE as never, dto);
    expect(auditLogService.log).toHaveBeenCalledTimes(1); // no new entry for the identical resubmit
  });
});

describe('ExternalTransactionInformationService.recalculateCommissionsForContractPriceChange', () => {
  it('recalculates grossCommission and cascades to the broker split when the buyer commission is percentage-based', async () => {
    const { service, auditLogService } = buildService();
    const tx = { ...TRANSACTION, contractPrice: 1200000 };
    await service.saveTransactionInformation(LINK as never, tx as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 2.5 },
    });
    await service.saveTransactionInformation(BROKER_LINK as never, tx as never, {
      broker: { brokerCommissionType: 'percentage', brokerCommissionValue: 10 },
    });
    auditLogService.log.mockClear();

    const repricedTx = { ...tx, contractPrice: 1500000 };
    await service.recalculateCommissionsForContractPriceChange(repricedTx as never);

    const result = await service.getPrefillData(BROKER_LINK as never, repricedTx as never);
    expect(result.buyerSide.grossCommission).toBe(37500); // 1,500,000 * 2.5%
    expect(result.broker.brokerCommissionAmount).toBe(3750); // 37,500 * 10%
    expect(result.broker.buyerAgentCommissionAmount).toBe(33750);
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'buyer_side_info_updated', targetType: 'buyer_side_information' }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'broker_info_updated', targetType: 'broker_information' }));
  });

  it('leaves grossCommission unchanged when the buyer commission is flat-amount, but still recomputes the broker split from it', async () => {
    const { service, auditLogService } = buildService();
    const tx = { ...TRANSACTION, contractPrice: 1200000 };
    await service.saveTransactionInformation(LINK as never, tx as never, {
      buyerSide: { buyerCommissionType: 'flat_amount', buyerCommissionValue: 20000 },
    });
    await service.saveTransactionInformation(BROKER_LINK as never, tx as never, {
      broker: { brokerCommissionType: 'percentage', brokerCommissionValue: 10 },
    });
    auditLogService.log.mockClear();

    const repricedTx = { ...tx, contractPrice: 1500000 };
    await service.recalculateCommissionsForContractPriceChange(repricedTx as never);

    const result = await service.getPrefillData(BROKER_LINK as never, repricedTx as never);
    expect(result.buyerSide.grossCommission).toBe(20000); // unaffected by price
    expect(result.broker.brokerCommissionAmount).toBe(2000); // still 20,000 * 10%
    expect(auditLogService.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'buyer_side_info_updated' }));
  });

  it('is a no-op — no writes, no audit entries — when nothing has been saved yet', async () => {
    const { service, auditLogService } = buildService();
    const tx = { ...TRANSACTION, contractPrice: 1500000 };
    await service.recalculateCommissionsForContractPriceChange(tx as never);
    expect(auditLogService.log).not.toHaveBeenCalled();
  });

  it('is a no-op when the recalculated figures are identical to what is already stored', async () => {
    const { service, auditLogService } = buildService();
    const tx = { ...TRANSACTION, contractPrice: 1200000 };
    await service.saveTransactionInformation(LINK as never, tx as never, {
      buyerSide: { buyerCommissionType: 'percentage', buyerCommissionValue: 2.5 },
    });
    auditLogService.log.mockClear();

    await service.recalculateCommissionsForContractPriceChange(tx as never); // same contractPrice — nothing actually changes
    expect(auditLogService.log).not.toHaveBeenCalled();
  });
});
