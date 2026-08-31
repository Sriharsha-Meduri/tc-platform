import { isValidEmailLocal, isValidCurrencyAmount } from '../shared/validation.util';

export interface BuyerAgentInfoFields {
  lenderEmail: string;
  buyerSideBrokerEmail: string;
  clientCredits: string;
  buyerCommissionType: 'percentage' | 'flat_amount' | '';
  buyerCommissionValue: string;
}

export interface BuyerAgentInfoErrors {
  lenderEmailError: string | null;
  buyerSideBrokerEmailError: string | null;
  clientCreditsError: string | null;
  buyerCommissionValueError: string | null;
}

export function validateBuyerAgentInfo(fields: BuyerAgentInfoFields): BuyerAgentInfoErrors {
  let buyerCommissionValueError: string | null = null;
  if (fields.buyerCommissionValue.trim()) {
    if (!isValidCurrencyAmount(fields.buyerCommissionValue)) {
      buyerCommissionValueError = 'Enter a valid amount (e.g. 0, 500, or 500.00).';
    } else if (fields.buyerCommissionType === 'percentage' && Number(fields.buyerCommissionValue) > 100) {
      buyerCommissionValueError = 'Commission percentage cannot exceed 100.';
    }
  }

  return {
    lenderEmailError: fields.lenderEmail.trim() && !isValidEmailLocal(fields.lenderEmail)
      ? 'Enter a valid email address.' : null,
    buyerSideBrokerEmailError: fields.buyerSideBrokerEmail.trim() && !isValidEmailLocal(fields.buyerSideBrokerEmail)
      ? 'Enter a valid broker email address.' : null,
    clientCreditsError: fields.clientCredits.trim() && !isValidCurrencyAmount(fields.clientCredits)
      ? 'Enter a valid amount (e.g. 0, 500, or 500.00).' : null,
    buyerCommissionValueError,
  };
}

export function hasBuyerAgentValidationError(errors: BuyerAgentInfoErrors): boolean {
  return !!(errors.lenderEmailError || errors.buyerSideBrokerEmailError || errors.clientCreditsError || errors.buyerCommissionValueError);
}
