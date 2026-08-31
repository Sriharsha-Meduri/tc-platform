import type { ContractDocumentExtraction, PackageValidationResult, PackageValidationIssue } from '../../extraction-result.types';

const CONTRACT_CHAIN_CODES = new Set(['RPA', 'SCO', 'SMCO', 'BCO', 'BMCO']);

function isContractChainDocument(doc: ContractDocumentExtraction): boolean {
  return doc.documentType != null && CONTRACT_CHAIN_CODES.has(doc.documentType);
}

export function detectMissingDocuments(docs: ContractDocumentExtraction[]): PackageValidationIssue[] {
  const issues: PackageValidationIssue[] = [];
  const chainDocs = docs.filter(isContractChainDocument);

  // Only validate if there are actually documents in the chain
  if (chainDocs.length === 0) return issues;

  const hasRpa = chainDocs.some((d) => d.documentType === 'RPA');
  if (!hasRpa) {
    issues.push({
      code: 'MISSING_RPA',
      severity: 'blocker',
      message: 'Missing Purchase Agreement (RPA)',
      detail: 'An RPA is required to calculate final terms.',
    });
  }

  const counterNumbers = new Set<number>();
  for (const doc of chainDocs) {
    const n = doc.counterNumber;
    if (n != null && n > 0) counterNumbers.add(n);
  }
  if (counterNumbers.size > 0) {
    const max = Math.max(...counterNumbers);
    const expected = new Set(Array.from({ length: max }, (_, i) => i + 1));
    const missing = [...expected].filter((n) => !counterNumbers.has(n));
    if (missing.length > 0) {
      issues.push({
        code: 'MISSING_COUNTER_OFFER',
        severity: 'blocker',
        message: `Missing counter-offer document${missing.length > 1 ? 's' : ''}`,
        detail: `Counter-offer #${missing.join(', #')} ${missing.length > 1 ? 'are' : 'is'} missing from the chain.`,
      });
    }
  }

  return issues;
}

export function validateContractPackage(
  docs: ContractDocumentExtraction[],
): PackageValidationResult {
  const issues = detectMissingDocuments(docs);

  const hasBlocker = issues.some((i) => i.severity === 'blocker');
  return {
    issues,
    canCalculateFinalTerms: !hasBlocker && docs.length > 0,
    canSendEmails: !hasBlocker,
  };
}
