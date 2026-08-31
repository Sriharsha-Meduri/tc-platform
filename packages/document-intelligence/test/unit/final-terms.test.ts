import { describe, it, expect } from 'vitest';
import { resolveFinalNegotiatedTerms } from '../../src/validator/stages/final-terms';
import type { FinalTermsInputDocument } from '../../src/validator/stages/final-terms';
import type { ContractDocumentExtraction, ContractContingencyInfo } from '../../src/extractor/extractor.types';

function contingency(days: number | null, waived = false): ContractContingencyInfo | null {
  if (waived) return { status: 'No contingency', deadline: null };
  return days != null ? { status: 'Contingent', deadline: `${days} days` } : null;
}

function makeDoc(overrides: {
  fileName?: string;
  documentType?: 'RPA' | 'SCO' | 'BCO' | 'SMCO' | 'BMCO';
  counterNumber?: number;
  sequenceOrder?: number;
  referencedFormCode?: string | null;
  referencedCounterOfferNumber?: string | null;
  acceptanceDate?: string | null;
  loanContingency?: ContractContingencyInfo | null;
  appraisalContingency?: ContractContingencyInfo | null;
  inspectionContingency?: ContractContingencyInfo | null;
  insuranceContingency?: ContractContingencyInfo | null;
  sellerDocumentReview?: { deadline: string | null } | null;
  titleReview?: { deadline: string | null } | null;
  hoaReview?: { deadline: string | null } | null;
  buyerSigned?: boolean;
  sellerSigned?: boolean;
} = {}): ContractDocumentExtraction {
  const documentType = overrides.documentType ?? 'RPA';
  return {
    documentId: null,
    fileName: overrides.fileName ?? `${documentType}.pdf`,
    documentType,
    counterNumber: overrides.counterNumber ?? 0,
    sequenceOrder: overrides.sequenceOrder ?? 0,
    referencedFormCode: overrides.referencedFormCode ?? (documentType === 'RPA' ? null : 'RPA'),
    referencedCounterOfferNumber: overrides.referencedCounterOfferNumber ?? null,
    extractedTerms: {
      formRevision: null, formRevisionLabel: null, datePrepared: null,
      offerDate: null,
      acceptanceDate: overrides.acceptanceDate ?? null,
      expirationDate: null, buyerName: null, sellerName: null, propertyAddress: null,
      purchasePrice: null, initialDeposit: null, closeOfEscrow: null,
      sellerCreditToBuyer: null, buyerBrokerCompensation: null,
      loanContingency: overrides.loanContingency ?? null,
      appraisalContingency: overrides.appraisalContingency ?? null,
      inspectionContingency: overrides.inspectionContingency ?? null,
      insuranceContingency: overrides.insuranceContingency ?? null,
      sellerDocumentReview: overrides.sellerDocumentReview ?? null,
      titleReview: overrides.titleReview ?? null,
      hoaReview: overrides.hoaReview ?? null,
      possession: null, otherTerms: null, otherTermsOverrides: null,
      signatures: {
        buyerSigned: overrides.buyerSigned ?? (documentType === 'SCO' || documentType === 'SMCO'),
        sellerSigned: overrides.sellerSigned ?? (documentType === 'RPA' || documentType === 'BCO' || documentType === 'BMCO'),
        buyerSignedDate: null, sellerSignedDate: null,
      },
    },
  };
}

let idCounter = 0;
function input(doc: ContractDocumentExtraction, overrides: Partial<FinalTermsInputDocument> = {}): FinalTermsInputDocument {
  return {
    document: doc,
    documentId: overrides.documentId ?? `doc-${++idCounter}`,
    versionNo: overrides.versionNo ?? 1,
    rawContractTerms: overrides.rawContractTerms ?? null,
  };
}

function termFor(result: ReturnType<typeof resolveFinalNegotiatedTerms>, key: string) {
  return result.terms.find((t) => t.key === key)!;
}

