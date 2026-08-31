import { describe, it, expect } from 'vitest';
import { resolveFinalNegotiatedTerms, attachValidation } from '../../src/validator/stages/final-terms';
import type { FinalTermsInputDocument } from '../../src/validator/stages/final-terms';
import { normalizeContractDocument } from '../../src/validator/stages/contract.stage';
import type { ContractDocumentExtraction } from '../../src/extractor/extractor.types';
import type { ComplianceCheck } from '../../src/validator/validator.types';
import type { FormExtractionResult } from '../../src/pipeline/pipeline.types';

/**
 * Core regression coverage for the extraction/validation independence
 * guarantee (spec item 14): a validation failure must never overwrite an
 * explicitly extracted value, and an absent field must fall back to the
 * document's printed default — never to a validation-derived value. Cases
 * (a)-(c) exercise the real production path (normalizeContractDocument ->
 * resolveFinalNegotiatedTerms -> attachValidation); case (d) is the general,
 * non-footer-initials extension of the rescue-only merge guarantee already
 * covered for pixel/vision signals in footer-initials-verdict.test.ts and
 * for numeric crops in contract-field-crop-enrichment.test.ts.
 */

function makeDoc(overrides: {
  fileName?: string;
  documentType?: 'RPA' | 'SCO' | 'BCO' | 'SMCO' | 'BMCO';
  acceptanceDate?: string | null;
  purchasePrice?: number | null;
  fields?: ContractDocumentExtraction['extractedTerms']['fields'];
} = {}): ContractDocumentExtraction {
  const documentType = overrides.documentType ?? 'RPA';
  return {
    documentId: null,
    fileName: overrides.fileName ?? `${documentType}.pdf`,
    documentType,
    counterNumber: 0,
    sequenceOrder: 0,
    referencedFormCode: null,
    referencedCounterOfferNumber: null,
    extractedTerms: {
      formRevision: null, formRevisionLabel: null, datePrepared: null,
      offerDate: null,
      acceptanceDate: overrides.acceptanceDate ?? null,
      expirationDate: null, buyerName: null, sellerName: null, propertyAddress: null,
      purchasePrice: overrides.purchasePrice ?? null,
      initialDeposit: null, closeOfEscrow: null,
      sellerCreditToBuyer: null, buyerBrokerCompensation: null,
      loanContingency: null, appraisalContingency: null, inspectionContingency: null,
      insuranceContingency: null, sellerDocumentReview: null, titleReview: null, hoaReview: null,
      possession: null, otherTerms: null, otherTermsOverrides: null,
      signatures: { buyerSigned: true, sellerSigned: true, buyerSignedDate: null, sellerSignedDate: null },
      fields: overrides.fields,
    },
  };
}

function input(doc: ContractDocumentExtraction): FinalTermsInputDocument {
  return { document: doc, documentId: 'rpa-doc', versionNo: 1, rawContractTerms: null };
}

function footerInitialsCheck(status: 'pass' | 'fail'): ComplianceCheck {
  return {
    ruleId: 'rpa_buyer_footer_initials',
    category: 'signature',
    formCode: 'RPA',
    phase: 'execution',
    severity: status === 'fail' ? 'error' : 'info',
    status,
    label: "Buyer's footer initials",
  };
}

