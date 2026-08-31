import { FORM_FOOTER_FIELDS, FORM_FOOTER_INSTRUCTION } from '../form-definition';
import type { FormDefinition } from '../form-definition';

const QS_TEMPLATE = {
  header: {
    ...FORM_FOOTER_FIELDS,
    agreement_date: "<date: YYYY-MM-DD | null>",
    property_address: "<string | null>",
    buyer_name: "<string | null>",
    seller_name: "<string | null>",
  },
  qualified_substitute_information: {
    "qualified_substitute_name": "<string | null>"
  },
  transferors_affidavit: {
    "transferors_are_all_transferors_for_transaction": "<boolean>",
    "transferor_full_names": [
      "<string>"
    ]
  },
  declaration: {
    "qualified_substitute_name_declaration": "<string | null>",
    "qualified_substitute_signatory_title": "<string | null>",
    "qualified_substitute_signature_date": "<date: YYYY-MM-DD | null>"
  },
  acknowledgement_of_receipt: {
    "buyer_1_signature_date": "<date: YYYY-MM-DD | null>",
    "buyer_2_signature_date": "<date: YYYY-MM-DD | null>"
  },
  extractionWarnings: [
    "<string>"
  ],
};

export const qsStandardV0625: FormDefinition = {
  formCode: 'QS',
  formName: 'QUALIFIED SUBSTITUTE DECLARATION OF POSSESSION OF TRANSFEROR\'S AFFIDAVIT OF NONFOREIGN STATUS',
  variant: 'standard',
  version: 'v06-25',

  systemPrompt: `You are an expert California real estate transaction coordinator.
This is the California Association of REALTORS® Qualified Substitute Declaration of Possession of Transferor's Affidavit of Nonforeign Status form. It is a one-page document completed by a qualified substitute (like an escrow company or attorney) to declare that they possess the Transferor's Affidavit of Nonforeign Status required by IRS regulations.

${FORM_FOOTER_INSTRUCTION}

CRITICAL GUIDELINES:
1. Extract the agreement date, property address, and buyer/seller names from the header section.
2. For the 'qualified_substitute_name' field in Section 1, capture the name of the entity (escrow company, title company, attorney, or buyer's broker) acting as the qualified substitute.
3. In Section 2.A, the 'transferors_are_all_transferors_for_transaction' field should be 'true' if 'are' is checked, and 'false' if 'are not' is checked. This checkbox implicitly indicates whether the listed Transferor(s) constitute all Transferors for the transaction.
4. Extract all full names listed in Section 2.B under 'TRANSFEROR(S) FULL NAME(S)' into the 'transferor_full_names' array.
5. For Section 3, capture the name of the Qualified Substitute (the entity, not a personal signature), the signatory's title, and the date of declaration.
6. In the 'acknowledgement_of_receipt' section, capture up to two buyer signature dates. If only one buyer signs, the second date will be null.

EXPECTED OUTPUT FORMAT:
Return ONLY valid JSON matching this template exactly. No markdown, no explanation.

${JSON.stringify(QS_TEMPLATE, null, 2)}`,

  userPrompt: 'Extract all fields from this QUALIFIED SUBSTITUTE DECLARATION OF POSSESSION OF TRANSFEROR\'S AFFIDAVIT OF NONFOREIGN STATUS and return valid JSON matching the template. Output ONLY valid JSON.',
};
