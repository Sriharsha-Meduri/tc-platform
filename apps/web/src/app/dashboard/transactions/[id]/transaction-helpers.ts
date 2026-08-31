import type { ApiDocument } from '@/lib/api';
import type { ComplianceResult, BlockerOutput, WarningOutput, ComplianceCheck } from '@/app/transactions/new/extraction-result.types';

export function filterDocs(
  documents: ApiDocument[],
  contractDocId: string | null,
  documentTypes: string[],
): ApiDocument[] {
  return documents.filter((d) => {
    if (d.id === contractDocId) return false;
    if (d.status === 'superseded' || d.status === 'rejected') return false;
    return documentTypes.includes(d.documentType);
  });
}

export type DocumentAnalysisStatus =
  | 'uploaded'
  | 'analyzing'
  | 'analysis_failed'
  | 'validation_passed'
  | 'blockers_found'
  | 'needs_review';

/**
 * Composite document status — computed from the backend-saved analysisStatus
 * column and metadataJson.compliance, never from anything client-derived.
 * This is the single source of truth consumed by the Documents section,
 * checklists, blocker summary, and document dropdown alike.
 */
export function computeDocumentAnalysisStatus(doc: ApiDocument | null): {
  status: DocumentAnalysisStatus;
  blockerCount: number;
  warningCount: number;
} {
  if (!doc) return { status: 'uploaded', blockerCount: 0, warningCount: 0 };

  if (doc.analysisStatus === 'analyzing') {
    return { status: 'analyzing', blockerCount: 0, warningCount: 0 };
  }
  if (doc.analysisStatus === 'failed') {
    return { status: 'analysis_failed', blockerCount: 0, warningCount: 0 };
  }

  const meta = doc.metadataJson as Record<string, unknown> | null;
  const compliance = meta?.compliance as ComplianceResult | null | undefined;
  const blockerCount = compliance?.blockers?.length ?? 0;
  const warningCount = compliance?.warnings?.length ?? 0;

  if (doc.analysisStatus !== 'completed') {
    return { status: 'uploaded', blockerCount: 0, warningCount: 0 };
  }
  if (blockerCount > 0) return { status: 'blockers_found', blockerCount, warningCount };
  if (warningCount > 0) return { status: 'needs_review', blockerCount, warningCount };
  return { status: 'validation_passed', blockerCount, warningCount };
}

export function aggregateCompliance(docs: ApiDocument[]): ComplianceResult | null {
  const seenBlockers = new Map<string, BlockerOutput>();
  const seenWarnings = new Map<string, WarningOutput>();
  const seenChecks = new Map<string, ComplianceCheck>();

  for (const doc of docs) {
    const meta = doc.metadataJson as Record<string, unknown> | null;
    const comp = meta?.compliance as ComplianceResult | null;
    if (comp) {
      for (const b of comp.blockers ?? []) {
        if (!seenBlockers.has(b.compositeId)) seenBlockers.set(b.compositeId, b);
      }
      for (const w of comp.warnings ?? []) {
        if (!seenWarnings.has(w.compositeId)) seenWarnings.set(w.compositeId, w);
      }
      for (const c of comp.checks ?? []) {
        if (!seenChecks.has(c.ruleId)) seenChecks.set(c.ruleId, c);
      }
    }
  }

  const allChecks = [...seenChecks.values()];
  const allBlockers = [...seenBlockers.values()];
  const allWarnings = [...seenWarnings.values()];

  if (allBlockers.length === 0 && allWarnings.length === 0 && allChecks.length === 0) return null;

  const failCount = allBlockers.length;
  const warningCount = allWarnings.length;
  const passCount = allChecks.filter((c) => c.status === 'pass').length;
  const skippedCount = allChecks.filter((c) => c.status === 'skipped').length;

  return {
    sourceType: 'llm_extraction' as const,
    hasAcroForm: false,
    acroFieldCount: 0,
    checks: allChecks,
    blockers: allBlockers,
    warnings: allWarnings,
    summary: {
      overallStatus: failCount > 0 ? 'non_compliant' : warningCount > 0 ? 'needs_review' : 'compliant',
      passCount,
      failCount,
      warningCount,
      skippedCount,
    },
    signatureFields: [],
    emptyRequiredAcroFields: [],
  };
}
