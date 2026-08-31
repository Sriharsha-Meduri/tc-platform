import type { FieldChange, FormComparisonResult, ChangeSeverity } from './comparison.types';

interface ScoExtractionData {
  header?: {
    property_address?: string | null;
    counter_offer_number?: string | null;
  };
  parties?: {
    buyer_names?: string[];
    seller_names?: string[];
  };
  offer_reference?: {
    referenced_form_code?: string | null;
    referenced_offer_date?: string | null;
    referenced_counter_offer_number?: string | null;
  };
  counter_offer_terms?: {
    other_terms_text?: string | null;
    attached_addenda?: string[];
  };
  expiration?: {
    expiration_date?: string | null;
    expiration_time?: string | null;
  };
  section_4_offer?: {
    offeror_1_signature_date?: string | null;
    offeror_2_signature_date?: string | null;
  };
  section_5_acceptance?: {
    subject_to_attached_counter_offer?: boolean;
    acceptor_1_signature_date?: string | null;
    acceptor_2_signature_date?: string | null;
  };
}

function compareStrings(
  path: string,
  label: string,
  oldVal: string | null | undefined,
  newVal: string | null | undefined,
  severity: ChangeSeverity = 'material',
): FieldChange | null {
  const oldNorm = oldVal?.trim().toLowerCase() ?? '';
  const newNorm = newVal?.trim().toLowerCase() ?? '';
  if (oldNorm === newNorm) return null;
  return { path, oldValue: oldVal, newValue: newVal, severity, label };
}

function compareBooleans(
  path: string,
  label: string,
  oldVal: boolean | undefined,
  newVal: boolean | undefined,
): FieldChange | null {
  if ((oldVal ?? false) === (newVal ?? false)) return null;
  return { path, oldValue: oldVal, newValue: newVal, severity: 'material', label };
}

function compareStringArrays(
  path: string,
  label: string,
  oldVal: string[] | undefined,
  newVal: string[] | undefined,
): FieldChange | null {
  const o = (oldVal ?? []).map(s => s.trim().toLowerCase()).sort();
  const n = (newVal ?? []).map(s => s.trim().toLowerCase()).sort();
  if (o.length === n.length && o.every((v, i) => v === n[i])) return null;
  return { path, oldValue: oldVal, newValue: newVal, severity: 'material', label };
}

export function compareScoExtractions(
  oldData: ScoExtractionData,
  newData: ScoExtractionData,
): FormComparisonResult {
  const changes: FieldChange[] = [];

  const chAddr = compareStrings('header.property_address', 'Property Address', oldData.header?.property_address, newData.header?.property_address);
  if (chAddr) changes.push(chAddr);

  const chNum = compareStrings('header.counter_offer_number', 'Counter Offer Number', oldData.header?.counter_offer_number, newData.header?.counter_offer_number);
  if (chNum) changes.push(chNum);

  const chBuyers = compareStringArrays('parties.buyer_names', 'Buyer Names', oldData.parties?.buyer_names, newData.parties?.buyer_names);
  if (chBuyers) changes.push(chBuyers);

  const chSellers = compareStringArrays('parties.seller_names', 'Seller Names', oldData.parties?.seller_names, newData.parties?.seller_names);
  if (chSellers) changes.push(chSellers);

  const chRefCode = compareStrings('offer_reference.referenced_form_code', 'Referenced Form Code', oldData.offer_reference?.referenced_form_code, newData.offer_reference?.referenced_form_code);
  if (chRefCode) changes.push(chRefCode);

  const chRefDate = compareStrings('offer_reference.referenced_offer_date', 'Referenced Offer Date', oldData.offer_reference?.referenced_offer_date, newData.offer_reference?.referenced_offer_date);
  if (chRefDate) changes.push(chRefDate);

  const chTerms = compareStrings('counter_offer_terms.other_terms_text', 'Counter Offer Terms', oldData.counter_offer_terms?.other_terms_text, newData.counter_offer_terms?.other_terms_text);
  if (chTerms) changes.push(chTerms);

  const chAddenda = compareStringArrays('counter_offer_terms.attached_addenda', 'Attached Addenda', oldData.counter_offer_terms?.attached_addenda, newData.counter_offer_terms?.attached_addenda);
  if (chAddenda) changes.push(chAddenda);

  const chExpDate = compareStrings('expiration.expiration_date', 'Expiration Date', oldData.expiration?.expiration_date, newData.expiration?.expiration_date);
  if (chExpDate) changes.push(chExpDate);

  const chExpTime = compareStrings('expiration.expiration_time', 'Expiration Time', oldData.expiration?.expiration_time, newData.expiration?.expiration_time);
  if (chExpTime) changes.push(chExpTime);

  const chOfferorSig = compareStrings('section_4_offer.offeror_1_signature_date', 'Offeror Signature Date', oldData.section_4_offer?.offeror_1_signature_date, newData.section_4_offer?.offeror_1_signature_date);
  if (chOfferorSig) changes.push(chOfferorSig);

  const chAcceptorSig = compareStrings('section_5_acceptance.acceptor_1_signature_date', 'Acceptor Signature Date', oldData.section_5_acceptance?.acceptor_1_signature_date, newData.section_5_acceptance?.acceptor_1_signature_date);
  if (chAcceptorSig) changes.push(chAcceptorSig);

  const chSubjectTo = compareBooleans('section_5_acceptance.subject_to_attached_counter_offer', 'Subject to Attached Counter Offer', oldData.section_5_acceptance?.subject_to_attached_counter_offer, newData.section_5_acceptance?.subject_to_attached_counter_offer);
  if (chSubjectTo) changes.push(chSubjectTo);

  const materialChanges = changes.filter(c => c.severity === 'material');
  const minorChanges = changes.filter(c => c.severity === 'minor');

  return {
    hasChanges: changes.length > 0,
    hasMaterialChanges: materialChanges.length > 0,
    changes,
    materialChanges,
    minorChanges,
  };
}
