import { Injectable, Logger } from '@nestjs/common';
import { PdfjsPageConverter, GeminiProvider } from '@tc/document-intelligence';
import { getFormTemplate } from './field-coordinates';
import type { FormFieldPlacement } from './field-analysis.types';

export interface DetectedSignatureLine {
  pageNumber: number;
  label: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  recommendedRecipientRole: string;
  docuSignTabType: 'signHere' | 'initialHere' | 'dateSigned';
  confidence: 'high' | 'medium' | 'low';
}

const SYSTEM_PROMPT = `You are a signature-line detection engine for real estate PDF forms.
Your task is to identify physical signature lines on a rendered PDF page.

A signature line is characterized by:
- A long horizontal line (typically 150-300 pixels wide at 200 DPI)
- A blank area immediately above or below the line where a signature would be written
- Often accompanied by a text label like "Buyer", "Seller", "Agent", "Signature", or "Date"

Return a JSON object with this exact shape:
{
  "signature_fields": [
    {
      "page_number": <number>,
      "label": "<the nearest text label, e.g. Buyer Signature>",
      "center_x": <number, pixel x of the line midpoint>,
      "center_y": <number, pixel y of the line>,
      "width": <number, pixel width of the line>,
      "height": <number, estimated pixel height of the signing area (typical: 25-40)>,
      "doc_type": "signature" | "initials" | "date" | "name"
    }
  ]
}

IMPORTANT RULES:
- Return ALL signature/initial/date lines visible on the page, not just a few
- Use PIXEL coordinates relative to the rendered image (origin at top-left)
- center_x and center_y should be the MIDPOINT of the horizontal line
- If a line has both a signature line AND a date line next to it, report BOTH as separate entries
- For "initials" — these are short lines (50-80 pixels) typically found at page bottom
- For "date" fields — these are shorter lines (80-120 pixels) directly adjacent to a signature line
- Do NOT return decorative lines, separator lines, or form borders
- If no signature lines are found, return { "signature_fields": [] }
- Set confidence to "high" if you clearly see a complete signature line with label, "medium" if the line is visible but partially obscured, "low" if you are guessing`;

@Injectable()
export class SignatureLineDetectorService {
  private readonly logger = new Logger(SignatureLineDetectorService.name);
  private readonly converter = new PdfjsPageConverter({ dpi: 200 });
  private geminiProvider: GeminiProvider | null = null;
  private readonly cache = new Map<string, DetectedSignatureLine[]>();

