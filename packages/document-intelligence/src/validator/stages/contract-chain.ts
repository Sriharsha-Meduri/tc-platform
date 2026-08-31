import type { ContractDocumentExtraction, ContractDocumentExtractedTerms } from '../../extractor/extractor.types';
import type { FormExtractionResult } from '../../pipeline/pipeline.types';

// ─── Form code normalization ────────────────────────────────────────────────────

/**
 * Set of known contract form codes for chain building.
 * Used for case-insensitive, prefix-tolerant matching so LLM identifier
 * variants (e.g. "BCO Revised 4/24") still match.
 */
const CONTRACT_FORM_PATTERNS: Record<string, string> = {
  RPA: 'RPA',
  SCO: 'SCO',
  SMCO: 'SMCO',
  BCO: 'BCO',
  BMCO: 'BMCO',
};

/**
 * Normalize an LLM-returned form code to a known contract type.
 *
 * Handles identifier edge cases:
 *   - Multi-form composites: "RPA+AD+ABA" → "RPA" (primary)
 *   - Variants: "BCO Revised 4/24" → "BCO"
 *   - Lowercase: "sco" → "SCO"
 *   - Exact known codes: "RPA" → "RPA"
 *
 * Returns null if the code doesn't match any known contract form.
 */
export function normalizeContractFormCode(raw: string): string | null {
  const upper = raw.toUpperCase();
  // Multi-form composite: use the first component
  const parts = upper.split(/[+\s]+/);
  for (const part of parts) {
    const known = CONTRACT_FORM_PATTERNS[part];
    if (known) return known;
  }
  // Check if any known code appears as a prefix or substring.
  // Sort descending by length so "SMCO" is checked before "SCO".
  for (const known of Object.keys(CONTRACT_FORM_PATTERNS).sort((a, b) => b.length - a.length)) {
    if (upper.includes(known)) return CONTRACT_FORM_PATTERNS[known];
  }
  return null;
}

/**
 * Check whether a raw form code string matches any contract type.
 */
