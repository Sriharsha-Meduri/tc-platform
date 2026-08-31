import type { AcroFieldInfo } from '../validator/validator.types';
import type {
  ExtractionResult,
  ExtractionProperty,
  ExtractionTransaction,
  ExtractionParties,
  ExtractionContractTerms,
  ExtractionForm,
  ExtractionSignatures,
  ExtractionConfidenceSummary,
} from '../extractor/extractor.types';
import type { AcroFormExtractionResult } from './acroform-extractor';

function findFields(fields: AcroFieldInfo[], ...tokens: string[]): AcroFieldInfo[] {
  const patterns = tokens.map((t) => new RegExp(t.replace(/_/g, '[_\\s]?'), 'i'));
  return fields.filter((f) => patterns.some((p) => p.test(f.name)));
}

function textValue(fields: AcroFieldInfo[], ...tokens: string[]): string | null {
  const match = findFields(fields, ...tokens).find(
    (f) => !f.isEmpty && typeof f.value === 'string',
  );
  if (!match) return null;
  const val = (match.value as string).trim();
  return val || null;
}

function numValue(fields: AcroFieldInfo[], ...tokens: string[]): number | null {
  const raw = textValue(fields, ...tokens);
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

function sigSigned(acroFields: AcroFieldInfo[], ...tokens: string[]): boolean {
  return findFields(acroFields, ...tokens).some((f) => f.type === 'signature' && f.isSigned);
}

export class AcroFormMapper {
  map(acro: AcroFormExtractionResult): ExtractionResult {
    const f = acro.fields;

    const streetAddress  = textValue(f, 'property_address', 'street_address', 'property_street', 'subject_property');
    const city           = textValue(f, 'property_city', 'city');
    const state          = textValue(f, 'property_state', 'state');
    const postalCode     = textValue(f, 'zip', 'postal_code', 'property_zip');
    const county         = textValue(f, 'county');
    const apn            = textValue(f, 'apn', 'assessors_parcel');
    const mlsNumber      = textValue(f, 'mls', 'mls_number', 'mls_no');
    const legalDesc      = textValue(f, 'legal_description', 'legal_desc');

    const purchasePrice      = numValue(f, 'purchase_price', 'offer_price', 'sales_price');
    const earnestMoneyAmount = numValue(f, 'earnest_money', 'initial_deposit', 'deposit_amount');
    const loanAmount         = numValue(f, 'loan_amount', 'new_loan', 'first_loan');
    const financingType      = textValue(f, 'financing_type', 'loan_type', 'type_of_financing');
    const occupancyType      = textValue(f, 'occupancy', 'occupancy_type', 'intended_occupancy');
    const offerDate          = textValue(f, 'offer_date', 'date_of_offer');
    const acceptanceDate     = textValue(f, 'acceptance_date', 'accepted_date');
    const closingDate        = textValue(f, 'close_escrow', 'closing_date', 'coe_date', 'close_of_escrow');
    const possessionDate     = textValue(f, 'possession_date', 'possession');

    const buyerName  = textValue(f, 'buyer_name', 'buyer1_name', 'buyers_name', 'buyer_printed');
    const buyerEmail = textValue(f, 'buyer_email', 'buyer1_email');
    const buyerPhone = textValue(f, 'buyer_phone', 'buyer1_phone');
    const buyerSig   = sigSigned(f, 'buyer_sig', 'buyer_signature', 'buyer1_sig')
                    || acro.signatureFields.some((s) => /buyer/i.test(s.name) && s.isSigned);

    const sellerName  = textValue(f, 'seller_name', 'seller1_name', 'sellers_name', 'seller_printed');
    const sellerEmail = textValue(f, 'seller_email', 'seller1_email');
    const sellerPhone = textValue(f, 'seller_phone', 'seller1_phone');
    const sellerSig   = sigSigned(f, 'seller_sig', 'seller_signature', 'seller1_sig')
                     || acro.signatureFields.some((s) => /seller/i.test(s.name) && s.isSigned);

    const buyerAgentName    = textValue(f, 'buyer_agent_name', 'selling_agent_name', 'buyers_agent_name', 'selling_agent_printed');
    const buyerAgentEmail   = textValue(f, 'buyer_agent_email', 'selling_agent_email');
    const buyerAgentPhone   = textValue(f, 'buyer_agent_phone', 'selling_agent_phone');
    const buyerAgentLicense = textValue(f, 'buyer_agent_license', 'selling_agent_license', 'buyer_broker_license');
    const buyerAgentCompany = textValue(f, 'buyer_broker_name', 'selling_broker', 'buyers_brokerage');

    const listingAgentName    = textValue(f, 'listing_agent_name', 'listing_agent_printed', 'sellers_agent_name');
    const listingAgentEmail   = textValue(f, 'listing_agent_email', 'sellers_agent_email');
    const listingAgentPhone   = textValue(f, 'listing_agent_phone', 'sellers_agent_phone');
    const listingAgentLicense = textValue(f, 'listing_agent_license', 'sellers_agent_license', 'listing_broker_license');
    const listingAgentCompany = textValue(f, 'listing_broker_name', 'listing_brokerage', 'sellers_brokerage');

    const escrowName    = textValue(f, 'escrow_company', 'escrow_holder', 'title_company');
    const escrowOfficer = textValue(f, 'escrow_officer', 'title_officer');
    const escrowEmail   = textValue(f, 'escrow_email', 'title_email');
    const escrowPhone   = textValue(f, 'escrow_phone', 'title_phone');
    const lenderName    = textValue(f, 'lender_name', 'lender', 'mortgage_company', 'loan_company');
    const lenderPhone   = textValue(f, 'lender_phone');

    const inspectionDays = numValue(f, 'inspection_days', 'inspection_contingency', 'inspection_period');
    const loanDays       = numValue(f, 'loan_contingency_days', 'loan_days', 'financing_days');
    const appraisalDays  = numValue(f, 'appraisal_contingency', 'appraisal_days', 'appraisal_period');
    const disclosureDays = numValue(f, 'disclosure_days', 'disclosures_due', 'seller_disclosure_days');

    const signedParties: string[]     = [];
    const missingSignatures: string[] = [];
    if (buyerSig)  signedParties.push(buyerName ?? 'Buyer');
    else           missingSignatures.push(buyerName ?? 'Buyer');
    if (sellerSig) signedParties.push(sellerName ?? 'Seller');
    else           missingSignatures.push(sellerName ?? 'Seller');

    const fillRate = acro.fieldCount > 0
      ? f.filter((fld) => !fld.isEmpty).length / acro.fieldCount
      : 0;
    const overall = Math.round((0.70 + fillRate * 0.25) * 100) / 100;

    const property: ExtractionProperty = {
      streetAddress, city, state, postalCode, county, apn, mlsNumber, legalDescription: legalDesc,
    };

    const transaction: ExtractionTransaction = {
      purchasePrice, earnestMoneyAmount, loanAmount, financingType, occupancyType,
      offerDate, acceptanceDate, closingDate, possessionDate,
    };

    const parties: ExtractionParties = {
      buyers: (buyerName || buyerEmail)
        ? [{ fullName: buyerName, email: buyerEmail, phone: buyerPhone, mailingAddress: null, signaturePresent: buyerSig, confidence: 0.95 }]
        : [],
      sellers: (sellerName || sellerEmail)
        ? [{ fullName: sellerName, email: sellerEmail, phone: sellerPhone, mailingAddress: null, signaturePresent: sellerSig, confidence: 0.95 }]
        : [],
      buyerAgents: buyerAgentName
        ? [{ fullName: buyerAgentName, email: buyerAgentEmail, phone: buyerAgentPhone, licenseNumber: buyerAgentLicense, companyName: buyerAgentCompany, confidence: 0.95 }]
        : [],
      listingAgents: listingAgentName
        ? [{ fullName: listingAgentName, email: listingAgentEmail, phone: listingAgentPhone, licenseNumber: listingAgentLicense, companyName: listingAgentCompany, confidence: 0.95 }]
        : [],
      brokers: [],
      escrowCompanies: escrowName
        ? [{ companyName: escrowName, contactName: escrowOfficer, email: escrowEmail, phone: escrowPhone, confidence: 0.90 }]
        : [],
      lenders: lenderName
        ? [{ companyName: lenderName, contactName: null, email: null, phone: lenderPhone, confidence: 0.88 }]
        : [],
      attorneys: [],
      otherParties: [],
    };

    const contractTerms: ExtractionContractTerms = {
      inspectionContingencyDays: inspectionDays,
      loanContingencyDays:       loanDays,
      loanContingencyWaived:     false,
      appraisalContingencyDays:  appraisalDays,
      appraisalContingencyWaived: false,
      disclosuresDueDays:        disclosureDays,
      // Not currently mapped from AcroForm field names — falls back to "Not specified"
      // downstream rather than guessing a PDF field name that may not exist.
      initialDepositBusinessDays: null,
      otherDeadlines:            [],
      otherTermsText:            null,
    };

    const formsAndDisclosures: ExtractionForm[] = [
      { title: 'Residential Purchase Agreement', formCode: 'RPA', status: 'attached', confidence: 0.99 },
    ];

    const signatures: ExtractionSignatures = {
      buyerSigned: buyerSig, sellerSigned: sellerSig, signedParties, missingSignatures,
      missingSignatureDates: [],
    };

    const confidenceSummary: ExtractionConfidenceSummary = {
      overall,
      property:            streetAddress ? 0.95 : 0.50,
      transaction:         purchasePrice ? 0.95 : 0.50,
      parties:             (buyerName || sellerName) ? 0.95 : 0.50,
      formsAndDisclosures: 0.99,
    };

    return {
      documentType: acro.formTitle ?? 'Residential Purchase Agreement',
      documentSubtypes: ['Purchase Agreement'],
      sourceLanguage: 'en',
      property,
      transaction,
      parties,
      contractTerms,
      formsAndDisclosures,
      signatures,
      extractionWarnings: [],
      confidenceSummary,
    };
  }
}
