import { GoogleGenerativeAI } from '@google/generative-ai';
import type { OtherTermsOverrides } from '../../extractor/extractor.types';
import type { ContractDocumentExtraction } from '../../extractor/extractor.types';

// ─── Gemini prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a real estate contract analyzer. Extract contingency information from the "Other Terms" section of a California real estate contract.

Given the text from the Other Terms section, identify any mention of contingency modifications including:

- Loan contingency day counts or waivers ("loan contingency to be 10 days", "no loan contingency", "loan contingency waived")
- Appraisal contingency day counts or waivers ("appraisal contingency to be 7 days", "no appraisal contingency")
- Inspection / investigation contingency day counts ("inspection contingency to be 7 days", "investigation contingency to be 10 days")
- Insurance contingency day counts
- Seller document review day counts
- Title review day counts
- "All contingencies removed within X days" — apply X to all active contingencies unless a specific exception is stated
- "All contingencies removed except inspection" — set all others to no contingency, keep inspection with specified days

Return ONLY valid JSON with these fields:
{
  "loan_contingency_days": number | null,
  "loan_contingency_no_contingency": boolean,
  "appraisal_contingency_days": number | null,
  "appraisal_contingency_no_contingency": boolean,
  "investigation_of_property_days": number | null,
  "insurance_contingency_days": number | null,
  "seller_documents_review_days": number | null,
  "title_review_days": number | null,
  "source_section": "Other Terms",
  "raw_text_used": "<the exact text used for analysis>"
}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OtherTermsContingencyResult {
  loan_contingency_days: number | null;
  loan_contingency_no_contingency: boolean;
  appraisal_contingency_days: number | null;
  appraisal_contingency_no_contingency: boolean;
  investigation_of_property_days: number | null;
  insurance_contingency_days: number | null;
  seller_documents_review_days: number | null;
  title_review_days: number | null;
  source_section: string;
  raw_text_used: string;
}

// ─── Gemini API call ──────────────────────────────────────────────────────────

async function callGeminiForContingency(
  text: string,
  apiKey: string,
  model?: string,
): Promise<OtherTermsContingencyResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const generativeModel = genAI.getGenerativeModel({
    model: model ?? 'gemini-3.1-flash-lite',
    systemInstruction: SYSTEM_PROMPT,
  });

  const response = await generativeModel.generateContent(
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: `Analyze the following Other Terms text and extract contingency information:\n\n---\n${text}\n---\n\nReturn only valid JSON.` }],
        },
      ],
      generationConfig: { maxOutputTokens: 1000, temperature: 0 },
    },
    { timeout: 30000 },
  );

  const resultText = response.response.text();
  const jsonStr = resultText
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  return JSON.parse(jsonStr) as OtherTermsContingencyResult;
}

// ─── Merge Gemini result into OtherTermsOverrides ─────────────────────────────

const CONTINGENCY_FIELD_MAP: Array<{
  geminiKey: string;
  overrideKey: keyof OtherTermsOverrides;
}> = [
  { geminiKey: 'loan_contingency_days', overrideKey: 'loanContingencyDays' },
  { geminiKey: 'appraisal_contingency_days', overrideKey: 'appraisalContingencyDays' },
  { geminiKey: 'investigation_of_property_days', overrideKey: 'inspectionContingencyDays' },
  { geminiKey: 'insurance_contingency_days', overrideKey: 'insuranceContingencyDays' },
  { geminiKey: 'seller_documents_review_days', overrideKey: 'sellerDocumentReviewDays' },
  { geminiKey: 'title_review_days', overrideKey: 'titleReviewDays' },
];

/**
 * Merge a Gemini extraction result into a document's OtherTermsOverrides.
 *
 * Only fills fields that are still null — structured LLM output always wins.
 * Returns a set of field names that were actually updated by this doc's Gemini result,
 * so the caller can track per-field source for UI display.
 */
