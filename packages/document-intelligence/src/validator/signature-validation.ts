/**
 * Configuration-driven signature validation for disclosure documents.
 *
 * Each disclosure form defines which signature fields are required. The
 * validator checks each field and produces individual pass/fail
 * ComplianceCheck entries plus BLOCKER issues for missing signatures.
 *
 * To add a new disclosure form, add an entry to DISCLOSURE_SIGNATURE_CONFIG.
 */

import type { ComplianceCheck, RuleIssue, RuleResult, ValidationUploadSource } from '../validator/validator.types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignatureFieldRequirement {
  /** Paths to check for a boolean "is signed" value. Any one being true = signed. */
  signedPaths: string[];
  /** Optional path to a date string field. If defined, the date must be non-empty. */
  datePath?: string;
  /** Human-readable label, e.g. "Seller signature", "Buyer signature date". */
  label: string;
  /** Issue code emitted when this signature is missing (must be in the blocker catalog). */
  blockerCode: string;
  /** Page reference, e.g. "Page 2 or Page 3". */
  page?: string;
  /** Section reference, e.g. "Signature section". */
  section?: string;
  /**
   * Which party this requirement belongs to, when the form has a real
   * buyer/seller split — left undefined for forms where the signer isn't a
   * transaction-side buyer or seller (SCO/BCO's offeror/acceptor, CCPA's
   * generic acknowledging parties). Undefined requirements are never
   * excluded, regardless of uploadSource — suppression only ever targets an
   * explicit 'buyer' entry.
   */
  role?: 'buyer' | 'seller';
}

// ── Helper to resolve nested paths ────────────────────────────────────────────

