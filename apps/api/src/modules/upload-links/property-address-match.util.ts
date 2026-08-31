import { resolveDisclosuresBlocker } from '@tc/document-intelligence';
import type { ComplianceResult } from '../document-extraction/compliance-result.types';

/**
 * Lenient address-matching for RR/RRRR uploads: extracted addresses vary in
 * abbreviation ("St" vs "Street"), suite/unit noise, and formatting, so this
 * deliberately does not require an exact match — only that the transaction's
 * street number and at least one significant street-name word both appear
 * somewhere in the extracted address's own token set.
 */
function normalizeAddressTokens(address: string): string[] {
  return address
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * True when `extractedAddress` plausibly refers to the same property as
 * `transactionAddressLine1`. Returns true (never blocks) when the transaction
 * itself has no usable address to compare against — there's nothing to
 * validate the extraction against in that case.
 */
export function propertyAddressMatchesTransaction(
  extractedAddress: string | null | undefined,
  transactionAddressLine1: string | null | undefined,
): boolean {
  const txTokens = normalizeAddressTokens(transactionAddressLine1 ?? '');
  if (txTokens.length === 0) return true;
  if (!extractedAddress) return false;

  const extractedTokens = new Set(normalizeAddressTokens(extractedAddress));

  const txNumber = txTokens.find((t) => /^\d+$/.test(t));
  const numberMatches = !txNumber || extractedTokens.has(txNumber);

  const txWords = txTokens.filter((t) => !/^\d+$/.test(t) && t.length >= 3);
  const wordMatches = txWords.length === 0 || txWords.some((w) => extractedTokens.has(w));

  return numberMatches && wordMatches;
}

/**
 * RR/RRRR extraction output isn't RPA-shaped (`ExtractionResult`'s real type)
 * even though `DocumentPipelineService.process()` casts it to that type for
 * convenience — at runtime it's the flat `{ header: { property_address } }`
 * shape defined in the RR/RRRR FormDefinition system prompts.
 */
export function extractHeaderPropertyAddress(extraction: unknown): string | null {
  const data = extraction as Record<string, unknown> | null | undefined;
  const header = (data?.['header'] as Record<string, unknown> | undefined) ?? data ?? undefined;
  const address = header?.['property_address'];
  return typeof address === 'string' && address.trim() ? address : null;
}

/**
 * Synthesizes an address-mismatch blocker straight from the document-intelligence
 * blocker catalog (so the message/compositeId stay a single source of truth) and
 * returns a NEW ComplianceResult with it merged in — flipping the summary to
 * non_compliant when it wasn't already, since this check runs at the apps/api
 * layer (the only place `transaction` context exists) rather than inside the
 * document-intelligence package's own validators. Deliberately non-mutating: the
 * input `compliance` object may be a shared/cached reference (e.g. a constant
 * reused across call sites or tests), so mutating it in place would leak state
 * across unrelated callers.
 */
const ADDRESS_MISMATCH_BLOCKER_CODES: Record<'RR' | 'RRRR' | 'CR-B' | 'VP', string> = {
  RR: 'BLOCKER_RR_ADDRESS_MISMATCH',
  RRRR: 'BLOCKER_RRRR_ADDRESS_MISMATCH',
  'CR-B': 'BLOCKER_CRB_ADDRESS_MISMATCH',
  VP: 'BLOCKER_VP_ADDRESS_MISMATCH',
};

export function appendAddressMismatchBlocker(compliance: ComplianceResult, formCode: 'RR' | 'RRRR' | 'CR-B' | 'VP'): ComplianceResult {
  const code = ADDRESS_MISMATCH_BLOCKER_CODES[formCode];
  const blocker = resolveDisclosuresBlocker(code, ['header.property_address']);
  if (!blocker) return compliance;

  const wasAlreadyNonCompliant = compliance.summary.overallStatus === 'non_compliant';
  return {
    ...compliance,
    blockers: [...(compliance.blockers ?? []), blocker],
    summary: {
      ...compliance.summary,
      overallStatus: 'non_compliant',
      failCount: wasAlreadyNonCompliant ? compliance.summary.failCount : compliance.summary.failCount + 1,
    },
  };
}
