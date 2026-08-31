import { matchDocumentsToChecklist, matchDocumentsToSellerAgentChecklist, mapComplianceChecks } from './checklist-matching.util';
import type { ComplianceCheck } from '../document-extraction/compliance-result.types';

function makeDoc(overrides: Partial<{
  id: string; fileName: string | null; formCode: string | null; documentType: string;
  analysisStatus: string | null; createdAt: Date; metadataJson: Record<string, unknown> | null;
}> = {}) {
  return {
    id: 'doc-1',
    fileName: 'file.pdf',
    formCode: null,
    documentType: 'external_upload',
    analysisStatus: null,
    createdAt: new Date('2026-01-01'),
    metadataJson: null,
    ...overrides,
  } as never;
}

function blockedMetadata(): Record<string, unknown> {
  return { compliance: { blockers: [{ code: 'BLOCKER_BUYER_SIGNATURE', message: 'Missing buyer signature' }] } };
}

const REQUIRED_ITEMS = [
  { key: 'RPA', label: 'Residential Purchase Agreement', category: 'purchase_agreement' },
  { key: 'TDS', label: 'Transfer Disclosure Statement', category: 'disclosure' },
];

describe('mapComplianceChecks', () => {
  it('passes through the location hint from a ComplianceCheck so the checklist dropdown can show a page number', () => {
    const checks: ComplianceCheck[] = [
      { ruleId: 'r1', category: 'signatures', formCode: 'RPA', phase: 'contract', severity: 'error', status: 'fail', label: 'Broker signature missing', location: 'Page 2' },
    ];
    const [mapped] = mapComplianceChecks(checks);
    expect(mapped.location).toBe('Page 2');
  });

  it('leaves location undefined when the underlying check never recorded one', () => {
    const checks: ComplianceCheck[] = [
      { ruleId: 'r1', category: 'signatures', formCode: 'RPA', phase: 'contract', severity: 'info', status: 'pass', label: 'Buyer signature present' },
    ];
    const [mapped] = mapComplianceChecks(checks);
    expect(mapped.location).toBeUndefined();
  });
});

describe('matchDocumentsToChecklist', () => {
  it('matchBy formCode: a required item with no matching document is "required"', () => {
    const items = matchDocumentsToChecklist(REQUIRED_ITEMS, [], 'formCode');
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
  });

  it('matchBy formCode: only flips to "submitted" once analysis has completed', () => {
    const analyzing = matchDocumentsToChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'RPA', analysisStatus: 'analyzing' })], 'formCode');
    expect(analyzing.find((i) => i.formCode === 'RPA')?.status).toBe('required');

    const completed = matchDocumentsToChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'RPA', analysisStatus: 'completed' })], 'formCode');
    expect(completed.find((i) => i.formCode === 'RPA')?.status).toBe('submitted');
  });

  it('matchBy documentType: "submitted" as soon as the document is present — analysis is never a gate', () => {
    const items = matchDocumentsToChecklist(
      [{ key: 'lender_prequalification', label: 'Lender Prequalification Letter', category: 'buyer_agent_required_document' }],
      [makeDoc({ documentType: 'lender_prequalification', analysisStatus: 'analyzing' })],
      'documentType',
    );
    expect(items[0].status).toBe('submitted');
  });

  it('picks the most recently created matching document when multiple exist', () => {
    const older = makeDoc({ id: 'doc-old', fileName: 'old.pdf', formCode: 'RPA', analysisStatus: 'completed', createdAt: new Date('2026-01-01') });
    const newer = makeDoc({ id: 'doc-new', fileName: 'new.pdf', formCode: 'RPA', analysisStatus: 'completed', createdAt: new Date('2026-02-01') });
    const items = matchDocumentsToChecklist(REQUIRED_ITEMS, [older, newer], 'formCode');
    expect(items.find((i) => i.formCode === 'RPA')?.matchedDocument?.id).toBe('doc-new');
  });

  it('a document matching a different item never satisfies an unrelated required item', () => {
    const items = matchDocumentsToChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'TDS', analysisStatus: 'completed' })], 'formCode');
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
    expect(items.find((i) => i.formCode === 'TDS')?.status).toBe('submitted');
  });

  it('returns an empty array for an empty required-items list, regardless of documents present', () => {
    const items = matchDocumentsToChecklist([], [makeDoc({ formCode: 'RPA', analysisStatus: 'completed' })], 'formCode');
    expect(items).toEqual([]);
  });

  it('matchBy formCode: a completed document with compliance blockers is "reupload_required", never "submitted"', () => {
    const items = matchDocumentsToChecklist(
      REQUIRED_ITEMS,
      [makeDoc({ formCode: 'RPA', analysisStatus: 'completed', metadataJson: blockedMetadata() })],
      'formCode',
    );
    const rpa = items.find((i) => i.formCode === 'RPA');
    expect(rpa?.status).toBe('reupload_required');
    expect(rpa?.matchedDocument?.id).toBe('doc-1'); // still points at the document so its failed checks can be shown
  });

  it('matchBy documentType: compliance blockers never gate a dedicated-category item — it is still "submitted"', () => {
    const items = matchDocumentsToChecklist(
      [{ key: 'lender_prequalification', label: 'Lender Prequalification Letter', category: 'buyer_agent_required_document' }],
      [makeDoc({ documentType: 'lender_prequalification', analysisStatus: 'completed', metadataJson: blockedMetadata() })],
      'documentType',
    );
    expect(items[0].status).toBe('submitted');
  });

  it('one valid split document never marks a blocked sibling (a different formCode) complete', () => {
    const validRpa = makeDoc({ id: 'doc-rpa', formCode: 'RPA', analysisStatus: 'completed' });
    const blockedTds = makeDoc({ id: 'doc-tds', formCode: 'TDS', analysisStatus: 'completed', metadataJson: blockedMetadata() });
    const items = matchDocumentsToChecklist(REQUIRED_ITEMS, [validRpa, blockedTds], 'formCode');
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('submitted');
    expect(items.find((i) => i.formCode === 'TDS')?.status).toBe('reupload_required');
  });
});

