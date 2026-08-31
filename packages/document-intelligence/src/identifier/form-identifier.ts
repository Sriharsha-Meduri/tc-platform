import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from '@google/generative-ai';
import { estimateLlmCostUsd } from '../llm-cost';
import type { PageClassification, PageClassificationSource, FormGroup } from './identifier.types';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Deterministic text-based identification ──────────────────────────────────
//
// Reads a page's own embedded PDF text and identifies it from its own
// header/title/footer — never from references to other forms in the body.
// Gemini is only used as a fallback when the page has no usable embedded
// text (e.g. a scanned image) or matches none of these four forms.
//
// Priority (highest first):
//   1. Exact document title, with or without a trailing page-count footer
//      (e.g. "CALIFORNIA RESIDENTIAL PURCHASE AGREEMENT AND JOINT ESCROW
//      INSTRUCTIONS (RPA PAGE 5 OF 17)").
//   2. C.A.R. header identifier ("(C.A.R. Form RPA, Revised 6/26)").
//   3. Short form-code revision footer ("RPA REVISED 6/26 (PAGE 5 OF 17)").
//   4. Otherwise UNKNOWN — falls through to the Gemini fallback.

interface DeterministicFormPattern {
  code: string;
  formName: string;
  /** Bare descriptive title, e.g. "CALIFORNIA RESIDENTIAL PURCHASE AGREEMENT". */
  titleRegex: RegExp;
  /** Full title immediately followed by "(<CODE> PAGE N OF M)". Captures (pageNumber, totalPages). */
  titleFooterRegex: RegExp;
  /** Short form-code revision footer: "<CODE> REVISED M/YY (PAGE N OF M)". Captures (revision, pageNumber, totalPages). */
  revisionFooterRegex: RegExp;
}

