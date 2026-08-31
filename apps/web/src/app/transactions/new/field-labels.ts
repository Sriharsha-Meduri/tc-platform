const FIELD_LABELS: Record<string, string> = {
  'transaction.purchasePrice': 'Purchase price',
  'transaction.offerDate': 'Offer date',
  'transaction.acceptanceDate': 'Acceptance date',
  'transaction.closingDate': 'Closing date',
  'transaction.earnestMoneyAmount': 'Earnest money',
  'transaction.loanAmount': 'Loan amount',
  'transaction.financingType': 'Financing type',
  'property.streetAddress': 'Property address',
  'property.city': 'Property city',
  'property.state': 'Property state',
  'property.postalCode': 'Property zip code',
  'property.apn': 'Assessor parcel number',
  'parties.buyers': 'Buyer name(s)',
  'parties.sellers': 'Seller name(s)',
  'parties.buyerAgents': 'Buyer agent',
  'parties.listingAgents': 'Listing agent',
  'parties.escrowCompanies': 'Escrow company',
  'signatures.buyerSigned': 'Buyer signature',
  'signatures.sellerSigned': 'Seller signature',
  'formsAndDisclosures': 'Attached forms',
  'seller_acceptance.accepted_subject_to_counter_offer': 'Counter-offer status',
  'contractTerms.inspectionContingencyDays': 'Inspection contingency',
  'contractTerms.loanContingencyDays': 'Loan contingency',
  'contractTerms.appraisalContingencyDays': 'Appraisal contingency',
  'contractTerms.disclosuresDueDays': 'Disclosures due',
  'confirmation.buyer_agent': 'Buyer agent confirmation',
  'confirmation.listing_agent': 'Listing agent confirmation',
  'items_inspected.visible_defects_noted': 'Inspection defects',
  'buyer_acknowledgement.buyer_initials': 'Buyer initials (BIA)',
  'header.property_address': 'Property address',
  'parties.buyer_names': 'Buyer name(s)',
  'parties.seller_names': 'Seller name(s)',
  'offer_reference.referenced_form_code': 'Offer reference',
  'expiration.expiration_date': 'Expiration date',
  'section_4_offer.offeror_1_signature_date': 'Offeror 1 signature date',
  'section_4_offer.offeror_2_signature_date': 'Offeror 2 signature date',
  'section_5_acceptance.acceptor_1_signature_date': 'Acceptor 1 signature date',
  'section_5_acceptance.acceptor_2_signature_date': 'Acceptor 2 signature date',
};

export function formatFieldLabel(raw: string): string {
  const cleaned = raw.replace(/\[.*?\]/g, '');
  return FIELD_LABELS[cleaned] ?? cleaned;
}

export function renderFields(fields: string[]): string {
  return fields.map((f) => formatFieldLabel(f)).join(', ');
}
