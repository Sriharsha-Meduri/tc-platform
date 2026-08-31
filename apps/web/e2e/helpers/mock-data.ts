// ── Helper: build a minimal compliance result ────────────────────────────

interface ComplianceInput {
  blockerCount?: number;
  warningCount?: number;
  status?: 'compliant' | 'non_compliant';
}

export interface MockExtractResponse {
  transaction: { id: string };
  extractionResult: Record<string, unknown>;
  partiesCreated: number;
  compliance: {
    sourceType: string;
    hasAcroForm: boolean;
    acroFieldCount: number;
    checks: any[];
    blockers?: any[];
    warnings?: any[];
    summary: {
      overallStatus: 'compliant' | 'non_compliant' | 'needs_review';
      passCount: number;
      failCount: number;
      warningCount: number;
      skippedCount: number;
    };
    signatureFields: any[];
    emptyRequiredAcroFields: string[];
  };
}

function buildCompliance(input: ComplianceInput = {}): MockExtractResponse['compliance'] {
  const blockerCount = input.blockerCount ?? 0;
  const warningCount = input.warningCount ?? 0;
  const hasBlockers = blockerCount > 0;
  const hasWarnings = warningCount > 0;
  let overallStatus: 'compliant' | 'non_compliant' | 'needs_review';
  if (hasBlockers) {
    overallStatus = 'non_compliant';
  } else if (hasWarnings) {
    overallStatus = 'needs_review';
  } else {
    overallStatus = 'compliant';
  }
  return {
    sourceType: 'llm_extraction',
    hasAcroForm: false,
    acroFieldCount: 0,
    checks: [],
    blockers: blockerCount > 0 ? [{ code: 'BLOCKER-MOCK-1', message: 'Mock blocker', compositeId: 'BLOCKER-MOCK-1', formCode: 'RPA', type: 'blocker' }] : [],
    warnings: warningCount > 0 ? [{ code: 'WARN-MOCK-1', message: 'Mock warning', compositeId: 'WARN-MOCK-1', formCode: 'RPA', type: 'warning' }] : [],
    summary: {
      overallStatus,
      passCount: 0,
      failCount: blockerCount,
      warningCount,
      skippedCount: 0,
    },
    signatureFields: [],
    emptyRequiredAcroFields: [],
  };
}

// ── Mock extraction data builders ────────────────────────────────────────

export const MOCK_RPA_VALID: Record<string, unknown> = {
  documentType: 'Residential Purchase Agreement',
  documentSubtypes: ['Purchase Agreement'],
  sourceLanguage: 'en',
  property: {
    streetAddress: '123 Main St',
    city: 'Los Angeles',
    state: 'CA',
    postalCode: '90001',
    county: 'Los Angeles',
    apn: '5543-021-015',
    mlsNumber: null,
    legalDescription: null,
  },
  transaction: {
    purchasePrice: 900000,
    earnestMoneyAmount: 18000,
    offerDate: '2026-01-01',
    acceptanceDate: '2026-01-02',
    closingDate: '2026-03-01',
    possessionDate: null,
    financingType: 'Conventional',
    loanAmount: 720000,
    occupancyType: null,
  },
  parties: {
    buyers: [{ fullName: 'John Buyer', email: null, phone: null, mailingAddress: null, signaturePresent: true, confidence: 0.95 }],
    sellers: [{ fullName: 'Jane Seller', email: null, phone: null, mailingAddress: null, signaturePresent: true, confidence: 0.95 }],
    buyerAgents: [{ fullName: 'Agent A', email: 'agent.a@realty.com', phone: null, licenseNumber: 'CA-12345', companyName: 'Realty', confidence: 0.9 }],
    listingAgents: [{ fullName: 'Agent B', email: 'agent.b@realty.com', phone: null, licenseNumber: 'CA-67890', companyName: 'Realty', confidence: 0.9 }],
    brokers: [],
    escrowCompanies: [{ companyName: 'Pacific Escrow', contactName: null, email: null, phone: null, confidence: 0.9 }],
    lenders: [],
    attorneys: [],
    otherParties: [],
  },
  contractTerms: {
    inspectionContingencyDays: 17,
    loanContingencyDays: 21,
    appraisalContingencyDays: 17,
    disclosuresDueDays: 7,
    otherDeadlines: [],
  },
  formsAndDisclosures: [],
  signatures: {
    buyerSigned: true,
    sellerSigned: true,
    signedParties: ['John Buyer', 'Jane Seller'],
    missingSignatures: [],
  },
  extractionWarnings: [],
  confidenceSummary: { overall: 0.95, property: 0.95, transaction: 0.95, parties: 0.95, formsAndDisclosures: null },
};

export const MOCK_RPA_MISSING_PRICE: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  transaction: {
    ...MOCK_RPA_VALID.transaction as Record<string, unknown>,
    purchasePrice: null,
  },
};

export const MOCK_RPA_MISSING_SIGNATURES: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  signatures: {
    buyerSigned: false,
    sellerSigned: false,
    signedParties: [],
    missingSignatures: ['John Buyer', 'Jane Seller'],
  },
};

export const MOCK_RPA_COUNTER_OFFER: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  seller_acceptance: {
    accepted_subject_to_counter_offer: true,
    seller_signature_date: '2026-01-05',
    buyer_signature_date: '2026-01-01',
  },
};

export const MOCK_RPA_NULL_CONTINGENCIES: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  contractTerms: {
    inspectionContingencyDays: null,
    loanContingencyDays: null,
    appraisalContingencyDays: null,
    disclosuresDueDays: null,
    otherDeadlines: [],
  },
};

export const MOCK_RPA_PARTIAL_CONTINGENCIES: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  contractTerms: {
    inspectionContingencyDays: 17,
    loanContingencyDays: null,
    appraisalContingencyDays: null,
    disclosuresDueDays: 7,
    otherDeadlines: [],
  },
};

