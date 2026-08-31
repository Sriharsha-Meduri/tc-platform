import { TransactionDraftService } from './transaction-draft.service';
import { TransactionEntity, TransactionStatus, TransactionType, TransactionSide, CoordinatorSide } from './entities/transaction.entity';
import { ContactEntity } from '../contacts/entities/contact.entity';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionClockService } from '../transaction-clock/transaction-clock.service';
import type { ExtractionResult } from '../document-extraction/extraction-result.types';
import type { ComplianceResult } from '../document-extraction/compliance-result.types';

function makeExtraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    documentType: 'Residential Purchase Agreement',
    documentSubtypes: [],
    sourceLanguage: 'en',
    property: {
      streetAddress: '123 Main St', city: 'Chino', state: 'CA', postalCode: '91710',
      county: null, apn: null, mlsNumber: null, legalDescription: null,
    },
    transaction: {
      purchasePrice: 850000, earnestMoneyAmount: 17000, offerDate: '2026-05-01',
      acceptanceDate: '2026-05-03', closingDate: '2026-06-15', possessionDate: null,
      financingType: 'Conventional', loanAmount: 680000, occupancyType: 'Primary Residence',
    },
    parties: {
      buyers: [{ fullName: 'John Buyer', email: 'john@test.com', phone: '555-0100', mailingAddress: '456 Oak Ave', signaturePresent: true, confidence: 0.99 }],
      sellers: [{ fullName: 'Sally Seller', email: null, phone: null, mailingAddress: '123 Main St', signaturePresent: true, confidence: 0.98 }],
      buyerAgents: [], listingAgents: [], brokers: [],
      escrowCompanies: [], lenders: [], attorneys: [], otherParties: [],
    },
    contractTerms: {} as ExtractionResult['contractTerms'],
    formsAndDisclosures: [],
    signatures: {
      buyerSigned: true, sellerSigned: true, signedParties: [], missingSignatures: [], missingSignatureDates: [],
    },
    extractionWarnings: [],
    confidenceSummary: { overall: 0.95, property: 0.95, transaction: 0.95, parties: 0.95, formsAndDisclosures: 0.95 },
    ...overrides,
  };
}

const COMPLIANCE = {
  checks: [], blockers: [], warnings: [],
  sourceType: 'acroform',
  acroFieldCount: 0,
  summary: { overallStatus: 'pass' },
} as unknown as ComplianceResult;
const INTERACTION = { id: 'interaction-1' } as never;

function createService() {
  const transactionsRepo = {
    create: jest.fn((input: Partial<TransactionEntity>) => ({ ...input, id: 'tx-1' })),
    save: jest.fn(async (x: TransactionEntity) => x),
  };
  const contactsRepo = {
    create: jest.fn((input: Partial<ContactEntity>) => ({ ...input, id: 'contact-1' })),
    save: jest.fn(async (x: ContactEntity) => x),
  };
  const partiesRepo = { create: jest.fn(), save: jest.fn() };
  const documentsRepo = {
    create: jest.fn((input: Partial<TransactionDocumentEntity>) => ({ ...input, id: 'doc-1' })),
    save: jest.fn(async (x: TransactionDocumentEntity) => x),
  };
  const clockService = { createForTransaction: jest.fn().mockResolvedValue(undefined) };

  const service = new TransactionDraftService(
    transactionsRepo as never,
    contactsRepo as never,
    partiesRepo as never,
    documentsRepo as never,
    clockService as unknown as TransactionClockService,
  );
  return { service, transactionsRepo };
}

describe('TransactionDraftService — transactionSide', () => {
  it('defaults a newly created draft to BUYER when transactionSide is omitted (backward compatibility)', async () => {
    const { service, transactionsRepo } = createService();

    await service.createFromExtraction(makeExtraction(), INTERACTION, COMPLIANCE, 'org-1', 'acct-1');

    const created = transactionsRepo.create.mock.calls[0][0] as Partial<TransactionEntity>;
    expect(created.transactionSide).toBe(CoordinatorSide.BUYER);
  });

  it('persists SELLER when transactionSide=SELLER is provided', async () => {
    const { service, transactionsRepo } = createService();

    await service.createFromExtraction(
      makeExtraction(), INTERACTION, COMPLIANCE, 'org-1', 'acct-1', undefined, undefined, CoordinatorSide.SELLER,
    );

    const created = transactionsRepo.create.mock.calls[0][0] as Partial<TransactionEntity>;
    expect(created.transactionSide).toBe(CoordinatorSide.SELLER);
  });

  it('keeps the existing buyer workflow fields unchanged for a buyer-side draft', async () => {
    const { service } = createService();

    const draft = await service.createFromExtraction(makeExtraction(), INTERACTION, COMPLIANCE, 'org-1', 'acct-1');

    expect(draft.transaction.transactionNumber).toMatch(/^TXN-\d{4}-[A-Z0-9]{6}$/);
    expect(draft.transaction.transactionType).toBe(TransactionType.PURCHASE);
    expect(draft.transaction.status).toBe(TransactionStatus.DRAFT);
    // Agency `side` is still auto-derived from the extracted parties (buyers + sellers → DUAL),
    // independent of the new coordinated-side field.
    expect(draft.transaction.side).toBe(TransactionSide.DUAL);
    expect(draft.transaction.transactionSide).toBe(CoordinatorSide.BUYER);
    expect(draft.transaction.contractPrice).toBe(850000);
    expect(draft.transaction.propertyAddressLine1).toBe('123 Main St');
  });
});
