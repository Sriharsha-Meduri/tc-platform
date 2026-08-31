import { describe, it, expect } from 'vitest';
import { validateContractStage } from '../../src/validator/stages/contract.stage';
import { REQUIRED_FORM_REVISIONS } from '../../src/validator/stages/contract.blocker-catalog';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';

/** A revision guaranteed to differ from whatever is currently configured. */
function wrongRevision(formCode: string): string {
  const required = REQUIRED_FORM_REVISIONS[formCode];
  return required === '1/1' ? '2/2' : '1/1';
}

const baseData = {
  documentType: 'RPA',
  documentSubtypes: [],
  sourceLanguage: 'en',
  property: {
    streetAddress: '123 Main St', city: 'Los Angeles', state: 'CA',
    postalCode: '90001', county: 'Los Angeles', apn: '5543-021-015',
    mlsNumber: null, legalDescription: null,
  },
  transaction: {
    purchasePrice: 900000, earnestMoneyAmount: 18000,
    offerDate: '2026-01-01', acceptanceDate: '2026-01-02', closingDate: '2026-03-01',
    possessionDate: null, financingType: 'Conventional', loanAmount: 720000, occupancyType: null,
  },
  parties: {
    buyers:        [{ fullName: 'John Buyer',  email: null, phone: null, mailingAddress: null, signaturePresent: true,  confidence: 0.95 }],
    sellers:       [{ fullName: 'Jane Seller', email: null, phone: null, mailingAddress: null, signaturePresent: true,  confidence: 0.95 }],
    buyerAgents:   [{ fullName: 'Agent A', email: null, phone: null, licenseNumber: 'CA-12345', companyName: 'Realty', confidence: 0.9 }],
    listingAgents: [{ fullName: 'Agent B', email: null, phone: null, licenseNumber: 'CA-67890', companyName: 'Realty', confidence: 0.9 }],
    brokers: [], escrowCompanies: [{ companyName: 'Pacific Escrow', contactName: null, email: null, phone: null, confidence: 0.9 }],
    lenders: [], attorneys: [], otherParties: [],
  },
  contractTerms: {
    inspectionContingencyDays: 17, loanContingencyDays: 21, appraisalContingencyDays: 17,
    disclosuresDueDays: 7, otherDeadlines: [],
  },
  formsAndDisclosures: [],
  signatures: { buyerSigned: true, sellerSigned: true, signedParties: ['John Buyer', 'Jane Seller'], missingSignatures: [], missingSignatureDates: [] },
  extractionWarnings: [],
  confidenceSummary: { overall: 0.95, property: 0.95, transaction: 0.95, parties: 0.95, formsAndDisclosures: null },
};

function makeExtraction(data: unknown): FormExtractionOutput[] {
  return [{
    formCode: 'RPA',
    formName: 'Residential Purchase Agreement',
    data: data as Record<string, unknown>,
    rawResponse: '',
    promptTokens: null,
    completionTokens: null,
    modelName: 'test',
  }];
}

