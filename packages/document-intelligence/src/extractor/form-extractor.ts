import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { resolveFormDefinition } from './forms/registry';
import { PdfjsPageConverter } from '../page-converter/page-converter';
import { detectFooterInitialsWithVision, type FooterInitialsVerification, type InitialSlotDetection } from '../vision/initials-slot-detector';
import { resolveFooterInitialVerdict, type GeminiFooterVerdict } from '../vision/footer-initials-vision';
import { extractYesExplanationsWithVision, applyDisclosureVisionOverride } from '../vision/disclosure-yes-explanation-vision';
import { RenderedPageCache } from '../page-converter/rendered-page-cache';
import type { LlmExtractionProvider, LlmExtractionOptions } from './provider.interface';
import type { FormExtractionOutput } from './extractor.types';
import type { FormDefinition, PageDefinition } from './forms/form-definition';
import { applyRpaContingencyTextOverrides, clearEmptyOtherTermsModifications, extractRpaContingencyTextOverrides } from './rpa-contingency-text-override';
import { DEFAULT_PAGE_CONVERTER_CONFIG, type PageConverterConfig } from '../page-converter/page-converter.types';
import { SPQ_YES_SECTIONS, TDS_ALL_YES_NO_SECTIONS, type YesItemSection } from '../validator/stages/disclosures.stage';

const GENERIC_SYSTEM_PROMPT = `You are a real-estate contract extraction engine.

You read uploaded transaction PDFs and extract structured business data for a transaction management application.

Your output will be used to create a draft transaction record, draft parties, key dates, and related forms/disclosures.

TASK
Analyze the provided PDF contract and extract structured data.

The document may include a purchase agreement, disclosure package, addendum, signature pages, or related real-estate transaction forms.

EXTRACTION RULES
- Return only valid JSON.
- Follow the provided schema exactly.
- Do not include markdown, explanation, or commentary.
- If a field is not present or cannot be determined reliably, use null.
- Do not invent names, dates, prices, or party roles.
- If multiple values appear to conflict, prefer the most explicit value and record the issue in extractionWarnings.
- Preserve names, addresses, form titles, and dates as they appear in the document when possible.
- Do not calculate deadline dates unless explicitly instructed; instead extract the source rule needed for deterministic calculation.
- Include confidence assessments for important fields where supported.

DOCUMENT UNDERSTANDING RULES
- Identify the document type.
- Extract property details.
- Extract transaction terms.
- Extract all parties and their apparent roles.
- Extract agents, brokers, escrow, lender, and other known participants if present.
- Extract important dates already present in the document.
- Extract contingency periods and deadline rules if present.
- Identify and extract ALL forms, disclosures, and addenda present in or referenced by this document.
  For formsAndDisclosures array:
  - Set "status" to "attached" for EVERY form whose pages are physically included in the uploaded PDF.
    This includes any form that has its own title page, footer code, or printed identifier within the upload.
    Even if the form appears after the main contract pages, scan the ENTIRE upload for all form codes.
  - Set "status" to "referenced" for forms mentioned by name or code in the contract text/checkboxes
    but whose pages are NOT physically present in the upload.
  - Set "status" to "missing" ONLY for forms explicitly listed as required/expected in a checklist
    or notice that are clearly absent from both the upload and any attachment list.
  - CRITICAL: For each form you detect, include the exact C.A.R. form code (e.g., "BHIA", "TDS", "SPQ", "NHD")
    in the "formCode" field, not just the title. This enables accurate checklist matching.
- Extract notes about ambiguity, conflicts, or unreadable sections.

OUTPUT CONTRACT
Return JSON only, matching this schema exactly:

{
  "documentType": "<string | null>",
  "documentSubtypes": ["<string>"],
  "sourceLanguage": "<string | null>",
  "property": {
    "streetAddress": "<string | null>",
    "city": "<string | null>",
    "state": "<string | null — 2-letter>",
    "postalCode": "<string | null>",
    "county": "<string | null>",
    "apn": "<string | null>",
    "mlsNumber": "<string | null>",
    "legalDescription": "<string | null>"
  },
  "transaction": {
    "purchasePrice": "<number | null>",
    "earnestMoneyAmount": "<number | null>",
    "offerDate": "<date: YYYY-MM-DD | null>",
    "acceptanceDate": "<date: YYYY-MM-DD | null>",
    "closingDate": "<date: YYYY-MM-DD | null>",
    "possessionDate": "<date: YYYY-MM-DD | null>",
    "financingType": "<string | null>",
    "loanAmount": "<number | null>",
    "occupancyType": "<string | null>"
  },
  "parties": {
    "buyers": [{ "fullName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "mailingAddress": "<string | null>", "signaturePresent": "<boolean>", "confidence": "<number | null>" }],
    "sellers": [{ "fullName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "mailingAddress": "<string | null>", "signaturePresent": "<boolean>", "confidence": "<number | null>" }],
    "buyerAgents": [{ "fullName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "licenseNumber": "<string | null>", "companyName": "<string | null>", "confidence": "<number | null>" }],
    "listingAgents": [{ "fullName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "licenseNumber": "<string | null>", "companyName": "<string | null>", "confidence": "<number | null>" }],
    "brokers": [{ "companyName": "<string | null>", "contactName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "confidence": "<number | null>" }],
    "escrowCompanies": [{ "companyName": "<string | null>", "contactName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "confidence": "<number | null>" }],
    "lenders": [{ "companyName": "<string | null>", "contactName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "confidence": "<number | null>" }],
    "attorneys": [{ "fullName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "licenseNumber": "<string | null>", "companyName": "<string | null>", "confidence": "<number | null>" }],
    "otherParties": [{ "companyName": "<string | null>", "contactName": "<string | null>", "email": "<string | null>", "phone": "<string | null>", "confidence": "<number | null>" }]
  },
  "contractTerms": {
    "inspectionContingencyDays": "<number | null>",
    "loanContingencyDays": "<number | null>",
    "appraisalContingencyDays": "<number | null>",
    "disclosuresDueDays": "<number | null>",
    "otherDeadlines": [{ "label": "<string>", "value": "<string | null>" }]
  },
  "formsAndDisclosures": [{ "title": "<string>", "formCode": "<string | null>", "status": "<referenced | attached | missing>", "confidence": "<number | null>" }],
  "signatures": {
    "buyerSigned": "<boolean>",
    "sellerSigned": "<boolean>",
    "signedParties": ["<string>"],
    "missingSignatures": ["<string>"]
  },
  "extractionWarnings": ["<string>"],
  "confidenceSummary": {
    "overall": "<number>",
    "property": "<number | null>",
    "transaction": "<number | null>",
    "parties": "<number | null>",
    "formsAndDisclosures": "<number | null>"
  }
}`;

