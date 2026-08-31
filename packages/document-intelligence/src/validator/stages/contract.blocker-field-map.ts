import type { FieldAttribution } from '../validator.types';

/**
 * Maps each signature/initials/execution blocker code in
 * contract.blocker-catalog.ts to the field(s) it gates — cross-referenced
 * by hand against that catalog's `message`/`category`/page references.
 *
 * This is purely descriptive metadata for UI/debug attribution. It is never
 * consulted by extraction, and a blocker's presence here must never be used
 * to alter an extracted field's value — see final-terms.ts's
 * `attachValidation` doc comment for the read-only join this feeds.
 */
export const BLOCKER_FIELD_ATTRIBUTIONS: Record<string, FieldAttribution[]> = {
  BLOCKER_BUYER_SIGNATURE: [
    { fieldKey: 'signatures.buyerSigned', page: 16, formCode: 'RPA' },
  ],
  WARN_SELLER_SIGNATURE: [
    { fieldKey: 'signatures.sellerSigned', page: 16, formCode: 'RPA' },
  ],
  BLOCKER_SELLER_SIGNATURE: [
    { fieldKey: 'signatures.sellerSigned', page: 16, formCode: 'RPA' },
  ],
  BLOCKER_BUYER_SIGNATURE_DATE: [
    { fieldKey: 'signatures.buyerSignedDate', page: 16, formCode: 'RPA' },
  ],
  BLOCKER_SELLER_SIGNATURE_DATE: [
    { fieldKey: 'signatures.sellerSignedDate', page: 16, formCode: 'RPA' },
  ],
  BLOCKER_INITIAL_BUYER_LD: [
    { fieldKey: 'initials.liquidatedDamagesBuyer', page: 15, formCode: 'RPA' },
  ],
  BLOCKER_INITIAL_SELLER_LD: [
    { fieldKey: 'initials.liquidatedDamagesSeller', page: 15, formCode: 'RPA' },
  ],
  BLOCKER_INITIAL_BUYER_AR: [
    { fieldKey: 'initials.arbitrationBuyer', page: 15, formCode: 'RPA' },
  ],
  BLOCKER_INITIAL_SELLER_AR: [
    { fieldKey: 'initials.arbitrationSeller', page: 15, formCode: 'RPA' },
  ],
  BLOCKER_RPA_BUYER_INITIALS_MISSING: [
    { fieldKey: 'initials.buyerFooterInitials', formCode: 'RPA' },
  ],
  BLOCKER_RPA_SELLER_INITIALS_MISSING: [
    { fieldKey: 'initials.sellerFooterInitials', formCode: 'RPA' },
  ],
  // Shared warning codes — the offeror/acceptor role flips by form (seller
  // offers on SCO/SMCO, buyer offers on BCO/BMCO) but the code is the same.
  WARN_SCO_OFFEROR_SIGNATURE: [
    { fieldKey: 'signatures.offerorSigned', page: 1 },
  ],
  WARN_SCO_ACCEPTOR_SIGNATURE: [
    { fieldKey: 'signatures.acceptorSigned', page: 2 },
  ],
  WARN_SIGNATURE_MISSING: [
    { fieldKey: 'signatures.sellerSigned', page: 16, formCode: 'RPA' },
  ],
  WARN_SIGNATURE_DATE_MISSING: [
    { fieldKey: 'signatures.sellerSignedDate', page: 16, formCode: 'RPA' },
  ],
};

/**
 * Field attributions for a blocker/warning code, or an empty array when the
 * code has no known field-level attribution (e.g. a document-level or
 * revision blocker that doesn't gate any one extracted field).
 */
export function attributionsFor(code: string): FieldAttribution[] {
  return BLOCKER_FIELD_ATTRIBUTIONS[code] ?? [];
}