describe('validateContractStage', () => {
  it('passes when all required fields are present (no blockers)', () => {
    const result = validateContractStage(makeExtraction(baseData));
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.failCount).toBe(0);
    expect(['compliant', 'needs_review']).toContain(result.summary.overallStatus);
  });

  it('emits BLOCKER_BUYER_MISSING when buyers array is empty', () => {
    const data = { ...baseData, parties: { ...baseData.parties, buyers: [] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_BUYER_MISSING');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-RPA-1');
    expect(result.summary.overallStatus).toBe('non_compliant');
  });

  it('emits BLOCKER_SELLER_MISSING when sellers array is empty', () => {
    const data = { ...baseData, parties: { ...baseData.parties, sellers: [] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SELLER_MISSING');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-RPA-2');
  });

  it('emits BLOCKER_PURCHASE_PRICE when price is null', () => {
    const data = { ...baseData, transaction: { ...baseData.transaction, purchasePrice: null } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_PURCHASE_PRICE');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-RPA-3');
  });

  it('emits BLOCKER_CLOSING_DATE when closing date is null', () => {
    const data = { ...baseData, transaction: { ...baseData.transaction, closingDate: null } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_CLOSING_DATE');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-RPA-8');
  });

  it('runs per-form validation for AD extraction', () => {
    const result = validateContractStage([
      ...makeExtraction(baseData),
      {
        formCode: 'AD',
        formName: 'Agency Disclosure',
        data: { confirmation: { buyer_agent: 'Alice' } } as Record<string, unknown>,
        rawResponse: '',
        promptTokens: null,
        completionTokens: null,
        modelName: 'test',
      },
    ]);
    const adCheck = result.checks.find((c) => c.ruleId === 'ad_agents');
    expect(adCheck?.status).toBe('pass');
  });

  it('emits WARN_CROSS_BUYER_AGENT when agent names differ across forms', () => {
    const result = validateContractStage([
      ...makeExtraction(baseData),
      {
        formCode: 'AD',
        formName: 'Agency Disclosure',
        data: { confirmation: { buyer_agent: 'Different Agent' } } as Record<string, unknown>,
        rawResponse: '',
        promptTokens: null,
        completionTokens: null,
        modelName: 'test',
      },
    ]);
    const warning = result.warnings.find((w) => w.code === 'WARN_CROSS_BUYER_AGENT');
    expect(warning).toBeDefined();
    expect(warning?.compositeId).toBe('WARN-RPA-AD-1003');
  });

  it('returns empty result (no blockers/warnings) when no RPA present', () => {
    const result = validateContractStage([]);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.summary.failCount).toBe(0);
    expect(result.summary.warningCount).toBe(0);
  });

  // ── Contingency date warnings ────────────────────

  it('emits WARN_INSPECTION_CONTINGENCY when inspectionContingencyDays is null', () => {
    const data = { ...baseData, contractTerms: { ...baseData.contractTerms, inspectionContingencyDays: null } };
    const result = validateContractStage(makeExtraction(data));
    expect(result.warnings.find((w) => w.code === 'WARN_INSPECTION_CONTINGENCY')).toBeDefined();
    expect(result.warnings.find((w) => w.compositeId === 'WARN-RPA-19')).toBeDefined();
    expect(result.summary.overallStatus).toBe('needs_review');
  });

  it('emits WARN_LOAN_CONTINGENCY when loanContingencyDays is null and not cash', () => {
    const data = { ...baseData, contractTerms: { ...baseData.contractTerms, loanContingencyDays: null } };
    const result = validateContractStage(makeExtraction(data));
    expect(result.warnings.find((w) => w.code === 'WARN_LOAN_CONTINGENCY')).toBeDefined();
    expect(result.warnings.find((w) => w.compositeId === 'WARN-RPA-20')).toBeDefined();
  });

  it('skips WARN_LOAN_CONTINGENCY for cash transaction', () => {
    const data = {
      ...baseData,
      transaction: { ...baseData.transaction, financingType: 'Cash' },
      contractTerms: { ...baseData.contractTerms, loanContingencyDays: null },
    };
    const result = validateContractStage(makeExtraction(data));
    expect(result.warnings.find((w) => w.code === 'WARN_LOAN_CONTINGENCY')).toBeUndefined();
    const check = result.checks.find((c) => c.ruleId === 'loan_contingency');
    expect(check?.status).toBe('skipped');
    expect(check?.detail).toContain('Cash transaction');
  });

  it('emits WARN_APPRAISAL_CONTINGENCY when appraisalContingencyDays is null', () => {
    const data = { ...baseData, contractTerms: { ...baseData.contractTerms, appraisalContingencyDays: null } };
    const result = validateContractStage(makeExtraction(data));
    expect(result.warnings.find((w) => w.code === 'WARN_APPRAISAL_CONTINGENCY')).toBeDefined();
    expect(result.warnings.find((w) => w.compositeId === 'WARN-RPA-21')).toBeDefined();
  });

  it('emits WARN_DISCLOSURES_DUE when disclosuresDueDays is null', () => {
    const data = { ...baseData, contractTerms: { ...baseData.contractTerms, disclosuresDueDays: null } };
    const result = validateContractStage(makeExtraction(data));
    expect(result.warnings.find((w) => w.code === 'WARN_DISCLOSURES_DUE')).toBeDefined();
    expect(result.warnings.find((w) => w.compositeId === 'WARN-RPA-22')).toBeDefined();
  });

  it('emits all 4 contingency warnings when all contractTerms are null', () => {
    const data = {
      ...baseData,
      contractTerms: {
        inspectionContingencyDays: null, loanContingencyDays: null,
        appraisalContingencyDays: null, disclosuresDueDays: null,
        otherDeadlines: [],
      },
    };
    const result = validateContractStage(makeExtraction(data));
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('WARN_INSPECTION_CONTINGENCY');
    expect(codes).toContain('WARN_LOAN_CONTINGENCY');
    expect(codes).toContain('WARN_APPRAISAL_CONTINGENCY');
    expect(codes).toContain('WARN_DISCLOSURES_DUE');
    expect(result.summary.warningCount).toBeGreaterThanOrEqual(4);
    expect(result.summary.overallStatus).toBe('needs_review');
  });

  it('produces pass checks when all contingency days are present', () => {
    const result = validateContractStage(makeExtraction(baseData));
    const contingencyChecks = result.checks.filter((c) => c.category === 'contingencies');
    expect(contingencyChecks.every((c) => c.status === 'pass')).toBe(true);
    expect(contingencyChecks.map((c) => c.ruleId).sort()).toEqual([
      'appraisal_contingency', 'disclosures_due',
      'inspection_contingency', 'loan_contingency',
    ]);
  });

  // ── SCO per-form validation ──────────────────────

  const validScoData: Record<string, unknown> = {
    header: {
      form_version: REQUIRED_FORM_REVISIONS.SCO,
      property_address: '123 Main St',
      date: '2026-05-01',
      counter_offer_number: '1',
    },
    parties: {
      buyer_names: ['John Buyer'],
      seller_names: ['Jane Seller'],
    },
    offer_reference: {
      referenced_form_code: 'RPA',
      referenced_offer_date: '2026-04-28',
      referenced_counter_offer_number: null,
    },
    counter_offer_terms: {
      other_terms_text: 'Purchase price increased to $925,000',
      attached_addenda: [],
    },
    expiration: {
      expiration_date: '2026-05-04',
      expiration_time: '5:00',
      expiration_time_period: 'PM',
      alternative_expiration_specified: false,
    },
    section_4_offer: {
      offeror_1_signature_date: '2026-05-01',
      offeror_2_signature_date: null,
    },
    section_5_acceptance: {
      subject_to_attached_counter_offer: false,
      acceptor_1_signature_date: '2026-05-02',
      acceptor_1_signature_time: '3:00',
      acceptor_1_signature_time_period: 'PM',
      acceptor_2_signature_date: null,
      acceptor_2_signature_time: null,
      acceptor_2_signature_time_period: null,
    },
    confirmation_of_acceptance: {
      confirmation_initials: 'JS',
      confirmation_date: '2026-05-02',
      confirmation_time: '3:30',
      confirmation_time_period: 'PM',
    },
  };

  it('runs per-form SCO validation and passes well-formed SCO', () => {
    const result = validateContractStage([
      ...makeExtraction(baseData),
      {
        formCode: 'SCO',
        formName: 'Seller Counter Offer',
        data: validScoData,
        rawResponse: '',
        promptTokens: null,
        completionTokens: null,
        modelName: 'test',
      },
    ]);
    expect(result.checks.filter((c) => c.ruleId.startsWith('sco_')).every((c) => c.status === 'pass')).toBe(true);
    expect(result.warnings.filter((w) => w.code.startsWith('WARN_SCO_'))).toHaveLength(0);
  });

  it('emits SCO warnings for missing fields on SCO', () => {
    const result = validateContractStage([
      ...makeExtraction(baseData),
      {
        formCode: 'SCO',
        formName: 'Seller Counter Offer',
        data: {} as Record<string, unknown>,
        rawResponse: '',
        promptTokens: null,
        completionTokens: null,
        modelName: 'test',
      },
    ]);
    const scoWarnings = result.warnings.filter((w) => w.code.startsWith('WARN_SCO_'));
    expect(scoWarnings.length).toBeGreaterThanOrEqual(6);
    expect(scoWarnings.map((w) => w.code).sort()).toEqual([
      'WARN_SCO_ACCEPTOR_SIGNATURE',
      'WARN_SCO_BUYER_NAMES',
      'WARN_SCO_EXPIRATION',
      'WARN_SCO_OFFEROR_SIGNATURE',
      'WARN_SCO_OFFER_REFERENCE',
      'WARN_SCO_PROPERTY_ADDRESS',
      'WARN_SCO_SELLER_NAMES',
    ]);
  });

  it('runs per-form SCO validation for BCO variant', () => {
    const result = validateContractStage([
      ...makeExtraction(baseData),
      {
        formCode: 'BCO',
        formName: 'Buyer Counter Offer',
        data: validScoData,
        rawResponse: '',
        promptTokens: null,
        completionTokens: null,
        modelName: 'test',
      },
    ]);
    expect(result.checks.filter((c) => c.ruleId.startsWith('sco_')).length).toBeGreaterThan(0);
  });

  // ── SCO/BCO/SMCO revision blockers (configuration-driven) ─────────

  function makeCounterOfferExtraction(formCode: string, formName: string, header: Record<string, unknown>): FormExtractionOutput {
    return {
      formCode,
      formName,
      data: { ...validScoData, header },
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'test',
    };
  }

  it('blocks SCO when the form revision is missing', () => {
    const { form_version: _omit, ...headerWithoutRevision } = validScoData.header as Record<string, unknown>;
    const result = validateContractStage([
      ...makeExtraction(baseData),
      makeCounterOfferExtraction('SCO', 'Seller Counter Offer', headerWithoutRevision),
    ]);
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SCO_INVALID_REVISION');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-SCO-35008');
    expect(blocker?.location).toBe('Form footer — revision unreadable (required ' + REQUIRED_FORM_REVISIONS.SCO + ')');
    expect(blocker?.fields).toContain(`required_revision=${REQUIRED_FORM_REVISIONS.SCO}`);
  });

  it('blocks SCO when the form revision does not match the configured requirement', () => {
    const badRevision = wrongRevision('SCO');
    const result = validateContractStage([
      ...makeExtraction(baseData),
      makeCounterOfferExtraction('SCO', 'Seller Counter Offer', { ...(validScoData.header as Record<string, unknown>), form_version: badRevision }),
    ]);
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SCO_INVALID_REVISION');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe(`Form footer — detected ${badRevision} (required ${REQUIRED_FORM_REVISIONS.SCO})`);
    expect(blocker?.fields).toContain(`detected_revision=${badRevision}`);
    expect(blocker?.fields).toContain(`required_revision=${REQUIRED_FORM_REVISIONS.SCO}`);
  });

  it('does not block a well-formed SCO with the configured required revision', () => {
    const result = validateContractStage([
      ...makeExtraction(baseData),
      makeCounterOfferExtraction('SCO', 'Seller Counter Offer', validScoData.header as Record<string, unknown>),
    ]);
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_SCO_INVALID_REVISION')).toHaveLength(0);
    expect(result.checks.find((c) => c.ruleId === 'sco_form_revision')?.status).toBe('pass');
  });

  it('also blocks BCO and SMCO with their own codes when the revision does not match', () => {
    const badRevision = wrongRevision('BCO');
    const result = validateContractStage([
      ...makeExtraction(baseData),
      makeCounterOfferExtraction('BCO', 'Buyer Counter Offer', { ...(validScoData.header as Record<string, unknown>), form_version: badRevision }),
      makeCounterOfferExtraction('SMCO', 'Seller Multiple Counter Offer', { ...(validScoData.header as Record<string, unknown>), form_version: wrongRevision('SMCO') }),
    ]);
    const bcoBlocker = result.blockers.find((b) => b.code === 'BLOCKER_BCO_INVALID_REVISION');
    expect(bcoBlocker).toBeDefined();
    expect(bcoBlocker?.location).toBe(`Form footer — detected ${badRevision} (required ${REQUIRED_FORM_REVISIONS.BCO})`);
    const smcoBlocker = result.blockers.find((b) => b.code === 'BLOCKER_SMCO_INVALID_REVISION');
    expect(smcoBlocker).toBeDefined();
    // Cross-check: BCO's bad revision must never be reported under SCO's or SMCO's code.
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_SCO_INVALID_REVISION')).toHaveLength(0);
  });

  it('does not apply any revision blocker to BMCO, which has no configured requirement', () => {
    const result = validateContractStage([
      ...makeExtraction(baseData),
      makeCounterOfferExtraction('BMCO', 'Buyer Multiple Counter Offer Selection', { ...(validScoData.header as Record<string, unknown>), form_version: 'garbage' }),
    ]);
    expect(result.blockers.filter((b) => b.code.includes('INVALID_REVISION'))).toHaveLength(0);
  });

  it('follows the configured revision when it changes at runtime — proves the check is config-driven, not hardcoded', () => {
    const originalScoRevision = REQUIRED_FORM_REVISIONS.SCO;
    try {
      // A document that satisfies today's required revision...
      const passingResult = validateContractStage([
        ...makeExtraction(baseData),
        makeCounterOfferExtraction('SCO', 'Seller Counter Offer', { ...(validScoData.header as Record<string, unknown>), form_version: originalScoRevision }),
      ]);
      expect(passingResult.blockers.filter((b) => b.code === 'BLOCKER_SCO_INVALID_REVISION')).toHaveLength(0);

      // ...gets blocked once the configured requirement changes to something else,
      // with no change to the validation logic itself.
      REQUIRED_FORM_REVISIONS.SCO = '9/99';
      const blockedResult = validateContractStage([
        ...makeExtraction(baseData),
        makeCounterOfferExtraction('SCO', 'Seller Counter Offer', { ...(validScoData.header as Record<string, unknown>), form_version: originalScoRevision }),
      ]);
      const blocker = blockedResult.blockers.find((b) => b.code === 'BLOCKER_SCO_INVALID_REVISION');
      expect(blocker).toBeDefined();
      expect(blocker?.location).toBe(`Form footer — detected ${originalScoRevision} (required 9/99)`);

      // And a document matching the NEW configured revision passes again.
      const passingAgainResult = validateContractStage([
        ...makeExtraction(baseData),
        makeCounterOfferExtraction('SCO', 'Seller Counter Offer', { ...(validScoData.header as Record<string, unknown>), form_version: '9/99' }),
      ]);
      expect(passingAgainResult.blockers.filter((b) => b.code === 'BLOCKER_SCO_INVALID_REVISION')).toHaveLength(0);
    } finally {
      // Restore the config so later tests in this file aren't affected.
      REQUIRED_FORM_REVISIONS.SCO = originalScoRevision;
    }
  });

  // ── Counter offer expected (formerly a stage-level warning) — now purely a
  // checklist concern, never a validation blocker/warning ──────────────────

  it('does not emit WARN_MISSING_COUNTER_OFFER when RPA has accepted_subject_to_counter_offer without SCO', () => {
    const rpaWithCounterFlag = {
      ...baseData,
      seller_acceptance: {
        accepted_subject_to_counter_offer: true,
        seller_signature_date: '2026-05-01',
        buyer_signature_date: '2026-04-28',
      },
    };
    const result = validateContractStage(makeExtraction(rpaWithCounterFlag));
    const warning = result.warnings.find((w) => w.code === 'WARN_MISSING_COUNTER_OFFER');
    expect(warning).toBeUndefined();
  });

  it('still does not emit WARN_MISSING_COUNTER_OFFER when RPA has the counter offer flag and SCO is present', () => {
    const rpaWithCounterFlag = {
      ...baseData,
      seller_acceptance: {
        accepted_subject_to_counter_offer: true,
        seller_signature_date: '2026-05-01',
        buyer_signature_date: '2026-04-28',
      },
    };
    const result = validateContractStage([
      ...makeExtraction(rpaWithCounterFlag),
      {
        formCode: 'SCO',
        formName: 'Seller Counter Offer',
        data: validScoData,
        rawResponse: '',
        promptTokens: null,
        completionTokens: null,
        modelName: 'test',
      },
    ]);
    const warning = result.warnings.find((w) => w.code === 'WARN_MISSING_COUNTER_OFFER');
    expect(warning).toBeUndefined();
  });

  it('does not emit WARN_MISSING_COUNTER_OFFER when RPA has no accepted_subject_to_counter_offer', () => {
    const result = validateContractStage(makeExtraction(baseData));
    const warning = result.warnings.find((w) => w.code === 'WARN_MISSING_COUNTER_OFFER');
    expect(warning).toBeUndefined();
  });

  it('emits BLOCKER_BUYER_SIGNATURE with location when buyer has not signed', () => {
    const data = { ...baseData, signatures: { ...baseData.signatures, buyerSigned: false, missingSignatures: ['John Buyer'] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_BUYER_SIGNATURE');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe('Buyer Offer Signature(s) (Section 32D), Page 16');
  });

  it('emits BLOCKER_SELLER_SIGNATURE with location when seller has not signed', () => {
    const data = { ...baseData, signatures: { ...baseData.signatures, sellerSigned: false, missingSignatures: ['Jane Seller'] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SELLER_SIGNATURE');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe('Seller Acceptance Signature(s) (Section 33D), Page 16');
  });

  it('emits BLOCKER_BUYER_SIGNATURE_DATE with location when buyer date is missing', () => {
    const data = { ...baseData, signatures: { ...baseData.signatures, missingSignatureDates: ['John Buyer'] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_BUYER_SIGNATURE_DATE');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe('Buyer Offer Signature(s) (Section 32D), Page 16');
  });

  it('emits BLOCKER_SELLER_SIGNATURE_DATE with location when seller date is missing', () => {
    const data = { ...baseData, signatures: { ...baseData.signatures, missingSignatureDates: ['Jane Seller'] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SELLER_SIGNATURE_DATE');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe('Seller Acceptance Signature(s) (Section 33D), Page 16');
  });

  it('emits location on BLOCKER_BUYER_SIGNATURE fallback when missingSignatures is empty but buyerSigned is false', () => {
    const data = { ...baseData, signatures: { ...baseData.signatures, buyerSigned: false, missingSignatures: [] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_BUYER_SIGNATURE');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe('Buyer Offer Signature(s) (Section 32D), Page 16');
  });

  it('emits location on BLOCKER_SELLER_SIGNATURE fallback when missingSignatures is empty but sellerSigned is false', () => {
    const data = { ...baseData, signatures: { ...baseData.signatures, sellerSigned: false, missingSignatures: [] } };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_SELLER_SIGNATURE');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe('Seller Acceptance Signature(s) (Section 33D), Page 16');
  });

  // ── RPA form revision (configuration-driven) ──────────────────────────────

  it('skips form revision check when form_metadata is absent (backward compat)', () => {
    const result = validateContractStage(makeExtraction(baseData));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION');
    expect(blocker).toBeUndefined();
    expect(result.summary.failCount).toBe(0);
  });

  it('passes when form_revision matches the configured requirement', () => {
    const required = REQUIRED_FORM_REVISIONS.RPA;
    const data = {
      ...baseData,
      form_metadata: { form_revision: required, form_revision_label: `Revised ${required}` },
    };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION');
    expect(blocker).toBeUndefined();
    expect(result.summary.failCount).toBe(0);
  });

  it('emits BLOCKER_RPA_INVALID_REVISION with detected and required revision when revision is wrong', () => {
    const required = REQUIRED_FORM_REVISIONS.RPA;
    const badRevision = wrongRevision('RPA');
    const data = {
      ...baseData,
      form_metadata: { form_revision: badRevision, form_revision_label: `Revised ${badRevision}` },
    };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-RPA-17');
    expect(blocker?.message).toBe(`The uploaded RPA is not the required Revised ${required} version. Upload the correct RPA form to continue.`);
    expect(blocker?.location).toBe(`Form footer — detected ${badRevision} (required ${required})`);
    expect(blocker?.fields).toContain(`detected_revision=${badRevision}`);
    expect(blocker?.fields).toContain(`required_revision=${required}`);
    expect(result.summary.failCount).toBeGreaterThanOrEqual(1);
  });

  it('emits BLOCKER_RPA_INVALID_REVISION when revision is missing (unreadable)', () => {
    const required = REQUIRED_FORM_REVISIONS.RPA;
    const data = {
      ...baseData,
      form_metadata: { form_revision_label: `Revised ${required}` },
    };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toBe(`Form header — conflicting revisions: Revised ${required} (required ${required})`);
    expect(blocker?.fields).toContain('form_metadata.form_revision');
    expect(result.summary.failCount).toBeGreaterThanOrEqual(1);
  });

  it('emits BLOCKER_RPA_INVALID_REVISION when revision is blank', () => {
    const data = {
      ...baseData,
      form_metadata: { form_revision: '', form_revision_label: '' },
    };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION');
    expect(blocker).toBeDefined();
    expect(result.summary.failCount).toBeGreaterThanOrEqual(1);
  });

  it('emits BLOCKER_RPA_INVALID_REVISION with conflict detail when revision_label contains conflicting text', () => {
    const required = REQUIRED_FORM_REVISIONS.RPA;
    const otherRevision = wrongRevision('RPA');
    const data = {
      ...baseData,
      form_metadata: { form_revision_label: `Header Revised ${required}, Footer Revised ${otherRevision}` },
    };
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION');
    expect(blocker).toBeDefined();
    expect(blocker?.location).toContain('conflicting');
    expect(blocker?.location).toContain(required);
    expect(blocker?.location).toContain(otherRevision);
    expect(result.summary.failCount).toBeGreaterThanOrEqual(1);
  });

  it('follows the configured RPA revision when it changes at runtime', () => {
    const originalRpaRevision = REQUIRED_FORM_REVISIONS.RPA;
    try {
      const passingResult = validateContractStage(makeExtraction({
        ...baseData,
        form_metadata: { form_revision: originalRpaRevision, form_revision_label: `Revised ${originalRpaRevision}` },
      }));
      expect(passingResult.blockers.filter((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION')).toHaveLength(0);

      REQUIRED_FORM_REVISIONS.RPA = '9/99';
      const blockedResult = validateContractStage(makeExtraction({
        ...baseData,
        form_metadata: { form_revision: originalRpaRevision, form_revision_label: `Revised ${originalRpaRevision}` },
      }));
      const blocker = blockedResult.blockers.find((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION');
      expect(blocker).toBeDefined();
      expect(blocker?.location).toBe(`Form footer — detected ${originalRpaRevision} (required 9/99)`);

      const passingAgainResult = validateContractStage(makeExtraction({
        ...baseData,
        form_metadata: { form_revision: '9/99', form_revision_label: 'Revised 9/99' },
      }));
      expect(passingAgainResult.blockers.filter((b) => b.code === 'BLOCKER_RPA_INVALID_REVISION')).toHaveLength(0);
    } finally {
      REQUIRED_FORM_REVISIONS.RPA = originalRpaRevision;
    }
  });

  // ── Page-level initials validation (strict binary present/missing) ──────

  function withExecutionReview(
    footerOverrides?: Record<string, unknown>,
    topOverrides?: Record<string, unknown>,
    execOverrides?: Record<string, unknown>,
  ) {
    return {
      ...baseData,
      ...topOverrides,
      execution_review: {
        expected_party_counts: { buyers: 1, sellers: 1 },
        ...execOverrides,
      },
      page_14_footer_initials: {
        buyer_initials: {
          slot_1: { initials_present: true, initials_text: 'JB' },
          slot_2: { initials_present: true, initials_text: 'JB2' },
          initials_present_count: 1,
          required_initials_count: 1,
          missing_required_initials_count: 0,
          completion_status: 'complete',
        },
        seller_initials: {
          slot_1: { initials_present: true, initials_text: 'JS' },
          slot_2: { initials_present: true, initials_text: 'JS2' },
          initials_present_count: 1,
          required_initials_count: 1,
          missing_required_initials_count: 0,
          completion_status: 'complete',
        },
        ...footerOverrides,
      },
    };
  }

  it('passes page-level initials when all buyer and seller footer initials are present', () => {
    const result = validateContractStage(makeExtraction(withExecutionReview()));
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toHaveLength(0);
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_SELLER_INITIALS_MISSING')).toHaveLength(0);
  });

  it('emits BLOCKER_RPA_BUYER_INITIALS_MISSING for Buyer 1 on page 14 footer', () => {
    const data = withExecutionReview({
      buyer_initials: {
        slot_1: { initials_present: false, initials_text: null },
        slot_2: { initials_present: true, initials_text: 'JB2' },
        initials_present_count: 1,
        required_initials_count: 1,
        missing_required_initials_count: 1,
        completion_status: 'missing',
      },
    });
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-RPA-18');
    expect(blocker?.location).toBe('RPA page 14 footer');
    expect(blocker?.fields).toContain('Buyer 1');
    expect(result.summary.failCount).toBeGreaterThanOrEqual(1);
  });

  it('emits BLOCKER_RPA_SELLER_INITIALS_MISSING for Seller 2 on page 14 footer', () => {
    const data = withExecutionReview(
      {
        seller_initials: {
          slot_1: { initials_present: true, initials_text: 'JS' },
          slot_2: { initials_present: false, initials_text: null },
          initials_present_count: 1,
          required_initials_count: 2,
          missing_required_initials_count: 1,
          completion_status: 'missing',
        },
      },
      {
        // Add a second seller so expectedSellerCount = 2
        parties: {
          ...baseData.parties,
          sellers: [
            ...baseData.parties.sellers,
            { fullName: 'Jane Seller 2', email: null, phone: null, mailingAddress: null, signaturePresent: true, confidence: 0.95 },
          ],
        },
      },
    );
    const result = validateContractStage(makeExtraction(data));
    const blocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_SELLER_INITIALS_MISSING');
    expect(blocker).toBeDefined();
    expect(blocker?.compositeId).toBe('BLOCKER-RPA-19');
    expect(blocker?.location).toBe('RPA page 14 footer');
    expect(blocker?.fields).toContain('Seller 2');
    expect(result.summary.failCount).toBeGreaterThanOrEqual(1);
  });

  it('emits separate blockers for each missing party on the same page', () => {
    const data = withExecutionReview(
      {
        buyer_initials: {
          slot_1: { initials_present: false, initials_text: null },
          slot_2: { initials_present: false, initials_text: null },
          initials_present_count: 0,
          required_initials_count: 2,
          missing_required_initials_count: 2,
          completion_status: 'missing',
        },
        seller_initials: {
          slot_1: { initials_present: false, initials_text: null },
          slot_2: { initials_present: false, initials_text: null },
          initials_present_count: 0,
          required_initials_count: 2,
          missing_required_initials_count: 2,
          completion_status: 'missing',
        },
      },
      {
        // Add second buyer and second seller so expected counts = 2
        parties: {
          ...baseData.parties,
          buyers: [
            ...baseData.parties.buyers,
            { fullName: 'John Buyer 2', email: null, phone: null, mailingAddress: null, signaturePresent: true, confidence: 0.95 },
          ],
          sellers: [
            ...baseData.parties.sellers,
            { fullName: 'Jane Seller 2', email: null, phone: null, mailingAddress: null, signaturePresent: true, confidence: 0.95 },
          ],
        },
      },
    );
    const result = validateContractStage(makeExtraction(data));
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toHaveLength(2);
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_SELLER_INITIALS_MISSING')).toHaveLength(2);
  });

  it('skips page-level initials when execution_review is absent (backward compat)', () => {
    const result = validateContractStage(makeExtraction(baseData));
    expect(result.blockers.filter((b) =>
      b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING' || b.code === 'BLOCKER_RPA_SELLER_INITIALS_MISSING',
    )).toHaveLength(0);
  });

  it('treats an unreadable-but-present mark as present, never as missing', () => {
    const data = withExecutionReview({
      buyer_initials: {
        slot_1: {
          initials_present: true,
          initials_text: null,
          mark_type: 'unreadable',
          visual_evidence: 'a deliberate ink mark is present but the letters cannot be read',
        },
        slot_2: { initials_present: true, initials_text: 'JB2' },
        initials_present_count: 1,
        required_initials_count: 1,
        missing_required_initials_count: 0,
        completion_status: 'complete',
      },
    });
    const result = validateContractStage(makeExtraction(data));
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toHaveLength(0);
  });

  it('passes electronically-signed (DocuSign) initials the same as handwritten', () => {
    const data = withExecutionReview({
      buyer_initials: {
        slot_1: {
          initials_present: true,
          initials_text: 'JB',
          mark_type: 'electronic',
          visual_evidence: 'DocuSign initials stamp inside the electronic field border',
        },
        slot_2: { initials_present: true, initials_text: 'JB2' },
        initials_present_count: 1,
        required_initials_count: 1,
        missing_required_initials_count: 0,
        completion_status: 'complete',
      },
    });
    const result = validateContractStage(makeExtraction(data));
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toHaveLength(0);
  });

  it('does not report a duplicate-looking mark in the second slot as missing (Lantana regression)', () => {
    // Regression test for the real lantana-home-rpa.pdf false positive: a
    // single Buyer and single Seller each have the SAME initials stamp
    // duplicated into both available footer slots by the signing platform.
    // Only slot 1 is "required" (expected count = 1), but slot 2 is still
    // visually present and must never be reported as missing.
    const data = withExecutionReview({
      buyer_initials: {
        slot_1: { initials_present: true, initials_text: 'AP', mark_type: 'electronic' },
        slot_2: { initials_present: true, initials_text: 'AP', mark_type: 'electronic' },
        initials_present_count: 2,
        required_initials_count: 1,
        missing_required_initials_count: 0,
        completion_status: 'complete',
      },
      seller_initials: {
        slot_1: { initials_present: true, initials_text: 'SP', mark_type: 'electronic' },
        slot_2: { initials_present: true, initials_text: 'SP', mark_type: 'electronic' },
        initials_present_count: 2,
        required_initials_count: 1,
        missing_required_initials_count: 0,
        completion_status: 'complete',
      },
    });
    const result = validateContractStage(makeExtraction(data));
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toHaveLength(0);
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_SELLER_INITIALS_MISSING')).toHaveLength(0);
  });

  it('validates page 15 Liquidated Damages initials separately from footer', () => {
    const data = withExecutionReview(
      undefined,
      undefined,
      {
        section_29_liquidated_damages: {
          buyer_initials: {
            slot_1: { initials_present: false, initials_text: null },
            slot_2: { initials_present: false, initials_text: null },
            initials_present_count: 0,
            required_initials_count: 1,
            missing_required_initials_count: 1,
            completion_status: 'missing',
          },
        },
      },
    );
    const result = validateContractStage(makeExtraction(data));
    const ldBlocker = result.blockers.find((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING');
    expect(ldBlocker).toBeDefined();
    expect(ldBlocker?.location).toBe('Paragraph 29 (Liquidated Damages), RPA Page 15');
  });

  it('gives page 15\'s three independent initials zones (Liquidated Damages, Arbitration, footer) distinct check ruleIds — never a React-key-colliding duplicate', () => {
    // Regression test: page 15 has three separate initials requirements that can
    // all be present on the same document at once. Before the zone key was added
    // to the check id, all three collapsed onto the same
    // `rpa_pg15_{role}_{party}_initials` ruleId — a real duplicate-key React
    // warning downstream wherever checks are rendered keyed by ruleId.
    const data = withExecutionReview(
      undefined,
      undefined,
      {
        section_29_liquidated_damages: {
          buyer_initials: {
            slot_1: { initials_present: true, initials_text: 'JB' },
            initials_present_count: 1, required_initials_count: 1,
            missing_required_initials_count: 0, completion_status: 'complete',
          },
        },
        section_31_arbitration_of_disputes: {
          buyer_initials: {
            slot_1: { initials_present: true, initials_text: 'JB' },
            initials_present_count: 1, required_initials_count: 1,
            missing_required_initials_count: 0, completion_status: 'complete',
          },
        },
        page_footer_initials: {
          buyer_initials: {
            slot_1: { initials_present: true, initials_text: 'JB' },
            initials_present_count: 1, required_initials_count: 1,
            missing_required_initials_count: 0, completion_status: 'complete',
          },
        },
      },
    );
    const result = validateContractStage(makeExtraction(data));
    const page15BuyerChecks = result.checks.filter((c) => c.ruleId.startsWith('rpa_pg15_') && c.ruleId.includes('buyer_1'));
    expect(page15BuyerChecks).toHaveLength(3);
    expect(new Set(page15BuyerChecks.map((c) => c.ruleId)).size).toBe(3); // all unique
  });

  it('generates per-page blockers from page_X_footer_initials keys for pages 4 and 5', () => {
    const data = {
      ...baseData,
      parties: {
        ...baseData.parties,
        sellers: [
          ...baseData.parties.sellers,
          { fullName: 'Jane Seller 2', email: null, phone: null, mailingAddress: null, signaturePresent: true, confidence: 0.95 },
        ],
      },
      execution_review: {
        expected_party_counts: { buyers: 1, sellers: 2 },
      },
      page_4_footer_initials: {
        buyer_initials: {
          slot_1: { initials_present: true, initials_text: 'JB' },
          slot_2: { initials_present: true, initials_text: 'JB2' },
          initials_present_count: 1, required_initials_count: 1,
          missing_required_initials_count: 0, completion_status: 'complete',
        },
        seller_initials: {
          slot_1: { initials_present: false, initials_text: null },
          slot_2: { initials_present: true, initials_text: 'JS2' },
          initials_present_count: 1, required_initials_count: 2,
          missing_required_initials_count: 1, completion_status: 'missing',
        },
      },
      page_5_footer_initials: {
        buyer_initials: {
          slot_1: { initials_present: false, initials_text: null },
          slot_2: { initials_present: true, initials_text: 'JB2' },
          initials_present_count: 0, required_initials_count: 1,
          missing_required_initials_count: 1, completion_status: 'missing',
        },
        seller_initials: {
          slot_1: { initials_present: true, initials_text: 'JS' },
          slot_2: { initials_present: false, initials_text: null },
          initials_present_count: 1, required_initials_count: 2,
          missing_required_initials_count: 1, completion_status: 'missing',
        },
      },
    };
    const result = validateContractStage(makeExtraction(data));
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toHaveLength(1);
    expect(result.blockers.filter((b) => b.code === 'BLOCKER_RPA_SELLER_INITIALS_MISSING')).toHaveLength(2);
    const pg4Seller = result.blockers.find((b) => b.location === 'RPA page 4 footer');
    expect(pg4Seller).toBeDefined();
    expect(pg4Seller?.fields).toContain('Seller 1');
    const pg5Buyer = result.blockers.find((b) => b.location === 'RPA page 5 footer');
    expect(pg5Buyer).toBeDefined();
    expect(pg5Buyer?.fields).toContain('Buyer 1');
    const pg5Seller2 = result.blockers.find((b) => b.location === 'RPA page 5 footer' && b.fields?.includes('Seller 2'));
    expect(pg5Seller2).toBeDefined();
  });

  // ── RPA page 17: Escrow Holder Acknowledgment ─────────────────────────

  it('warns when RPA page 17 escrow holder acknowledgment has no name or number', () => {
    const data = {
      ...baseData,
      escrow_holder_acknowledgment: {
        deposit_checked: false,
        escrow_holder_name: null,
        escrow_number: null,
      },
    };
    const result = validateContractStage(makeExtraction(data));
    const warning = result.warnings.find((w) => w.code === 'WARN_RPA_MISSING_ESCROW_INFO');
    expect(warning).toBeDefined();
    expect(warning?.compositeId).toBe('WARN-RPA-31');
    expect(warning?.location).toBe('RPA page 17, Escrow Holder Acknowledgment');
  });

  it('does not warn when RPA page 17 has an escrow holder name', () => {
    const data = {
      ...baseData,
      escrow_holder_acknowledgment: {
        escrow_holder_name: 'Pacific Escrow',
        escrow_number: null,
      },
    };
    const result = validateContractStage(makeExtraction(data));
    expect(result.warnings.filter((w) => w.code === 'WARN_RPA_MISSING_ESCROW_INFO')).toHaveLength(0);
  });

  it('does not warn when RPA page 17 has only an escrow number', () => {
    const data = {
      ...baseData,
      escrow_holder_acknowledgment: {
        escrow_holder_name: null,
        escrow_number: 'ESC-12345',
      },
    };
    const result = validateContractStage(makeExtraction(data));
    expect(result.warnings.filter((w) => w.code === 'WARN_RPA_MISSING_ESCROW_INFO')).toHaveLength(0);
  });

  it('does not warn when RPA page 17 was not extracted at all', () => {
    const result = validateContractStage(makeExtraction(baseData));
    expect(result.warnings.filter((w) => w.code === 'WARN_RPA_MISSING_ESCROW_INFO')).toHaveLength(0);
  });

  // ── rpa_page17_escrow_completed check — the "Signed RPA" checklist gate ─

  it('rpa_page17_escrow_completed is skipped (never a blocker) when page 17 was not extracted at all', () => {
    const result = validateContractStage(makeExtraction(baseData));
    const check = result.checks.find((c) => c.ruleId === 'rpa_page17_escrow_completed');
    expect(check?.status).toBe('skipped');
    expect(result.blockers).toHaveLength(0);
  });

  it('rpa_page17_escrow_completed is skipped when page 17 is blank (no escrow info, no signature)', () => {
    const data = {
      ...baseData,
      escrow_holder_acknowledgment: { escrow_holder_name: null, escrow_number: null, by_name: null },
    };
    const result = validateContractStage(makeExtraction(data));
    const check = result.checks.find((c) => c.ruleId === 'rpa_page17_escrow_completed');
    expect(check?.status).toBe('skipped');
    expect(result.blockers).toHaveLength(0);
  });

  it('rpa_page17_escrow_completed is skipped and warns when escrow info is present but the escrow holder signature is missing', () => {
    const data = {
      ...baseData,
      escrow_holder_acknowledgment: { escrow_holder_name: 'Pacific Escrow', escrow_number: 'ESC-12345', by_name: null },
    };
    const result = validateContractStage(makeExtraction(data));
    const check = result.checks.find((c) => c.ruleId === 'rpa_page17_escrow_completed');
    expect(check?.status).toBe('skipped');
    const warning = result.warnings.find((w) => w.code === 'WARN_RPA_PAGE17_ESCROW_SIGNATURE_MISSING');
    expect(warning).toBeDefined();
    expect(warning?.compositeId).toBe('WARN-RPA-32');
    expect(warning?.location).toBe('RPA page 17, Escrow Holder Acknowledgment');
    expect(result.blockers).toHaveLength(0);
  });

  it('rpa_page17_escrow_completed passes only once escrow info AND the escrow holder signature are both present', () => {
    const data = {
      ...baseData,
      escrow_holder_acknowledgment: { escrow_holder_name: 'Pacific Escrow', escrow_number: 'ESC-12345', by_name: 'Jane Escrow Officer' },
    };
    const result = validateContractStage(makeExtraction(data));
    const check = result.checks.find((c) => c.ruleId === 'rpa_page17_escrow_completed');
    expect(check?.status).toBe('pass');
    expect(result.warnings.filter((w) => w.code === 'WARN_RPA_MISSING_ESCROW_INFO' || w.code === 'WARN_RPA_PAGE17_ESCROW_SIGNATURE_MISSING')).toHaveLength(0);
    expect(result.blockers).toHaveLength(0);
  });

  it('rpa_page17_escrow_completed is never satisfied by buyer/seller execution alone (page 16 signatures) — page 17 escrow section still blank', () => {
    // baseData already has buyerSigned/sellerSigned true and no escrow_holder_acknowledgment at all.
    const result = validateContractStage(makeExtraction(baseData));
    const check = result.checks.find((c) => c.ruleId === 'rpa_page17_escrow_completed');
    expect(check?.status).not.toBe('pass');
  });
});