const DETERMINISTIC_FORM_PATTERNS: DeterministicFormPattern[] = [
  {
    code: 'RPA',
    formName: 'California Residential Purchase Agreement and Joint Escrow Instructions',
    titleRegex: /CALIFORNIA\s+RESIDENTIAL\s+PURCHASE\s+AGREEMENT(?:\s+AND\s+JOINT\s+ESCROW\s+INSTRUCTIONS)?/i,
    titleFooterRegex:
      /CALIFORNIA\s+RESIDENTIAL\s+PURCHASE\s+AGREEMENT\s+AND\s+JOINT\s+ESCROW\s+INSTRUCTIONS\s*\(\s*RPA\s+PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
    revisionFooterRegex: /\bRPA\s+REVISED\s+(\d{1,2}\/\d{2})\s*\(\s*PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
  },
  {
    code: 'SMCO',
    formName: 'Seller Multiple Counter Offer',
    // Checked before SCO/BCO since "SELLER MULTIPLE COUNTER OFFER" would not
    // match the plain SCO regex anyway (MULTIPLE breaks the SELLER..COUNTER
    // adjacency), but keeping SMCO first avoids ever relying on that.
    titleRegex: /SELLER\s+MULTIPLE\s+COUNTER\s+OFFER/i,
    titleFooterRegex: /SELLER\s+MULTIPLE\s+COUNTER\s+OFFER\s*\(\s*SMCO\s+PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
    revisionFooterRegex: /\bSMCO\s+REVISED\s+(\d{1,2}\/\d{2})\s*\(\s*PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
  },
  {
    code: 'SCO',
    formName: 'Seller Counter Offer',
    titleRegex: /SELLER\s+COUNTER\s+OFFER/i,
    titleFooterRegex: /SELLER\s+COUNTER\s+OFFER\s*\(\s*SCO\s+PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
    revisionFooterRegex: /\bSCO\s+REVISED\s+(\d{1,2}\/\d{2})\s*\(\s*PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
  },
  {
    code: 'BCO',
    formName: 'Buyer Counter Offer',
    titleRegex: /BUYER\s+COUNTER\s+OFFER/i,
    titleFooterRegex: /BUYER\s+COUNTER\s+OFFER\s*\(\s*BCO\s+PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
    revisionFooterRegex: /\bBCO\s+REVISED\s+(\d{1,2}\/\d{2})\s*\(\s*PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
  },
  {
    code: 'AVID',
    formName: 'Agent Visual Inspection Disclosure',
    titleRegex: /AGENT\s+VISUAL\s+INSPECTION\s+DISCLOSURE/i,
    titleFooterRegex: /AGENT\s+VISUAL\s+INSPECTION\s+DISCLOSURE\s*\(\s*AVID\s+PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
    // The revision (M/YY) is captured generically, never hardcoded to any one
    // value — see AVID_KNOWN_REVISION below for why. A future AVID revision
    // (e.g. 6/26) still matches this same pattern unchanged.
    revisionFooterRegex: /\bAVID\s+REVISED\s+(\d{1,2}\/\d{2})\s*\(\s*PAGE\s+(\d+)\s+OF\s+(\d+)\s*\)/i,
  },
];

/**
 * The AVID revision printed on the reference fixture used to build the
 * patterns above ("C.A.R. Form AVID, Revised 6/24"). This is a named
 * constant purely so the value isn't repeated as a magic string anywhere it
 * needs to be referenced (e.g. tests) — it is NEVER used inside
 * revisionFooterRegex or matchHeader's revision capture, both of which match
 * ANY `M/YY` revision. A future AVID revision (6/26, 6/28, ...) is
 * identified exactly the same way without any code change here.
 */
export const AVID_KNOWN_REVISION = '6/24';

function normalizeRevision(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\s*\/\s*(\d{2})/);
  if (!match) return null;
  return `${Number(match[1])}/${match[2]}`;
}

export interface DeterministicMatch {
  formCode: string;
  formName: string;
  formRevision: string | null;
  pageNumber: number | null;
  totalPages: number | null;
  confidence: number;
  source: PageClassificationSource;
  evidence: string[];
}

/**
 * Try to match ONE form's own patterns against a page's text, in priority
 * order: (1) exact title, with or without its own page-count footer, (2)
 * C.A.R. header identifier, (3) short form-code revision footer.
 */
/** Tier 1 (strongest): full title immediately followed by "(<CODE> PAGE N OF M)". */
function matchTitleFooter(text: string, pat: DeterministicFormPattern): DeterministicMatch | null {
  const m = text.match(pat.titleFooterRegex);
  if (!m) return null;
  return {
    formCode: pat.code,
    formName: pat.formName,
    formRevision: null,
    pageNumber: Number(m[1]),
    totalPages: Number(m[2]),
    confidence: 0.99,
    source: 'title_footer',
    evidence: [m[0]],
  };
}

/** Tier 2: short form-code revision footer, "<CODE> REVISED M/YY (PAGE N OF M)". */
function matchRevisionFooter(text: string, pat: DeterministicFormPattern): DeterministicMatch | null {
  const m = text.match(pat.revisionFooterRegex);
  if (!m) return null;
  return {
    formCode: pat.code,
    formName: pat.formName,
    formRevision: normalizeRevision(m[1]),
    pageNumber: Number(m[2]),
    totalPages: Number(m[3]),
    confidence: 0.97,
    source: 'revision_footer',
    evidence: [m[0]],
  };
}

/** Tier 3: C.A.R. header identifier, "(C.A.R. Form XXX, Revised M/YY)". */
function matchHeader(text: string, pat: DeterministicFormPattern): DeterministicMatch | null {
  const headerRe = new RegExp(`\\bC\\.?\\s*A\\.?\\s*R\\.?\\s+Form\\s+${pat.code}\\s*,?\\s*Revised\\s+(\\d{1,2}\\/\\d{2})`, 'i');
  const m = text.match(headerRe);
  if (!m) return null;
  return {
    formCode: pat.code,
    formName: pat.formName,
    formRevision: normalizeRevision(m[1]),
    pageNumber: null,
    totalPages: null,
    confidence: 0.9,
    source: 'header',
    evidence: [m[0]],
  };
}

/**
 * Immediately preceding a bare-title match, these words mean the title is
 * being CITED as a separate, attached, or already-provided document — e.g. a
 * TDS's own "Agent's Inspection Disclosure" section literally contains the
 * checkbox line "See attached Agent Visual Inspection Disclosure (AVID
 * Form)", which satisfies AVID's full bare title even though the page is a
 * TDS, not an AVID. A genuine form's own title is never preceded by this
 * kind of reference phrasing on its own title page.
 */
const REFERENCE_CONTEXT_RE = /\b(?:see|attach(?:ed|ment)?|copy\s+of|receipt\s+of|review|refer(?:red)?\s+to|pursuant\s+to)\s*(?:the\s+|a\s+|any\s+)?$/i;

/**
 * Tier 4 (weakest): bare descriptive title, unanchored anywhere in the page's
 * text. Deliberately checked last across ALL patterns (see
 * classifyFromPrintedText) — this is the only tier with no page-count or
 * form-code anchor, so it's the one tier a body reference to a DIFFERENT
 * form can accidentally satisfy. Rejected outright when immediately preceded
 * by reference/attachment phrasing (see REFERENCE_CONTEXT_RE) — a real title
 * is never introduced that way.
 */
function matchBareTitle(text: string, pat: DeterministicFormPattern): DeterministicMatch | null {
  const m = text.match(pat.titleRegex);
  if (!m || m.index === undefined) return null;
  const precedingText = text.slice(Math.max(0, m.index - 40), m.index);
  if (REFERENCE_CONTEXT_RE.test(precedingText)) return null;
  return {
    formCode: pat.code,
    formName: pat.formName,
    formRevision: null,
    pageNumber: null,
    totalPages: null,
    confidence: 0.95,
    source: 'title',
    evidence: [m[0]],
  };
}

/** All four tiers for ONE pattern, strongest first — used for RPA and AVID, each checked in isolation before any other pattern (see classifyFromPrintedText). */
function matchPattern(text: string, pat: DeterministicFormPattern): DeterministicMatch | null {
  return matchTitleFooter(text, pat) ?? matchRevisionFooter(text, pat) ?? matchHeader(text, pat) ?? matchBareTitle(text, pat);
}

/**
 * Parse a page's own extracted printed text into a deterministic match,
 * without any LLM call. Returns null when none of the five tracked forms
 * (RPA, SCO, SMCO, BCO, AVID) can be identified from this page's own
 * header/title/footer — the caller should fall back to Gemini in that case.
 *
 * The page's own title/header/footer is authoritative. A form merely
 * referenced in body text (e.g. an RPA page's Other Terms section
 * mentioning "Buyer Counter Offer (C.A.R. Form BCO)") never changes the
 * page's identity.
 *
 * RPA is always checked first, across all of ITS OWN tiers, before any
 * counter-offer form is considered at all. This directly implements the
 * rule that the full "RESIDENTIAL PURCHASE AGREEMENT" document title/footer
 * takes precedence over any BCO/SCO/SMCO reference appearing in the body —
 * even when that body reference is itself phrased like a title, header, or
 * revision-footer citation (e.g. "Buyer Counter Offer (C.A.R. Form BCO,
 * Revised 6/26)" inside an RPA's acceptance paragraph). A real counter-offer
 * page never itself contains RPA's own title/header/footer text, so this
 * ordering never misclassifies a genuine SCO/SMCO/BCO page as RPA.
 *
 * Among the counter-offer forms (SCO/SMCO/BCO), every pattern is checked
 * TIER-FIRST rather than pattern-first: every pattern's title_footer is
 * tried before any pattern's revision_footer, then every header, then only
 * finally every bare title. This matters because SCO/SMCO/BCO share
 * boilerplate that references the others by name — e.g. a genuine BCO's own
 * "ACCEPTANCE" paragraph reads "...SUBJECT TO THE ATTACHED SELLER COUNTER
 * OFFER No. OR SELLER MULTIPLE COUNTER OFFER No. ...", which satisfies
 * SMCO's bare (unanchored) title tier. Checking pattern-first would let that
 * weak match win before BCO's own much stronger footer
 * ("BUYER COUNTER OFFER (BCO PAGE 1 OF 1)") is ever tried. Tier-first
 * ordering guarantees a page's own strong, anchored match always beats
 * another form's weak body-text reference.
 */
export function classifyFromPrintedText(text: string): DeterministicMatch | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const rpaPattern = DETERMINISTIC_FORM_PATTERNS.find((p) => p.code === 'RPA')!;
  const rpaMatch = matchPattern(normalized, rpaPattern);
  if (rpaMatch) return rpaMatch;

  // AVID is its own, unrelated form family (a 3-page disclosure, never a
  // purchase agreement or counter offer) — checked right after RPA, using
  // all of its own tiers, so it can never be misclassified as RPA (RPA's
  // strong patterns are tried first and win on any real RPA page) or lumped
  // into the counter-offer family's grouping/smoothing logic below.
  const avidPattern = DETERMINISTIC_FORM_PATTERNS.find((p) => p.code === 'AVID')!;
  const avidMatch = matchPattern(normalized, avidPattern);
  if (avidMatch) return avidMatch;

  const counterOfferPatterns = DETERMINISTIC_FORM_PATTERNS.filter((p) => p.code !== 'RPA' && p.code !== 'AVID');
  const tierMatchers = [matchTitleFooter, matchRevisionFooter, matchHeader, matchBareTitle];
  for (const matchTier of tierMatchers) {
    for (const pat of counterOfferPatterns) {
      const match = matchTier(normalized, pat);
      if (match) return match;
    }
  }

  // UNKNOWN — caller falls back to Gemini.
  return null;
}

/**
 * Deterministically identify a PDF's own form from its page 1 printed text
 * alone — no LLM call, no per-page splitting. Used by callers that only need
 * a fast yes/no routing signal (e.g. "is this PDF RPA-family before trusting
 * an RPA-only fast path?") rather than a full page-by-page classification.
 * Returns null when pdfjs is unavailable, page 1 has no extractable text
 * layer, or the page matches none of the tracked forms — callers should
 * treat null as "inconclusive," not as "definitely not a match."
 */
export async function identifyPdfFirstPage(buffer: Buffer): Promise<DeterministicMatch | null> {
  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    return null;
  }
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    try {
      const page = await doc.getPage(1);
      const content = await page.getTextContent();
      const text = (content.items as Array<{ str?: string }>)
        .map((item) => item.str ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      return classifyFromPrintedText(text);
    } finally {
      await doc.destroy().catch(() => {});
    }
  } catch {
    return null;
  }
}

// ── Gemini fallback (used only when embedded text is unusable, or the page
//    matches none of RPA/SCO/SMCO/BCO/AVID — e.g. a different disclosure or
//    addendum form) ──────────────────────────────────────────────────────

const ROUTER_SYSTEM = `You are a California real estate document page classifier.
You receive a single page from a scanned or digital C.A.R. (California Association of REALTORS) transaction document.

Your job:
1. Identify the C.A.R. form code printed on this page.
   Look at the header, footer, title block, and any form identifiers in parentheses like "(C.A.R. Form XXX, Revised ...)".
   That parenthetical notation IS the authoritative form identifier.

2. Return ONLY valid JSON — no markdown, no explanation:
{
  "form_codes": ["RPA"],
  "page_number": 1,
  "total_pages": null,
  "confidence": 0.95
}

CRITICAL RULES:
- form_codes must be an array. Include multiple codes only if the page genuinely contains content from more than one form.
- Only return a form code if its identifier is actually PRINTED on the page. Do NOT infer codes from text referencing other forms.
- If no CAR form code is identifiable, use ["UNKNOWN"].
- page_number and total_pages: null if not visible.
- confidence: 0–1 float reflecting your certainty.

FORM CATEGORIES AND THEIR RECOGNITION PATTERNS:

--- Purchase Agreements (look for "PURCHASE AGREEMENT" in title) ---
RPA  – Residential Purchase Agreement (most common)
MH-PA – Manufactured Home Purchase Agreement
NCPA  – New Construction Purchase Agreement
NIPA  – New Construction Purchase Agreement (alternate)
CPA   – Commercial Property Purchase Agreement
RIPA  – Residential Income Property Purchase Agreement
VLPA  – Vacant Land Purchase Agreement

--- Counter Offers (look for "COUNTER OFFER" in title) ---
SCO  – Seller Counter Offer
BCO  – Buyer Counter Offer
SMCO – Seller Multiple Counter Offer
BMCO – Buyer Multiple Counter Offer Selection

--- Listing Agreements (look for "LISTING AGREEMENT" or "AUTHORIZATION" in title) ---
RLA   – Residential Listing Agreement
RLAA  – Residential Listing Agreement (Agency)
RLAS  – Residential Listing Agreement (Seller Reserved)
RLBO  – Residential Listing Agreement (Open)
RIPA-LA – Residential Income Property Listing Agreement
CLAL  – Commercial Listing Agreement
LLAL  – Land Listing Agreement

--- Agency & Representation ---
AD    – Disclosure Regarding Real Estate Agency Relationships
BRBC  – Buyer Representation and Broker Compensation
BRBB  – Buyer Representation and Broker Compensation — Bilateral
BRBCAA – Buyer Representation and Broker Compensation — Addendum
AC    – Confirmation of Real Estate Agency Relationships
PRBS  – Possible Representation of More Than One Buyer or Seller

--- Disclosures (Required) ---
TDS  – Real Estate Transfer Disclosure Statement
SPQ  – Seller Property Questionnaire
SPQR – Supplemental Seller Property Questionnaire
NHD  – Natural Hazard Disclosure Statement
LPD  – Lead-Based Paint Hazards Disclosure

--- Disclosures (Advisory) ---
SBSA – Statewide Buyer and Seller Advisory
BIA  – Buyer's Investigation Advisory
BHIA – Buyer Homeowners' Insurance Advisory
AVID – Agent Visual Inspection Disclosure
FHDA – Fair Housing and Discrimination Advisory
MEA  – Market Conditions Advisory (also MCA)
WFA  – Wire Fraud and Electronic Funds Transfer Advisory
FHDS – Fire Hardening & Defensible Space Disclosure
HAA  – Home Affordability Advisory
PVOH – Property Visit and Open House Advisory
SEA  – Solar Energy Advisory
RSPA – Residential Square Footage Advisory
AEA  – Agent Environmental Advisory
CDA  – Commercial Disclosure Advisory
WHSD – Residential Earthquake Hazards Report
MELLO – Mello-Roos and Special Assessment Disclosure
WPA  – Water-Saving Plumbing Retrofit Disclosure

--- Disclosures (Conditional) ---
FIRPTA – FIRPTA Disclosure
CCPA – California Consumer Privacy Act Advisory
DEDA – Designated Electronic Delivery Address Amendment
ABA  – Additional Broker Acknowledgement
SH   – Short Sale Addendum

--- HOA & Property ---
HOA  – Homeowners Association Information
BHAA – Buyer's Homeowners Association Advisory
HWA  – Home Warranty Addendum
SOLAR-A – Solar Panels and Systems Addendum

--- Inspections ---
AVID LA – Agent Visual Inspection Disclosure (Listing Agent version)
AVID SA – Agent Visual Inspection Disclosure (Seller Agent version)
PEAD – Pest Control Disclosure and Addendum
WCI  – Wood Destroying Pest Inspection

--- Contingency & Performance ---
CR-B – Contingency Removal (Buyer)
CR-S – Contingency Removal (Seller)
NBP  – Notice to Buyer to Perform
NSP  – Notice to Seller to Perform
RR   – Request for Repair
RRRR – Seller's Response to Buyer's Request for Repair
CC   – Cancellation of Contract, Release of Deposit
DCE  – Demand to Close Escrow
VP   – Verification of Property Condition

--- Financing ---
FHA-VA – FHA/VA and Conventional Financing Advisory
FVA    – FHA/VA Financing Addendum
PREQUAL – Lender Prequalification Letter
LQ      – Lender Pre-Qualification Letter Request
POF     – Buyer Proof of Funds
PAA     – Pre-Approval Letter Addendum
ABI     – Authorization for Bridge Loan / Interim Financing

--- Addenda ---
AADDM – General Addendum
IDA   – Increased Deposit Addendum
IBA   – Interim Occupancy Addendum
RID   – Residential Interim Occupancy Agreement
RLEO  – Residential Lease After Sale (Seller Leaseback)
REOA  – REO Addendum
PA    – Probate Purchase Addendum
FRR-PA – Federal Reporting Requirement Purchase Addendum
LR    – California Residential Lease or Month-to-Month Rental Agreement

--- Closing & Escrow ---
PEAD – Performance of Escrow (Pest Control)
IA   – Income and Expense Analysis
PED  – Parent/Guardian Authorization for Minor Signatory

--- Special Forms (RPA-specific footers) ---
RPA-CA – Alternate designation for RPA (CA suffix variant)
RSPA   – Residential Square Footage Advisory (may appear as RPA addendum footer)

TITLE BLOCK RECOGNITION:
- "RESIDENTIAL PURCHASE AGREEMENT" at the top → RPA
- "SELLER COUNTER OFFER" → SCO
- "BUYER COUNTER OFFER" → BCO
- "DISCLOSURE REGARDING REAL ESTATE AGENCY" → AD
- "TRANSFER DISCLOSURE STATEMENT" → TDS
- "SELLER PROPERTY QUESTIONNAIRE" → SPQ
- "NATURAL HAZARD DISCLOSURE" → NHD

FOOTER RECOGNITION:
- Look for "(C.A.R. Form XXX, Revised MM/YY)" where XXX is the form code
- Forms often have their code printed in the footer on every page
- Multi-page forms: page 1 has the title, subsequent pages have the footer code

RPA VS. COUNTER OFFER (SCO/BCO/SMCO/BMCO) — CRITICAL DISAMBIGUATION:
These forms are frequently confused because both discuss purchase terms,
buyers, and sellers. Use these structural fingerprints, not just keywords:

- RPA is a LONG form: 17 pages. Its footer reads "RPA PAGE <N> OF 17" (or
  similar — the total is always in the mid-to-high teens, never 1 or 2). It
  contains numbered Sections 1 through 33 (Offer, Agency, Financing,
  Contingencies, Allocation of Costs, Time Periods, Title, Broker
  Compensation, Definitions, Offer/Acceptance, etc.), Buyer/Seller initials
  lines in the footer of most pages, and full signature blocks in Sections
  32-33 near the end.
- SCO/BCO/SMCO/BMCO are SHORT forms: normally only 1-2 pages total. Their
  footer reads "<CODE> PAGE <N> OF 1" or "OF 2" — never a large total. They
  contain a short list of numbered paragraph amendments to an existing
  offer/RPA, a brief acceptance/counter-terms block, and a single signature
  line or two — never the full 33-section RPA structure.

- The total_pages value you report for THIS page must reflect what is
  actually printed in this page's own footer/page-count notation. If the
  footer says "PAGE 4 OF 17", total_pages = 17 — do not report 1 or 2 just
  because the page discusses a counter offer.
- The form code for THIS page is whatever code is printed in THIS page's own
  footer/title block. A page's own footer overrides any code merely
  mentioned, discussed, or referenced in the page's body text.
- An RPA page that discusses, references, negotiates, or attaches a "Buyer
  Counter Offer" in its body text (e.g. in the Other Terms section) is still
  an RPA page — do NOT classify it as BCO unless THIS SPECIFIC page's own
  footer/title actually says "BUYER COUNTER OFFER" / "BCO".
- Conversely, a genuine BCO/SCO page does not contain Sections 1-33 — do not
  classify a page as RPA just because it mentions the underlying purchase
  agreement by name.

DISCLOSURE/ADVISORY FORM RECOGNITION:
- These are typically 1-3 page forms with a bold title and advisory text
- Look for "ADVISORY" in the title for advisory forms
- Look for "DISCLOSURE" in the title for disclosure forms
- The form code appears in the footer/title block, NOT in the body text`;

const ROUTER_USER = 'Classify this page and return JSON only.';

export interface FormIdentifierConfig {
  apiKey: string;
  model?: string;
  concurrency?: number;
  temperature?: number;
  /**
   * Test seam: replaces the Gemini visual fallback. When set, no API call is
   * made for pages whose deterministic text parsing fails to identify one
   * of RPA/SCO/SMCO/BCO/AVID.
   */
  classifyFallback?: (buffer: Buffer, pageIndex: number) => Promise<PageClassification>;
}

export class FormIdentifier {
  private readonly model: ReturnType<InstanceType<typeof GoogleGenerativeAI>['getGenerativeModel']>;
  private readonly concurrency: number;
  private readonly temperature: number;
  private readonly classifyFallback?: (buffer: Buffer, pageIndex: number) => Promise<PageClassification>;
  private pdfjs: any = null;

  constructor(config: FormIdentifierConfig) {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = genAI.getGenerativeModel({
      model: config.model ?? 'gemini-3.1-flash-lite',
      systemInstruction: ROUTER_SYSTEM,
    });
    this.concurrency = config.concurrency ?? 10;
    this.temperature = config.temperature ?? 0;
    this.classifyFallback = config.classifyFallback;
  }

  // ── Per-page embedded text layer extraction (pdfjs), no LLM ────────────────
  private async getPdfjs(): Promise<any> {
    if (this.pdfjs) return this.pdfjs;
    try {
      this.pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      return this.pdfjs;
    } catch {
      console.warn('[Identifier] pdfjs-dist not available — deterministic text identification disabled; falling back to Gemini');
      return null;
    }
  }

  private async extractPageText(pageBuffer: Buffer): Promise<string | null> {
    const pdfjs = await this.getPdfjs();
    if (!pdfjs) return null;
    try {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(pageBuffer) }).promise;
      try {
        const page = await doc.getPage(1);
        const content = await page.getTextContent();
        return (content.items as Array<{ str?: string }>)
          .map((i) => i.str ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      } finally {
        await doc.destroy().catch(() => {});
      }
    } catch (err) {
      console.warn(`[Identifier] extractPageText FAILED: ${(err as Error)?.message ?? err}`);
      return null;
    }
  }

  async classifyPages(
    pageBuffers: Buffer[],
    onProgress?: (classified: number, total: number) => void,
  ): Promise<PageClassification[]> {
    const t0 = Date.now();
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let geminiPages = 0;
    console.log(`[Identifier] Classifying ${pageBuffers.length} pages (concurrency=${this.concurrency})`);
    const results: PageClassification[] = new Array(pageBuffers.length);
    const queue = pageBuffers.map((buf, idx) => ({ buf, idx }));
    let classified = 0;

    while (queue.length > 0) {
      const batch = queue.splice(0, this.concurrency);
      await Promise.all(
        batch.map(async ({ buf, idx }) => {
          const { result, promptTokens, completionTokens, geminiCalled } = await this.classifyOnePageWithTokens(buf, idx);
          results[idx] = result;
          totalPromptTokens += promptTokens;
          totalCompletionTokens += completionTokens;
          if (geminiCalled) geminiPages++;
          classified++;
          const r = results[idx];
          const pninfo = r.pageNumber != null ? `page ${r.pageNumber}/${r.totalPages ?? '?'}` : 'unnumbered';
          console.log(`[Identifier] Page ${idx} → ${r.formCodes.join(',')} ${pninfo} (${r.source ?? 'gemini'}, confidence=${r.confidence})`);
          onProgress?.(classified, pageBuffers.length);
        }),
      );
    }

    const geminiFraction = geminiPages > 0 ? ` (${geminiPages} via Gemini)` : '';
    console.log(`[Identifier] Token usage: input=${totalPromptTokens} output=${totalCompletionTokens} total=${totalPromptTokens + totalCompletionTokens} cost=$${(estimateLlmCostUsd(this.model.model as string, totalPromptTokens, totalCompletionTokens) ?? 0).toFixed(6)}${geminiFraction}`);
    console.log(`[Identifier] All ${pageBuffers.length} pages classified in ${Date.now() - t0}ms`);
    return results;
  }

  groupByFormCode(classifications: PageClassification[]): FormGroup[] {
    const COUNTER_OFFER_FAMILY = new Set(['SCO', 'SMCO', 'BCO', 'BMCO']);

    // Normalize common variant codes to their canonical form
    const normalize = (code: string): string => {
      const upper = code.toUpperCase().trim();
      // RPA-CA → RPA
      if (upper === 'RPA-CA') return 'RPA';
      // AVID LA / AVID SA → AVID (same form, different agent role)
      if (upper === 'AVID LA' || upper === 'AVID SA') return 'AVID';
      return upper;
    };

    // ── Smoothing pass ──────────────────────────────────────────────────
    // The per-page router is a small, cheap model and occasionally
    // misreads a page of a long multi-page form (e.g. RPA, 17 pages) as a
    // short counter-offer form (BCO/SCO/SMCO/BMCO, normally 1-2 pages).
    // Because groupByFormCode used to trust formCodes[0] in isolation, a
    // single bad page could hijack part (or, if the whole document reads
    // the same way, all) of a real RPA into a bogus BCO group — which then
    // skips RPA-specific extraction and validation entirely and runs the
    // generic counter-offer template instead, producing nonsense blockers.
    //
    // Deterministically-sourced pages (title/header/footer read directly
    // from the page's own printed text) are authoritative and are NEVER
    // candidates for reassignment here — only Gemini/unknown-sourced pages
    // can be smoothed, since only those are genuinely uncertain.
    const sources = classifications.map((c) => c.source ?? 'gemini');
    const smoothedCodes = this.smoothCounterOfferMisreads(
      classifications.map((c) => normalize(c.formCodes[0] ?? 'UNKNOWN')),
      classifications.map((c) => c.totalPages),
      sources,
      COUNTER_OFFER_FAMILY,
    );

    // Group by a normalized key so all counter-offer family pages land in the
    // same bucket (preventing a single PDF from being split across 'SCO' and
    // 'BCO' groups when the LLM hallucinates different codes per page).
    // Track original codes so we can vote on the final formCode.
    const groupMap = new Map<string, { pages: number[]; codes: string[] }>();

    classifications.forEach((c, i) => {
      const primaryCode = smoothedCodes[i];
      const groupKey = COUNTER_OFFER_FAMILY.has(primaryCode) ? 'COUNTER_OFFER' : primaryCode;
      let entry = groupMap.get(groupKey);
      if (!entry) {
        entry = { pages: [], codes: [] };
        groupMap.set(groupKey, entry);
      }
      entry.pages.push(c.pageIndex);
      entry.codes.push(primaryCode);
    });

    const groups: FormGroup[] = [];
    for (const [groupKey, entry] of groupMap.entries()) {
      let formCode: string;
      if (groupKey === 'COUNTER_OFFER') {
        // Vote: use the most common original counter-offer code among this
        // group's pages. On a tie the first-encountered code (lowest page
        // index) wins, which is generally the most reliable.
        const counts = new Map<string, number>();
        for (const code of entry.codes) {
          counts.set(code, (counts.get(code) ?? 0) + 1);
        }
        let maxCount = 0;
        formCode = 'SCO'; // safe fallback
        for (const [code, count] of counts) {
          if (count > maxCount) {
            maxCount = count;
            formCode = code;
          }
        }
      } else {
        formCode = groupKey;
      }

      groups.push({
        formCode,
        pageIndices: entry.pages.sort((a, b) => a - b),
      });
    }

    return groups.sort((a, b) => (a.pageIndices[0] ?? 0) - (b.pageIndices[0] ?? 0));
  }

  /**
   * Correct isolated, implausible counter-offer-family classifications
   * inside an otherwise-consistent run of pages.
   *
   * `codes`, `totalPages`, and `sources` are parallel arrays in physical
   * page order (index i = page i). Returns a new array of (possibly
   * corrected) codes. Only entries whose source is 'gemini' or 'unknown'
   * are ever candidates for reassignment — a page identified from its own
   * printed title/header/footer is authoritative and is never rewritten.
   *
   * A run of counter-offer-family pages (BCO/SCO/SMCO/BMCO) is reassigned
   * to a neighboring code when:
   *   (a) it is short (<= 2 pages), AND
   *   (b) every page in the run is Gemini/unknown-sourced, AND
   *   (c) either — the runs immediately before and after it agree on the
   *       same (non-counter-offer-family) code and that shared run is much
   *       longer (>= 5 pages) than the interruption; OR — at least one page
   *       in the run reports totalPages >= 8, which is structurally
   *       impossible for a real 1-2 page counter-offer form, in which case
   *       it is reassigned to whichever adjacent run is long enough (>= 5
   *       pages) to plausibly be that longer document.
   *
   * A real, standalone counter-offer document (all its pages agree, no
   * long neighboring run, totalPages consistently 1-2) is left untouched.
   */
  private smoothCounterOfferMisreads(
    codes: string[],
    totalPages: Array<number | null>,
    sources: PageClassificationSource[],
    counterOfferFamily: Set<string>,
  ): string[] {
    const MIN_LONG_RUN = 5;
    const MAX_INTERRUPTION = 2;
    const IMPLAUSIBLE_TOTAL_PAGES = 8;

    const corrected = [...codes];

    interface Run { code: string; start: number; end: number }
    const runs: Run[] = [];
    for (let i = 0; i < codes.length; i++) {
      const last = runs[runs.length - 1];
      if (last && last.code === codes[i]) {
        last.end = i;
      } else {
        runs.push({ code: codes[i], start: i, end: i });
      }
    }

    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const runLength = run.end - run.start + 1;
      if (runLength > MAX_INTERRUPTION) continue;
      if (!counterOfferFamily.has(run.code)) continue;

      // Authoritative (deterministically-sourced) pages are never smoothed.
      const allSuspect = sources
        .slice(run.start, run.end + 1)
        .every((s) => s === 'gemini' || s === 'unknown');
      if (!allSuspect) continue;

      const prev = runs[r - 1];
      const next = runs[r + 1];
      const prevLength = prev ? prev.end - prev.start + 1 : 0;
      const nextLength = next ? next.end - next.start + 1 : 0;

      let replacementCode: string | null = null;

      if (prev && next && prev.code === next.code && prevLength >= MIN_LONG_RUN) {
        // Sandwiched between two agreeing, much-longer runs of the same code.
        replacementCode = prev.code;
      } else {
        const reportsImplausibleTotalPages = totalPages
          .slice(run.start, run.end + 1)
          .some((t) => t != null && t >= IMPLAUSIBLE_TOTAL_PAGES);
        if (reportsImplausibleTotalPages) {
          if (prev && prevLength >= MIN_LONG_RUN) replacementCode = prev.code;
          else if (next && nextLength >= MIN_LONG_RUN) replacementCode = next.code;
        }
      }

      if (replacementCode) {
        for (let i = run.start; i <= run.end; i++) corrected[i] = replacementCode;
      }
    }

    return corrected;
  }

  private async classifyOnePageWithTokens(
    pageBuffer: Buffer,
    pageIndex: number,
  ): Promise<{ result: PageClassification; promptTokens: number; completionTokens: number; geminiCalled: boolean }> {
    // Deterministic printed-text path first — no LLM call at all when the
    // page's own title/header/footer identifies it as RPA/SCO/SMCO/BCO/AVID.
    const text = await this.extractPageText(pageBuffer);
    if (text) {
      const det = classifyFromPrintedText(text);
      if (det) {
        console.log(
          `[Identifier] Page ${pageIndex} → ${det.formCode} (${det.source}, conf=${det.confidence})` +
            (det.pageNumber != null ? ` page ${det.pageNumber}/${det.totalPages ?? '?'}` : ''),
        );
        return {
          result: {
            pageIndex,
            formCodes: [det.formCode],
            formName: det.formName,
            formRevision: det.formRevision,
            pageNumber: det.pageNumber,
            totalPages: det.totalPages,
            confidence: det.confidence,
            source: det.source,
            evidence: det.evidence,
          },
          promptTokens: 0,
          completionTokens: 0,
          geminiCalled: false,
        };
      }
    }

    // Gemini fallback — only reached when the page has no usable embedded
    // text, or its text matches none of RPA/SCO/SMCO/BCO/AVID (it may still
    // be a different, non-tracked C.A.R. form, which Gemini continues to handle).
    if (this.classifyFallback) {
      const result = await this.classifyFallback(pageBuffer, pageIndex);
      return { result, promptTokens: 0, completionTokens: 0, geminiCalled: false };
    }

    return this.classifyOnePageWithGemini(pageBuffer, pageIndex);
  }

  private async classifyOnePageWithGemini(
    pageBuffer: Buffer,
    pageIndex: number,
  ): Promise<{ result: PageClassification; promptTokens: number; completionTokens: number; geminiCalled: boolean }> {
    const t0 = Date.now();

    const thisModel = this.model;
    const temp = this.temperature;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await thisModel.generateContent(
          {
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: 'application/pdf',
                      data: pageBuffer.toString('base64'),
                    },
                  },
                  { text: ROUTER_USER },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 256, temperature: temp },
          },
          { timeout: 30000 },
        );

        const raw = response.response.text().trim();
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        let parsed: { form_codes: string[]; page_number: number | null; total_pages: number | null; confidence: number };
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          console.warn(`[Identifier] classifyOnePage pg=${pageIndex} JSON parse failed, raw: ${raw.slice(0, 200)}`);
          return {
            result: { pageIndex, formCodes: ['UNKNOWN'], pageNumber: null, totalPages: null, confidence: 0, source: 'unknown', evidence: [] },
            promptTokens: 0,
            completionTokens: 0,
            geminiCalled: true,
          };
        }

        const result: PageClassification = {
          pageIndex,
          formCodes: Array.isArray(parsed.form_codes) && parsed.form_codes.length > 0
            ? parsed.form_codes.map((c) => c.toUpperCase())
            : ['UNKNOWN'],
          pageNumber: parsed.page_number ?? null,
          totalPages: parsed.total_pages ?? null,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          source: 'gemini',
          evidence: [],
        };
        const usage = response.response.usageMetadata;
        const pt = usage?.promptTokenCount ?? 0;
        const ct = usage?.candidatesTokenCount ?? 0;
        console.log(`[Identifier] classifyOnePage pg=${pageIndex} → ${result.formCodes.join(',')} conf=${result.confidence} (${Date.now() - t0}ms, tokens ${pt}/${ct})`);
        return { result, promptTokens: pt, completionTokens: ct, geminiCalled: true };
      } catch (err) {
        const is429 = err instanceof GoogleGenerativeAIFetchError && err.status === 429;
        if (is429 && attempt < 3) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.warn(`[Identifier] classifyOnePage pg=${pageIndex} 429 rate limited — retry ${attempt}/3 in ${delay}ms`);
          await sleep(delay);
          continue;
        }
        const action = attempt === 3 ? 'gave up' : 'retrying';
        console.warn(`[Identifier] classifyOnePage pg=${pageIndex} FAILED (${action}): ${(err as Error)?.message ?? err} (${Date.now() - t0}ms)`);
      }
    }

    return {
      result: { pageIndex, formCodes: ['UNKNOWN'], pageNumber: null, totalPages: null, confidence: 0, source: 'unknown', evidence: [] },
      promptTokens: 0,
      completionTokens: 0,
      geminiCalled: true,
    };
  }
}
