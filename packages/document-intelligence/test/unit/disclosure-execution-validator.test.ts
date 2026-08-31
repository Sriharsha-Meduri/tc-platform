/**
 * Disclosure Execution Validator — unit tests
 *
 * Tests the shared config-driven execution validator:
 * validateDisclosureExecution() and createDisclosureExecutionPrompt().
 */

import { describe, it, expect } from 'vitest';
import {
  validateDisclosureExecution,
  createDisclosureExecutionPrompt,
  type DisclosureExecutionConfig,
  type DisclosureExecutionExtraction,
  type DisclosureValidationContext,
  type ExtractedExecutionSlot,
  type ExtractedPartyExecution,
} from '../../src/validator/disclosure-execution-validator';
import { BHIA_CONFIG, BIA_CONFIG, WFA_CONFIG, FHDA_CONFIG, AVID_CONFIG } from '../../src/validator/disclosure-configs';
import { BHIA_DEFINITION, BIA_DEFINITION, WFA_DEFINITION, FHDA_DEFINITION, AVID_DEFINITION } from '../../src/validator/disclosure-definitions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(overrides: Partial<ExtractedExecutionSlot> = {}): ExtractedExecutionSlot {
  return {
    slotNumber: 1,
    markPresent: false,
    markText: null,
    markType: 'blank',
    datePresent: null,
    date: null,
    dateReadable: null,
    ...overrides,
  };
}

function makeParty(overrides: Partial<ExtractedPartyExecution> = {}): ExtractedPartyExecution {
  return { signatures: [], initials: [], ...overrides };
}

function makePage(
  buyer?: Partial<ExtractedPartyExecution>,
  seller?: Partial<ExtractedPartyExecution>,
  pageNumber = 1,
): DisclosureExecutionExtraction['pages'][0] {
  return {
    pageNumber,
    detectedPageLabel: null,
    isCorrectPage: true,
    buyer: makeParty(buyer),
    seller: makeParty(seller),
  };
}

const SINGLE_BUYER: DisclosureValidationContext = { expectedBuyers: 1, expectedSellers: null };
const BUYER_SELLER: DisclosureValidationContext = { expectedBuyers: 1, expectedSellers: 1 };

// ─── BHIA tests ───────────────────────────────────────────────────────────────

describe('DisclosureExecutionValidator — BHIA config', () => {
  it('passes with valid buyer signatures on page 1', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BHIA',
      formTitle: "BUYER HOMEOWNERS' INSURANCE ADVISORY",
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage(
        { signatures: [makeSlot({ markPresent: true, markText: 'Jane Doe', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
      )],
    };
    const result = validateDisclosureExecution(BHIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('blocks when buyer signature slot 1 missing', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BHIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage({ signatures: [] })],
    };
    const result = validateDisclosureExecution(BHIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].fieldType).toBe('signature');
    expect(result.blockers[0].role).toBe('buyer');
    expect(result.blockers[0].slotNumber).toBe(1);
  });

  it('blocks when buyer signature date missing', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BHIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage({
        signatures: [makeSlot({ markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: false, date: null, dateReadable: null })],
      })],
    };
    const result = validateDisclosureExecution(BHIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].fieldType).toBe('signature_date');
  });

  it('warns when signature unreadable', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BHIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage({
        signatures: [makeSlot({ markPresent: true, markText: null, markType: 'unreadable', datePresent: true, date: '05/25/2026', dateReadable: true })],
      })],
    };
    const result = validateDisclosureExecution(BHIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].fieldType).toBe('signature');
  });

  it('reports correct summary counts', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BHIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage({ signatures: [] })],
    };
    const result = validateDisclosureExecution(BHIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.summary.missingBuyerSignatures).toBe(1);
    expect(result.summary.missingBuyerSignatureDates).toBe(0);
    expect(result.summary.missingSellerSignatures).toBe(0);
  });
});

// ─── WFA tests ────────────────────────────────────────────────────────────────

