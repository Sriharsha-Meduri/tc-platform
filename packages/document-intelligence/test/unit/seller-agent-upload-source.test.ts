import { describe, it, expect } from 'vitest';
import { validateDisclosuresStage } from '../../src/validator/stages/disclosures.stage';
import { validateContractStage } from '../../src/validator/stages/contract.stage';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';

function makeExtraction(formCode: string, data: Record<string, unknown>): FormExtractionOutput[] {
  return [{
    formCode,
    formName: formCode,
    data,
    rawResponse: '',
    promptTokens: null,
    completionTokens: null,
    modelName: 'test',
  }];
}

describe('Seller Agent Upload Link — buyer-signature suppression', () => {
  describe('TDS (disclosures stage)', () => {
    function tdsData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        header: { property_address: '123 Main St' },
        signatures: {
          seller_signature_page_2: true,
          seller_signature_page_2_date: '2026-01-01',
          buyer_signature: false,
          buyer_signature_date: null,
        },
        ...overrides,
      };
    }

    it('does not blocker on a missing buyer signature when uploaded via the Seller Agent link', () => {
      const result = validateDisclosuresStage(makeExtraction('TDS', tdsData()), 'seller_agent');
      expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_BUYER_SIG')).toBe(false);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_BUYER_DATE')).toBe(false);
    });

    it('still blockers on a missing seller signature when uploaded via the Seller Agent link', () => {
      const data = tdsData({
        signatures: {
          seller_signature_page_2: false,
          seller_signature_page_2_date: null,
          buyer_signature: false,
          buyer_signature_date: null,
        },
      });
      const result = validateDisclosuresStage(makeExtraction('TDS', data), 'seller_agent');
      expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_SELLER_SIG')).toBe(true);
    });

    it('blockers on a missing buyer signature for a non-seller-agent upload (regression)', () => {
      const result = validateDisclosuresStage(makeExtraction('TDS', tdsData()));
      expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_BUYER_SIG')).toBe(true);
    });

    it('blockers on a missing buyer signature for a Buyer Agent upload (uploadSource is a different value)', () => {
      const result = validateDisclosuresStage(makeExtraction('TDS', tdsData()));
      expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_BUYER_SIG')).toBe(true);
    });

    it('still runs TDS-specific content validation (Section II.C Yes-item explanations) for a Seller Agent upload', () => {
      const data = tdsData({
        section_II_sellers_information: {
          C_environmental_and_legal: {
            '1_environmental_hazards': true,
            explanation: null,
          },
        },
      });
      const result = validateDisclosuresStage(makeExtraction('TDS', data), 'seller_agent');
      expect(result.blockers.some((b) => b.code === 'BLOCKER_TDS_YES_ITEM_MISSING_EXPLANATION:C1')).toBe(true);
    });
  });

  describe('SPQ (disclosures stage)', () => {
    function spqData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        header: { property_address: '123 Main St' },
        signatures: {
          seller_signature_1: true,
          seller_date_1: '2026-01-01',
          buyer_signature_1: false,
          buyer_date_1: null,
        },
        ...overrides,
      };
    }

    it('accepts the document when only seller-side requirements pass (buyer sig/date missing)', () => {
      const result = validateDisclosuresStage(makeExtraction('SPQ', spqData()), 'seller_agent');
      expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_BUYER_SIG')).toBe(false);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_BUYER_DATE')).toBe(false);
      expect(result.summary.overallStatus).toBe('compliant');
    });

    it('blockers on missing buyer signature for a regular upload', () => {
      const result = validateDisclosuresStage(makeExtraction('SPQ', spqData()));
      expect(result.blockers.some((b) => b.code === 'BLOCKER_SPQ_BUYER_SIG')).toBe(true);
    });
  });

  describe('RPA (contract stage)', () => {
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
        buyers:        [{ fullName: 'John Buyer',  email: null, phone: null, mailingAddress: null, signaturePresent: false, confidence: 0.95 }],
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
      signatures: { buyerSigned: false, sellerSigned: true, signedParties: ['Jane Seller'], missingSignatures: ['John Buyer'], missingSignatureDates: [] },
      initials: { liquidatedDamagesBuyer: false, liquidatedDamagesSeller: true, arbitrationBuyer: false, arbitrationSeller: true },
      extractionWarnings: [],
      confidenceSummary: { overall: 0.95, property: 0.95, transaction: 0.95, parties: 0.95, formsAndDisclosures: null },
    };

    function makeRpaExtraction(data: unknown): FormExtractionOutput[] {
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

    it('does not blocker on a missing buyer signature/initials when uploaded via the Seller Agent link', () => {
      const result = validateContractStage(makeRpaExtraction(baseData), undefined, undefined, 'seller_agent');
      expect(result.blockers.some((b) => b.code === 'BLOCKER_BUYER_SIGNATURE')).toBe(false);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_INITIAL_BUYER_LD')).toBe(false);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_INITIAL_BUYER_AR')).toBe(false);
    });

    it('still blockers on a missing seller signature/initials when uploaded via the Seller Agent link', () => {
      const data = {
        ...baseData,
        signatures: { buyerSigned: false, sellerSigned: false, signedParties: [], missingSignatures: ['John Buyer', 'Jane Seller'], missingSignatureDates: [] },
        initials: { liquidatedDamagesBuyer: false, liquidatedDamagesSeller: false, arbitrationBuyer: false, arbitrationSeller: false },
      };
      const result = validateContractStage(makeRpaExtraction(data), undefined, undefined, 'seller_agent');
      expect(result.blockers.some((b) => b.code === 'BLOCKER_SELLER_SIGNATURE')).toBe(true);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_INITIAL_SELLER_LD')).toBe(true);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_INITIAL_SELLER_AR')).toBe(true);
    });

    it('blockers on a missing buyer signature/initials for a regular (non-seller-agent) upload', () => {
      const result = validateContractStage(makeRpaExtraction(baseData));
      expect(result.blockers.some((b) => b.code === 'BLOCKER_BUYER_SIGNATURE')).toBe(true);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_INITIAL_BUYER_LD')).toBe(true);
      expect(result.blockers.some((b) => b.code === 'BLOCKER_INITIAL_BUYER_AR')).toBe(true);
    });

    function withFooterInitials(): Record<string, unknown> {
      return {
        ...baseData,
        execution_review: { expected_party_counts: { buyers: 1, sellers: 1 } },
        page_4_footer_initials: {
          buyer_initials: {
            slot_1: { initials_present: false, initials_text: null },
            initials_present_count: 0, required_initials_count: 1, missing_required_initials_count: 1,
          },
          seller_initials: {
            slot_1: { initials_present: true, initials_text: 'JS' },
            initials_present_count: 1, required_initials_count: 1, missing_required_initials_count: 0,
          },
        },
      };
    }

    it('does not blocker on missing buyer footer initials on RPA pages when uploaded via the Seller Agent link', () => {
      const result = validateContractStage(makeRpaExtraction(withFooterInitials()), undefined, undefined, 'seller_agent');
      expect(result.blockers.some((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toBe(false);
    });

    it('blockers on missing buyer footer initials on RPA pages for a regular upload (regression)', () => {
      const result = validateContractStage(makeRpaExtraction(withFooterInitials()));
      expect(result.blockers.some((b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING')).toBe(true);
    });
  });
});
