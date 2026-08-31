/**
 * Typed-sentinel fields for the bottom-left footer of every CAR form page.
 * Spread this into the header section of every form template.
 *
 * Example footer text: "RPA  Revised 12/25  Page 1 of 17"
 */
export const FORM_FOOTER_FIELDS = {
  form_code:    '<string | null>',
  form_version: '<string | null>',
  form_name: '<string | null>'
} as const;

/**
 * Standard instruction added to every system prompt so the LLM knows to read
 * the bottom-left footer for form identification fields.
 */
export const FORM_FOOTER_INSTRUCTION = `FORM FOOTER (applies to every CAR form):
Every page has a bottom-left footer with three pieces of information:
  • Form code   — e.g. "RPA", "TDS", "AD"
  • Revision    — e.g. "Revised 12/25", "Revised 6/24"
  • Page number — e.g. "Page 1 of 17"
Read the footer from ANY page and extract form_code and form_version into the header section.
If the footer is not legible, set both to null.`;

/**
 * Per-page extraction configuration for a single page of a form.
 * When defined, this page is extracted individually with custom prompts and
 * an optional model/provider override. Pages without a PageDefinition use
 * the form-level fallback prompt and the extractor's default model.
 */
export type FormCriticality = 'critical' | 'routine';

export interface PageDefinition {
  /** 1-indexed page number as printed on the form footer (e.g. 1, 2, 17). */
  pageNumber: number;
  /** Full system prompt with page-specific instructions and JSON schema. */
  systemPrompt: string;
  /** User-turn message for this page. */
  userPrompt: string;
  /** Model override for this page (e.g. 'gemini-3.1-flash-lite'). Falls back to extractor default. */
  model?: string;
  /** Provider override for this page (e.g. 'gemini'). Falls back to extractor default. */
  provider?: 'anthropic' | 'gemini';
}

export interface FormDefinition {
  /** CAR form code, uppercase. E.g. 'RPA', 'TDS', 'COUNTER'. */
  formCode: string;
  /** Human-readable form name. */
  formName: string;
  /**
   * Form variant within the same form code.
   * 'standard' for the base form; other values for addenda or special editions.
   * E.g. 'standard' | 'counter' | 'cash' | 'condo'
   */
  variant: string;
  /**
   * CAR revision date in the format printed on the form itself: v<MM>-<YY>
   * E.g. 'v12-23' = Revised 12/23, 'v06-24' = Revised 6/24
   */
  version: string;
  /** Full system prompt including form-specific instructions and JSON schema. */
  systemPrompt: string;
  /** User-turn message sent alongside the PDF pages. */
  userPrompt: string;
  /**
   * Per-page extraction overrides. Pages with an entry here are extracted
   * individually with page-specific prompts and optional model/provider.
   * Pages without an entry use the form-level fallback prompt + default model.
   */
  pageDefinitions?: PageDefinition[];
  /**
   * Form criticality level for validation purposes.
   * 'critical' → material changes trigger void/reupload suggestion
   * 'routine' → changes tracked but no automatic void suggestion
   * Default: 'critical' for main transaction forms, 'routine' for informational
   */
  criticality?: FormCriticality;
}