const GENERIC_USER_PROMPT = 'Extract all transaction data from the provided PDF document(s) and return valid JSON matching the schema.';

export type ExtractionProvider = 'anthropic' | 'gemini';

export interface FormExtractorConfig {
  provider: ExtractionProvider;
  apiKey: string;
  model?: string;
  temperature?: number;
  pageConversion?: PageConverterConfig | 'none';
}

export interface ExtractionProgressEvent {
  currentPage: number;
  totalPages: number;
  message: string;
  formCode?: string;
}

interface PageBucket {
  buffers: Buffer[];
  systemPrompt: string;
  userPrompt: string;
  provider: ExtractionProvider;
  model?: string;
  pageNumbers: number[];
  mimeType: 'application/pdf' | 'image/png';
}

export class FormExtractor {
  private readonly providers = new Map<string, LlmExtractionProvider>();

  private readonly converter: PdfjsPageConverter | null;

  constructor(private readonly defaultConfig: FormExtractorConfig) {
    this.converter = defaultConfig.pageConversion && defaultConfig.pageConversion !== 'none'
      ? new PdfjsPageConverter(defaultConfig.pageConversion)
      : null;
  }

  async extract(
    pageBuffers: Buffer[],
    pageNumbers: (number | null)[],
    formCode: string,
    formName?: string | null,
    formVersion?: string | null,
    onProgress?: (event: ExtractionProgressEvent) => void,
  ): Promise<FormExtractionOutput> {
    const t0 = Date.now();
    console.log(`[Extractor] extract() form=${formCode} pages=${pageBuffers.length} mime_hint=${this.converter ? 'convertible' : 'raw_pdf'}`);

    const { buffers, mimeType } = await this.maybeConvertPages(pageBuffers);
    console.log(`[Extractor] Page conversion: ${mimeType} (${buffers.length} buffers)`);

    const formDef = resolveFormDefinition(formCode, formVersion);
    const pageDefs = formDef?.pageDefinitions;

    if (!pageDefs || pageDefs.length === 0) {
      console.log(`[Extractor] No page definitions for ${formCode} — using batch extraction`);
      onProgress?.({ currentPage: 1, totalPages: buffers.length, message: `Analyzing ${buffers.length} page${buffers.length !== 1 ? 's' : ''}…`, formCode });
      const result = await this.extractBatch(buffers, formDef, formCode, formName, mimeType, formDef?.systemPrompt, formDef?.userPrompt);
      await this.applyDisclosureYesExplanationVisionVerification(formCode, result.data, pageBuffers);
      onProgress?.({ currentPage: buffers.length, totalPages: buffers.length, message: `Analysis complete`, formCode });
      console.log(`[Extractor] Batch extraction done for ${formCode} in ${Date.now() - t0}ms (tokens: prompt=${result.promptTokens} completion=${result.completionTokens})`);
      return result;
    }

    const buckets = this.buildPageBuckets(buffers, pageNumbers, pageDefs, formDef, mimeType);
    console.log(`[Extractor] Per-page extraction for ${formCode}: ${buckets.length} bucket(s)`);
    // One shared render cache per extract() call — a page rendered for footer-initials
    // verification (or, in a later phase, field-region-crop corroboration) is rendered
    // at most once even if multiple signals need it.
    const renderCache = new RenderedPageCache(
      this.defaultConfig.pageConversion && this.defaultConfig.pageConversion !== 'none'
        ? this.defaultConfig.pageConversion
        : DEFAULT_PAGE_CONVERTER_CONFIG,
    );
    const results = await this.executeBuckets(buckets, buffers.length, onProgress, formCode, renderCache);

    const merged = this.deepMergeAll(results.map((r) => r.data));
    const totalPrompt = results.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
    const totalCompletion = results.reduce((s, r) => s + (r.completionTokens ?? 0), 0);
    const models = [...new Set(results.map((r) => r.modelName).filter(Boolean))].join(', ');

    await this.applyRpaContingencyTextCorrection(merged, pageBuffers, pageNumbers);

    for (let i = 0; i < results.length; i++) {
      const bucketPageNums = buckets[i]?.pageNumbers ?? [];
      const topKeys = Object.keys(results[i].data);
      console.log(`[Extractor] Bucket ${i + 1} contribution [pages ${bucketPageNums.join(',')}]: top-level keys = ${topKeys.join(', ') || '(none)'}`);
    }

    const mergedKeys = Object.keys(merged);
    console.log(`[Extractor] Per-page extraction done for ${formCode} in ${Date.now() - t0}ms (${buckets.length} buckets, ${mergedKeys.length} merged keys, tokens: prompt=${totalPrompt} completion=${totalCompletion})`);
    return {
      formCode,
      formName: formName ?? formDef?.formName ?? null,
      data: merged,
      rawResponse: results.map((r) => r.rawResponse).join('\n---\n'),
      promptTokens: totalPrompt || null,
      completionTokens: totalCompletion || null,
      modelName: models || (this.defaultConfig.model ?? 'unknown'),
    };
  }

