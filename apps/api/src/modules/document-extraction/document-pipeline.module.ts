import { Module } from '@nestjs/common';
import { AiInteractionsModule } from '../ai-interactions/ai-interactions.module';
import { PageRoutingPipelineService } from './page-routing-pipeline.service';
import { AcroFormExtractorService } from './acroform-extractor.service';
import { AcroFormExtractionMapper } from './acroform-extraction-mapper.service';
import { RpaComplianceValidator } from './rpa-compliance.validator';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentPipelineService } from './document-pipeline.service';
import { DocumentFormSplitterService } from './document-form-splitter.service';

/**
 * The self-contained core of the document-analysis pipeline (form detection +
 * extraction + compliance), split out from DocumentExtractionModule so other
 * modules can inject DocumentPipelineService without pulling in that module's
 * heavier imports (TransactionsModule, RepairRequestsModule, etc.) — none of
 * these 6 providers depend on anything beyond AiInteractionsModule.
 */
@Module({
  imports: [AiInteractionsModule],
  providers: [
    PageRoutingPipelineService,
    AcroFormExtractorService,
    AcroFormExtractionMapper,
    RpaComplianceValidator,
    DocumentExtractionService,
    DocumentPipelineService,
    DocumentFormSplitterService,
  ],
  exports: [
    PageRoutingPipelineService,
    AcroFormExtractorService,
    AcroFormExtractionMapper,
    RpaComplianceValidator,
    DocumentExtractionService,
    DocumentPipelineService,
    DocumentFormSplitterService,
  ],
})
export class DocumentPipelineModule {}
