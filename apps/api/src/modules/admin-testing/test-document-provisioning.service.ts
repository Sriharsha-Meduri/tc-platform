import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateScenarioFiles } from '@tc/test-pdf-generator';
import { rpaValid } from '@tc/test-pdf-generator/dist/fixtures/CA-rpa-valid';
import { rpaMissingPrice } from '@tc/test-pdf-generator/dist/fixtures/CA-rpa-missing-price';
import { rpaCounterOffer } from '@tc/test-pdf-generator/dist/fixtures/CA-RPA-counter-offer';
import { smcoValid } from '@tc/test-pdf-generator/dist/fixtures/CA-SMCO-valid';
import type { Scenario } from '@tc/test-pdf-generator';

export type BuiltInTestDocument = 'rpa_valid' | 'rpa_missing_price' | 'sco_bco_counter_offer' | 'smco_valid';

export interface ProvisionedFile {
  formCode: string;
  fileName: string;
  buffer: Buffer;
}

const SCENARIOS: Record<BuiltInTestDocument, Scenario> = {
  rpa_valid: rpaValid,
  rpa_missing_price: rpaMissingPrice,
  sco_bco_counter_offer: rpaCounterOffer,
  smco_valid: smcoValid,
};

/**
 * Generates synthetic C.A.R.-form PDFs on demand via @tc/test-pdf-generator
 * for the Admin Buyer Transaction Test Center's document-upload actions.
 * These PDFs are fed into the REAL upload pipeline (ExternalDocumentUploadService
 * → DocumentPipelineService) exactly like any real upload — never a shortcut
 * around classification/extraction/validation.
 *
 * Verification of Property (VP) has no generator scenario in
 * @tc/test-pdf-generator today (no blank VP.pdf template, no coordinate map)
 * — the Test Center's VP actions accept an admin-uploaded PDF instead; there
 * is deliberately no `vp_valid`/`vp_invalid` entry here.
 */
@Injectable()
export class TestDocumentProvisioningService {
  private readonly logger = new Logger(TestDocumentProvisioningService.name);

  async provision(document: BuiltInTestDocument): Promise<ProvisionedFile[]> {
    const scenario = SCENARIOS[document];
    const outDir = mkdtempSync(join(tmpdir(), 'tc-admin-testing-'));
    const filePaths = await generateScenarioFiles(scenario, outDir);
    this.logger.log(`Generated ${filePaths.length} file(s) for scenario "${scenario.name}" in ${outDir}`);

    return filePaths.map((filePath) => {
      const fileName = filePath.split('/').pop() ?? filePath;
      const formCode = fileName.replace(/\.pdf$/i, '').split('-')[0];
      return { formCode, fileName, buffer: readFileSync(filePath) };
    });
  }
}