export function mergeGeminiContingencyResult(
  gemini: OtherTermsContingencyResult,
  overrides: OtherTermsOverrides,
  sourceLabel: string, // e.g. "RPA Other Terms", "SCO Other Terms"
): Set<string> {
  const updatedFields = new Set<string>();

  // ── Loan contingency ──────────────────────────────────────
  if (gemini.loan_contingency_no_contingency) {
    if (overrides.loanContingencyDays == null && overrides.loanContingencyWaived == null) {
      overrides.loanContingencyDays = null;
      overrides.loanContingencyWaived = true;
      updatedFields.add('loanContingencyDays');
      updatedFields.add('loanContingencyWaived');
    }
  } else if (gemini.loan_contingency_days != null) {
    if (overrides.loanContingencyDays == null) {
      overrides.loanContingencyDays = gemini.loan_contingency_days;
      overrides.loanContingencyWaived = false;
      updatedFields.add('loanContingencyDays');
    }
  }

  // ── Appraisal contingency ─────────────────────────────────
  if (gemini.appraisal_contingency_no_contingency) {
    if (overrides.appraisalContingencyDays == null && overrides.appraisalContingencyWaived == null) {
      overrides.appraisalContingencyDays = null;
      overrides.appraisalContingencyWaived = true;
      updatedFields.add('appraisalContingencyDays');
      updatedFields.add('appraisalContingencyWaived');
    }
  } else if (gemini.appraisal_contingency_days != null) {
    if (overrides.appraisalContingencyDays == null) {
      overrides.appraisalContingencyDays = gemini.appraisal_contingency_days;
      overrides.appraisalContingencyWaived = false;
      updatedFields.add('appraisalContingencyDays');
    }
  }

  // ── Day-count fields ──────────────────────────────────────
  // "inspection contingency" maps to investigation_of_property_days in the contract
  if (gemini.investigation_of_property_days != null && overrides.inspectionContingencyDays == null) {
    overrides.inspectionContingencyDays = gemini.investigation_of_property_days;
    updatedFields.add('inspectionContingencyDays');
  }
  if (gemini.insurance_contingency_days != null && overrides.insuranceContingencyDays == null) {
    overrides.insuranceContingencyDays = gemini.insurance_contingency_days;
    updatedFields.add('insuranceContingencyDays');
  }
  if (gemini.seller_documents_review_days != null && overrides.sellerDocumentReviewDays == null) {
    overrides.sellerDocumentReviewDays = gemini.seller_documents_review_days;
    updatedFields.add('sellerDocumentReviewDays');
  }
  if (gemini.title_review_days != null && overrides.titleReviewDays == null) {
    overrides.titleReviewDays = gemini.title_review_days;
    updatedFields.add('titleReviewDays');
  }

  // Track source on the overrides for UI display
  if (updatedFields.size > 0) {
    const existing = (overrides as unknown as Record<string, unknown>)['contingencySource'] as Record<string, string> | undefined;
    const source: Record<string, string> = existing ?? {};
    for (const field of updatedFields) {
      source[field] = sourceLabel;
    }
    (overrides as unknown as Record<string, unknown>)['contingencySource'] = source;
  }

  return updatedFields;
}

// ─── Per-document extraction ──────────────────────────────────────────────────

/**
 * Extract contingency modifications from a single document's Other Terms text
 * using Gemini, and merge into the document's OtherTermsOverrides.
 *
 * @returns true if any field was updated
 */
export async function extractContingencyViaGeminiForDocument(
  doc: ContractDocumentExtraction,
  apiKey: string,
): Promise<boolean> {
  const otherTerms = doc.extractedTerms.otherTerms;
  if (!otherTerms || otherTerms.trim().length === 0) return false;

  const overrides = doc.extractedTerms.otherTermsOverrides;
  if (!overrides) return false;

  try {
    const result = await callGeminiForContingency(otherTerms, apiKey);
    const docLabel = `${doc.documentType} Other Terms`;
    const updated = mergeGeminiContingencyResult(result, overrides, docLabel);
    return updated.size > 0;
  } catch {
    return false;
  }
}

// ─── Batch enrichment across all documents ────────────────────────────────────

/**
 * Enrich all contract documents by running Gemini-based contingency extraction
 * on each document's Other Terms text and merging results into their overrides.
 *
 * Documents are processed in hierarchy order (RPA → SCO → BCO) so that later
 * documents can override earlier ones.
 */
export async function enrichDocumentsWithGeminiContingency(
  docs: ContractDocumentExtraction[],
  apiKey: string,
): Promise<void> {
  if (!apiKey || docs.length === 0) return;

  for (const doc of docs) {
    await extractContingencyViaGeminiForDocument(doc, apiKey);
  }
}