function resolvePath(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Per-disclosure signature configuration ─────────────────────────────────────

/**
 * Maps disclosure form codes → their required signature fields.
 *
 * `signedPaths` supports OR semantics: if ANY path resolves to `true`, the
 * signature is considered present (handles forms with multiple signature
 * locations, e.g. TDS seller can sign on page 2 or page 3).
 *
 * `datePath` is checked independently — a missing date is a separate blocker
 * even if the signature itself is present.
 */
export const DISCLOSURE_SIGNATURE_CONFIG: Record<string, SignatureFieldRequirement[]> = {
  // ── Transfer Disclosure Statement (TDS) ──────────────────────────────────
  TDS: [
    {
      signedPaths: ['signatures.seller_signature_page_2', 'signatures.seller_signature_page_3'],
      datePath: 'signatures.seller_signature_page_2_date',
      label: 'Seller signature',
      blockerCode: 'BLOCKER_TDS_SELLER_SIG',
      page: 'Page 2 or Page 3',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.seller_signature_page_2_date', 'signatures.seller_signature_page_3_date'],
      label: 'Seller signature date',
      blockerCode: 'BLOCKER_TDS_SELLER_DATE',
      page: 'Page 2 or Page 3',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.buyer_signature'],
      datePath: 'signatures.buyer_signature_date',
      label: 'Buyer signature',
      blockerCode: 'BLOCKER_TDS_BUYER_SIG',
      page: 'Page 3',
      section: 'Signature section',
      role: 'buyer',
    },
    {
      signedPaths: ['signatures.buyer_signature_date'],
      label: 'Buyer signature date',
      blockerCode: 'BLOCKER_TDS_BUYER_DATE',
      page: 'Page 3',
      section: 'Signature section',
      role: 'buyer',
    },
  ],

  // ── Seller Property Questionnaire (SPQ) ──────────────────────────────────
  SPQ: [
    {
      signedPaths: ['signatures.seller_signature_1', 'signatures.seller_signature_2'],
      datePath: 'signatures.seller_date_1',
      label: 'Seller signature',
      blockerCode: 'BLOCKER_SPQ_SELLER_SIG',
      page: 'Page 4',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.seller_date_1', 'signatures.seller_date_2'],
      label: 'Seller signature date',
      blockerCode: 'BLOCKER_SPQ_SELLER_DATE',
      page: 'Page 4',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.buyer_signature_1', 'signatures.buyer_signature_2'],
      datePath: 'signatures.buyer_date_1',
      label: 'Buyer signature',
      blockerCode: 'BLOCKER_SPQ_BUYER_SIG',
      page: 'Page 4',
      section: 'Signature section',
      role: 'buyer',
    },
    {
      signedPaths: ['signatures.buyer_date_1', 'signatures.buyer_date_2'],
      label: 'Buyer signature date',
      blockerCode: 'BLOCKER_SPQ_BUYER_DATE',
      page: 'Page 4',
      section: 'Signature section',
      role: 'buyer',
    },
  ],

  // ── Natural Hazard Disclosure (NHD) ──────────────────────────────────────
  NHD: [
    {
      signedPaths: ['signatures.seller_signature', 'seller_acknowledgment.signed', 'seller_acknowledgment.acknowledged'],
      datePath: 'signatures.seller_signature_date',
      label: 'Seller signature',
      blockerCode: 'BLOCKER_NHD_SELLER_SIG',
      page: 'Page 1',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.seller_signature_date', 'seller_acknowledgment.date'],
      label: 'Seller signature date',
      blockerCode: 'BLOCKER_NHD_SELLER_DATE',
      page: 'Page 1',
      section: 'Signature section',
      role: 'seller',
    },
  ],

  // ── Agent Visual Inspection Disclosure (AVID) ────────────────────────────
  AVID: [
    {
      // The inspecting broker/agent's own signature — the seller-side
      // execution requirement on this form (Civil Code §2079 visual
      // inspection duty), never suppressed for a Seller Agent upload.
      signedPaths: ['signatures.agent_signed'],
      datePath: 'signatures.agent_signature_date',
      label: 'Agent signature',
      blockerCode: 'BLOCKER_AVID_AGENT_SIG',
      page: 'Page 1',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.agent_signature_date'],
      label: 'Agent signature date',
      blockerCode: 'BLOCKER_AVID_AGENT_DATE',
      page: 'Page 1',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.buyer_signed', 'signatures.buyer_acknowledged'],
      datePath: 'signatures.buyer_signature_date',
      label: 'Buyer signature',
      blockerCode: 'BLOCKER_AVID_BUYER_SIG',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
    {
      signedPaths: ['signatures.buyer_signature_date'],
      label: 'Buyer signature date',
      blockerCode: 'BLOCKER_AVID_BUYER_DATE',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
  ],

  // ── Agency Disclosure (AD) ───────────────────────────────────────────────
  // AD is an agent-to-client disclosure; no buyer/seller signature required.

  // ── Buyer's Inspection Advisory (BIA) ────────────────────────────────────
  BIA: [
    {
      signedPaths: ['buyer_acknowledgement.buyer_1_signed', 'buyer_acknowledgement.buyer_signed'],
      datePath: 'buyer_acknowledgement.buyer_1_signature_date',
      label: 'Buyer signature',
      blockerCode: 'BLOCKER_BIA_BUYER_SIG',
      page: 'Page 2',
      section: 'Acknowledgment section',
      role: 'buyer',
    },
    {
      signedPaths: ['buyer_acknowledgement.buyer_1_signature_date', 'buyer_acknowledgement.buyer_signature_date'],
      label: 'Buyer signature date',
      blockerCode: 'BLOCKER_BIA_BUYER_DATE',
      page: 'Page 2',
      section: 'Acknowledgment section',
      role: 'buyer',
    },
  ],

  // ── Counter Offer forms (SCO/BCO/SMCO/BMCO) ─────────────────────────────
  SCO: [
    {
      signedPaths: ['section_4_offer.offeror_signature'],
      datePath: 'section_4_offer.offeror_signature_date',
      label: 'Offeror signature',
      blockerCode: 'BLOCKER_SCO_OFFEROR_SIG',
      page: 'Page 1',
      section: 'Section 4 — Offer',
    },
    {
      signedPaths: ['section_5_acceptance.acceptor_signature'],
      datePath: 'section_5_acceptance.acceptor_signature_date',
      label: 'Acceptor signature',
      blockerCode: 'BLOCKER_SCO_ACCEPTOR_SIG',
      page: 'Page 2',
      section: 'Section 5 — Acceptance',
    },
  ],
  BCO: [
    {
      signedPaths: ['section_4_offer.offeror_signature'],
      datePath: 'section_4_offer.offeror_signature_date',
      label: 'Offeror signature',
      blockerCode: 'BLOCKER_BCO_OFFEROR_SIG',
      page: 'Page 1',
      section: 'Section 4 — Offer',
    },
    {
      signedPaths: ['section_5_acceptance.acceptor_signature'],
      datePath: 'section_5_acceptance.acceptor_signature_date',
      label: 'Acceptor signature',
      blockerCode: 'BLOCKER_BCO_ACCEPTOR_SIG',
      page: 'Page 1',
      section: 'Section 5 — Acceptance',
    },
  ],

  // ── California Consumer Privacy Act Advisory (CCPA) ───────────────────────
  CCPA: [
    {
      signedPaths: [
        'signatures.party_1_signature_present',
        'signatures.party_1_signature',
        'acknowledgements.party_1.signature_present',
      ],
      datePath: 'signatures.party_1_signature_date',
      label: 'Acknowledging party 1 signature',
      blockerCode: 'BLOCKER_CCPA_PARTY_1_SIGNATURE_MISSING',
      page: 'Page 1',
    },
    {
      signedPaths: [
        'signatures.party_2_signature_present',
        'signatures.party_2_signature',
        'acknowledgements.party_2.signature_present',
      ],
      datePath: 'signatures.party_2_signature_date',
      label: 'Acknowledging party 2 signature',
      blockerCode: 'BLOCKER_CCPA_PARTY_2_SIGNATURE_MISSING',
      page: 'Page 1',
    },
  ],

  // ── Request for Repair (RR) ────────────────────────────────────────────────
  RR: [
    {
      signedPaths: ['signatures.buyer_signature_1'],
      datePath: 'signatures.buyer_signature_1_date',
      label: 'Buyer signature',
      blockerCode: 'BLOCKER_RR_BUYER_SIG',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
    {
      signedPaths: ['signatures.buyer_signature_1_date'],
      label: 'Buyer signature date',
      blockerCode: 'BLOCKER_RR_BUYER_DATE',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
  ],

  // ── Seller's Response to Buyer's Request for Repair (RRRR) ─────────────────
  RRRR: [
    {
      signedPaths: ['signatures.seller_signature_1'],
      datePath: 'signatures.seller_signature_1_date',
      label: 'Seller signature',
      blockerCode: 'BLOCKER_RRRR_SELLER_SIG',
      page: 'Page 1',
      section: 'Signature section',
      role: 'seller',
    },
    {
      signedPaths: ['signatures.seller_signature_1_date'],
      label: 'Seller signature date',
      blockerCode: 'BLOCKER_RRRR_SELLER_DATE',
      page: 'Page 1',
      section: 'Signature section',
      role: 'seller',
    },
  ],

  // ── Contingency Removal (Buyer) (CR-B) ──────────────────────────────────────
  'CR-B': [
    {
      signedPaths: ['signatures.buyer_signature_1'],
      datePath: 'signatures.buyer_signature_1_date',
      label: 'Buyer signature',
      blockerCode: 'BLOCKER_CRB_BUYER_SIG',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
    {
      signedPaths: ['signatures.buyer_signature_1_date'],
      label: 'Buyer signature date',
      blockerCode: 'BLOCKER_CRB_BUYER_DATE',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
  ],

  // ── Verification of Property Condition (VP) ─────────────────────────────────
  VP: [
    {
      signedPaths: ['signatures.buyer_signature_1'],
      datePath: 'signatures.buyer_signature_1_date',
      label: 'Buyer signature',
      blockerCode: 'BLOCKER_VP_BUYER_SIG',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
    {
      signedPaths: ['signatures.buyer_signature_1_date'],
      label: 'Buyer signature date',
      blockerCode: 'BLOCKER_VP_BUYER_DATE',
      page: 'Page 1',
      section: 'Signature section',
      role: 'buyer',
    },
  ],
};

// ── Validation function ───────────────────────────────────────────────────────

function buildLocation(req: SignatureFieldRequirement): string | undefined {
  if (req.page && req.section) return `${req.page} — ${req.section}`;
  if (req.page) return req.page;
  if (req.section) return req.section;
  return undefined;
}

/**
 * Run signature validation for a single disclosure form against its config.
 *
 * Returns:
 *  - `ComplianceCheck[]` for every field checked (pass or fail)
 *  - `RuleIssue[]` for missing signatures (BLOCKER codes)
 *
 * Forms not in the config produce empty results (graceful no-op).
 */
export function validateDisclosureSignaturesPerForm(
  formCode: string,
  data: Record<string, unknown>,
  uploadSource?: ValidationUploadSource,
): RuleResult {
  const config = DISCLOSURE_SIGNATURE_CONFIG[formCode.toUpperCase()];
  if (!config || config.length === 0) {
    return { issues: [], checks: [] };
  }

  const issues: RuleIssue[] = [];
  const checks: ComplianceCheck[] = [];
  const code = formCode.toUpperCase();

  for (const req of config) {
    // A document uploaded through the Seller Agent Upload Link only carries
    // the seller's own execution — a buyer-role requirement is skipped
    // entirely rather than validated and then discarded, so it never appears
    // in checks/issues at all for this upload.
    if (uploadSource === 'seller_agent' && req.role === 'buyer') continue;

    const location = buildLocation(req);
    const sigLabel = `${req.label}${location ? ` (${location})` : ''}`;

    // ── Check signature presence (OR across signedPaths) ──
    const isSigned = req.signedPaths.some((p) => {
      const val = resolvePath(data, p);
      return val === true || (typeof val === 'string' && val.length > 0);
    });

    if (isSigned) {
      checks.push({
        ruleId: `sig_${code.toLowerCase()}_${req.label.toLowerCase().replace(/\s+/g, '_')}`,
        category: 'signatures',
        formCode: code,
        phase: 'disclosure',
        severity: 'info',
        status: 'pass',
        label: `${sigLabel} — present`,
        fields: req.signedPaths,
        ...(location ? { location } : {}),
      });
    } else {
      checks.push({
        ruleId: `sig_${code.toLowerCase()}_${req.label.toLowerCase().replace(/\s+/g, '_')}`,
        category: 'signatures',
        formCode: code,
        phase: 'disclosure',
        severity: 'error',
        status: 'fail',
        label: `${sigLabel} — missing`,
        fields: req.signedPaths,
        ...(location ? { location } : {}),
      });
      issues.push({ code: req.blockerCode, fields: req.signedPaths, location });
    }

    // ── Check date presence (independent of signature check) ──
    if (req.datePath) {
      const dateValue = resolvePath(data, req.datePath);
      const hasDate = dateValue != null && dateValue !== '';
      const dateLabel = `${req.label} date${location ? ` (${location})` : ''}`;

      if (hasDate) {
        checks.push({
          ruleId: `sig_${code.toLowerCase()}_${req.label.toLowerCase().replace(/\s+/g, '_')}_date`,
          category: 'signatures',
          formCode: code,
          phase: 'disclosure',
          severity: 'info',
          status: 'pass',
          label: `${dateLabel} — present`,
          fields: [req.datePath],
          ...(location ? { location } : {}),
        });
      } else {
        checks.push({
          ruleId: `sig_${code.toLowerCase()}_${req.label.toLowerCase().replace(/\s+/g, '_')}_date`,
          category: 'signatures',
          formCode: code,
          phase: 'disclosure',
          severity: 'error',
          status: 'fail',
          label: `${dateLabel} — missing`,
          fields: [req.datePath],
          ...(location ? { location } : {}),
        });
        issues.push({ code: req.blockerCode.replace('_SIG', '_DATE').replace('_sig', '_date'), fields: [req.datePath], location });
      }
    }
  }

  return { issues, checks };
}
