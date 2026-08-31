import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateContractStage } from '../../src/validator/stages/contract.stage';
import { validateDisclosuresStage } from '../../src/validator/stages/disclosures.stage';
import { StageValidator } from '../../src/validator/stage-validator';
import type { FormExtractionOutput } from '../../src/extractor/extractor.types';

const FIXTURES = join(__dirname, '..', 'fixtures');

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf-8'));
}

function makeOutput(formCode: string, data: Record<string, unknown>): FormExtractionOutput {
  return {
    formCode,
    formName: null,
    data,
    rawResponse: '',
    promptTokens: null,
    completionTokens: null,
    modelName: 'mock',
  };
}

describe('mock-validator: CONTRACT stage', () => {
  it('passes well-formed RPA with no blockers', () => {
    const result = validateContractStage([
      makeOutput('RPA', loadFixture('valid-rpa')),
    ]);
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.failCount).toBe(0);
  });

  it('blocks when purchase price is null', () => {
    const result = validateContractStage([
      makeOutput('RPA', loadFixture('rpa-missing-price')),
    ]);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].compositeId).toBe('BLOCKER-RPA-3');
    expect(result.summary.overallStatus).toBe('non_compliant');
  });

  it('does not warn when counter offer flag is set but no SCO/BCO present — that is a checklist concern, not a validation blocker/warning', () => {
    const result = validateContractStage([
      makeOutput('RPA', loadFixture('rpa-counter-offer-flag')),
    ]);
    const warning = result.warnings.find((w) => w.compositeId === 'WARN-RPA-2001');
    expect(warning).toBeUndefined();
  });

  it('does not warn when SCO is present alongside the flag either', () => {
    const result = validateContractStage([
      makeOutput('RPA', loadFixture('rpa-counter-offer-flag')),
      makeOutput('SCO', loadFixture('valid-sco')),
    ]);
    const warning = result.warnings.find((w) => w.compositeId === 'WARN-RPA-2001');
    expect(warning).toBeUndefined();
  });

  it('validates AD per-form check passes with agent info', () => {
    const result = validateContractStage([
      makeOutput('RPA', loadFixture('valid-rpa')),
      makeOutput('AD', loadFixture('valid-ad')),
    ]);
    const adCheck = result.checks.find((c) => c.ruleId === 'ad_agents');
    expect(adCheck?.status).toBe('pass');
  });

  it('runs cross-form check for mismatched buyer agent names', () => {
    const mismatchedAd = loadFixture('valid-ad');
    mismatchedAd.confirmation = { buyer_agent: 'Different Agent', seller_agent: 'Agent B' };
    const result = validateContractStage([
      makeOutput('RPA', loadFixture('valid-rpa')),
      makeOutput('AD', mismatchedAd),
    ]);
    const warning = result.warnings.find((w) => w.compositeId === 'WARN-RPA-AD-1003');
    expect(warning).toBeDefined();
  });

  it('does not generate a warning for a companion form (AD) that has not been uploaded — StageValidator', () => {
    const validator = new StageValidator();
    const result = validator.validate('CONTRACT', [
      makeOutput('RPA', loadFixture('valid-rpa')),
    ]);
    const missingAd = result.warnings.find((w) => w.code === 'WARN_MISSING_AD');
    expect(missingAd).toBeUndefined();
  });

  it('does not generate a blocker for a missing required form (RPA) — StageValidator; missingForms is informational only', () => {
    const validator = new StageValidator();
    const result = validator.validate('CONTRACT', []);
    const blocker = result.blockers.find((b) => b.code?.startsWith('MISSING_REQUIRED_FORM_'));
    expect(blocker).toBeUndefined();
    expect(result.missingForms).toContain('RPA');
    expect(result.complete).toBe(true);
  });
});