export function isContractFormCode(raw: string): boolean {
  return normalizeContractFormCode(raw) !== null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NegotiationChainDocument {
  formCode: 'RPA' | 'SCO' | 'SMCO' | 'BCO' | 'BMCO';
  fileName: string;
  counterNumber: number;
  sequenceOrder: number;
  /** The form code this counter offer is responding to (e.g. 'RPA', 'SCO', 'BCO'). null when not available. */
  referencedFormCode: string | null;
  /** The counter offer number this document responds to. null when not available. */
  referencedCounterOfferNumber: string | null;
  isAccepted: boolean;
  acceptanceDate: string | null;
  /** True when this document cannot be linked into the negotiation chain by its reference data. */
  unlinked: boolean;
  extractedTerms: ContractDocumentExtractedTerms | null;
}

export interface NegotiationChainResult {
  documents: NegotiationChainDocument[];
  finalDocument: NegotiationChainDocument | null;
  finalDocumentType: string | null;
  finalDocumentFileName: string | null;
  warnings: string[];
}

// ─── Counter number detection ──────────────────────────────────────────────────

/**
 * Extract a counter number from a filename.
 *
 * Supported patterns:
 *   SCO1.pdf, SCO2.pdf           → 1, 2
 *   seller-counter-1.pdf         → 1
 *   buyer-counter-1.pdf          → 1
 *   SCO-1.pdf, BCO-2.pdf         → 1, 2
 *   seller_counter_1             → 1
 *   smco3.pdf                    → 3
 *   SCO.pdf, BCO.pdf             → 0 (implicit first)
 */
function detectCounterNumberFromFilename(fileName: string): number {
  const name = fileName.replace(/\.[^.]+$/, '').toLowerCase();

  // DocuSign/ZipForm filenames often have suffixes like "__1225 (1) (1)" 
  // appended after the counter number, so we search the whole string
  // rather than anchoring to the end.

  // Pattern 1: seller_counter_1 / buyer-counter-2 / sco_3 / bco-1
  // (number follows the form-code prefix anywhere in the string)
  const prefixMatch = name.match(
    /(?:sco|smco|bco|bmco|seller[-_\s]+counter|buyer[-_\s]+counter)[^\d]*?(\d+)/i
  );
  if (prefixMatch) return parseInt(prefixMatch[1], 10);

  // Pattern 2: counter-1 / counter_offer_2 (generic fallback)
  const genericMatch = name.match(/counter[-_\s]*offer?[-_\s]*(\d+)/i);
  if (genericMatch) return parseInt(genericMatch[1], 10);

  // No number found — implicit first counter
  return 0;
}

/**
 * Helper to extract a valid non-negative integer from an unknown value.
 */
function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

/**
 * Extract counter number from form data fields.
 *
 * Priority:
 *   1. offer_reference.counter_number (direct numeric field from LLM)
 *   2. counter_offer_number (top-level field from some SCO templates)
 *   3. offer_reference.referenced_counter_offer_number (string from older template)
 */
function detectCounterNumberFromFormData(formCode: string, outputData: Record<string, unknown>): number | null {
  const or = (outputData['offer_reference'] ?? {}) as Record<string, unknown>;
  // 1. offer_reference.counter_number (direct numeric field)
  const cn = parsePositiveInt(or['counter_number']);
  if (cn != null) return cn;
  // 2. Top-level counter_offer_number (from some SCO/BCO templates)
  const topCn = parsePositiveInt(outputData['counter_offer_number']);
  if (topCn != null) return topCn;
  // 3. offer_reference.referenced_counter_offer_number (string from older template)
  const rcn = parsePositiveInt(or['referenced_counter_offer_number']);
  if (rcn != null) return rcn;
  return null;
}

/**
 * Determine the counter number for a contract document by checking
 * form data first, then falling back to filename patterns.
 *
 * Returns 0 for RPA and unknown numbers — callers should use
 * sequence-based reassignment when all counter numbers are identical.
 */
export function detectCounterNumber(formCode: string, fileName: string, outputData: Record<string, unknown>): number {
  if (formCode === 'RPA') return 0;

  const fromData = detectCounterNumberFromFormData(formCode, outputData);
  if (fromData != null) return fromData;

  const fromFile = detectCounterNumberFromFilename(fileName);
  return fromFile > 0 ? fromFile : 0;
}

// ─── Acceptance check ──────────────────────────────────────────────────────────

function isScoFamily(formCode: string): boolean {
  return formCode === 'SCO' || formCode === 'SMCO';
}

function isBcoFamily(formCode: string): boolean {
  return formCode === 'BCO' || formCode === 'BMCO';
}

/**
 * Check whether a contract document is fully accepted by the required party.
 *
 * Rules:
 *   RPA   → seller must have signed (sellerSigned === true)
 *   SCO   → buyer must have signed (buyerSigned === true)
 *   SMCO  → buyer must have signed (buyerSigned === true)
 *   BCO   → seller must have signed (sellerSigned === true)
 */
function isDocumentAccepted(doc: ContractDocumentExtraction): boolean {
  const sig = doc.extractedTerms.signatures;

  switch (doc.documentType) {
    case 'RPA':
      return sig.sellerSigned === true;
    case 'SCO':
    case 'SMCO':
      return sig.buyerSigned === true;
    case 'BCO':
    case 'BMCO':
      return sig.sellerSigned === true;
    default:
      return false;
  }
}

// ─── Chain sorting ─────────────────────────────────────────────────────────────

/**
 * Form code hierarchy weight. Lower = earlier in the chain.
 *
 *   RPA = 0
 *   SCO/SMCO = 1 (seller counters buyer)
 *   BCO = 2 (buyer counters seller)
 *
 * After sorting, the chain alternates SCO → BCO → SCO → BCO...
 */
function hierarchyWeight(formCode: string): number {
  switch (formCode) {
    case 'RPA': return 0;
    case 'SCO':
    case 'SMCO': return 1;
    case 'BCO':
    case 'BMCO': return 2;
    default: return 99;
  }
}

/**
 * Sort contract documents into negotiation chain order.
 *
 * The chain alternates between seller and buyer counter offers:
 *   RPA → SCO/SMCO(1) → BCO(1) → SCO/SMCO(2) → BCO(2) → ...
 *
 * Sort key: [round, counterNumber, intraRoundOrder]
 *   RPA        → [0, 0, 0]
 *   SCO/SMCO N → [1, N, 0]  (seller counters — first in round N)
 *   BCO/BMCO N → [1, N, 1]  (buyer counters — second in round N)
 */
export function sortNegotiationChain(
  documents: ContractDocumentExtraction[],
  extractions: FormExtractionResult[] | null,
): NegotiationChainDocument[] {
  const mapped: NegotiationChainDocument[] = documents.map((doc) => {
    const ext = extractions?.find((e) => e.formCode === doc.documentType && e.output?.data);
    const outputData = ext?.output?.data ?? {};
    const counterNumber = detectCounterNumber(doc.documentType, doc.fileName, outputData);
    return {
      formCode: doc.documentType,
      fileName: doc.fileName,
      counterNumber,
      sequenceOrder: doc.sequenceOrder,
      referencedFormCode: doc.referencedFormCode,
      referencedCounterOfferNumber: doc.referencedCounterOfferNumber,
      isAccepted: isDocumentAccepted(doc),
      acceptanceDate: doc.extractedTerms.signatures.sellerSignedDate ?? doc.extractedTerms.signatures.buyerSignedDate ?? null,
      unlinked: false,
      extractedTerms: doc.extractedTerms,
    };
  });

  console.log(`[NegotiationChain] Building chain from ${mapped.length} documents:`);
  for (const m of mapped) {
    console.log(`  ${m.formCode} #${m.counterNumber} seq=${m.sequenceOrder} ref=${m.referencedFormCode ?? 'none'}:${m.referencedCounterOfferNumber ?? 'none'} file=${m.fileName}`);
  }

  // Build a reference-based ordering using offered_reference relationships.
  // Fall back to counter-number + alternation when references are unavailable.
  const rpa = mapped.filter((d) => d.formCode === 'RPA');
  const counters = mapped.filter((d) => d.formCode !== 'RPA');

  const result: NegotiationChainDocument[] = [...rpa];

  if (counters.length === 0) return result;

  // ── Counter-number reassignment (fallback) ─────────────────────────────
  // When the LLM didn't extract counter numbers from the form data
  // (e.g. partial page extraction, encrypted PDF, or form data missing),
  // all counter offers will have counterNumber=0 from filename detection.
  // Reassign based on position in the already-ordered result so that
  // SCO→BCO→SCO→BCO alternation produces correct displayed numbers.
  const allCountersHaveZero = counters.length > 1 && counters.every((d) => d.counterNumber === 0);
  if (allCountersHaveZero) {
    console.log(`[NegotiationChain] All ${counters.length} counters have number=0 — reassigning from sequence`);
    let scoRound = 0;
    for (const doc of mapped) {
      if (doc.formCode === 'RPA') continue;
      if (isScoFamily(doc.formCode)) {
        scoRound++;
        doc.counterNumber = scoRound;
      } else {
        doc.counterNumber = scoRound > 0 ? scoRound : 1;
      }
    }
    for (const c of counters) {
      console.log(`  reassigned ${c.formCode} → counterNumber=${c.counterNumber}`);
    }
  }

  // ── Build reference-indexed lookup ──────────────────────────────────────
  // Key: "<formCode>:<counterNumber>" — used to find a document's position
  // by matching what another document references.
  const refIndex = new Map<string, NegotiationChainDocument[]>();
  for (const doc of mapped) {
    const key = `${doc.formCode}:${doc.counterNumber}`;
    const bucket = refIndex.get(key) ?? [];
    bucket.push(doc);
    refIndex.set(key, bucket);
  }

  // ── Reference-based chain building ──────────────────────────────────────
  const placed = new Set<number>(); // index of counter in `counters` array (already placed)
  let round = 0;
  console.log(`[NegotiationChain] Starting chain build with RPA root (${rpa.length} RPA, ${counters.length} counters)`);
  while (placed.size < counters.length && round < 100) {
    round++;
    const newlyPlaced: number[] = [];
    console.log(`[NegotiationChain] Round ${round} (${counters.length - placed.size} remaining)`);

    for (let i = 0; i < counters.length; i++) {
      if (placed.has(i)) continue;
      const doc = counters[i];

      let targetIndex: number | null = null;
      let reason = '';

      if (doc.referencedFormCode && doc.referencedFormCode !== doc.formCode) {
        const refCounterRaw = doc.referencedCounterOfferNumber != null
          ? parseInt(doc.referencedCounterOfferNumber, 10)
          : NaN;
        const refCounter = Number.isNaN(refCounterRaw) ? 0 : refCounterRaw;
        const refKey = `${doc.referencedFormCode}:${refCounter}`;

        // First pass: exact key match (form code + counter number)
        for (let j = result.length - 1; j >= 0; j--) {
          const existing = result[j];
          const existingKey = `${existing.formCode}:${existing.counterNumber}`;
          if (existingKey === refKey) {
            targetIndex = j + 1;
            reason = `ref-exact(${refKey} at pos ${j})`;
            break;
          }
        }

          if (targetIndex != null) {
            console.log(`  [${doc.formCode}] ref=${refKey} → EXACT parent match at pos ${targetIndex - 1} (${result[targetIndex - 1].formCode} #${result[targetIndex - 1].counterNumber})`);
          } else {
            console.log(`  [${doc.formCode}] ref=${refKey} → no exact match — falling to counter-number ordering`);
          }
      } else if (doc.referencedFormCode && doc.referencedFormCode === doc.formCode) {
        console.log(`  [${doc.formCode}] self-reference (${doc.formCode}:${doc.referencedCounterOfferNumber}) — using alternation fallback`);
      }

      if (targetIndex == null) {
        let insertAt = result.length;
        for (let j = result.length - 1; j >= 0; j--) {
          if (result[j].formCode === 'RPA') {
            insertAt = j + 1;
            reason = `counter-after-RPA(${doc.counterNumber})`;
            break;
          }
          const prevIsSco = isScoFamily(result[j].formCode);
          const currIsSco = isScoFamily(doc.formCode);

          if (doc.counterNumber > result[j].counterNumber) {
            insertAt = j + 1;
            reason = `counter-num(${doc.counterNumber} > ${result[j].counterNumber} at ${result[j].formCode})`;
            break;
          }
          if (doc.counterNumber === result[j].counterNumber && prevIsSco && !currIsSco) {
            insertAt = j + 1;
            reason = `counter-intra(${doc.formCode} after ${result[j].formCode} in round ${doc.counterNumber})`;
            break;
          }
          if (doc.counterNumber < result[j].counterNumber) {
            insertAt = j;
          }
        }
        if (!reason) reason = 'counter-end';
        targetIndex = insertAt;
      }

      if (targetIndex == null && round > 1) {
        doc.unlinked = true;
        targetIndex = result.length;
        reason = 'unlinked';
      }

      if (targetIndex != null) {
        console.log(`  ✓ ${doc.formCode} #${doc.counterNumber} → pos ${targetIndex} (${reason})${doc.unlinked ? ' [UNLINKED]' : ''}`);
        result.splice(targetIndex, 0, doc);
        placed.add(i);
        newlyPlaced.push(i);
      }
    }

    // If nothing was placed this round, break to avoid infinite loop
    if (newlyPlaced.length === 0) {
      console.log(`[NegotiationChain] No docs placed in round ${round} — flagging ${counters.length - placed.size} remaining as unlinked`);
      for (let i = 0; i < counters.length; i++) {
        if (!placed.has(i)) {
          counters[i].unlinked = true;
          result.push(counters[i]);
          placed.add(i);
          console.log(`  ⚠ ${counters[i].formCode} #${counters[i].counterNumber} → UNLINKED (appended at end)`);
        }
      }
      break;
    }
  }

  console.log(`[NegotiationChain] Final chain (${result.length} docs):`);
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    console.log(`  ${i}: ${r.formCode} #${r.counterNumber}${r.unlinked ? ' [UNLINKED]' : ''}${r.isAccepted ? ' [ACCEPTED]' : ''} ref=${r.referencedFormCode ?? '-'}:${r.referencedCounterOfferNumber ?? '-'}`);
  }

  return result;
}

