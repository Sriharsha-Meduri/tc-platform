import { Injectable } from '@nestjs/common';
import {
  validateContractStage,
  validateDisclosuresStage,
  AcroFormMapper,
  type FormExtractionOutput,
  type FormExtractionResult,
  type ContractDocumentExtraction,
  type ComplianceResult,
  type ValidationUploadSource,
} from '@tc/document-intelligence';
import type { AcroFormExtractionResult } from './acroform-extractor.service';
import type { ExtractionResult } from './extraction-result.types';

@Injectable()
export class RpaComplianceValidator {
  private readonly acroFormMapper = new AcroFormMapper();

  fromLlmExtraction(
    extraction: ExtractionResult,
    contractDocuments?: ContractDocumentExtraction[],
    pipelineExtractions?: FormExtractionResult[],
  ): ComplianceResult {
    const extractions: FormExtractionOutput[] = [{
      formCode: 'RPA',
      formName: 'Residential Purchase Agreement',
      data: extraction as unknown as Record<string, unknown>,
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'llm',
    }];
    return validateContractStage(extractions, contractDocuments, pipelineExtractions);
  }

  fromAcroForm(acro: AcroFormExtractionResult): ComplianceResult {
    const extraction = this.acroFormMapper.map(acro);
    const extractions: FormExtractionOutput[] = [{
      formCode: 'RPA',
      formName: 'Residential Purchase Agreement',
      data: extraction as unknown as Record<string, unknown>,
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'acroform',
    }];
    return validateContractStage(extractions);
  }

  /**
   * Run contract-stage validation for a document whose form code is already
   * known to be RPA/SCO/BCO/SMCO/BMCO — the real detected code is preserved
   * (never hardcoded to 'RPA') so validateContractStage's per-form dispatch,
   * and its RPA-only stage-level business rules (signatures, contingencies,
   * purchase price, etc.), only apply when the document really is an RPA.
   * A counter-offer passed here still gets its own SCO/BCO validation, not
   * RPA's.
   */
  fromContractFamilyExtraction(
    formCode: string,
    extraction: ExtractionResult,
    contractDocuments?: ContractDocumentExtraction[],
    pipelineExtractions?: FormExtractionResult[],
    uploadSource?: ValidationUploadSource,
  ): ComplianceResult {
    const code = formCode.toUpperCase();
    const extractions: FormExtractionOutput[] = [{
      formCode: code,
      formName: code === 'RPA' ? 'Residential Purchase Agreement' : code,
      data: extraction as unknown as Record<string, unknown>,
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'llm',
    }];
    return validateContractStage(extractions, contractDocuments, pipelineExtractions, uploadSource);
  }

  /**
   * Run disclosure-stage validation for a non-contract-family form (TDS, SPQ,
   * NHD, AVID, BHIA, BIA, WFA, FHDA, CCPA, RR, RRRR, CR-B, VP, etc.). The
   * formCode determines which per-form and cross-form checks apply — a form
   * code with no registered validator here resolves to zero blockers/warnings
   * (a graceful no-op), it is never treated as a failure.
   */
  fromDisclosureExtraction(
    formCode: string,
    extraction: Record<string, unknown>,
    uploadSource?: ValidationUploadSource,
  ): ComplianceResult {
    const extractions: FormExtractionOutput[] = [{
      formCode: formCode.toUpperCase(),
      formName: formCode.toUpperCase(),
      data: extraction,
      rawResponse: '',
      promptTokens: null,
      completionTokens: null,
      modelName: 'llm',
    }];
    return validateDisclosuresStage(extractions, uploadSource);
  }

  /**
   * No form code could be identified at all — never guess by running RPA (or
   * any other) validation against unidentified data. The upload still
   * succeeds; there is simply nothing to report.
   */
  noValidationRequired(): ComplianceResult {
    return {
      sourceType: 'llm_extraction',
      hasAcroForm: false,
      acroFieldCount: 0,
      checks: [],
      blockers: [],
      warnings: [],
      summary: { overallStatus: 'compliant', passCount: 0, failCount: 0, warningCount: 0, skippedCount: 0 },
      signatureFields: [],
      emptyRequiredAcroFields: [],
    };
  }
}
