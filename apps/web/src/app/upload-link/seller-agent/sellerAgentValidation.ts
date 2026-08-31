import { isValidEmailLocal } from '../shared/validation.util';

export interface SellerAgentInfoErrors {
  escrowEmailError: string | null;
}

export function validateSellerAgentInfo(escrowEmail: string): SellerAgentInfoErrors {
  return {
    escrowEmailError: escrowEmail.trim() && !isValidEmailLocal(escrowEmail) ? 'Enter a valid email address.' : null,
  };
}

export function hasSellerAgentValidationError(errors: SellerAgentInfoErrors): boolean {
  return !!errors.escrowEmailError;
}
