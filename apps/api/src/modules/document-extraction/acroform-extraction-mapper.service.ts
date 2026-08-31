import { Injectable } from '@nestjs/common';
import {
  AcroFormMapper as PackageAcroFormMapper,
  type ExtractionResult,
} from '@tc/document-intelligence';
import type { AcroFormExtractionResult } from './acroform-extractor.service';

@Injectable()
export class AcroFormExtractionMapper {
  private readonly mapper = new PackageAcroFormMapper();

  map(acro: AcroFormExtractionResult): ExtractionResult {
    return this.mapper.map(acro);
  }
}
