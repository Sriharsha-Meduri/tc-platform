import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FORM_REGISTRY, resolveFormDefinition } from '../../src/extractor/forms/registry';
import { REASONING_REGISTRY } from '../../src/reasoner/registry';
import { loadExtractions, loadSnaps } from '../helpers/scenario';

describe('FORM_REGISTRY', () => {
  it('RPA shorthand resolves to latest version', () => {
    const rpa = FORM_REGISTRY['RPA'];
    expect(rpa).toBeDefined();
    expect(rpa.formCode).toBe('RPA');
    expect(rpa.variant).toBe('standard');
    expect(rpa.version).toMatch(/^v\d{2}-\d{2}$/);  // e.g. v12-23
    expect(rpa.systemPrompt).toContain('terms_of_purchase');
    expect(rpa.systemPrompt).toContain('contingencies_and_time_periods');
  });

  it('RPA pinned key resolves to the pinned version', () => {
    const rpa = resolveFormDefinition('RPA', 'v12-23');
    expect(rpa).toBeDefined();
    expect(rpa!.version).toBe('v12-23');
  });

  it('TDS shorthand resolves to latest version', () => {
    const tds = FORM_REGISTRY['TDS'];
    expect(tds).toBeDefined();
    expect(tds.formCode).toBe('TDS');
    expect(tds.variant).toBe('standard');
    expect(tds.version).toMatch(/^v\d{2}-\d{2}$/);
    expect(tds.systemPrompt).toContain('section_II_sellers_information');
  });

  it('unknown version falls back to shorthand (latest)', () => {
    // v99-99 does not exist — should fall back to the shorthand 'RPA'
    const rpa = resolveFormDefinition('RPA', 'v99-99');
    expect(rpa).toBeDefined();
    expect(rpa!.formCode).toBe('RPA');
  });

  it('all shorthand keys have formCode matching the key (or are known aliases)', () => {
    const knownAliases = new Set(['BCO', 'SMCO', 'BMCO']);
    for (const [key, form] of Object.entries(FORM_REGISTRY)) {
      // Skip pinned keys like 'RPA@v12-23'
      if (key.includes('@')) continue;
      if (knownAliases.has(key)) continue;
      expect(form.formCode, `FORM_REGISTRY['${key}'].formCode`).toBe(key);
    }
  });

  it('AD resolves and contains agency confirmation schema', () => {
    const ad = FORM_REGISTRY['AD'];
    expect(ad).toBeDefined();
    expect(ad.formCode).toBe('AD');
    expect(ad.variant).toBe('standard');
    expect(ad.systemPrompt).toContain('agency_confirmation');
    expect(ad.systemPrompt).toContain('selling_agent');
  });

  it('AVID resolves and contains inspection items schema', () => {
    const avid = FORM_REGISTRY['AVID'];
    expect(avid).toBeDefined();
    expect(avid.formCode).toBe('AVID');
    expect(avid.systemPrompt).toContain('items_inspected');
    expect(avid.systemPrompt).toContain('visible_defects_noted');
  });

  it('BIA resolves and contains buyer acknowledgement schema', () => {
    const bia = FORM_REGISTRY['BIA'];
    expect(bia).toBeDefined();
    expect(bia.formCode).toBe('BIA');
    expect(bia.systemPrompt).toContain('buyer_acknowledgement');
    expect(bia.systemPrompt).toContain('advisory_sections_present');
  });

  it('SBSA resolves and requires both buyer and seller signatures', () => {
    const sbsa = FORM_REGISTRY['SBSA'];
    expect(sbsa).toBeDefined();
    expect(sbsa.formCode).toBe('SBSA');
    expect(sbsa.systemPrompt).toContain('buyer');
    expect(sbsa.systemPrompt).toContain('seller');
    expect(sbsa.systemPrompt).toContain('advisory_topics_covered');
  });

  it('PRBS resolves and contains dual-representation disclosure schema', () => {
    const prbs = FORM_REGISTRY['PRBS'];
    expect(prbs).toBeDefined();
    expect(prbs.formCode).toBe('PRBS');
    expect(prbs.systemPrompt).toContain('agent_represents_more_than_one_buyer');
    expect(prbs.systemPrompt).toContain('consent');
  });

  it('pinned versions for companion forms resolve correctly', () => {
    expect(resolveFormDefinition('AD',   'v12-23')?.version).toBe('v12-23');
    expect(resolveFormDefinition('AVID', 'v12-22')?.version).toBe('v12-22');
    expect(resolveFormDefinition('BIA',  'v12-22')?.version).toBe('v12-22');
    expect(resolveFormDefinition('SBSA', 'v12-22')?.version).toBe('v12-22');
    expect(resolveFormDefinition('PRBS', 'v12-22')?.version).toBe('v12-22');
  });
});