export const MOCK_RPA_NULL_ACCEPTANCE: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  transaction: {
    ...MOCK_RPA_VALID.transaction as Record<string, unknown>,
    acceptanceDate: null,
  },
};

export const MOCK_RPA_MULTI_COUNTER_OFFER: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  transaction: {
    ...MOCK_RPA_VALID.transaction as Record<string, unknown>,
    purchasePrice: 925000,
    acceptanceDate: '2026-05-02',
  },
  formsAndDisclosures: [
    { title: 'Residential Purchase Agreement', formCode: 'RPA', status: 'attached',  confidence: 0.95 },
    { title: 'Seller Counter Offer',           formCode: 'SCO', status: 'attached',  confidence: 0.92 },
    { title: 'Buyer Counter Offer',            formCode: 'BCO', status: 'attached',  confidence: 0.88 },
  ],
  seller_acceptance: {
    accepted_subject_to_counter_offer: true,
    seller_signature_date: '2026-05-02',
    buyer_signature_date: '2026-05-01',
  },
};

export const MOCK_RPA_BCO_ONLY: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  transaction: {
    ...MOCK_RPA_VALID.transaction as Record<string, unknown>,
    purchasePrice: 950000,
    acceptanceDate: '2026-05-03',
  },
  formsAndDisclosures: [
    { title: 'Residential Purchase Agreement', formCode: 'RPA', status: 'attached', confidence: 0.95 },
    { title: 'Buyer Counter Offer',            formCode: 'BCO', status: 'attached', confidence: 0.88 },
  ],
  seller_acceptance: {
    accepted_subject_to_counter_offer: true,
    seller_signature_date: '2026-05-03',
    buyer_signature_date: '2026-05-01',
  },
};

export const MOCK_RPA_FLAG_FALSE_WITH_SCO: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  transaction: {
    ...MOCK_RPA_VALID.transaction as Record<string, unknown>,
    purchasePrice: 880000,
  },
  formsAndDisclosures: [
    { title: 'Residential Purchase Agreement', formCode: 'RPA', status: 'attached', confidence: 0.95 },
    { title: 'Seller Counter Offer',           formCode: 'SCO', status: 'attached', confidence: 0.92 },
  ],
  seller_acceptance: {
    accepted_subject_to_counter_offer: false,
    seller_signature_date: '2026-01-02',
    buyer_signature_date: '2026-01-01',
  },
};

export const MOCK_RPA_FLAG_TRUE_NO_COUNTER: Record<string, unknown> = {
  ...MOCK_RPA_VALID,
  transaction: {
    ...MOCK_RPA_VALID.transaction as Record<string, unknown>,
    purchasePrice: 975000,
    acceptanceDate: '2026-05-04',
  },
  formsAndDisclosures: [
    { title: 'Residential Purchase Agreement', formCode: 'RPA', status: 'attached', confidence: 0.95 },
  ],
  seller_acceptance: {
    accepted_subject_to_counter_offer: true,
    seller_signature_date: '2026-05-04',
    buyer_signature_date: '2026-05-01',
  },
};

export const MOCK_NON_RPA: Record<string, unknown> = {
  documentType: 'Unknown Document',
  documentSubtypes: [],
  sourceLanguage: 'en',
  property: { streetAddress: null, city: null, state: null, postalCode: null, county: null, apn: null, mlsNumber: null, legalDescription: null },
  transaction: { purchasePrice: null, earnestMoneyAmount: null, offerDate: null, acceptanceDate: null, closingDate: null, possessionDate: null, financingType: null, loanAmount: null, occupancyType: null },
  parties: { buyers: [], sellers: [], buyerAgents: [], listingAgents: [], brokers: [], escrowCompanies: [], lenders: [], attorneys: [], otherParties: [] },
  contractTerms: { inspectionContingencyDays: null, loanContingencyDays: null, appraisalContingencyDays: null, disclosuresDueDays: null, otherDeadlines: [] },
  formsAndDisclosures: [],
  signatures: { buyerSigned: false, sellerSigned: false, signedParties: [], missingSignatures: [] },
  extractionWarnings: [],
  rawFacts: {},
  confidenceSummary: { overall: 0, property: 0, transaction: 0, parties: 0, formsAndDisclosures: null },
};

// ── Full mock response builders ──────────────────────────────────────────

let txCounter = 1000;

export function buildMockExtractResponse(
  extractionData: Record<string, unknown>,
  complianceInput?: ComplianceInput,
): MockExtractResponse {
  txCounter += 1;
  const transactionId = `mock-tx-${txCounter}`;
  return {
    transaction: { id: transactionId },
    extractionResult: extractionData,
    partiesCreated: 2,
    compliance: buildCompliance(complianceInput),
  };
}

export function buildMockExtractResponseWithBlockers(
  extractionData: Record<string, unknown>,
  blockerCount: number = 1,
  warningCount: number = 0,
): MockExtractResponse {
  return buildMockExtractResponse(extractionData, {
    blockerCount,
    warningCount,
    status: 'non_compliant',
  });
}

export function buildMockExtractResponseWithWarnings(
  extractionData: Record<string, unknown>,
  warningCount: number = 1,
): MockExtractResponse {
  return buildMockExtractResponse(extractionData, {
    blockerCount: 0,
    warningCount,
    status: 'compliant',
  });
}

export function buildMockWithOtherDeadlines(
  deadlines: Array<{ label: string; value: string | null }>,
): Record<string, unknown> {
  return {
    ...MOCK_RPA_VALID,
    contractTerms: {
      ...MOCK_RPA_VALID.contractTerms as Record<string, unknown>,
      otherDeadlines: deadlines,
    },
  };
}