  private getProvider(): GeminiProvider {
    if (!this.geminiProvider) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set — signature line detection requires Gemini');
      }
      this.geminiProvider = new GeminiProvider(apiKey, 'gemini-3.1-flash-lite', 0);
    }
    return this.geminiProvider;
  }

  /**
   * Detect signature lines on specific pages of a PDF document.
   * Caches results by document hash to avoid repeated LLM calls.
   */
  async detectLines(
    pdfBuffer: Buffer,
    formCode: string,
    documentId: string,
    cachedLines?: DetectedSignatureLine[] | null,
  ): Promise<DetectedSignatureLine[]> {
    if (cachedLines && cachedLines.length > 0) {
      this.logger.log(`Using ${cachedLines.length} cached signature line(s) for ${formCode}`);
      return cachedLines;
    }

    const cacheKey = `${documentId}-${formCode}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const template = getFormTemplate(formCode);
    if (!template) {
      this.logger.debug(`No coordinate template for ${formCode}, skipping line detection`);
      return [];
    }

    // Determine which pages have signature-related fields
    const signaturePages = [...new Set(
      template.placements
        .filter((p: FormFieldPlacement) => ['signHere', 'initialHere', 'dateSigned'].includes(p.docuSignTabType))
        .map((p: FormFieldPlacement) => p.pageNumber),
    )].sort((a: number, b: number) => a - b);

    if (signaturePages.length === 0) return [];

    this.logger.log(`Detecting signature lines on ${formCode} pages ${signaturePages.join(', ')}`);

    try {
      // Convert PDF to PNG images
      const convertResult = await this.converter.convert(pdfBuffer);
      if (convertResult.convertedPageCount === 0) {
        this.logger.warn(`PDF→PNG conversion failed for ${formCode}, falling back to template coordinates`);
        return [];
      }

      const provider = this.getProvider();
      const allLines: DetectedSignatureLine[] = [];

      // Process signature pages
      const targetPages = signaturePages.filter((p) => p <= convertResult.convertedPageCount);
      for (const pageNum of targetPages) {
        const pageIndex = pageNum - 1; // 0-indexed
        const pageBuffer = convertResult.pages[pageIndex];

        const userPrompt = `This is page ${pageNum} of a ${formCode} real estate form (California). Detect ALL signature lines, initial lines, and date lines on this page. Return the JSON with page_number set to ${pageNum}.`;

        const response = await provider.extractText(
          [pageBuffer],
          SYSTEM_PROMPT,
          userPrompt,
          { mimeType: 'image/png' },
        );

        const raw = response.text;
        const parsed = this.parseResponse(raw, pageNum, formCode, provider.providerName);

        if (parsed.length > 0) {
          this.logger.log(`Detected ${parsed.length} line(s) on ${formCode} page ${pageNum}`);
          allLines.push(...parsed);
        }
      }

      // Convert pixel coordinates to PDF points (72 DPI)
      // The converter renders at 200 DPI, so pixel = point * (200/72) ≈ point * 2.778
      const scale = 200 / 72;
      const inPdfPoints = allLines.map((line) => ({
        ...line,
        centerX: Math.round(line.centerX / scale),
        centerY: Math.round(line.centerY / scale),
        width: Math.round(line.width / scale),
        height: Math.round(line.height / scale),
      }));

      if (inPdfPoints.length > 0) {
        this.cache.set(cacheKey, inPdfPoints);
      }

      return inPdfPoints;
    } catch (err) {
      this.logger.warn(`Signature line detection failed for ${formCode}: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Parse the LLM response into structured DetectedSignatureLine objects.
   */
  private parseResponse(
    rawText: string,
    pageNum: number,
    formCode: string,
    providerName: string,
  ): DetectedSignatureLine[] {
    try {
      // Extract JSON from the response (may be wrapped in markdown code blocks)
      let jsonStr = rawText;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else {
        // Try to find JSON object boundaries
        const braceMatch = rawText.match(/(\{[\s\S]*\})/);
        if (braceMatch) {
          jsonStr = braceMatch[1];
        }
      }

      const data = JSON.parse(jsonStr) as { signature_fields?: Array<{
        page_number?: number;
        label?: string;
        center_x?: number;
        center_y?: number;
        width?: number;
        height?: number;
        doc_type?: string;
        confidence?: string;
      }> };

      if (!data.signature_fields?.length) return [];

      const template = getFormTemplate(formCode);

      return data.signature_fields
        .filter((f) => f.center_x != null && f.center_y != null)
        .map((f) => {
          const docType = (f.doc_type || 'signature').toLowerCase();
          const tabType: DetectedSignatureLine['docuSignTabType'] =
            docType === 'initials' ? 'initialHere'
            : docType === 'date' ? 'dateSigned'
            : 'signHere';

          // Match the detected label to a template placement to get the recipient role
          const label = (f.label || 'Signature').trim();
          let role = 'buyer';
          if (template) {
            const match = template.placements.find(
              (p) => p.docuSignTabType === tabType
                && (label.toLowerCase().includes(p.recommendedRecipientRole)
                  || p.label.toLowerCase().includes(label.toLowerCase())
                  || label.toLowerCase().includes(p.label.toLowerCase())),
            );
            if (match) {
              role = match.recommendedRecipientRole;
            }
          }

          // Infer role from label if no template match
          if (role === 'buyer') {
            const lowerLabel = label.toLowerCase();
            if (lowerLabel.includes('seller') || lowerLabel.includes('offeror')) role = 'seller';
            else if (lowerLabel.includes('buyer agent')) role = 'buyer_agent';
            else if (lowerLabel.includes('seller agent') || lowerLabel.includes('listing agent')) role = 'seller_agent';
          }

          return {
            pageNumber: f.page_number ?? pageNum,
            label,
            centerX: f.center_x ?? 90,
            centerY: f.center_y ?? 500,
            width: f.width ?? 200,
            height: f.height ?? 32,
            recommendedRecipientRole: role,
            docuSignTabType: tabType,
            confidence: (f.confidence === 'low' ? 'low' : f.confidence === 'medium' ? 'medium' : 'high') as DetectedSignatureLine['confidence'],
          };
        });
    } catch (err) {
      this.logger.warn(`Failed to parse ${providerName} signature line response: ${(err as Error).message}`);
      return [];
    }
  }
}