// ─── Final document finder ─────────────────────────────────────────────────────

/**
 * Walk the sorted negotiation chain to find the last fully accepted document.
 *
 * Rules:
 *   - Start with RPA (always accepted by default if no counters exist)
 *   - Walk each subsequent document in counter order
 *   - If a document is accepted, it becomes the new "last accepted"
 *   - If a later document is NOT accepted, generate a warning
 *   - If there are multiple SCOs and the latest is not accepted, warn
 */
export function findFinalDocument(
  chain: NegotiationChainDocument[],
): { finalDocument: NegotiationChainDocument | null; warnings: string[] } {
  const warnings: string[] = [];

  if (chain.length === 0) {
    warnings.push('Final accepted document not found.');
    return { finalDocument: null, warnings };
  }

  const rpa = chain[0];
  if (rpa.formCode !== 'RPA') {
    // No RPA in the chain — shouldn't happen in normal flow
    warnings.push('Final accepted document not found.');
    return { finalDocument: null, warnings };
  }

  // Separate RPA from counter offers
  const counters = chain.filter((d) => d.formCode !== 'RPA');

  // If no counter offers, RPA is the final document (if accepted)
  if (counters.length === 0) {
    if (!rpa.isAccepted) {
      warnings.push('Final accepted document not found.');
      return { finalDocument: null, warnings };
    }
    return { finalDocument: rpa, warnings };
  }

  // ── Walk the counter chain ──────────────────────────────────────────────
  let lastAccepted: NegotiationChainDocument | null = rpa.isAccepted ? rpa : null;

  // Group counters by round numbers to detect alternations
  let pendingWarning: string | null = null;
  let scoNotAcceptedFound = false;

  for (let i = 0; i < counters.length; i++) {
    const doc = counters[i];
    const prev = i > 0 ? counters[i - 1] : rpa;

    if (doc.isAccepted) {
      lastAccepted = doc;
      scoNotAcceptedFound = false;
      pendingWarning = null;
    } else {
      // This counter is NOT accepted
      if (isScoFamily(doc.formCode)) {
        // SCO/SMCO not accepted by buyer
        if (!scoNotAcceptedFound) {
          // First SCO not accepted
          pendingWarning = 'Later Seller Counter Offer found but not fully accepted. Final contract document cannot be confirmed.';
          scoNotAcceptedFound = true;
        }
      } else {
        // BCO not accepted by seller
        pendingWarning = 'Counteroffer uploaded but not fully accepted.';
      }
    }
  }

  if (pendingWarning) {
    warnings.push(pendingWarning);
  }

  if (!lastAccepted) {
    // No document in the chain was accepted
    warnings.push('Final accepted document not found.');
    return { finalDocument: null, warnings };
  }

  // Check if there are later counters after the last accepted one
  const lastAcceptedIndex = chain.indexOf(lastAccepted);
  const laterCountersExist = chain.some((d, idx) => idx > lastAcceptedIndex && d.formCode !== 'RPA');

  if (laterCountersExist && warnings.length === 0) {
    // There are later counters that weren't flagged above
    const laterCounters = chain.filter((d, idx) => idx > lastAcceptedIndex && d.formCode !== 'RPA');
    const hasUnacceptedSco = laterCounters.some((d) => isScoFamily(d.formCode) && !d.isAccepted);
    if (hasUnacceptedSco) {
      warnings.push('Later Seller Counter Offer found but not fully accepted. Final contract document cannot be confirmed.');
    }
  }

  return { finalDocument: lastAccepted, warnings };
}