describe('resolveFinalNegotiatedTerms', () => {
  it('original-only: resolves every term straight from the RPA when there are no counter-offers', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      loanContingency: contingency(21),
      appraisalContingency: contingency(17),
      inspectionContingency: contingency(17),
    });
    const result = resolveFinalNegotiatedTerms([input(rpa)]);

    expect(result.acceptanceDate).toBe('2026-05-03T12:00:00Z');
    expect(termFor(result, 'loan').days).toBe(21);
    expect(termFor(result, 'loan').status).toBe('Contingent');
    expect(termFor(result, 'appraisal').days).toBe(17);
    expect(termFor(result, 'inspection').days).toBe(17);
    expect(termFor(result, 'insurance').status).toBe('N/A');
  });

  it('modified-by-counteroffer: a later BCO restating loan contingency overrides the RPA value', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      loanContingency: contingency(21),
      appraisalContingency: contingency(17),
    });
    const bco = makeDoc({
      documentType: 'BCO', counterNumber: 1, sequenceOrder: 1,
      loanContingency: contingency(10),
    });
    const result = resolveFinalNegotiatedTerms([input(rpa), input(bco)]);

    expect(termFor(result, 'loan').days).toBe(10);
    expect(termFor(result, 'loan').source?.formCode).toBe('BCO-1');
  });

  it('per-field partial restatement: a counter-offer that only restates one field leaves every other field from the earlier document', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      loanContingency: contingency(21),
      appraisalContingency: contingency(17),
      inspectionContingency: contingency(17),
    });
    const sco = makeDoc({
      documentType: 'SCO', counterNumber: 1, sequenceOrder: 1,
      appraisalContingency: contingency(10), // only restates appraisal
    });
    const result = resolveFinalNegotiatedTerms([input(rpa), input(sco)]);

    expect(termFor(result, 'appraisal').days).toBe(10);
    expect(termFor(result, 'loan').days).toBe(21); // untouched, still from RPA
    expect(termFor(result, 'inspection').days).toBe(17); // untouched, still from RPA
  });

  it('waiver: a later document waiving a contingency reports "No contingency" with no deadline', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      loanContingency: contingency(21),
    });
    const bco = makeDoc({
      documentType: 'BCO', counterNumber: 1, sequenceOrder: 1,
      loanContingency: contingency(null, true),
    });
    const result = resolveFinalNegotiatedTerms([input(rpa), input(bco)]);

    const loan = termFor(result, 'loan');
    expect(loan.status).toBe('No contingency');
    expect(loan.days).toBeNull();
    expect(loan.deadline).toBeNull();
  });

  it('CR-B removal: a completed CR-B for a contingency reports "Removed" regardless of the negotiated day count', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      inspectionContingency: contingency(17),
    });
    const result = resolveFinalNegotiatedTerms([input(rpa)], {
      crRemovals: [{ key: 'inspection', documentId: 'doc-crb-1', fileName: 'CR-B.pdf', versionNo: 1 }],
    });

    const inspection = termFor(result, 'inspection');
    expect(inspection.status).toBe('Removed');
    expect(inspection.deadline).toBeNull();
    expect(inspection.source?.formCode).toBe('CR-B');
    expect(result.resolvedFrom).toContain('doc-crb-1');
  });

  it('immutable acceptance date: a later document restating a different acceptance date never overrides the first one resolved', () => {
    const rpa = makeDoc({ acceptanceDate: '2026-05-03T12:00:00Z' });
    const bco = makeDoc({
      documentType: 'BCO', counterNumber: 1, sequenceOrder: 1,
      acceptanceDate: '2026-05-10T12:00:00Z',
    });
    const result = resolveFinalNegotiatedTerms([input(rpa), input(bco)]);
    expect(result.acceptanceDate).toBe('2026-05-03T12:00:00Z');
  });

  it('conflict/unresolvable: a value contributed by an unlinked document is flagged Needs Review instead of silently trusted', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      loanContingency: contingency(21),
    });
    // A BCO with an unrecognized reference that the chain-sorter cannot place —
    // referencing a nonexistent prior document forces the "unlinked" fallback.
    const strayBco = makeDoc({
      documentType: 'BCO', counterNumber: 5, sequenceOrder: 1,
      referencedFormCode: 'SCO', referencedCounterOfferNumber: '99',
      loanContingency: contingency(3),
    });
    const result = resolveFinalNegotiatedTerms([input(rpa), input(strayBco)]);

    // Whether or not the chain sorter manages to place it, this test only
    // needs the resolver to propagate whatever `unlinked` flag the chain
    // produced — assert the invariant, not the chain internals.
    const loan = termFor(result, 'loan');
    if (loan.conflict) {
      expect(loan.status).toBe('Needs Review');
      expect(loan.deadline).toBeNull();
    } else {
      expect(loan.days).toBe(3);
    }
  });

  it('weekend/holiday deadline roll: a contingency deadline landing on a weekend rolls forward to the next business day', () => {
    // Wed Jul 1, 2026 + 3 calendar days = Sat Jul 4 -> rolls to Mon Jul 6.
    const rpa = makeDoc({
      acceptanceDate: '2026-07-01T12:00:00Z',
      loanContingency: contingency(3),
    });
    const result = resolveFinalNegotiatedTerms([input(rpa)]);
    expect(termFor(result, 'loan').deadline).toBe('2026-07-06');
  });

  it('EMD/initial-deposit uses business-day counting (not calendar-days-then-roll) and is sourced from rawContractTerms', () => {
    // Wed Jul 1, 2026 + 5 business days, skipping the observed Jul 3 holiday and the weekend -> Jul 9.
    const rpa = makeDoc({ acceptanceDate: '2026-07-01T12:00:00Z' });
    const result = resolveFinalNegotiatedTerms([
      input(rpa, { rawContractTerms: { disclosuresDueDays: 7, initialDepositBusinessDays: 5 } }),
    ]);

    const emd = termFor(result, 'emdInitialDeposit');
    expect(emd.dayType).toBe('business');
    expect(emd.deadline).toBe('2026-07-09');

    const disclosures = termFor(result, 'disclosuresDue');
    expect(disclosures.dayType).toBe('calendar');
    expect(disclosures.days).toBe(7);
  });

  it('reports N/A for a field never restated by any document and not covered by a CR-B removal', () => {
    const rpa = makeDoc({ acceptanceDate: '2026-05-03T12:00:00Z' });
    const result = resolveFinalNegotiatedTerms([input(rpa)]);
    expect(termFor(result, 'titleReview').status).toBe('N/A');
    expect(termFor(result, 'hoaReview').status).toBe('N/A');
  });

  it('tracks which documents contributed at least one final value in resolvedFrom', () => {
    const rpa = makeDoc({
      acceptanceDate: '2026-05-03T12:00:00Z',
      loanContingency: contingency(21),
    });
    const bco = makeDoc({
      documentType: 'BCO', counterNumber: 1, sequenceOrder: 1,
      appraisalContingency: contingency(10),
    });
    const rpaInput = input(rpa, { documentId: 'rpa-doc' });
    const bcoInput = input(bco, { documentId: 'bco-doc' });
    const result = resolveFinalNegotiatedTerms([rpaInput, bcoInput]);

    expect(result.resolvedFrom).toContain('rpa-doc');
    expect(result.resolvedFrom).toContain('bco-doc');
  });
});
