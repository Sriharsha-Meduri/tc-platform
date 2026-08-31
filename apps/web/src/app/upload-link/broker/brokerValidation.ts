import { isValidCurrencyAmount } from '../shared/validation.util';

export interface BrokerInfoFields {
  brokerCommissionType: 'percentage' | 'flat_amount' | '';
  brokerCommissionValue: string;
}

export interface BrokerInfoErrors {
  brokerCommissionValueError: string | null;
}

export function validateBrokerInfo(fields: BrokerInfoFields): BrokerInfoErrors {
  let brokerCommissionValueError: string | null = null;
  if (fields.brokerCommissionValue.trim()) {
    if (!isValidCurrencyAmount(fields.brokerCommissionValue)) {
      brokerCommissionValueError = 'Enter a valid amount (e.g. 0, 500, or 500.00).';
    } else if (fields.brokerCommissionType === 'percentage' && Number(fields.brokerCommissionValue) > 100) {
      brokerCommissionValueError = 'Commission percentage cannot exceed 100.';
    }
  }

  return { brokerCommissionValueError };
}

export function hasBrokerValidationError(errors: BrokerInfoErrors): boolean {
  return !!errors.brokerCommissionValueError;
}