describe('snap cache helpers', () => {
  let tmpDir: string;

  const rpaSnap = { formCode: 'RPA', formName: 'RPA', variant: 'standard', version: 'v12-23', data: { purchase_price: 900000 } };
  const rpaPlain = { formCode: 'RPA', formName: 'RPA', variant: 'standard', version: 'v12-23', data: { purchase_price: 800000 } };
  const tdsPlain = { formCode: 'TDS', formName: 'TDS', variant: 'standard', version: 'v06-24', data: {} };

  beforeEach(() => {
    tmpDir = join(tmpdir(), `di-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'extractions'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('loadSnaps returns empty map when no snap files exist', () => {
    expect(loadSnaps(tmpDir)).toEqual({});
  });

  it('loadSnaps keys by uppercase form code', () => {
    writeFileSync(join(tmpDir, 'extractions', 'rpa.standard.v12-23.snap.json'), JSON.stringify(rpaSnap));
    const snaps = loadSnaps(tmpDir);
    expect(snaps['RPA']).toBeDefined();
    expect(snaps['RPA'].data).toEqual(rpaSnap.data);
  });

  it('loadExtractions prefers snap over plain .json with the same base name', () => {
    writeFileSync(join(tmpDir, 'extractions', 'rpa.standard.v12-23.snap.json'), JSON.stringify(rpaSnap));
    writeFileSync(join(tmpDir, 'extractions', 'rpa.standard.v12-23.json'), JSON.stringify(rpaPlain));
    const results = loadExtractions(tmpDir);
    expect(results).toHaveLength(1);
    expect((results[0].data as Record<string, unknown>).purchase_price).toBe(900000); // snap wins
  });

  it('loadExtractions loads plain .json when no snap for that base exists', () => {
    writeFileSync(join(tmpDir, 'extractions', 'rpa.standard.v12-23.snap.json'), JSON.stringify(rpaSnap));
    writeFileSync(join(tmpDir, 'extractions', 'tds.standard.v06-24.json'), JSON.stringify(tdsPlain));
    const results = loadExtractions(tmpDir);
    expect(results).toHaveLength(2); // both RPA (snap) and TDS (plain) included
    const codes = results.map((r) => r.formCode);
    expect(codes).toContain('RPA');
    expect(codes).toContain('TDS');
  });
});

describe('REASONING_REGISTRY', () => {
  it('CONTRACT reasoning is registered', () => {
    const contract = REASONING_REGISTRY['CONTRACT'];
    expect(contract).toBeDefined();
    expect(contract.stage).toBe('CONTRACT');
    expect(contract.systemPrompt).toContain('finalAgreedPrice');
    expect(contract.systemPrompt).toContain('readyToAdvance');
  });

  it('DISCLOSURES reasoning is registered', () => {
    const disclosures = REASONING_REGISTRY['DISCLOSURES'];
    expect(disclosures).toBeDefined();
    expect(disclosures.stage).toBe('DISCLOSURES');
    expect(disclosures.systemPrompt).toContain('formsReceived');
    expect(disclosures.systemPrompt).toContain('readyToAdvance');
  });

  it('all registered reasoning definitions have stage matching their registry key', () => {
    for (const [key, def] of Object.entries(REASONING_REGISTRY)) {
      expect(def.stage, `REASONING_REGISTRY['${key}'].stage`).toBe(key);
    }
  });
});