// ─── Final terms resolution ────────────────────────────────────────────────────

// ─── Main entry point ──────────────────────────────────────────────────────────

/**
 * Validate the contract negotiation chain and determine the final accepted
 * document. Term resolution (price/dates/credits/contingencies) now lives
 * solely in `final-terms.ts`'s `resolveFinalNegotiatedTerms` — see that
 * file's doc comment for why the three mergers that used to exist were
 * consolidated into one.
 *
 * @param documents - Normalized contract documents (RPA, SCO, BCO, SMCO)
 * @param extractions - Raw pipeline extractions (for counter number detection from form data)
 * @returns NegotiationChainResult with the final document and chain warnings
 */
export function validateContractChain(
  documents: ContractDocumentExtraction[],
  extractions?: FormExtractionResult[] | null,
): NegotiationChainResult {
  const rpaCount = documents.filter((d) => d.documentType === 'RPA').length;
  const scoCount = documents.filter((d) => d.documentType === 'SCO' || d.documentType === 'SMCO').length;
  const bcoCount = documents.filter((d) => d.documentType === 'BCO' || d.documentType === 'BMCO').length;
  console.log(`[NegotiationChain] validateContractChain: ${rpaCount} RPA, ${scoCount} SCO/SMCO, ${bcoCount} BCO/BMCO`);

  const chain = sortNegotiationChain(documents, extractions ?? null);
  const { finalDocument, warnings } = findFinalDocument(chain);

  return {
    documents: chain,
    finalDocument,
    finalDocumentType: finalDocument?.formCode ?? null,
    finalDocumentFileName: finalDocument?.fileName ?? null,
    warnings,
  };
}