describe('matchDocumentsToSellerAgentChecklist', () => {
  it('no document at all → "required"', () => {
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [], new Set());
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
  });

  it('a completed matching document → "submitted"', () => {
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'RPA', analysisStatus: 'completed' })], new Set());
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('submitted');
  });

  it('an in-flight matching document → "analyzing" (unlike matchDocumentsToChecklist, this one CAN attribute an in-flight doc to its item)', () => {
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'RPA', analysisStatus: 'analyzing' })], new Set());
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('analyzing');
  });

  it('no live document, but the form code is in rejectedFormCodes → "reupload_required"', () => {
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [], new Set(['RPA']));
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('reupload_required');
    expect(items.find((i) => i.formCode === 'TDS')?.status).toBe('required'); // TDS not in the rejected set
  });

  it('a completed submission wins over rejectedFormCodes — "submitted" takes priority, an item is never stuck at "reupload_required" once fixed', () => {
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'RPA', analysisStatus: 'completed' })], new Set(['RPA']));
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('submitted');
  });

  it('an in-flight document also wins over rejectedFormCodes — "analyzing" takes priority over "reupload_required"', () => {
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'RPA', analysisStatus: 'analyzing' })], new Set(['RPA']));
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('analyzing');
  });

  it('picks the most recently created matching document when multiple completed docs exist for the same item', () => {
    const older = makeDoc({ id: 'doc-old', fileName: 'old.pdf', formCode: 'RPA', analysisStatus: 'completed', createdAt: new Date('2026-01-01') });
    const newer = makeDoc({ id: 'doc-new', fileName: 'new.pdf', formCode: 'RPA', analysisStatus: 'completed', createdAt: new Date('2026-02-01') });
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [older, newer], new Set());
    expect(items.find((i) => i.formCode === 'RPA')?.matchedDocument?.id).toBe('doc-new');
  });

  it('a document matching a different item never satisfies an unrelated required item', () => {
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [makeDoc({ formCode: 'TDS', analysisStatus: 'completed' })], new Set());
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('required');
    expect(items.find((i) => i.formCode === 'TDS')?.status).toBe('submitted');
  });

  it('returns an empty array for an empty required-items list', () => {
    const items = matchDocumentsToSellerAgentChecklist([], [makeDoc({ formCode: 'RPA', analysisStatus: 'completed' })], new Set());
    expect(items).toEqual([]);
  });

  it('a completed document with compliance blockers is "reupload_required", never "submitted"', () => {
    const items = matchDocumentsToSellerAgentChecklist(
      REQUIRED_ITEMS,
      [makeDoc({ formCode: 'RPA', analysisStatus: 'completed', metadataJson: blockedMetadata() })],
      new Set(),
    );
    const rpa = items.find((i) => i.formCode === 'RPA');
    expect(rpa?.status).toBe('reupload_required');
    expect(rpa?.matchedDocument?.id).toBe('doc-1');
  });

  it('one valid split document never marks a blocked sibling (a different formCode) complete', () => {
    const validRpa = makeDoc({ id: 'doc-rpa', formCode: 'RPA', analysisStatus: 'completed' });
    const blockedTds = makeDoc({ id: 'doc-tds', formCode: 'TDS', analysisStatus: 'completed', metadataJson: blockedMetadata() });
    const items = matchDocumentsToSellerAgentChecklist(REQUIRED_ITEMS, [validRpa, blockedTds], new Set());
    expect(items.find((i) => i.formCode === 'RPA')?.status).toBe('submitted');
    expect(items.find((i) => i.formCode === 'TDS')?.status).toBe('reupload_required');
  });
});