describe('extraction/validation independence — end-to-end', () => {
  it('(a) explicit value + passing check: value is reported and validation is pass', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      purchasePrice: 925000,
      fields: {
        purchasePrice: {
          value: 925000, defaultValue: null, enteredValue: 925000, sourceType: 'typed',
          source: { documentId: null, formCode: 'RPA', page: 1 },
        },
      },
    });
    const result = resolveFinalNegotiatedTerms([input(rpa)]);
    const term = result.valueTerms.find((t) => t.key === 'purchasePrice')!;
    expect(term.value).toBe(925000);

    const resolved = attachValidation(term, [footerInitialsCheck('pass')]);
    expect(resolved.validation.status).toBe('pass');
    expect(resolved.term.value).toBe(925000);
  });

  it('(b) explicit value + false-negative initials blocker: value stays unchanged, blocker recorded separately', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      purchasePrice: 925000,
      fields: {
        purchasePrice: {
          value: 925000, defaultValue: null, enteredValue: 925000, sourceType: 'typed',
          source: { documentId: null, formCode: 'RPA', page: 1 },
        },
      },
    });
    const result = resolveFinalNegotiatedTerms([input(rpa)]);
    const term = result.valueTerms.find((t) => t.key === 'purchasePrice')!;

    // The footer-initials check fails (e.g. a pixel/vision false negative) —
    // this must never touch the already-extracted purchase price.
    const resolved = attachValidation(term, [footerInitialsCheck('fail')]);
    expect(resolved.validation.status).toBe('blocker');
    expect(resolved.validation.checks[0]?.ruleId).toBe('rpa_buyer_footer_initials');
    // The non-negotiable: value is untouched by the blocker, never nulled or
    // swapped for a default.
    expect(resolved.term.value).toBe(925000);
    expect(term.value).toBe(925000);
  });

  it('(c) no entered value: resolves to the printed default, not to any validation-derived value', () => {
    const data = {
      header: { property_address: '123 Main St', date: '2026-05-01', counter_offer_number: '1' },
      parties: { buyer_names: ['John Buyer'], seller_names: ['Jane Seller'] },
      offer_reference: { referenced_form_code: 'RPA', referenced_offer_date: '2026-04-28', referenced_counter_offer_number: null },
      counter_offer_terms: {
        other_terms_text: 'Loan contingency reverts to the RPA default',
        other_terms_modifications: {
          loan_contingency_days: {
            default_value: 17,
            entered_value: null,
            resolved_value: 17,
            entered_value_present: false,
            source_type: 'printed_default',
            evidence_text: '17 (Days After Acceptance)',
            confidence: 0.9,
          },
        },
        attached_addenda: [],
      },
      expiration: { expiration_date: '2026-05-04' },
      section_4_offer: { offeror_1_signature_date: '2026-05-01' },
      section_5_acceptance: { subject_to_attached_counter_offer: false, acceptor_1_signature_date: '2026-05-02' },
    };
    const formExtraction: FormExtractionResult = {
      formCode: 'SCO',
      formName: 'Seller Counter Offer',
      pageIndices: [0, 1],
      output: {
        formCode: 'SCO', formName: 'Seller Counter Offer', data,
        rawResponse: '', promptTokens: null, completionTokens: null, modelName: 'test',
      },
    };

    const doc = normalizeContractDocument(formExtraction, 'SCO-3.pdf', 1);
    const field = doc!.extractedTerms.fields?.loanContingencyDays;
    expect(field?.enteredValue).toBeNull();
    expect(field?.defaultValue).toBe(17);
    // No entry present -> falls back to the printed default, exactly per the
    // documented invariant (value = enteredValue ?? defaultValue ?? null).
    expect(field?.value).toBe(17);
  });

  it('(d) a validation-side absent signal cannot flip an already-resolved value (general case, not footer-initials-specific)', () => {
    // Mirrors the footer-initials two-signal "keep" guarantee, but for a
    // generic field value: an unrelated failing/unknown check must never be
    // able to substitute for or null out a term that already has a value.
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      purchasePrice: 925000,
      fields: {
        purchasePrice: {
          value: 925000, defaultValue: null, enteredValue: 925000, sourceType: 'typed',
          source: { documentId: null, formCode: 'RPA', page: 1 },
        },
      },
    });
    const result = resolveFinalNegotiatedTerms([input(rpa)]);
    const term = result.valueTerms.find((t) => t.key === 'purchasePrice')!;

    // No relevant checks at all (e.g. the compliance pass hasn't attributed
    // any check to this field yet) — status is 'unknown', value is untouched.
    const noChecks = attachValidation(term, []);
    expect(noChecks.validation.status).toBe('unknown');
    expect(noChecks.term.value).toBe(925000);

    // An unrelated check failing elsewhere on the document still cannot
    // affect this term's value once joined.
    const unrelatedFailure = attachValidation(term, [footerInitialsCheck('fail')]);
    expect(unrelatedFailure.term.value).toBe(925000);
  });
});