describe('mock-validator: DISCLOSURES stage', () => {
  it('passes well-formed TDS + SPQ + NHD with no blockers', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('valid-tds')),
      makeOutput('SPQ', loadFixture('valid-spq')),
      makeOutput('NHD', loadFixture('valid-nhd')),
    ]);
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.overallStatus).toBe('compliant');
  });

  it('does not block when TDS is missing — a missing document is a checklist concern, not a validation blocker', () => {
    const result = validateDisclosuresStage([
      makeOutput('SPQ', loadFixture('valid-spq')),
      makeOutput('NHD', loadFixture('valid-nhd')),
    ]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-TDS-10001')).toBeUndefined();
    expect(result.summary.overallStatus).not.toBe('non_compliant');
  });

  it('does not block when SPQ is missing', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('valid-tds')),
      makeOutput('NHD', loadFixture('valid-nhd')),
    ]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-SPQ-15001')).toBeUndefined();
  });

  it('does not block when NHD is missing', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('valid-tds')),
      makeOutput('SPQ', loadFixture('valid-spq')),
    ]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-NHD-20001')).toBeUndefined();
  });

  it('warns when TDS has missing property address', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('tds-missing-property')),
    ]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-TDS-10003')).toBeDefined();
  });

  it('blocks when TDS has no seller signature', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('tds-missing-property')),
    ]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-TDS-10007')).toBeDefined();
  });

  it('blocks when TDS has no buyer acknowledgment', () => {
    const tdsNoBuyer = loadFixture('valid-tds');
    tdsNoBuyer.signatures = { seller_signature_page_2: true, seller_signature_page_2_date: '2026-04-15', seller_signature_page_3: false };
    const result = validateDisclosuresStage([makeOutput('TDS', tdsNoBuyer)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-TDS-10009')).toBeDefined();
  });

  it('blocks when SPQ has no seller or buyer signatures', () => {
    const spqNoSigs = loadFixture('valid-spq');
    spqNoSigs.signatures = {
      seller_signature_1: false,
      seller_signature_2: false,
      buyer_signature_1: false,
      buyer_signature_2: false,
    };
    const result = validateDisclosuresStage([makeOutput('SPQ', spqNoSigs)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-SPQ-15006')).toBeDefined();
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-SPQ-15007')).toBeDefined();
  });

  it('warns when NHD has no property address', () => {
    const nhdNoAddr: Record<string, unknown> = {};
    const result = validateDisclosuresStage([makeOutput('NHD', nhdNoAddr)]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-NHD-20002')).toBeDefined();
  });

  it('runs cross-form check and warns on address mismatch', () => {
    const tdsDifferent = loadFixture('valid-tds');
    tdsDifferent.header = { property_address: '456 Oak Ave', city: 'Los Angeles', county: 'Los Angeles' };
    const result = validateDisclosuresStage([
      makeOutput('RPA', loadFixture('valid-rpa')),
      makeOutput('TDS', tdsDifferent),
      makeOutput('SPQ', loadFixture('valid-spq')),
      makeOutput('NHD', loadFixture('valid-nhd')),
    ]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-CROSS-11001')).toBeDefined();
  });

  it('does not generate blockers for missing required forms — StageValidator; missingForms is informational only', () => {
    const validator = new StageValidator();
    const result = validator.validate('DISCLOSURES', []);
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.overallStatus).toBe('compliant');
    expect(result.missingForms).toEqual(expect.arrayContaining(['TDS', 'SPQ', 'NHD']));
    expect(result.complete).toBe(true);
  });

  it('passes well-formed TDS + SPQ + NHD + AVID with no blockers', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('valid-tds')),
      makeOutput('SPQ', loadFixture('valid-spq')),
      makeOutput('NHD', loadFixture('valid-nhd')),
      makeOutput('AVID', loadFixture('valid-avid')),
    ]);
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.overallStatus).toBe('compliant');
  });

  it('warns when AVID has no property address', () => {
    const avidNoAddr: Record<string, unknown> = { signatures: { agent_signed: true, agent_signature_date: '2026-04-15', buyer_signed: true, buyer_signature_date: '2026-04-15' } };
    const result = validateDisclosuresStage([makeOutput('AVID', avidNoAddr)]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-AVID-25002')).toBeDefined();
  });

  it('blocks when AVID has no agent signature', () => {
    const avidNoAgent = {
      header: { property_address: '123 Main St' },
      signatures: { buyer_signed: true, buyer_signature_date: '2026-04-15' },
    };
    const result = validateDisclosuresStage([makeOutput('AVID', avidNoAgent)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-AVID-25005')).toBeDefined();
  });

  it('blocks when AVID has no buyer acknowledgment', () => {
    const avidNoBuyer = {
      header: { property_address: '123 Main St' },
      signatures: { agent_signed: true, agent_signature_date: '2026-04-15' },
    };
    const result = validateDisclosuresStage([makeOutput('AVID', avidNoBuyer)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-AVID-25007')).toBeDefined();
  });

  it('runs AVID cross-form address check', () => {
    const avidDifferent = {
      header: { property_address: '456 Oak Ave' },
      signatures: { agent_signed: true, agent_signature_date: '2026-04-15', buyer_signed: true, buyer_signature_date: '2026-04-15' },
    };
    const result = validateDisclosuresStage([
      makeOutput('RPA', loadFixture('valid-rpa')),
      makeOutput('AVID', avidDifferent),
    ]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-CROSS-11001')).toBeDefined();
  });
});

describe('mock-validator: RR / RRRR (Request for Repair / Response)', () => {
  function validRr(): Record<string, unknown> {
    return {
      header: { property_address: '123 Main St', total_pages: 2, request_date: '2026-04-15' },
      repair_items: [{ item_number: 1, description: 'Repair the roof leak.' }],
      signatures: { buyer_signature_1: true, buyer_signature_1_date: '2026-04-15', buyer_signature_2: false, buyer_signature_2_date: null },
    };
  }

  function validRrrr(): Record<string, unknown> {
    return {
      header: { property_address: '123 Main St', total_pages: 2, response_date: '2026-04-16' },
      response_items: [{ item_number: 1, response: 'agree', notes: null }],
      signatures: { seller_signature_1: true, seller_signature_1_date: '2026-04-16', seller_signature_2: false, seller_signature_2_date: null },
    };
  }

  it('passes a well-formed RR with no RR-specific blockers', () => {
    const result = validateDisclosuresStage([makeOutput('RR', validRr())]);
    expect(result.blockers.filter((b) => b.formCode === 'RR')).toHaveLength(0);
  });

  it('passes a well-formed RRRR with no RRRR-specific blockers', () => {
    const result = validateDisclosuresStage([makeOutput('RRRR', validRrrr())]);
    expect(result.blockers.filter((b) => b.formCode === 'RRRR')).toHaveLength(0);
  });

  it('passes well-formed TDS + SPQ + NHD + RR + RRRR together with no blockers at all', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('valid-tds')),
      makeOutput('SPQ', loadFixture('valid-spq')),
      makeOutput('NHD', loadFixture('valid-nhd')),
      makeOutput('RR', validRr()),
      makeOutput('RRRR', validRrrr()),
    ]);
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.overallStatus).toBe('compliant');
  });

  it('warns when RR has no property address', () => {
    const rr = validRr();
    (rr.header as Record<string, unknown>).property_address = null;
    const result = validateDisclosuresStage([makeOutput('RR', rr)]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-RR-40001')).toBeDefined();
  });

  it('blocks when RR has no legible page count', () => {
    const rr = validRr();
    (rr.header as Record<string, unknown>).total_pages = null;
    const result = validateDisclosuresStage([makeOutput('RR', rr)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RR-40002')).toBeDefined();
    expect(result.summary.overallStatus).toBe('non_compliant');
  });

  it('blocks when RR lists no repair items', () => {
    const rr = validRr();
    rr.repair_items = [];
    const result = validateDisclosuresStage([makeOutput('RR', rr)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RR-40003')).toBeDefined();
  });

  it('blocks when RR has no buyer signature', () => {
    const rr = validRr();
    rr.signatures = { buyer_signature_1: false, buyer_signature_1_date: null, buyer_signature_2: false, buyer_signature_2_date: null };
    const result = validateDisclosuresStage([makeOutput('RR', rr)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RR-40004')).toBeDefined();
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RR-40005')).toBeDefined();
  });

  it('warns when RRRR has no property address', () => {
    const rrrr = validRrrr();
    (rrrr.header as Record<string, unknown>).property_address = null;
    const result = validateDisclosuresStage([makeOutput('RRRR', rrrr)]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-RRRR-41001')).toBeDefined();
  });

  it('blocks when RRRR has no legible page count', () => {
    const rrrr = validRrrr();
    (rrrr.header as Record<string, unknown>).total_pages = null;
    const result = validateDisclosuresStage([makeOutput('RRRR', rrrr)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RRRR-41002')).toBeDefined();
  });

  it('blocks when RRRR lists no response items', () => {
    const rrrr = validRrrr();
    rrrr.response_items = [];
    const result = validateDisclosuresStage([makeOutput('RRRR', rrrr)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RRRR-41003')).toBeDefined();
  });

  it('blocks when RRRR has no seller signature', () => {
    const rrrr = validRrrr();
    rrrr.signatures = { seller_signature_1: false, seller_signature_1_date: null, seller_signature_2: false, seller_signature_2_date: null };
    const result = validateDisclosuresStage([makeOutput('RRRR', rrrr)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RRRR-41004')).toBeDefined();
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-RRRR-41005')).toBeDefined();
  });
});

describe('mock-validator: CR-B (Contingency Removal, Buyer)', () => {
  function validCrB(): Record<string, unknown> {
    return {
      header: { property_address: '123 Main St', total_pages: 1, removal_date: '2026-04-20' },
      contingencies_removed: { inspection: true, loan: false, appraisal: false, all_contingencies: false },
      signatures: { buyer_signature_1: true, buyer_signature_1_date: '2026-04-20', buyer_signature_2: false, buyer_signature_2_date: null },
    };
  }

  it('passes a well-formed CR-B with no CR-B-specific blockers', () => {
    const result = validateDisclosuresStage([makeOutput('CR-B', validCrB())]);
    expect(result.blockers.filter((b) => b.formCode === 'CR-B')).toHaveLength(0);
  });

  it('passes well-formed TDS + SPQ + NHD + CR-B together with no blockers at all', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('valid-tds')),
      makeOutput('SPQ', loadFixture('valid-spq')),
      makeOutput('NHD', loadFixture('valid-nhd')),
      makeOutput('CR-B', validCrB()),
    ]);
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.overallStatus).toBe('compliant');
  });

  it('warns when CR-B has no property address', () => {
    const crb = validCrB();
    (crb.header as Record<string, unknown>).property_address = null;
    const result = validateDisclosuresStage([makeOutput('CR-B', crb)]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-CRB-42001')).toBeDefined();
  });

  it('blocks when CR-B has no legible page count', () => {
    const crb = validCrB();
    (crb.header as Record<string, unknown>).total_pages = null;
    const result = validateDisclosuresStage([makeOutput('CR-B', crb)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-CRB-42002')).toBeDefined();
    expect(result.summary.overallStatus).toBe('non_compliant');
  });

  it('blocks when CR-B selects no contingency at all', () => {
    const crb = validCrB();
    crb.contingencies_removed = { inspection: false, loan: false, appraisal: false, all_contingencies: false };
    const result = validateDisclosuresStage([makeOutput('CR-B', crb)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-CRB-42003')).toBeDefined();
  });

  it('passes the contingency-selected check when only "all_contingencies" is checked', () => {
    const crb = validCrB();
    crb.contingencies_removed = { inspection: false, loan: false, appraisal: false, all_contingencies: true };
    const result = validateDisclosuresStage([makeOutput('CR-B', crb)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-CRB-42003')).toBeUndefined();
  });

  it('blocks when CR-B has no buyer signature', () => {
    const crb = validCrB();
    crb.signatures = { buyer_signature_1: false, buyer_signature_1_date: null, buyer_signature_2: false, buyer_signature_2_date: null };
    const result = validateDisclosuresStage([makeOutput('CR-B', crb)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-CRB-42004')).toBeDefined();
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-CRB-42005')).toBeDefined();
  });
});

describe('mock-validator: VP (Verification of Property Condition)', () => {
  function validVp(): Record<string, unknown> {
    return {
      header: { property_address: '123 Main St', total_pages: 1, verification_date: '2026-05-01' },
      property_verified: true,
      signatures: { buyer_signature_1: true, buyer_signature_1_date: '2026-05-01', buyer_signature_2: false, buyer_signature_2_date: null },
    };
  }

  it('passes a well-formed VP with no VP-specific blockers', () => {
    const result = validateDisclosuresStage([makeOutput('VP', validVp())]);
    expect(result.blockers.filter((b) => b.formCode === 'VP')).toHaveLength(0);
  });

  it('passes well-formed TDS + SPQ + NHD + VP together with no blockers at all', () => {
    const result = validateDisclosuresStage([
      makeOutput('TDS', loadFixture('valid-tds')),
      makeOutput('SPQ', loadFixture('valid-spq')),
      makeOutput('NHD', loadFixture('valid-nhd')),
      makeOutput('VP', validVp()),
    ]);
    expect(result.blockers).toHaveLength(0);
    expect(result.summary.overallStatus).toBe('compliant');
  });

  it('warns when VP has no property address', () => {
    const vp = validVp();
    (vp.header as Record<string, unknown>).property_address = null;
    const result = validateDisclosuresStage([makeOutput('VP', vp)]);
    expect(result.warnings.find((w) => w.compositeId === 'WARN-VP-43001')).toBeDefined();
  });

  it('blocks when VP has no legible page count', () => {
    const vp = validVp();
    (vp.header as Record<string, unknown>).total_pages = null;
    const result = validateDisclosuresStage([makeOutput('VP', vp)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-VP-43002')).toBeDefined();
    expect(result.summary.overallStatus).toBe('non_compliant');
  });

  it('blocks when VP does not confirm the property condition has been verified', () => {
    const vp = validVp();
    vp.property_verified = false;
    const result = validateDisclosuresStage([makeOutput('VP', vp)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-VP-43003')).toBeDefined();
  });

  it('blocks when property_verified is missing entirely', () => {
    const vp = validVp();
    delete vp.property_verified;
    const result = validateDisclosuresStage([makeOutput('VP', vp)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-VP-43003')).toBeDefined();
  });

  it('blocks when VP has no buyer signature', () => {
    const vp = validVp();
    vp.signatures = { buyer_signature_1: false, buyer_signature_1_date: null, buyer_signature_2: false, buyer_signature_2_date: null };
    const result = validateDisclosuresStage([makeOutput('VP', vp)]);
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-VP-43004')).toBeDefined();
    expect(result.blockers.find((b) => b.compositeId === 'BLOCKER-VP-43005')).toBeDefined();
  });
});

describe('mock-validator: edge cases', () => {
  it('returns empty result when contract stage has no extractions', () => {
    const result = validateContractStage([]);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.summary.overallStatus).toBe('compliant');
  });

  it('fixtures load correctly from disk', () => {
    expect(loadFixture('valid-rpa').property).toBeDefined();
    expect(loadFixture('valid-tds').header).toBeDefined();
    expect(loadFixture('valid-spq').signatures).toBeDefined();
    expect(loadFixture('valid-nhd').property_address).toBe('123 Main St');
    expect(loadFixture('valid-sco').parties).toBeDefined();
    expect(loadFixture('rpa-counter-offer-flag').seller_acceptance).toBeDefined();
  });
});
