import { IsIn } from 'class-validator';
import type { BuiltInTestDocument } from '../test-document-provisioning.service';

const BUILT_IN_TEST_DOCUMENTS: BuiltInTestDocument[] = ['rpa_valid', 'rpa_missing_price', 'sco_bco_counter_offer', 'smco_valid'];

export class UploadTestDocumentDto {
  @IsIn(BUILT_IN_TEST_DOCUMENTS)
  document!: BuiltInTestDocument;
}
