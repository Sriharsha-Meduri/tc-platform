import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { generateScenarioFiles } from '../src/pdf-filler';
import { rpaValid } from '../src/fixtures/CA-RPA-valid';
import { rpaMissingPrice } from '../src/fixtures/CA-RPA-missing-price';
import { rpaCounterOffer } from '../src/fixtures/CA-RPA-counter-offer';
import { rpaCounterOffer2 } from '../src/fixtures/CA-RPA-counter-offer-2';
import { rpaResubmit } from '../src/fixtures/CA-RPA-resubmit';
import { contractStandard } from '../src/fixtures/CA-RPA-contract-standard';
import { disclosuresStandard } from '../src/fixtures/CA-disclosures-standard';
import { smcoValid } from '../src/fixtures/CA-SMCO-valid';
import { smcoWithAddendum } from '../src/fixtures/CA-SMCO-with-addendum';
import { tdsValid } from '../src/fixtures/CA-TDS-valid';
import { spqValid } from '../src/fixtures/CA-SPQ-valid';
import { biaValid } from '../src/fixtures/CA-BIA-valid';
import { adValid } from '../src/fixtures/CA-AD-valid';
import { avidValid } from '../src/fixtures/CA-AVID-valid';
import { frrPaValid } from '../src/fixtures/CA-FRR-PA-valid';
import { prbsValid } from '../src/fixtures/CA-PRBS-valid';
import { wfaValid } from '../src/fixtures/CA-WFA-valid';

const OUTPUT_DIR = path.join(__dirname, 'fixtures');

describe('test-pdf-generator', () => {

  it('generates a single RPA PDF', async () => {
    const files = await generateScenarioFiles(rpaValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/RPA\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('generates RPA with missing price', async () => {
    const files = await generateScenarioFiles(rpaMissingPrice, OUTPUT_DIR);
    expect(files).toHaveLength(1);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('generates RPA with counter-offer flag and multi-round SCO/BCO chain', async () => {
    const files = await generateScenarioFiles(rpaCounterOffer, OUTPUT_DIR);
    expect(files).toHaveLength(8);
    expect(files[0]).toMatch(/\/RPA\.pdf$/);
    expect(files[1]).toMatch(/\/AD\.pdf$/);
    expect(files[2]).toMatch(/\/AVID\.pdf$/);
    expect(files[3]).toMatch(/\/BIA\.pdf$/);
    expect(files[4]).toMatch(/\/SCO-1\.pdf$/);
    expect(files[5]).toMatch(/\/BCO-1\.pdf$/);
    expect(files[6]).toMatch(/\/SCO-2\.pdf$/);
    expect(files[7]).toMatch(/\/BCO-2\.pdf$/);

    for (const f of files) {
      const doc = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

  it('generates RPA with single-round SCO/BCO chain and all dates disabled', async () => {
    const files = await generateScenarioFiles(rpaCounterOffer2, OUTPUT_DIR);
    expect(files).toHaveLength(6);
    expect(files[0]).toMatch(/\/RPA\.pdf$/);
    expect(files[1]).toMatch(/\/AD\.pdf$/);
    expect(files[2]).toMatch(/\/AVID\.pdf$/);
    expect(files[3]).toMatch(/\/BIA\.pdf$/);
    expect(files[4]).toMatch(/\/SCO-1\.pdf$/);
    expect(files[5]).toMatch(/\/BCO-1\.pdf$/);

    for (const f of files) {
      const doc = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

  it('generates 2 RPA PDFs for resubmission scenario', async () => {
    const files = await generateScenarioFiles(rpaResubmit, OUTPUT_DIR);
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/RPA-V1\.pdf$/);
    expect(files[1]).toMatch(/RPA-V2\.pdf$/);

    for (const f of files) {
      const doc = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

  it('generates a single SMCO PDF with valid data', async () => {
    const files = await generateScenarioFiles(smcoValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/SMCO\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(2);
  });

  it('generates a single SMCO-with-addendum PDF with valid data', async () => {
    const files = await generateScenarioFiles(smcoWithAddendum, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/SMCO-WITH-ADDENDUM\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(4);
  });

  it('generates a single TDS PDF with valid data', async () => {
    const files = await generateScenarioFiles(tdsValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/TDS\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(3);
  });

  it('generates a single SPQ PDF with valid data', async () => {
    const files = await generateScenarioFiles(spqValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/SPQ\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(4);
  });

  it('generates a single BIA PDF with valid data', async () => {
    const files = await generateScenarioFiles(biaValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/BIA\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(2);
  });

  it('generates a single AD PDF with valid data', async () => {
    const files = await generateScenarioFiles(adValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/AD\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('generates a single AVID PDF with valid data', async () => {
    const files = await generateScenarioFiles(avidValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/AVID\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('generates a single FRR-PA PDF with valid data', async () => {
    const files = await generateScenarioFiles(frrPaValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/FRR-PA\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(1);
  });

  it('generates a single PRBS PDF with valid data', async () => {
    const files = await generateScenarioFiles(prbsValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/PRBS\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(2);
  });

  it('generates a single WFA PDF with valid data', async () => {
    const files = await generateScenarioFiles(wfaValid, OUTPUT_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\/WFA\.pdf$/);

    const doc = await PDFDocument.load(fs.readFileSync(files[0]), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(1);
  });

  it('creates subfolder matching scenario name', async () => {
    const files = await generateScenarioFiles(rpaValid, OUTPUT_DIR);
    const subfolder = path.basename(path.dirname(files[0]));
    expect(subfolder).toBe('CA-RPA-valid');
  });

  it('throws for empty scenario', async () => {
    await expect(generateScenarioFiles({ name: 'empty', forms: [] }, OUTPUT_DIR))
      .rejects.toThrow('at least one form');
  });

  it('generates all CONTRACT stage forms', async () => {
    const files = await generateScenarioFiles(contractStandard, OUTPUT_DIR);
    expect(files).toHaveLength(4);
    expect(files[0]).toMatch(/\/RPA\.pdf$/);
    expect(files[1]).toMatch(/\/AD\.pdf$/);
    expect(files[2]).toMatch(/\/AVID\.pdf$/);
    expect(files[3]).toMatch(/\/BIA\.pdf$/);

    for (const f of files) {
      const doc = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

  it('generates all DISCLOSURES stage forms', async () => {
    const files = await generateScenarioFiles(disclosuresStandard, OUTPUT_DIR);
    expect(files).toHaveLength(6);
    expect(files[0]).toMatch(/\/RPA\.pdf$/);
    expect(files[1]).toMatch(/\/AD\.pdf$/);
    expect(files[2]).toMatch(/\/AVID\.pdf$/);
    expect(files[3]).toMatch(/\/BIA\.pdf$/);
    expect(files[4]).toMatch(/\/TDS\.pdf$/);
    expect(files[5]).toMatch(/\/SPQ\.pdf$/);

    for (const f of files) {
      const doc = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

});
