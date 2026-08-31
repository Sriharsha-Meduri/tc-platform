import { Injectable, Logger } from '@nestjs/common';
import {
  AcroFormExtractor as PackageAcroFormExtractor,
  type AcroFormExtractionResult as PackageAcroFormExtractionResult,
} from '@tc/document-intelligence';

export type AcroFormExtractionResult = PackageAcroFormExtractionResult;

@Injectable()
export class AcroFormExtractorService {
  private readonly extractor = new PackageAcroFormExtractor();
  private readonly logger = new Logger(AcroFormExtractorService.name);

  async extract(buffer: Buffer): Promise<AcroFormExtractionResult> {
    try {
      return await this.extractor.extract(buffer);
    } catch (err) {
      this.logger.warn(`AcroForm extraction failed — LLM will handle it: ${(err as Error).message}`);
      return this.extractor.emptyResult(0);
    }
  }

  async isScannedPdf(buffer: Buffer): Promise<boolean> {
    return this.extractor.isScannedPdf(buffer);
  }
}
