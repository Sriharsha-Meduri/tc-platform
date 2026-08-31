import { Injectable } from '@nestjs/common';
import type { FormFieldTemplate } from './field-analysis.types';

/**
 * Coordinate data sourced from @tc/test-pdf-generator where available.
 * Coordinates are in DocuSign absolute positioning (from top-left, in PDF points).
 * An 8.5x11" PDF = 612w x 792h points.
 *
 * Placement priority: Template (test-pdf-generator) > stored mappings > AI detection > manual.
 */
const FORM_TEMPLATES: Record<string, FormFieldTemplate> = {
  RPA: {
    formCode: 'RPA',
    pageCount: 17,
    placements: [
      { label: 'Buyer Signature', description: 'Page 11 — Offer section, Buyer signature line', pageNumber: 11, xPosition: 90, yPosition: 520, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'BLOCKER-RPA-9' },
      { label: 'Buyer Signature Date', description: 'Page 11 — Date next to Buyer signature', pageNumber: 11, xPosition: 360, yPosition: 520, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'BLOCKER-RPA-9' },
      { label: 'Buyer Printed Name', description: 'Page 11 — Printed name below Buyer signature', pageNumber: 11, xPosition: 90, yPosition: 560, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'buyer', complianceCode: 'BLOCKER-RPA-9' },
      { label: 'Seller Signature', description: 'Page 16 — Seller Acceptance, Seller 1 signature line', pageNumber: 16, xPosition: 118, yPosition: 144, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-RPA-18' },
      { label: 'Seller 2 Signature', description: 'Page 16 — Seller Acceptance, Seller 2 signature line', pageNumber: 16, xPosition: 119, yPosition: 110, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-RPA-18' },
      { label: 'Seller Signature Date', description: 'Page 16 — Date next to Seller 1 signature', pageNumber: 16, xPosition: 443, yPosition: 144, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-RPA-19' },
      { label: 'Seller 2 Signature Date', description: 'Page 16 — Date next to Seller 2 signature', pageNumber: 16, xPosition: 444, yPosition: 110, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-RPA-19' },
      { label: 'Seller Printed Name', description: 'Page 16 — Printed name below Seller 1 signature', pageNumber: 16, xPosition: 180, yPosition: 132, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'seller', complianceCode: 'WARN-RPA-18' },
      { label: 'Seller 2 Printed Name', description: 'Page 16 — Printed name below Seller 2 signature', pageNumber: 16, xPosition: 182, yPosition: 100, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'seller', complianceCode: 'WARN-RPA-18' },
      { label: 'Buyer 1 Signature (Acceptance)', description: 'Page 16 — Seller Acceptance, Buyer 1 signature line', pageNumber: 16, xPosition: 121, yPosition: 511, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'BLOCKER-RPA-9' },
      { label: 'Buyer 2 Signature (Acceptance)', description: 'Page 16 — Seller Acceptance, Buyer 2 signature line', pageNumber: 16, xPosition: 117, yPosition: 478, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'BLOCKER-RPA-9' },
      { label: 'Buyer 1 Signature Date (Acceptance)', description: 'Page 16 — Date next to Buyer 1 signature (Acceptance)', pageNumber: 16, xPosition: 442, yPosition: 512, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-RPA-19' },
      { label: 'Buyer 2 Signature Date (Acceptance)', description: 'Page 16 — Date next to Buyer 2 signature (Acceptance)', pageNumber: 16, xPosition: 440, yPosition: 477, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-RPA-19' },
      { label: 'Buyer 1 Printed Name (Acceptance)', description: 'Page 16 — Printed name below Buyer 1 signature', pageNumber: 16, xPosition: 174, yPosition: 500, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'buyer', complianceCode: 'BLOCKER-RPA-9' },
      { label: 'Buyer 2 Printed Name (Acceptance)', description: 'Page 16 — Printed name below Buyer 2 signature', pageNumber: 16, xPosition: 176, yPosition: 468, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'buyer', complianceCode: 'BLOCKER-RPA-9' },
      { label: 'Buyer Initials — Page 1', description: 'Page 1 — Buyer initials line', pageNumber: 1, xPosition: 299, yPosition: 68, width: 80, height: 24, docuSignTabType: 'initialHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-RPA-10' },
      { label: 'Seller Initials — Page 1', description: 'Page 1 — Seller initials line', pageNumber: 1, xPosition: 450, yPosition: 68, width: 80, height: 24, docuSignTabType: 'initialHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-RPA-11' },
    ],
  },
  SCO: {
    formCode: 'SCO', pageCount: 2, placements: [
      { label: 'Offeror Signature', description: 'Page 1 — Section 4, Offeror signature line', pageNumber: 1, xPosition: 70, yPosition: 560, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35006' },
      { label: 'Offeror Signature Date', description: 'Page 1 — Date next to Offeror signature', pageNumber: 1, xPosition: 340, yPosition: 560, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35007' },
      { label: 'Offeror Printed Name', description: 'Page 1 — Printed name next to Offeror signature', pageNumber: 1, xPosition: 70, yPosition: 600, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35004' },
      { label: 'Acceptor Signature', description: 'Page 2 — Section 5, Acceptor signature line', pageNumber: 2, xPosition: 70, yPosition: 340, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35005' },
      { label: 'Acceptor Signature Date', description: 'Page 2 — Date next to Acceptor signature', pageNumber: 2, xPosition: 340, yPosition: 340, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35007' },
      { label: 'Acceptor Printed Name', description: 'Page 2 — Printed name next to Acceptor signature', pageNumber: 2, xPosition: 70, yPosition: 380, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35004' },
    ],
  },
  BCO: {
    formCode: 'BCO', pageCount: 1, placements: [
      { label: 'Offeror Signature', description: 'Page 1 — Section 4, Offeror signature line', pageNumber: 1, xPosition: 70, yPosition: 560, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35006' },
      { label: 'Offeror Signature Date', description: 'Page 1 — Date next to Offeror signature', pageNumber: 1, xPosition: 340, yPosition: 560, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35007' },
      { label: 'Offeror Printed Name', description: 'Page 1 — Printed name next to Offeror signature', pageNumber: 1, xPosition: 70, yPosition: 600, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35004' },
      { label: 'Acceptor Signature', description: 'Page 1 — Section 5, Acceptor signature line', pageNumber: 1, xPosition: 70, yPosition: 700, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35005' },
      { label: 'Acceptor Signature Date', description: 'Page 1 — Date next to Acceptor signature', pageNumber: 1, xPosition: 340, yPosition: 700, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35007' },
      { label: 'Acceptor Printed Name', description: 'Page 1 — Printed name next to Acceptor signature', pageNumber: 1, xPosition: 70, yPosition: 740, width: 200, height: 24, docuSignTabType: 'fullName', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35004' },
    ],
  },
  TDS: {
    formCode: 'TDS', pageCount: 5, placements: [
      { label: 'Seller Signature', description: 'Page 4 — Seller certification, Seller 1 signature line', pageNumber: 4, xPosition: 70, yPosition: 640, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-TDS-10002' },
      { label: 'Seller Signature Date', description: 'Page 4 — Date next to Seller signature', pageNumber: 4, xPosition: 340, yPosition: 640, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-TDS-10003' },
      { label: 'Seller 2 Signature', description: 'Page 4 — Seller certification, Seller 2 signature line', pageNumber: 4, xPosition: 70, yPosition: 704, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-TDS-10002' },
      { label: 'Seller 2 Signature Date', description: 'Page 4 — Date next to Seller 2 signature', pageNumber: 4, xPosition: 340, yPosition: 704, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-TDS-10003' },
    ],
  },
  SPQ: {
    formCode: 'SPQ', pageCount: 4, placements: [
      { label: 'Seller Initials Page 1', description: 'Page 1 — Seller initials at bottom', pageNumber: 1, xPosition: 70, yPosition: 740, width: 80, height: 24, docuSignTabType: 'initialHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SPQ-15002' },
      { label: 'Buyer Initials Page 1', description: 'Page 1 — Buyer initials at bottom', pageNumber: 1, xPosition: 340, yPosition: 740, width: 80, height: 24, docuSignTabType: 'initialHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SPQ-15003' },
      { label: 'Buyer Signature', description: 'Page 4 — Buyer acknowledgment signature line', pageNumber: 4, xPosition: 70, yPosition: 620, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SPQ-15003' },
      { label: 'Buyer Signature Date', description: 'Page 4 — Date next to Buyer signature', pageNumber: 4, xPosition: 340, yPosition: 620, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SPQ-15003' },
    ],
  },
  AD: {
    formCode: 'AD', pageCount: 2, placements: [
      { label: 'Buyer Signature', description: 'Page 2 — Buyer acknowledgment signature line', pageNumber: 2, xPosition: 70, yPosition: 540, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-AD-5002' },
      { label: 'Buyer Signature Date', description: 'Page 2 — Date next to Buyer signature', pageNumber: 2, xPosition: 340, yPosition: 540, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-AD-5003' },
      { label: 'Seller Signature', description: 'Page 2 — Seller acknowledgment signature line', pageNumber: 2, xPosition: 70, yPosition: 670, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-AD-5002' },
      { label: 'Seller Signature Date', description: 'Page 2 — Date next to Seller signature', pageNumber: 2, xPosition: 340, yPosition: 670, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-AD-5003' },
    ],
  },
  AVID: {
    formCode: 'AVID', pageCount: 3, placements: [
      { label: 'Agent Signature', description: 'Page 3 — Listing Agent visual inspection signature', pageNumber: 3, xPosition: 53, yPosition: 380, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller_agent', complianceCode: 'WARN-AVID-25002' },
      { label: 'Agent Signature Date', description: 'Page 3 — Date next to Agent signature', pageNumber: 3, xPosition: 397, yPosition: 380, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller_agent', complianceCode: 'WARN-AVID-25003' },
      { label: 'Buyer Signature', description: 'Page 3 — Buyer acknowledgment signature line', pageNumber: 3, xPosition: 76, yPosition: 271, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-AVID-25004' },
      { label: 'Buyer 2 Signature', description: 'Page 3 — Buyer 2 acknowledgment signature line', pageNumber: 3, xPosition: 74, yPosition: 252, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-AVID-25004' },
      { label: 'Buyer Signature Date', description: 'Page 3 — Date next to Buyer signature', pageNumber: 3, xPosition: 400, yPosition: 271, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-AVID-25004' },
      { label: 'Buyer 2 Signature Date', description: 'Page 3 — Date next to Buyer 2 signature', pageNumber: 3, xPosition: 401, yPosition: 254, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-AVID-25004' },
    ],
  },
  BIA: {
    formCode: 'BIA', pageCount: 2, placements: [
      { label: 'Buyer Initials', description: 'Page 1 — Buyer initials acknowledgment', pageNumber: 1, xPosition: 70, yPosition: 740, width: 80, height: 24, docuSignTabType: 'initialHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-BIA-30002' },
      { label: 'Buyer Signature', description: 'Page 2 — Buyer signature acknowledgment', pageNumber: 2, xPosition: 80, yPosition: 596, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-BIA-30002' },
      { label: 'Buyer 2 Signature', description: 'Page 2 — Buyer 2 signature acknowledgment', pageNumber: 2, xPosition: 77, yPosition: 572, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-BIA-30002' },
      { label: 'Buyer Signature Date', description: 'Page 2 — Date next to Buyer signature', pageNumber: 2, xPosition: 428, yPosition: 596, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-BIA-30003' },
      { label: 'Buyer 2 Signature Date', description: 'Page 2 — Date next to Buyer 2 signature', pageNumber: 2, xPosition: 430, yPosition: 572, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-BIA-30003' },
    ],
  },
  SMCO: {
    formCode: 'SMCO', pageCount: 2, placements: [
      { label: 'Offeror Signature', description: 'Page 1 — Section 4, Offeror signature line', pageNumber: 1, xPosition: 70, yPosition: 560, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35006' },
      { label: 'Offeror Signature Date', description: 'Page 1 — Date next to Offeror signature', pageNumber: 1, xPosition: 340, yPosition: 560, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-SCO-35007' },
    ],
  },
  BMCO: {
    formCode: 'BMCO', pageCount: 1, placements: [
      { label: 'Offeror Signature', description: 'Page 1 — Section 4, Offeror signature line', pageNumber: 1, xPosition: 70, yPosition: 560, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35006' },
      { label: 'Offeror Signature Date', description: 'Page 1 — Date next to Offeror signature', pageNumber: 1, xPosition: 340, yPosition: 560, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'buyer', complianceCode: 'WARN-SCO-35007' },
    ],
  },
  NHD: {
    formCode: 'NHD', pageCount: 4, placements: [
      { label: 'Seller Signature', description: 'Page 4 — Seller certification signature line', pageNumber: 4, xPosition: 70, yPosition: 600, width: 200, height: 32, docuSignTabType: 'signHere', recommendedRecipientRole: 'seller', complianceCode: 'WARN-NHD-20002' },
      { label: 'Seller Signature Date', description: 'Page 4 — Date next to Seller signature', pageNumber: 4, xPosition: 340, yPosition: 600, width: 120, height: 24, docuSignTabType: 'dateSigned', recommendedRecipientRole: 'seller', complianceCode: 'WARN-NHD-20003' },
    ],
  },
};

@Injectable()
export class TemplateCoordinatesService {
  /**
   * Get the template for a given form code (case-insensitive).
   * Handles aliases: BCO/SMCO → SCO, BMCO → BCO.
   */
  getTemplate(formCode: string): FormFieldTemplate | null {
    const code = formCode.toUpperCase();
    if (code in FORM_TEMPLATES) return FORM_TEMPLATES[code];

    if (code === 'BCO' || code === 'SMCO') return FORM_TEMPLATES.SCO;
    if (code === 'BMCO') return FORM_TEMPLATES.BCO;

    return null;
  }
}

export function getFormTemplate(formCode: string): FormFieldTemplate | null {
  const service = new TemplateCoordinatesService();
  return service.getTemplate(formCode);
}
