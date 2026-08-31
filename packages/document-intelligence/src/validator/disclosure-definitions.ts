/**
 * Disclosure Definitions — LLM validation prompts using shared execution module
 *
 * Each definition generates a prompt from DisclosureExecutionConfig + schema
 * to produce DisclosureExecutionExtraction JSON for the shared validator.
 */

import {
  createDisclosureExecutionPrompt,
  type DisclosureExecutionConfig,
  type DisclosureExecutionExtraction,
} from './disclosure-execution-validator';
import { BHIA_CONFIG, BIA_CONFIG, WFA_CONFIG, FHDA_CONFIG, AVID_CONFIG, CCPA_CONFIG } from './disclosure-configs';

export interface DisclosureDefinition {
  formType: string;
  config: DisclosureExecutionConfig;
  prompt: string;
  parseResponse(raw: unknown): DisclosureExecutionExtraction;
}

function parseExecutionExtraction(raw: unknown): DisclosureExecutionExtraction {
  const data = raw as Record<string, unknown>;
  const pages = Array.isArray(data['pages']) ? data['pages'] : [];

  return {
    formType: String(data['formType'] ?? ''),
    formTitle: (data['formTitle'] as string | null) ?? null,
    formRevision: (data['formRevision'] as string | null) ?? null,
    isCorrectForm: Boolean(data['isCorrectForm']),
    pages: pages.map((page: unknown, idx: number) => {
      const p = page as Record<string, unknown>;
      const buyer = (p['buyer'] ?? {}) as Record<string, unknown>;
      const seller = (p['seller'] ?? {}) as Record<string, unknown>;
      return {
        pageNumber: (p['pageNumber'] as number) ?? idx + 1,
        detectedPageLabel: (p['detectedPageLabel'] as string | null) ?? null,
        isCorrectPage: Boolean(p['isCorrectPage']),
        buyer: parsePartyExecution(buyer),
        seller: parsePartyExecution(seller),
      };
    }),
  };
}

function parsePartyExecution(raw: Record<string, unknown>): {
  signatures: Array<{
    slotNumber: number;
    markPresent: boolean;
    markText: string | null;
    markType: 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
    datePresent: boolean | null;
    date: string | null;
    dateReadable: boolean | null;
  }>;
  initials: Array<{
    slotNumber: number;
    markPresent: boolean;
    markText: string | null;
    markType: 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable';
    datePresent: null;
    date: null;
    dateReadable: null;
  }>;
} {
  const sigs = Array.isArray(raw['signatures']) ? raw['signatures'] : [];
  const inits = Array.isArray(raw['initials']) ? raw['initials'] : [];

  return {
    signatures: sigs.map((s: unknown, idx: number) => {
      const slot = s as Record<string, unknown>;
      return {
        slotNumber: (slot['slotNumber'] as number) ?? idx + 1,
        markPresent: Boolean(slot['markPresent']),
        markText: (slot['markText'] as string | null) ?? null,
        markType: (slot['markType'] as 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable') ?? 'blank',
        datePresent: slot['datePresent'] != null ? Boolean(slot['datePresent']) : null,
        date: (slot['date'] as string | null) ?? null,
        dateReadable: slot['dateReadable'] != null ? Boolean(slot['dateReadable']) : null,
      };
    }),
    initials: inits.map((s: unknown, idx: number) => {
      const slot = s as Record<string, unknown>;
      return {
        slotNumber: (slot['slotNumber'] as number) ?? idx + 1,
        markPresent: Boolean(slot['markPresent']),
        markText: (slot['markText'] as string | null) ?? null,
        markType: (slot['markType'] as 'handwritten' | 'electronic' | 'typed_text' | 'blank' | 'unreadable') ?? 'blank',
        datePresent: null,
        date: null,
        dateReadable: null,
      };
    }),
  };
}

function createDefinition(config: DisclosureExecutionConfig): DisclosureDefinition {
  return {
    formType: config.formType,
    config,
    prompt: createDisclosureExecutionPrompt(config),
    parseResponse: parseExecutionExtraction,
  };
}

export const BHIA_DEFINITION = createDefinition(BHIA_CONFIG);
export const BIA_DEFINITION = createDefinition(BIA_CONFIG);
export const WFA_DEFINITION = createDefinition(WFA_CONFIG);
export const FHDA_DEFINITION = createDefinition(FHDA_CONFIG);
export const AVID_DEFINITION = createDefinition(AVID_CONFIG);

export const CCPA_DEFINITION: DisclosureDefinition = {
  ...createDefinition(CCPA_CONFIG),
  prompt: `
Validate only the one-page C.A.R. California Consumer Privacy Act Advisory,
Disclosure and Notice, Form CCPA.

The form contains two generic signature fields labeled:

"Buyer/Seller/Landlord/Tenant"

Map those fields as follows:

- First generic signature field:
  buyer.signatures slot 1

- Second generic signature field:
  buyer.signatures slot 2

- Return seller.signatures as an empty array.
- Return Buyer and Seller initials arrays as empty because CCPA has no initials.
- Pair each signature with the Date field on the same horizontal line.
- Do not infer whether the signer is a Buyer, Seller, Landlord, or Tenant.
- Do not use footer names, brokerage information, or electronic-envelope
  metadata as signatures.

Return valid JSON matching the execution schema exactly.
  `.trim(),
};

export const DISCLOSURE_DEFINITIONS: DisclosureDefinition[] = [
  BHIA_DEFINITION,
  BIA_DEFINITION,
  WFA_DEFINITION,
  FHDA_DEFINITION,
  AVID_DEFINITION,
  CCPA_DEFINITION,
];

export function getDisclosureDefinition(formType: string): DisclosureDefinition | undefined {
  return DISCLOSURE_DEFINITIONS.find((def) => def.formType === formType.toUpperCase());
}
