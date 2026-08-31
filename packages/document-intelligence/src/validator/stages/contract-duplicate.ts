import type { RuleIssue, RuleResult } from '../validator.types';
import type { ContractDocumentExtraction } from '../../extractor/extractor.types';

const CONTRACT_CHAIN_CODES = new Set(['RPA', 'SCO', 'SMCO', 'BCO', 'BMCO']);

function isContractChainDocument(doc: ContractDocumentExtraction): boolean {
  return doc.documentType != null && CONTRACT_CHAIN_CODES.has(doc.documentType);
}

/**
 * Detect duplicate contract documents in an upload package.
 *
 * Returns `RuleIssue[]` that map to the contract blocker-catalog entries:
 *   - `BLOCKER_DUPLICATE_TYPE_COUNTER` — same form type + same counter number (blocker)
 *   - `WARN_DUPLICATE_SAME_FILE`        — same filename uploaded twice (warning)
 *   - `WARN_DUPLICATE_SEMANTIC`         — same address + date + parties (warning)
 *
 * Deduplication: groups with identical `(code, sortedFileList)` are collapsed
 * so the same duplicate pair is only reported once.
 */
export function validateDuplicateDocuments(docs: ContractDocumentExtraction[]): RuleResult {
  const issues: RuleIssue[] = [];
  const chainDocs = docs.filter(isContractChainDocument);
  const seen = new Set<string>();

  // 1. Type + counterNumber → BLOCKER
  const typeCounterMap = new Map<string, ContractDocumentExtraction[]>();
  for (const doc of chainDocs) {
    const key = `${doc.documentType}::${doc.counterNumber ?? 0}`;
    if (!typeCounterMap.has(key)) typeCounterMap.set(key, []);
    typeCounterMap.get(key)!.push(doc);
  }
  for (const [, group] of typeCounterMap) {
    if (group.length < 2) continue;
    const fileList = group.map((d) => d.fileName ?? 'unknown').sort();
    const dedupKey = `BLOCKER_DUPLICATE_TYPE_COUNTER::${fileList.join('|')}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    issues.push({ code: 'BLOCKER_DUPLICATE_TYPE_COUNTER', fields: fileList });
  }

  // 2. Filename match → BLOCKER
  const fileNameMap = new Map<string, ContractDocumentExtraction[]>();
  for (const doc of docs) {
    if (!doc.fileName) continue;
    if (!fileNameMap.has(doc.fileName)) fileNameMap.set(doc.fileName, []);
    fileNameMap.get(doc.fileName)!.push(doc);
  }
  for (const [, group] of fileNameMap) {
    if (group.length < 2) continue;
    const fileList = [group[0].fileName!];
    const dedupKey = `BLOCKER_DUPLICATE_SAME_FILE::${fileList[0]}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    issues.push({ code: 'BLOCKER_DUPLICATE_SAME_FILE', fields: fileList });
  }

  // 3. Semantic match (address + date + parties) → WARNING
  const exactMap = new Map<string, ContractDocumentExtraction[]>();
  for (const doc of chainDocs) {
    const terms = doc.extractedTerms;
    if (!terms.propertyAddress && !terms.acceptanceDate && !terms.buyerName && !terms.sellerName) continue;
    const key = [
      terms.propertyAddress ?? '',
      terms.acceptanceDate ?? '',
      terms.buyerName ?? '',
      terms.sellerName ?? '',
    ].join('|').toLowerCase();
    if (!exactMap.has(key)) exactMap.set(key, []);
    exactMap.get(key)!.push(doc);
  }
  for (const [, group] of exactMap) {
    if (group.length < 2) continue;
    const fileList = group.map((d) => d.fileName ?? 'unknown').sort();
    const dedupKey = `WARN_DUPLICATE_SEMANTIC::${fileList.join('|')}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    issues.push({ code: 'WARN_DUPLICATE_SEMANTIC', fields: fileList });
  }

  return { issues, checks: [] };
}
