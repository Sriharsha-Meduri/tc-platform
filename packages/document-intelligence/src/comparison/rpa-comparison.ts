import type {
  FieldChange,
  FormComparisonResult,
  RpaMaterialDifferenceConfig,
  ChangeSeverity,
} from './comparison.types';
import { DEFAULT_RPA_MATERIAL_CONFIG } from './comparison.types';

interface RpaExtractionData {
  header?: {
    property_address?: string | null;
    assessor_parcel_number?: string | null;
    city?: string | null;
    county?: string | null;
    zip_code?: string | null;
  };
  parties?: {
    buyer_names?: string[];
    seller_names?: string[];
  };
  terms_of_purchase?: {
    purchase_price?: number | null;
    close_of_escrow_days?: number | null;
    close_of_escrow_date?: string | null;
    initial_deposit_amount?: number | null;
    loan_amount_1?: number | null;
    is_all_cash?: boolean;
  };
  contingencies_and_time_periods?: {
    loan_contingency_days?: number | null;
    appraisal_contingency_days?: number | null;
    investigation_of_property_days?: number | null;
    review_seller_documents_days?: number | null;
    preliminary_title_report_days?: number | null;
  };
  seller_acceptance?: {
    accepted_subject_to_counter_offer?: boolean;
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

function compareNumbers(
  path: string,
  label: string,
  oldVal: number | null | undefined,
  newVal: number | null | undefined,
  config: RpaMaterialDifferenceConfig,
  thresholdKey: keyof RpaMaterialDifferenceConfig,
): FieldChange | null {
  const o = oldVal ?? 0;
  const n = newVal ?? 0;
  if (o === n) return null;
  const threshold = config[thresholdKey];
  const severity = Math.abs(o - n) >= threshold ? 'material' : 'minor';
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

export function compareRpaExtractions(
  oldData: RpaExtractionData,
  newData: RpaExtractionData,
  config: RpaMaterialDifferenceConfig = DEFAULT_RPA_MATERIAL_CONFIG,
): FormComparisonResult {
  const changes: FieldChange[] = [];

  const ch = compareStrings('header.property_address', 'Property Address', oldData.header?.property_address, newData.header?.property_address);
  if (ch) changes.push(ch);

  const chA = compareStrings('header.assessor_parcel_number', 'APN', oldData.header?.assessor_parcel_number, newData.header?.assessor_parcel_number);
  if (chA) changes.push(chA);

  const chCity = compareStrings('header.city', 'City', oldData.header?.city, newData.header?.city);
  if (chCity) changes.push(chCity);

  const chCounty = compareStrings('header.county', 'County', oldData.header?.county, newData.header?.county);
  if (chCounty) changes.push(chCounty);

  const chBuyers = compareStringArrays('parties.buyer_names', 'Buyer Names', oldData.parties?.buyer_names, newData.parties?.buyer_names);
  if (chBuyers) changes.push(chBuyers);

  const chSellers = compareStringArrays('parties.seller_names', 'Seller Names', oldData.parties?.seller_names, newData.parties?.seller_names);
  if (chSellers) changes.push(chSellers);

  const chPrice = compareNumbers('terms_of_purchase.purchase_price', 'Purchase Price', oldData.terms_of_purchase?.purchase_price, newData.terms_of_purchase?.purchase_price, config, 'purchasePriceThreshold');
  if (chPrice) changes.push(chPrice);

  const chCOEDays = compareNumbers('terms_of_purchase.close_of_escrow_days', 'Close of Escrow Days', oldData.terms_of_purchase?.close_of_escrow_days, newData.terms_of_purchase?.close_of_escrow_days, config, 'closeOfEscrowDayThreshold');
  if (chCOEDays) changes.push(chCOEDays);

  const chCOEDate = compareStrings('terms_of_purchase.close_of_escrow_date', 'Close of Escrow Date', oldData.terms_of_purchase?.close_of_escrow_date, newData.terms_of_purchase?.close_of_escrow_date);
  if (chCOEDate) changes.push(chCOEDate);

  const chDeposit = compareNumbers('terms_of_purchase.initial_deposit_amount', 'Initial Deposit', oldData.terms_of_purchase?.initial_deposit_amount, newData.terms_of_purchase?.initial_deposit_amount, config, 'purchasePriceThreshold');
  if (chDeposit) changes.push(chDeposit);

  const chLoan1 = compareNumbers('terms_of_purchase.loan_amount_1', 'Loan Amount', oldData.terms_of_purchase?.loan_amount_1, newData.terms_of_purchase?.loan_amount_1, config, 'purchasePriceThreshold');
  if (chLoan1) changes.push(chLoan1);

  const chAllCash = compareBooleans('terms_of_purchase.is_all_cash', 'All Cash Offer', oldData.terms_of_purchase?.is_all_cash, newData.terms_of_purchase?.is_all_cash);
  if (chAllCash) changes.push(chAllCash);

  const chLoanContingency = compareNumbers('contingencies_and_time_periods.loan_contingency_days', 'Loan Contingency Days', oldData.contingencies_and_time_periods?.loan_contingency_days, newData.contingencies_and_time_periods?.loan_contingency_days, config, 'contingencyDayThreshold');
  if (chLoanContingency) changes.push(chLoanContingency);

  const chApprContingency = compareNumbers('contingencies_and_time_periods.appraisal_contingency_days', 'Appraisal Contingency Days', oldData.contingencies_and_time_periods?.appraisal_contingency_days, newData.contingencies_and_time_periods?.appraisal_contingency_days, config, 'contingencyDayThreshold');
  if (chApprContingency) changes.push(chApprContingency);

  const chInvestContingency = compareNumbers('contingencies_and_time_periods.investigation_of_property_days', 'Investigation Contingency Days', oldData.contingencies_and_time_periods?.investigation_of_property_days, newData.contingencies_and_time_periods?.investigation_of_property_days, config, 'contingencyDayThreshold');
  if (chInvestContingency) changes.push(chInvestContingency);

  const chCounterOffer = compareBooleans('seller_acceptance.accepted_subject_to_counter_offer', 'Subject to Counter Offer', oldData.seller_acceptance?.accepted_subject_to_counter_offer, newData.seller_acceptance?.accepted_subject_to_counter_offer);
  if (chCounterOffer) changes.push(chCounterOffer);

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
