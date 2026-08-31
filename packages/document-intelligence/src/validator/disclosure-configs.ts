/**
 * Disclosure Execution Configs
 *
 * Per-form configuration defining which Buyer/Seller execution fields
 * (signatures, dates, initials) are required for each disclosure form.
 */

import type { DisclosureExecutionConfig, RoleExecutionRule } from './disclosure-execution-validator';

// ─── Shared rule presets ──────────────────────────────────────────────────────

const NONE: RoleExecutionRule = {
  slots: 0,
  signatures: 'not_present',
  signatureDates: 'not_present',
  initials: 'not_present',
};

const SIGNATURE_AND_DATE: RoleExecutionRule = {
  slots: 2,
  signatures: 'required',
  signatureDates: 'required',
  initials: 'not_present',
};

const INITIALS_ONLY: RoleExecutionRule = {
  slots: 2,
  signatures: 'not_present',
  signatureDates: 'not_present',
  initials: 'required',
};

// ─── Per-form configs ─────────────────────────────────────────────────────────

export const BHIA_CONFIG: DisclosureExecutionConfig = {
  formType: 'BHIA',
  formTitle: "BUYER HOMEOWNERS' INSURANCE ADVISORY",
  expectedPageCount: 1,
  pages: [
    {
      pageNumber: 1,
      expectedPageLabel: 'BHIA PAGE 1 OF 1',
      buyer: SIGNATURE_AND_DATE,
      seller: NONE,
    },
  ],
};

export const BIA_CONFIG: DisclosureExecutionConfig = {
  formType: 'BIA',
  formTitle: "BUYER'S INVESTIGATION ADVISORY",
  expectedPageCount: 2,
  pages: [
    {
      pageNumber: 1,
      expectedPageLabel: 'BIA PAGE 1 OF 2',
      buyer: NONE,
      seller: NONE,
    },
    {
      pageNumber: 2,
      expectedPageLabel: 'BIA PAGE 2 OF 2',
      buyer: SIGNATURE_AND_DATE,
      seller: NONE,
    },
  ],
};

export const FHDA_CONFIG: DisclosureExecutionConfig = {
  formType: 'FHDA',
  formTitle: 'FAIR HOUSING AND DISCRIMINATION ADVISORY',
  expectedPageCount: 2,
  pages: [
    {
      pageNumber: 1,
      expectedPageLabel: 'FHDA PAGE 1 OF 2',
      buyer: NONE,
      seller: NONE,
    },
    {
      pageNumber: 2,
      expectedPageLabel: 'FHDA PAGE 2 OF 2',
      buyer: SIGNATURE_AND_DATE,
      seller: SIGNATURE_AND_DATE,
    },
  ],
};

export const WFA_CONFIG: DisclosureExecutionConfig = {
  formType: 'WFA',
  formTitle: 'WIRE FRAUD AND ELECTRONIC FUNDS TRANSFER ADVISORY',
  expectedPageCount: 1,
  pages: [
    {
      pageNumber: 1,
      expectedPageLabel: 'WFA PAGE 1 OF 1',
      buyer: SIGNATURE_AND_DATE,
      seller: SIGNATURE_AND_DATE,
    },
  ],
};

/**
 * CCPA contains two generic:
 *
 *   Buyer/Seller/Landlord/Tenant + Date
 *
 * signature lines.
 *
 * The shared execution validator currently supports buyer and seller channels.
 * For CCPA, the buyer channel is intentionally used as the generic
 * acknowledging-party channel.
 *
 * validateCcpaExtraction() maps expectedSigners to expectedBuyers.
 * The seller channel must remain NONE to avoid requiring four signatures.
 */
export const CCPA_CONFIG: DisclosureExecutionConfig = {
  formType: 'CCPA',
  formTitle: 'CALIFORNIA CONSUMER PRIVACY ACT ADVISORY, DISCLOSURE AND NOTICE',
  expectedPageCount: 1,
  pages: [
    {
      pageNumber: 1,
      expectedPageLabel: 'CCPA PAGE 1 OF 1',
      buyer: SIGNATURE_AND_DATE,
      seller: NONE,
    },
  ],
};

export const AVID_CONFIG: DisclosureExecutionConfig = {
  formType: 'AVID',
  formTitle: 'AGENT VISUAL INSPECTION DISCLOSURE',
  expectedPageCount: 3,
  pages: [
    {
      pageNumber: 1,
      expectedPageLabel: 'AVID PAGE 1 OF 3',
      buyer: INITIALS_ONLY,
      seller: NONE,
    },
    {
      pageNumber: 2,
      expectedPageLabel: 'AVID PAGE 2 OF 3',
      buyer: INITIALS_ONLY,
      seller: NONE,
    },
    {
      pageNumber: 3,
      expectedPageLabel: 'AVID PAGE 3 OF 3',
      buyer: SIGNATURE_AND_DATE,
      seller: {
        slots: 2,
        signatures: 'not_present',
        signatureDates: 'not_present',
        initials: 'optional',
      },
    },
  ],
};