  private async maybeConvertPages(buffers: Buffer[]): Promise<{ buffers: Buffer[]; mimeType: 'application/pdf' | 'image/png' }> {
    if (!this.converter) {
      return { buffers, mimeType: 'application/pdf' };
    }
    try {
      const merged = await this.mergePageBuffers(buffers);
      const result = await this.converter.convert(merged);
      if (result.convertedPageCount > 0 && result.convertedPageCount === buffers.length) {
        return { buffers: result.pages, mimeType: 'image/png' };
      }
    } catch {
      // fall through — use raw PDF
    }
    return { buffers, mimeType: 'application/pdf' };
  }

  private async mergePageBuffers(buffers: Buffer[]): Promise<Buffer> {
    const { PDFDocument } = await import('pdf-lib');
    const merged = await PDFDocument.create();
    for (const buf of buffers) {
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    return Buffer.from(await merged.save());
  }

  private buildPageBuckets(
    pageBuffers: Buffer[],
    pageNumbers: (number | null)[],
    pageDefs: PageDefinition[],
    formDef: FormDefinition | undefined,
    mimeType: 'application/pdf' | 'image/png' = 'application/pdf',
  ): PageBucket[] {
    const defMap = new Map<number, PageDefinition>();
    for (const pd of pageDefs) {
      defMap.set(pd.pageNumber, pd);
    }

    const buckets: PageBucket[] = [];
    const genericBuffers: Buffer[] = [];
    const genericPageNums: number[] = [];

    for (let i = 0; i < pageBuffers.length; i++) {
      const pageNum = pageNumbers[i];

      if (pageNum !== null) {
        const def = defMap.get(pageNum);
        if (def) {
          const label = `${def.provider ?? this.defaultConfig.provider}/${def.model ?? this.defaultConfig.model}`;
          console.log(`[Extractor] Page ${i} (logical #${pageNum}) → dedicated bucket (provider=${label})`);
          buckets.push({
            buffers: [pageBuffers[i]],
            systemPrompt: def.systemPrompt,
            userPrompt: def.userPrompt,
            provider: def.provider ?? this.defaultConfig.provider,
            model: def.model ?? this.defaultConfig.model,
            pageNumbers: [pageNum],
            mimeType,
          });
        } else {
          console.log(`[Extractor] Page ${i} (logical #${pageNum}) → no PageDefinition for this logical number, falling to generic bucket`);
        }
      } else {
        console.log(`[Extractor] Page ${i} → unnumbered page, falling to generic bucket`);
      }

      genericBuffers.push(pageBuffers[i]);
      genericPageNums.push(pageNum ?? -1);
    }

    const dedupedPageNums = [...new Set(genericPageNums)];
    console.log(`[Extractor] Generic bucket: ${genericBuffers.length} page(s) [${dedupedPageNums.join(', ')}]`);
    if (genericBuffers.length > 0) {
      buckets.push({
        buffers: genericBuffers,
        systemPrompt: formDef?.systemPrompt ?? GENERIC_SYSTEM_PROMPT,
        userPrompt: formDef?.userPrompt ?? this.buildGenericUserPrompt(formDef?.formCode ?? 'UNKNOWN', null),
        provider: this.defaultConfig.provider,
        model: this.defaultConfig.model,
        pageNumbers: genericPageNums,
        mimeType,
      });
    }

    return buckets;
  }

  private async executeBuckets(
    buckets: PageBucket[],
    totalPages: number,
    onProgress?: (event: ExtractionProgressEvent) => void,
    formCode?: string,
    renderCache?: RenderedPageCache,
  ): Promise<FormExtractionOutput[]> {
    return Promise.all(
      buckets.map(async (bucket, i) => {
        const bt0 = Date.now();
        const providerLabel = `${bucket.provider}/${bucket.model ?? 'default'}`;
        const pageRange = bucket.pageNumbers.filter((n) => n !== null && n !== -1);
        const pageLabel = pageRange.length === 1
          ? `page ${pageRange[0]}`
          : pageRange.length > 1
          ? `pages ${pageRange[0]}–${pageRange[pageRange.length - 1]}`
          : `${bucket.buffers.length} page${bucket.buffers.length !== 1 ? 's' : ''}`;
        onProgress?.({ currentPage: i + 1, totalPages: buckets.length, message: `Analyzing ${pageLabel}…`, formCode });
        console.log(`[Extractor] Bucket ${i + 1}/${buckets.length}: provider=${providerLabel} pages=${bucket.buffers.length} mime=${bucket.mimeType}`);
        try {
          const llm = this.resolveProvider(bucket.provider, bucket.model);
          const options: LlmExtractionOptions = { mimeType: bucket.mimeType };
          const response = await llm.extractText(bucket.buffers, bucket.systemPrompt, bucket.userPrompt, options);
          const data = this.parseResponse(response.text);
          if (renderCache) await this.applyFooterInitialsVerification(formCode, bucket, data, renderCache);
          console.log(`[Extractor] Bucket ${i + 1}/${buckets.length} done in ${Date.now() - bt0}ms (tokens: prompt=${response.promptTokens} completion=${response.completionTokens})`);
          return {
            formCode: '',
            formName: null,
            data,
            rawResponse: response.text,
            promptTokens: response.promptTokens,
            completionTokens: response.completionTokens,
            modelName: response.modelName,
          };
        } catch (err) {
          console.error(`[Extractor] Bucket ${i + 1}/${buckets.length} FAILED in ${Date.now() - bt0}ms: ${(err as Error)?.message ?? err}`);
          throw err;
        }
      }),
    );
  }

  /**
   * Corroborate the extraction LLM's footer-initials judgment on RPA pages
   * 4-15 with two independent signals: deterministic pixel/connected-component
   * analysis (ground truth for "is there ink") and a Gemini vision check on
   * the exact slot crops. Merge rule per slot:
   *  - present  when EITHER signal finds an initial (rescues a missed mark)
   *  - absent   only when BOTH signals independently say there is no initial
   *  - otherwise the LLM's own value is left untouched — an inconclusive or
   *    unavailable check is never treated as "missing"
   * Runs only for single-page RPA buckets sent as raw PDF. When neither
   * signal is available (e.g. no text layer to anchor the slots), this
   * silently keeps the LLM's judgment.
   */
  private async applyFooterInitialsVerification(
    formCode: string | undefined,
    bucket: PageBucket,
    data: Record<string, unknown>,
    renderCache: RenderedPageCache,
  ): Promise<void> {
    if ((formCode ?? '').toUpperCase() !== 'RPA') return;
    // bucket.buffers[0] must be the original per-page PDF bytes — locateFooterSlotZones
    // and RenderedPageCache.getPage both parse it as a PDF via pdfjs, independent of
    // whatever format (PDF or PNG) was actually sent to the extraction LLM call above.
    if (bucket.mimeType !== 'application/pdf') return;
    if (bucket.pageNumbers.length !== 1) return;
    const pageNumber = bucket.pageNumbers[0];
    if (pageNumber === null || pageNumber < 4 || pageNumber > 15) return;

    const geminiApiKey = this.defaultConfig.provider === 'gemini'
      ? this.defaultConfig.apiKey
      : process.env.GEMINI_API_KEY ?? '';
    const visionModel = this.defaultConfig.provider === 'gemini' ? this.defaultConfig.model : undefined;

    let verification: FooterInitialsVerification | null;
    try {
      verification = await detectFooterInitialsWithVision(
        bucket.buffers[0],
        renderCache,
        geminiApiKey || undefined,
        { model: visionModel },
      );
    } catch (err) {
      console.warn(`[Extractor] Footer initials verification failed for RPA page ${pageNumber}: ${(err as Error)?.message ?? err}`);
      return;
    }
    if (!verification) return;

    const zone = pageNumber === 15
      ? this.getOrCreateRecord(this.getOrCreateRecord(data, 'execution_review'), 'page_footer_initials')
      : this.getOrCreateRecord(data, `page_${pageNumber}_footer_initials`);

    const buyerGroup = this.getOrCreateRecord(zone, 'buyer_initials');
    const sellerGroup = this.getOrCreateRecord(zone, 'seller_initials');

    const labels = ['B1', 'B2', 'S1', 'S2'];
    const slots: Array<[Record<string, unknown>, 'slot_1' | 'slot_2', InitialSlotDetection | null, keyof GeminiFooterVerdict]> = [
      [buyerGroup, 'slot_1', verification.pixel.buyerSlot1, 'buyerSlot1'],
      [buyerGroup, 'slot_2', verification.pixel.buyerSlot2, 'buyerSlot2'],
      [sellerGroup, 'slot_1', verification.pixel.sellerSlot1, 'sellerSlot1'],
      [sellerGroup, 'slot_2', verification.pixel.sellerSlot2, 'sellerSlot2'],
    ];

    const outcomes: string[] = [];
    for (let i = 0; i < slots.length; i++) {
      const [group, slotKey, pixel, visionKey] = slots[i];
      const gemini = verification.gemini?.[visionKey];
      const verdict = resolveFooterInitialVerdict(pixel, gemini);
      outcomes.push(`${labels[i]}=${verdict}`);
      if (verdict === 'keep') continue;
      this.applySlotVerdict(group, slotKey, verdict, pixel);
    }

    console.log(
      `[Extractor] Footer initials verification for RPA page ${pageNumber}: ` +
      `pixel B1=${verification.pixel.buyerSlot1?.initialsPresent ?? 'n/a'} B2=${verification.pixel.buyerSlot2?.initialsPresent ?? 'n/a'} ` +
      `S1=${verification.pixel.sellerSlot1?.initialsPresent ?? 'n/a'} S2=${verification.pixel.sellerSlot2?.initialsPresent ?? 'n/a'} ` +
      `| vision=${verification.gemini ? JSON.stringify(verification.gemini) : 'unavailable'} | verdict=${outcomes.join(' ')}`,
    );
  }

  /**
   * TDS/SPQ take the "no page definitions" batch path above, which sends raw
   * PDF bytes to a text-only LLM — no rendered image, so a checked "Yes" box
   * or its explanation text can be misread or attributed to the wrong
   * section. This re-derives both signals directly from rendered page images
   * in one Gemini vision call and merges the result over the batch
   * extraction's own values (never replacing fields outside the configured
   * Yes/explanation sections). Runs only for SPQ/TDS; silently does nothing
   * on any rendering/vision failure — the batch extraction's own answer
   * always survives untouched in that case.
   */
  private async applyDisclosureYesExplanationVisionVerification(
    formCode: string,
    data: Record<string, unknown>,
    pageBuffers: Buffer[],
  ): Promise<void> {
    const code = formCode.toUpperCase();
    let sections: YesItemSection[];
    if (code === 'SPQ') sections = SPQ_YES_SECTIONS;
    // Broader than TDS_SECTION_C_ITEMS (the explanation-check's own, narrower
    // scope) — this vision pass also verifies checkbox completion for TDS's
    // two other standalone Yes/No questions (Section II.A's own concluding
    // question, Section II.B's headline question), which don't participate
    // in the explanation check at all.
    else if (code === 'TDS') sections = TDS_ALL_YES_NO_SECTIONS;
    else return;

    const geminiApiKey = this.defaultConfig.provider === 'gemini'
      ? this.defaultConfig.apiKey
      : process.env.GEMINI_API_KEY ?? '';
    if (!geminiApiKey) return;
    const visionModel = this.defaultConfig.provider === 'gemini' ? this.defaultConfig.model : undefined;

    // Dedicated higher-resolution cache (900 DPI, vs the 200 DPI shared
    // default) — this is its own fresh cache regardless, never shared with
    // any other pass, and reading a small checkbox mark reliably benefits
    // more from resolution than page-level text extraction does. Confirmed
    // via repeated live-fixture debug runs that a checkbox sitting directly
    // beneath another item's wrapped second line is a stubborn, reproducible
    // misread at 300/400/600 DPI (consistent across both temperature-0 and
    // temperature-0.4 samples) — the model confidently reports the wrong
    // mark, not just an occasional miss. 900 DPI was the point this specific
    // failure mode actually resolved, verified over multiple repeated runs.
    const renderCache = new RenderedPageCache({ dpi: 900 });

    try {
      const result = await extractYesExplanationsWithVision(pageBuffers, code as 'TDS' | 'SPQ', sections, renderCache, geminiApiKey, visionModel);
      if (!result) return;
      applyDisclosureVisionOverride(data, result.override, sections);
      // Reserved side-channel (mirrors `extractionWarnings`), not one of the
      // form's own schema fields — see `getCompletionState` in
      // disclosures.stage.ts for why the Yes/No completion check reads this
      // directly instead of trying to infer "neither"/"both" from the
      // collapsed boolean fields the override above just wrote.
      data['yesNoCompletionState'] = result.completion;
      console.log(`[Extractor] Yes-explanation vision verification applied for ${code} across ${Object.keys(result.override).length} section(s)`);
    } catch (err) {
      console.warn(`[Extractor] Yes-explanation vision verification failed for ${code}: ${(err as Error)?.message ?? err}`);
    }
  }

  private getOrCreateRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
    const existing = parent[key];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      return existing as Record<string, unknown>;
    }
    const created: Record<string, unknown> = {};
    parent[key] = created;
    return created;
  }

  /**
   * Write a conclusive verdict into one slot. `present` sets
   * initials_present = true (either source found an initial); `absent` sets
   * initials_present = false (both sources independently found none).
   */
  private applySlotVerdict(
    group: Record<string, unknown>,
    slotKey: 'slot_1' | 'slot_2',
    verdict: 'present' | 'absent',
    pixel: InitialSlotDetection | null,
  ): void {
    const slot = this.getOrCreateRecord(group, slotKey);
    slot['initials_present'] = verdict === 'present';

    if (verdict === 'present') {
      const existingType = slot['mark_type'];
      if (existingType !== 'handwritten' && existingType !== 'electronic' && existingType !== 'unreadable') {
        slot['mark_type'] = 'unreadable';
      }
      slot['visual_evidence'] = pixel
        ? `[pixel-verified] dark-pixel ratio ${pixel.darkPixelRatio.toFixed(3)}, largest ink component ${pixel.largestComponentArea}px`
        : '[gemini-vision] visual inspection found an initial';
    } else {
      slot['mark_type'] = 'none';
      slot['visual_evidence'] = '[pixel+gemini] both checks report the slot is blank';
    }
  }

  /**
   * Deterministic contingency correction for RPA page 2. Reads typed override
   * digits out of the section 3L "(or ____)" blanks from the PDF text layer
   * and overrides the LLM's values — the vision model occasionally returns the
   * printed default (e.g. "17") when the blank contains a typed value ("9").
   * Handwritten overrides are untouched (no text glyph), so this never guesses.
   * Also drops fabricated `other_terms_modifications` when Section R is blank.
   */
  private async applyRpaContingencyTextCorrection(
    data: Record<string, unknown>,
    pageBuffers: Buffer[],
    pageNumbers: (number | null)[],
  ): Promise<void> {
    if (pageBuffers.length < 2) return;
    const idx = pageNumbers.findIndex((n) => n === 2);
    if (idx === -1) return;

    if (clearEmptyOtherTermsModifications(data)) {
      console.log('[Extractor] RPA Section R blank — cleared fabricated other_terms_modifications');
    }

    const overrides = await extractRpaContingencyTextOverrides(pageBuffers[idx]);
    if (Object.keys(overrides).length === 0) return;

    applyRpaContingencyTextOverrides(data, overrides);
    console.log(`[Extractor] RPA page-2 text-layer contingency overrides: ${JSON.stringify(overrides)}`);
  }

  private async extractBatch(
    pageBuffers: Buffer[],
    formDef: FormDefinition | undefined,
    formCode: string,
    formName?: string | null,
    mimeType?: 'application/pdf' | 'image/png',
    systemPromptOverride?: string,
    userPromptOverride?: string,
  ): Promise<FormExtractionOutput> {
    const t0 = Date.now();
    const systemPrompt = systemPromptOverride ?? formDef?.systemPrompt ?? GENERIC_SYSTEM_PROMPT;
    const userPrompt = userPromptOverride ?? formDef?.userPrompt ?? this.buildGenericUserPrompt(formCode, formName);

    console.log(`[Extractor] extractBatch() form=${formCode} provider=${this.defaultConfig.provider}/${this.defaultConfig.model ?? 'default'} pages=${pageBuffers.length}`);

    const llm = this.resolveProvider(this.defaultConfig.provider, this.defaultConfig.model);
    const options: LlmExtractionOptions = mimeType ? { mimeType } : {};
    const llmResponse = await llm.extractText(pageBuffers, systemPrompt, userPrompt, options);

    if (!llmResponse.text) {
      console.error(`[Extractor] extractBatch() form=${formCode} got EMPTY response in ${Date.now() - t0}ms`);
      throw new Error(`Empty response from LLM for form ${formCode}`);
    }

    const data = this.parseResponse(llmResponse.text);
    console.log(`[Extractor] extractBatch() form=${formCode} done in ${Date.now() - t0}ms (tokens: prompt=${llmResponse.promptTokens} completion=${llmResponse.completionTokens})`);

    return {
      formCode,
      formName: formName ?? formDef?.formName ?? null,
      data,
      rawResponse: llmResponse.text,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      modelName: llmResponse.modelName,
    };
  }

  private resolveProvider(provider: ExtractionProvider, model?: string): LlmExtractionProvider {
    const key = `${provider}::${model ?? 'default'}`;
    const cached = this.providers.get(key);
    if (cached) return cached;

    const apiKey = provider === 'gemini'
      ? (this.defaultConfig.provider === 'gemini' ? this.defaultConfig.apiKey : process.env.GEMINI_API_KEY ?? '')
      : (this.defaultConfig.provider === 'anthropic' ? this.defaultConfig.apiKey : process.env.ANTHROPIC_API_KEY ?? '');

    const temperature = this.defaultConfig.temperature;
    const llm = provider === 'gemini'
      ? new GeminiProvider(apiKey, model, temperature)
      : new AnthropicProvider(apiKey, model, temperature);

    this.providers.set(key, llm);
    return llm;
  }

  private parseResponse(text: string): Record<string, unknown> {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    const tryParse = (s: string): Record<string, unknown> | null => {
      try {
        return JSON.parse(s) as Record<string, unknown>;
      } catch {
        return null;
      }
    };

    // fast path — direct parse
    const direct = tryParse(cleaned);
    if (direct) return direct;

    // try extracting the outermost {…} block (handles trailing text)
    const braceStart = cleaned.indexOf('{');
    if (braceStart !== -1) {
      let depth = 0;
      let braceEnd = -1;
      for (let i = braceStart; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        else if (cleaned[i] === '}') {
          depth--;
          if (depth === 0) { braceEnd = i + 1; break; }
        }
      }
      if (braceEnd > braceStart) {
        const candidate = cleaned.slice(braceStart, braceEnd);
        const result = tryParse(candidate);
        if (result) return result;
      }
    }

    // try stripping trailing unquoted garbage (common LLM mistake after the closing })
    const matchEnd = cleaned.lastIndexOf('}');
    if (matchEnd !== -1) {
      const candidate = cleaned.slice(0, matchEnd + 1);
      const result = tryParse(candidate);
      if (result) return result;
    }

    // try fixing trailing commas (common LLM issue)
    const noTrailingCommas = cleaned.replace(/,(\s*[}\]])/g, '$1');
    const fixed = tryParse(noTrailingCommas);
    if (fixed) return fixed;

    // last resort — return empty object, caller will see null/undefined fields
    return {};
  }

  private deepMergeAll(objects: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const obj of objects) {
      this.deepMerge(result, obj);
    }
    return result;
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
      const sv = source[key];
      if (sv === null || sv === undefined) continue;
      const tv = target[key];
      if (this.isPlainObject(sv) && this.isPlainObject(tv)) {
        this.deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
      } else if (tv === undefined || tv === null) {
        target[key] = sv;
      }
    }
  }

  private isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  private buildGenericUserPrompt(formCode: string, formName?: string | null): string {
    if (!formCode || formCode === 'UNKNOWN') return GENERIC_USER_PROMPT;
    const label = formName ? `${formCode} — ${formName}` : formCode;
    return `You are extracting from the CAR form: ${label}. ${GENERIC_USER_PROMPT}`;
  }
}
