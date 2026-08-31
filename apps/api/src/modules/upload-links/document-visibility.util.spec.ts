import { canExternalUserSeeDocument, resolveUploadedByType, resolveUploadLinkVisibilityType, UploadedByType, UploadLinkVisibilityType } from './document-visibility.util';

describe('resolveUploadLinkVisibilityType', () => {
  it('maps each known purpose to its own audience', () => {
    expect(resolveUploadLinkVisibilityType('document_upload')).toBe('BUYER_AGENT');
    expect(resolveUploadLinkVisibilityType('seller_agent_document_upload')).toBe('SELLER_AGENT');
    expect(resolveUploadLinkVisibilityType('escrow_officer_document_upload')).toBe('ESCROW');
  });
});

describe('resolveUploadedByType', () => {
  it('is INTERNAL when uploadLinkId is null, regardless of any purpose passed in', () => {
    expect(resolveUploadedByType(null)).toBe('INTERNAL');
    expect(resolveUploadedByType(null, 'document_upload')).toBe('INTERNAL');
  });

  it('maps a set uploadLinkId + its own purpose to the matching origin', () => {
    expect(resolveUploadedByType('link-1', 'document_upload')).toBe('BUYER_AGENT');
    expect(resolveUploadedByType('link-2', 'seller_agent_document_upload')).toBe('SELLER_AGENT');
    expect(resolveUploadedByType('link-3', 'escrow_officer_document_upload')).toBe('ESCROW');
  });
});