describe('DisclosureExecutionValidator — WFA config', () => {
  it('passes with both buyer and seller signatures', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'WFA',
      formTitle: 'WIRE FRAUD AND ELECTRONIC FUNDS TRANSFER ADVISORY',
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage(
        { signatures: [makeSlot({ markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
        { signatures: [makeSlot({ markPresent: true, markText: 'John', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
      )],
    };
    const result = validateDisclosureExecution(WFA_CONFIG, extraction, BUYER_SELLER);
    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks when seller signature missing', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'WFA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage(
        { signatures: [makeSlot({ markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
        { signatures: [] },
      )],
    };
    const result = validateDisclosureExecution(WFA_CONFIG, extraction, BUYER_SELLER);
    expect(result.valid).toBe(false);
    expect(result.blockers.some((b) => b.role === 'seller' && b.fieldType === 'signature')).toBe(true);
  });

  it('blocks when buyer signature date missing', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'WFA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage(
        { signatures: [makeSlot({ markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: false })] },
        { signatures: [makeSlot({ markPresent: true, markText: 'John', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
      )],
    };
    const result = validateDisclosureExecution(WFA_CONFIG, extraction, BUYER_SELLER);
    expect(result.valid).toBe(false);
    expect(result.blockers.some((b) => b.role === 'buyer' && b.fieldType === 'signature_date')).toBe(true);
  });
});

// ─── BIA tests ────────────────────────────────────────────────────────────────

describe('DisclosureExecutionValidator — BIA config', () => {
  it('passes with buyer signatures on page 2', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BIA',
      formTitle: "BUYER'S INVESTIGATION ADVISORY",
      formRevision: null,
      isCorrectForm: true,
      pages: [
        makePage(undefined, undefined, 1),
        makePage(
          { signatures: [makeSlot({ markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
          undefined,
          2,
        ),
      ],
    };
    const result = validateDisclosureExecution(BIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks when page 2 buyer signature missing', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [
        makePage(undefined, undefined, 1),
        makePage({ signatures: [] }, undefined, 2),
      ],
    };
    const result = validateDisclosureExecution(BIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].pageNumber).toBe(2);
  });

  it('blocks when page 2 is missing', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage(undefined, undefined, 1)],
    };
    const result = validateDisclosureExecution(BIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(false);
    expect(result.blockers.some((b) => b.fieldType === 'page')).toBe(true);
  });
});

// ─── FHDA tests ───────────────────────────────────────────────────────────────

describe('DisclosureExecutionValidator — FHDA config', () => {
  it('passes with both buyer and seller signatures on page 2', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'FHDA',
      formTitle: 'FAIR HOUSING AND DISCRIMINATION ADVISORY',
      formRevision: null,
      isCorrectForm: true,
      pages: [
        makePage(undefined, undefined, 1),
        makePage(
          { signatures: [makeSlot({ markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
          { signatures: [makeSlot({ markPresent: true, markText: 'John', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
          2,
        ),
      ],
    };
    const result = validateDisclosureExecution(FHDA_CONFIG, extraction, BUYER_SELLER);
    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks when seller signature missing on page 2', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'FHDA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [
        makePage(undefined, undefined, 1),
        makePage(
          { signatures: [makeSlot({ markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
          { signatures: [] },
          2,
        ),
      ],
    };
    const result = validateDisclosureExecution(FHDA_CONFIG, extraction, BUYER_SELLER);
    expect(result.valid).toBe(false);
    expect(result.blockers.some((b) => b.role === 'seller')).toBe(true);
  });

  it('blocks when buyer signature missing on page 2', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'FHDA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [
        makePage(undefined, undefined, 1),
        makePage(
          { signatures: [] },
          { signatures: [makeSlot({ markPresent: true, markText: 'John', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
          2,
        ),
      ],
    };
    const result = validateDisclosureExecution(FHDA_CONFIG, extraction, BUYER_SELLER);
    expect(result.valid).toBe(false);
    expect(result.blockers.some((b) => b.role === 'buyer')).toBe(true);
  });
});

// ─── AVID tests ───────────────────────────────────────────────────────────────

describe('DisclosureExecutionValidator — AVID config', () => {
  it('passes with buyer initials on pages 1-2 and signature on page 3', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'AVID',
      formTitle: 'AGENT VISUAL INSPECTION DISCLOSURE',
      formRevision: null,
      isCorrectForm: true,
      pages: [
        makePage({ initials: [makeSlot({ slotNumber: 1, markPresent: true, markText: 'JD', markType: 'handwritten' })] }, undefined, 1),
        makePage({ initials: [makeSlot({ slotNumber: 1, markPresent: true, markText: 'JD', markType: 'handwritten' })] }, undefined, 2),
        makePage(
          { signatures: [makeSlot({ slotNumber: 1, markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] },
          undefined,
          3,
        ),
      ],
    };
    const result = validateDisclosureExecution(AVID_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks when buyer initials missing on page 1', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'AVID',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [
        makePage({ initials: [] }, undefined, 1),
        makePage({ initials: [makeSlot({ slotNumber: 1, markPresent: true, markText: 'JD', markType: 'handwritten' })] }, undefined, 2),
        makePage({ signatures: [makeSlot({ slotNumber: 1, markPresent: true, markText: 'Jane', markType: 'handwritten', datePresent: true, date: '05/25/2026', dateReadable: true })] }, undefined, 3),
      ],
    };
    const result = validateDisclosureExecution(AVID_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(false);
    expect(result.blockers[0].fieldType).toBe('initials');
    expect(result.blockers[0].pageNumber).toBe(1);
  });
});

// ─── Wrong form detection ─────────────────────────────────────────────────────

describe('DisclosureExecutionValidator — wrong form detection', () => {
  it('blocks when isCorrectForm is false', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BHIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: false,
      pages: [makePage()],
    };
    const result = validateDisclosureExecution(BHIA_CONFIG, extraction, SINGLE_BUYER);
    expect(result.valid).toBe(false);
    expect(result.blockers.some((b) => b.fieldType === 'document' && b.code.includes('WRONG-FORM'))).toBe(true);
  });
});

// ─── Party count unknown ──────────────────────────────────────────────────────

describe('DisclosureExecutionValidator — party count unknown', () => {
  it('warns when expected buyer count is null', () => {
    const extraction: DisclosureExecutionExtraction = {
      formType: 'BHIA',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [makePage()],
    };
    const result = validateDisclosureExecution(BHIA_CONFIG, extraction, { expectedBuyers: null, expectedSellers: null });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code.includes('PARTY-COUNT-UNKNOWN'))).toBe(true);
  });
});

// ─── createDisclosureExecutionPrompt ──────────────────────────────────────────

describe('createDisclosureExecutionPrompt', () => {
  it('returns a string containing the form type', () => {
    const prompt = createDisclosureExecutionPrompt(BHIA_CONFIG);
    expect(prompt).toContain('BHIA');
    expect(prompt).toContain('Buyer');
    expect(prompt).toContain('Seller');
  });

  it('returns a string containing schema instructions for each form type', () => {
    for (const config of [BHIA_CONFIG, BIA_CONFIG, WFA_CONFIG, FHDA_CONFIG, AVID_CONFIG]) {
      const prompt = createDisclosureExecutionPrompt(config);
      expect(prompt).toContain(config.formType);
      expect(prompt).toContain('slotNumber');
      expect(prompt).toContain('markPresent');
    }
  });
});

// ─── Disclosure definitions ───────────────────────────────────────────────────

describe('Disclosure Definitions', () => {
  const definitions = [
    { name: 'BHIA', def: BHIA_DEFINITION, config: BHIA_CONFIG },
    { name: 'BIA', def: BIA_DEFINITION, config: BIA_CONFIG },
    { name: 'WFA', def: WFA_DEFINITION, config: WFA_CONFIG },
    { name: 'FHDA', def: FHDA_DEFINITION, config: FHDA_CONFIG },
    { name: 'AVID', def: AVID_DEFINITION, config: AVID_CONFIG },
  ];

  for (const { name, def, config } of definitions) {
    it(`${name} definition matches config`, () => {
      expect(def.formType).toBe(config.formType);
      expect(def.config).toBe(config);
      expect(def.prompt).toContain(config.formType);
    });

    it(`${name} definition parses a minimal extraction`, () => {
      const raw = {
        formType: config.formType,
        formTitle: config.formTitle,
        formRevision: null,
        isCorrectForm: true,
        pages: config.pages.map((p) => ({
          pageNumber: p.pageNumber,
          detectedPageLabel: p.expectedPageLabel,
          isCorrectPage: true,
          buyer: { signatures: [], initials: [] },
          seller: { signatures: [], initials: [] },
        })),
      };
      const parsed = def.parseResponse(raw);
      expect(parsed.formType).toBe(config.formType);
      expect(parsed.pages).toHaveLength(config.pages.length);
      expect(parsed.isCorrectForm).toBe(true);
    });
  }
});

// ─── Config validation edge cases ─────────────────────────────────────────────

describe('DisclosureExecutionValidator — config validation', () => {
  it('rejects empty formType', () => {
    const config: DisclosureExecutionConfig = {
      formType: '',
      formTitle: 'Test',
      expectedPageCount: 1,
      pages: [{ pageNumber: 1, expectedPageLabel: 'TEST', buyer: { slots: 0, signatures: 'not_present', signatureDates: 'not_present', initials: 'not_present' }, seller: { slots: 0, signatures: 'not_present', signatureDates: 'not_present', initials: 'not_present' } }],
    };
    const extraction: DisclosureExecutionExtraction = {
      formType: '',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [],
    };
    expect(() => validateDisclosureExecution(config, extraction, SINGLE_BUYER)).toThrow('formType is required');
  });

  it('rejects signatureDates required when signatures not required', () => {
    const config: DisclosureExecutionConfig = {
      formType: 'TEST',
      formTitle: 'Test Form',
      expectedPageCount: 1,
      pages: [{
        pageNumber: 1,
        expectedPageLabel: 'TEST PAGE 1',
        buyer: { slots: 1, signatures: 'not_present', signatureDates: 'required', initials: 'not_present' },
        seller: { slots: 0, signatures: 'not_present', signatureDates: 'not_present', initials: 'not_present' },
      }],
    };
    const extraction: DisclosureExecutionExtraction = {
      formType: 'TEST',
      formTitle: null,
      formRevision: null,
      isCorrectForm: true,
      pages: [],
    };
    expect(() => validateDisclosureExecution(config, extraction, SINGLE_BUYER)).toThrow('signature dates cannot be required');
  });
});
