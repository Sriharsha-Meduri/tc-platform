import type { ComplianceCheck } from '../document-extraction/compliance-result.types';

/** The minimal shape the pure matching logic below needs — satisfied by TransactionBlockerOverrideEntity, and by plain fixtures in tests. */
export interface BlockerOverrideRecord {
  blockerId: string;
  documentId: string | null;
  formCode: string | null;
}

/**
 * The single shared resolution rule every consumer must go through — never
 * reimplemented independently per UI/service. A blocker is overridden when a
 * record exists whose blockerId matches and whose scope covers this
 * occurrence, most specific first:
 *   1. an override recorded against this exact document,
 *   2. an override recorded against this form code (no specific document —
 *      e.g. overridden before the document row existed),
 *   3. an override recorded with neither — transaction-wide for that code.
 */
export function isBlockerOverridden(
  overrides: readonly BlockerOverrideRecord[],
  blockerId: string,
  scope: { documentId?: string | null; formCode?: string | null } = {},
): boolean {
  const forBlocker = overrides.filter((o) => o.blockerId === blockerId);
  if (forBlocker.length === 0) return false;

  if (scope.documentId && forBlocker.some((o) => o.documentId === scope.documentId)) return true;
  if (scope.formCode && forBlocker.some((o) => o.documentId == null && o.formCode === scope.formCode)) return true;
  return forBlocker.some((o) => o.documentId == null && o.formCode == null);
}

/** Splits a document's raw blockers into what's still active vs. what's been overridden — never mutates or drops the input array itself. */
export function partitionBlockers<T extends { code: string }>(
  blockers: readonly T[],
  overrides: readonly BlockerOverrideRecord[],
  scope: { documentId?: string | null; formCode?: string | null } = {},
): { active: T[]; overridden: T[] } {
  const active: T[] = [];
  const overridden: T[] = [];
  for (const b of blockers) {
    (isBlockerOverridden(overrides, b.code, scope) ? overridden : active).push(b);
  }
  return { active, overridden };
}

/** True when at least one of this document's own recorded blockers is still active (not overridden) — the override-aware replacement for a bare `blockers.length > 0` check. */
export function hasActiveBlockers<T extends { code: string }>(
  blockers: readonly T[] | undefined,
  overrides: readonly BlockerOverrideRecord[],
  scope: { documentId?: string | null; formCode?: string | null } = {},
): boolean {
  if (!blockers || blockers.length === 0) return false;
  return blockers.some((b) => !isBlockerOverridden(overrides, b.code, scope));
}

/**
 * Maps a document's raw compliance.checks — used for the per-document
 * validation dropdown everywhere it's shown — to the DTO's plain vocabulary,
 * marking a failing/warning check whose ruleId has been overridden as
 * 'overridden' instead of 'failed'. ruleId and a blocker's `code` are the
 * same value for the same underlying rule (see disclosures/contract
 * blocker-catalog.ts), so this reuses the identical override lookup.
 */
export function effectiveCheckStatus(
  check: ComplianceCheck,
  overrides: readonly BlockerOverrideRecord[],
  scope: { documentId?: string | null; formCode?: string | null } = {},
): 'passed' | 'failed' | 'not_applicable' | 'overridden' {
  if (check.status === 'pass') return 'passed';
  if (check.status === 'skipped') return 'not_applicable';
  // status is 'fail' or 'warning' here
  return isBlockerOverridden(overrides, check.ruleId, scope) ? 'overridden' : 'failed';
}
