import type { ExtractionResult } from '../document-extraction/extraction-result.types';

/**
 * Canned, schema-valid RPA extraction result for Mock Test Mode's "create test
 * transaction" step — passed as `mockExtractions.RPA` to the real
 * `POST extract-and-draft-routed` endpoint (see DocumentExtractionController.
 * parseMockExtractions/mockExtractionsToSnaps) so the LLM call is skipped but
 * every other step of the real orchestration (compliance check, AiInteraction
 * persistence, contract-chain resolution, draft creation, S3 upload) still runs
 * for real. Shape mirrors the fixture already exercised by
 * transaction-draft.service.spec.ts, so this is known to satisfy the real
 * `ExtractionResult` contract rather than a hand-guessed payload.
 */
export function buildMockRpaExtraction(propertyAddress: {
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
}): ExtractionResult {
  return {
    documentType: 'Residential Purchase Agreement',
    documentSubtypes: [],
    sourceLanguage: 'en',
    property: {
      streetAddress: propertyAddress.streetAddress,
      city: propertyAddress.city,
      state: propertyAddress.state,
      postalCode: propertyAddress.postalCode,
      county: null,
      apn: null,
      mlsNumber: null,
      legalDescription: null,
    },
    transaction: {
      purchasePrice: 850000,
      earnestMoneyAmount: 17000,
      offerDate: new Date().toISOString().slice(0, 10),
      acceptanceDate: new Date().toISOString().slice(0, 10),
      closingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      possessionDate: null,
      financingType: 'Conventional',
      loanAmount: 680000,
      occupancyType: 'Primary Residence',
    },
    parties: {
      buyers: [{ fullName: 'Test Buyer', email: 'test-buyer@example.com', phone: '555-0100', mailingAddress: '456 Oak Ave', signaturePresent: true, confidence: 0.99 }],
      sellers: [{ fullName: 'Test Seller', email: null, phone: null, mailingAddress: propertyAddress.streetAddress, signaturePresent: true, confidence: 0.98 }],
      buyerAgents: [],
      listingAgents: [],
      brokers: [],
      escrowCompanies: [],
      lenders: [],
      attorneys: [],
      otherParties: [],
    },
    contractTerms: {} as ExtractionResult['contractTerms'],
    formsAndDisclosures: [],
    signatures: {
      buyerSigned: true,
      sellerSigned: true,
      signedParties: [],
      missingSignatures: [],
      missingSignatureDates: [],
    },
    extractionWarnings: [],
    confidenceSummary: { overall: 0.95, property: 0.95, transaction: 0.95, parties: 0.95, formsAndDisclosures: 0.95 },
  };
}