describe('canExternalUserSeeDocument — full visibility matrix', () => {
  const MATRIX: Array<{ uploadedByType: UploadedByType; linkType: UploadLinkVisibilityType; expected: boolean }> = [
    // Buyer Agent link
    { uploadedByType: 'INTERNAL', linkType: 'BUYER_AGENT', expected: true },
    { uploadedByType: 'BUYER_AGENT', linkType: 'BUYER_AGENT', expected: true },
    { uploadedByType: 'SELLER_AGENT', linkType: 'BUYER_AGENT', expected: false },
    { uploadedByType: 'ESCROW', linkType: 'BUYER_AGENT', expected: false },
    // Seller Agent link
    { uploadedByType: 'INTERNAL', linkType: 'SELLER_AGENT', expected: false },
    { uploadedByType: 'BUYER_AGENT', linkType: 'SELLER_AGENT', expected: false },
    { uploadedByType: 'SELLER_AGENT', linkType: 'SELLER_AGENT', expected: true },
    { uploadedByType: 'ESCROW', linkType: 'SELLER_AGENT', expected: false },
    // Escrow link
    { uploadedByType: 'INTERNAL', linkType: 'ESCROW', expected: false },
    { uploadedByType: 'BUYER_AGENT', linkType: 'ESCROW', expected: false },
    { uploadedByType: 'SELLER_AGENT', linkType: 'ESCROW', expected: false },
    { uploadedByType: 'ESCROW', linkType: 'ESCROW', expected: true },
  ];

  it.each(MATRIX)('$uploadedByType document on $linkType link -> visible=$expected (non-RPA)', ({ uploadedByType, linkType, expected }) => {
    expect(canExternalUserSeeDocument({ uploadedByType, formCode: 'TDS', documentType: 'general', status: 'approved' }, linkType)).toBe(expected);
  });

  it('the RPA exception applies only to the Escrow link, and only by formCode — the uploader\'s own origin is irrelevant', () => {
    for (const uploadedByType of ['INTERNAL', 'BUYER_AGENT', 'SELLER_AGENT', 'ESCROW'] as const) {
      expect(canExternalUserSeeDocument({ uploadedByType, formCode: 'RPA', documentType: 'general', status: 'approved' }, 'ESCROW')).toBe(true);
    }
  });

  it('the RPA exception never applies to Buyer Agent or Seller Agent links — they still follow the normal origin rule', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'SELLER_AGENT', formCode: 'RPA', documentType: 'general', status: 'approved' }, 'BUYER_AGENT')).toBe(false);
    expect(canExternalUserSeeDocument({ uploadedByType: 'ESCROW', formCode: 'RPA', documentType: 'general', status: 'approved' }, 'BUYER_AGENT')).toBe(false);
    expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: 'RPA', documentType: 'general', status: 'approved' }, 'SELLER_AGENT')).toBe(false);
    expect(canExternalUserSeeDocument({ uploadedByType: 'ESCROW', formCode: 'RPA', documentType: 'general', status: 'approved' }, 'SELLER_AGENT')).toBe(false);
  });

  it('a null formCode never accidentally satisfies the RPA exception', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: null, documentType: 'general', status: 'approved' }, 'ESCROW')).toBe(false);
  });

  it('fails closed for an audience outside the known union', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: 'TDS', documentType: 'general', status: 'approved' }, 'SOMETHING_ELSE' as never)).toBe(false);
  });

  it('the Broker link sees a CDA document regardless of origin, since a CDA is always INTERNAL-origin by construction', () => {
    for (const uploadedByType of ['INTERNAL', 'BUYER_AGENT', 'SELLER_AGENT', 'ESCROW'] as const) {
      expect(canExternalUserSeeDocument({ uploadedByType, formCode: null, documentType: 'cda', status: 'approved' }, 'BROKER')).toBe(true);
    }
  });

  it('the Broker link sees nothing else — no general document access', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: 'TDS', documentType: 'general', status: 'approved' }, 'BROKER')).toBe(false);
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: 'RPA', documentType: 'general', status: 'approved' }, 'BROKER')).toBe(false);
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: null, documentType: null, status: 'approved' }, 'BROKER')).toBe(false);
  });

  it('the Buyer Agent link also sees the CDA — covered by the existing INTERNAL-origin rule, not a special case', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: null, documentType: 'cda', status: 'approved' }, 'BUYER_AGENT')).toBe(true);
  });

  it('the Seller Agent and Escrow links never see the CDA', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: null, documentType: 'cda', status: 'approved' }, 'SELLER_AGENT')).toBe(false);
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: null, documentType: 'cda', status: 'approved' }, 'ESCROW')).toBe(false);
  });

  it('the Broker link sees its own signed CDA upload regardless of origin', () => {
    for (const uploadedByType of ['INTERNAL', 'BUYER_AGENT', 'SELLER_AGENT', 'ESCROW'] as const) {
      expect(canExternalUserSeeDocument({ uploadedByType, formCode: null, documentType: 'signed_cda', status: 'approved' }, 'BROKER')).toBe(true);
    }
  });

  it('the Escrow link sees the signed CDA — the one explicit exception alongside the RPA', () => {
    for (const uploadedByType of ['INTERNAL', 'BUYER_AGENT', 'SELLER_AGENT', 'ESCROW'] as const) {
      expect(canExternalUserSeeDocument({ uploadedByType, formCode: null, documentType: 'signed_cda', status: 'approved' }, 'ESCROW')).toBe(true);
    }
  });

  it('the Buyer Agent link also sees the signed CDA — same INTERNAL-origin rule as the CDA itself', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: null, documentType: 'signed_cda', status: 'approved' }, 'BUYER_AGENT')).toBe(true);
  });

  it('the Seller Agent link never sees the signed CDA', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'INTERNAL', formCode: null, documentType: 'signed_cda', status: 'approved' }, 'SELLER_AGENT')).toBe(false);
  });

  it('the Escrow link sees a signed VP — the one exception gated on document status, not just formCode', () => {
    for (const uploadedByType of ['INTERNAL', 'BUYER_AGENT', 'SELLER_AGENT', 'ESCROW'] as const) {
      expect(canExternalUserSeeDocument({ uploadedByType, formCode: 'VP', documentType: 'general', status: 'signed' }, 'ESCROW')).toBe(true);
    }
  });

  it('the Escrow link never sees an unsigned VP — the signed-only gate excludes every other status', () => {
    for (const status of ['requested', 'uploaded', 'under_review', 'approved', 'rejected', 'expired', 'superseded']) {
      expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: 'VP', documentType: 'general', status }, 'ESCROW')).toBe(false);
    }
  });

  it('the signed-VP exception (formCode-gated) never applies to Seller Agent links, regardless of the general any-signed-document rule on Buyer Agent', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: 'VP', documentType: 'general', status: 'signed' }, 'SELLER_AGENT')).toBe(false);
  });

  it('the Buyer Agent link sees any document with status "signed" regardless of uploadedByType — the DocuSign-signed-document exception', () => {
    for (const uploadedByType of ['INTERNAL', 'BUYER_AGENT', 'SELLER_AGENT', 'ESCROW'] as const) {
      expect(canExternalUserSeeDocument({ uploadedByType, formCode: 'RPA', documentType: 'general', status: 'signed' }, 'BUYER_AGENT')).toBe(true);
    }
  });

  it('a document the Seller Agent sent to the Buyer via DocuSign becomes visible on the Buyer Agent link once signed, even though its origin is Seller Agent', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'SELLER_AGENT', formCode: 'RPA', documentType: 'general', status: 'signed' }, 'BUYER_AGENT')).toBe(true);
  });

  it('the any-signed-document exception does not widen visibility for non-signed statuses — a Seller-Agent-origin document with any other status stays hidden from Buyer Agent', () => {
    for (const status of ['requested', 'uploaded', 'under_review', 'approved', 'rejected', 'expired', 'superseded']) {
      expect(canExternalUserSeeDocument({ uploadedByType: 'SELLER_AGENT', formCode: 'RPA', documentType: 'general', status }, 'BUYER_AGENT')).toBe(false);
    }
  });

  it('the any-signed-document exception is scoped to the Buyer Agent link only — Seller Agent and Escrow links still follow their own rules for a signed, non-VP/RPA/CDA document', () => {
    expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: 'TDS', documentType: 'general', status: 'signed' }, 'SELLER_AGENT')).toBe(false);
    expect(canExternalUserSeeDocument({ uploadedByType: 'BUYER_AGENT', formCode: 'TDS', documentType: 'general', status: 'signed' }, 'ESCROW')).toBe(false);
  });
});
