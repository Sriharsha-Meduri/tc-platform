/**
 * Disclosure form catalog — the single source of truth for which disclosure
 * forms appear in the Disclosure Details section.
 *
 * `required` reflects the legal requirement under California law:
 *   true        = legally required (missing = blocker)
 *   false       = optional / advisory (missing = not flagged)
 *   'conditional' = required only when specific circumstances apply
 *
 * When a transaction has an assigned form template, the template's
 * `isRequired` per-item value takes precedence over this catalog default.
 */

export interface DisclosureCatalogEntry {
  formCode: string;
  formName: string;
  required: boolean | 'conditional';
  /** Display order (lower = higher in the list) */
  sortOrder: number;
}

export const DISCLOSURE_CATALOG: DisclosureCatalogEntry[] = [
  // ── Core disclosures (legally required) ───────────────────────────────────
  { formCode: 'TDS',  formName: 'Real Estate Transfer Disclosure Statement', required: true, sortOrder: 100 },
  { formCode: 'SPQ',  formName: 'Seller Property Questionnaire', required: true, sortOrder: 200 },
  { formCode: 'AD',   formName: 'Disclosure Regarding Real Estate Agency Relationship', required: true, sortOrder: 300 },
  { formCode: 'AVID', formName: 'Agent Visual Inspection Disclosure', required: true, sortOrder: 400 },

  // ── AVID variants ────────────────────────────────────────────────────────
  { formCode: 'AVID LA', formName: 'Agent Visual Inspection Disclosure (Listing Agent)', required: true, sortOrder: 410 },
  { formCode: 'AVID SA', formName: 'Agent Visual Inspection Disclosure (Seller Agent)', required: true, sortOrder: 420 },

  // ── Required / conditional ────────────────────────────────────────────────
  { formCode: 'LPD',    formName: 'Lead-Based Paint Disclosure', required: 'conditional', sortOrder: 500 },
  { formCode: 'FRR-PA', formName: 'Federal Reporting Requirement Purchase Addendum', required: 'conditional', sortOrder: 510 },
  { formCode: 'WHSD',   formName: 'Water Heater and Smoke Alarm Statement of Compliance', required: 'conditional', sortOrder: 520 },
  { formCode: 'FHDS',   formName: 'Fire Hardening & Defensible Space Disclosure', required: 'conditional', sortOrder: 530 },

  // ── Advisories (optional) ─────────────────────────────────────────────────
  { formCode: 'BIA',   formName: "Buyer's Investigation Advisory", required: false, sortOrder: 600 },
  { formCode: 'BHIA',  formName: "Buyer Homeowners' Insurance Advisory", required: false, sortOrder: 610 },
  { formCode: 'BHAA',  formName: "Buyer's Homeowners' Association Advisory", required: false, sortOrder: 620 },
  { formCode: 'BCA',   formName: 'Broker Compensation Advisory', required: false, sortOrder: 630 },
  { formCode: 'SBSA',  formName: 'Statewide Buyer and Seller Advisory', required: false, sortOrder: 640 },
  { formCode: 'MCA',   formName: 'Market Conditions Advisory', required: false, sortOrder: 650 },
  { formCode: 'FHDA',  formName: 'Fair Housing and Discrimination Advisory', required: false, sortOrder: 660 },
  { formCode: 'CCPA',  formName: 'California Consumer Privacy Act Advisory', required: false, sortOrder: 670 },
  { formCode: 'WFDA',  formName: 'Wildfire Disaster Advisory', required: false, sortOrder: 680 },
  { formCode: 'WFA',   formName: 'Wire Fraud and Electronic Funds Transfer Advisory', required: false, sortOrder: 690 },
  { formCode: 'SFLS',  formName: 'Square Footage and Lot Size Advisory and Disclosure', required: false, sortOrder: 700 },
  { formCode: 'WCMD',  formName: 'Water-Conserving Plumbing Fixtures and Carbon Monoxide Detector Advisory', required: false, sortOrder: 710 },
  { formCode: 'PRBS',  formName: 'Possible Representation of More Than One Buyer or Seller — Disclosure and Consent', required: false, sortOrder: 720 },
  { formCode: 'AC',    formName: 'Confirmation of Real Estate Agency Relationships', required: false, sortOrder: 730 },
  { formCode: 'DEDA',  formName: 'Designated Electronic Delivery Address Amendment', required: false, sortOrder: 740 },
  { formCode: 'PVOH',  formName: 'Property Visit and Open House Advisory', required: false, sortOrder: 750 },
];

/** Set of all disclosure form codes for quick lookup */
export const DISCLOSURE_FORM_CODES = new Set(DISCLOSURE_CATALOG.map((e) => e.formCode));

/** Map from form code to catalog entry */
const DISCLOSURE_BY_CODE = new Map(DISCLOSURE_CATALOG.map((e) => [e.formCode, e]));

/**
 * Look up a disclosure catalog entry by form code.
 * Handles case-insensitive matching and AVID LA/SA variant matching.
 */
export function getDisclosureEntry(formCode: string): DisclosureCatalogEntry | undefined {
  const upper = formCode.toUpperCase();
  // Direct match
  const direct = DISCLOSURE_BY_CODE.get(upper);
  if (direct) return direct;
  // Case-insensitive scan
  for (const entry of DISCLOSURE_CATALOG) {
    if (entry.formCode.toUpperCase() === upper) return entry;
  }
  return undefined;
}
