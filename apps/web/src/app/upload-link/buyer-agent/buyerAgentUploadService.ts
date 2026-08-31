import { getTransactionInfo, saveTransactionInfo, SaveTransactionInfoResult } from '../shared/uploadLinkApi';
import type { TransactionInfoDto } from '../shared/uploadLinkTypes';

export interface BuyerAgentInfoFormFields {
  lenderName: string;
  lenderEmail: string;
  buyerSideBrokerageName: string;
  buyerSideBrokerFullName: string;
  buyerSideBrokerEmail: string;
  buyerAgentPaymentAddress: string;
  clientCredits: string;
  buyerCommissionType: 'percentage' | 'flat_amount' | '';
  buyerCommissionValue: string;
}

/** Shapes the Buyer Agent's Lender + "Broker and Commission Information" fields into the shared transaction-info save payload. */
export function buildBuyerAgentInfoPayload(fields: BuyerAgentInfoFormFields): Record<string, unknown> {
  return {
    lender: { lenderName: fields.lenderName.trim() || null, lenderEmail: fields.lenderEmail.trim() || null },
    buyerSide: {
      brokerageName: fields.buyerSideBrokerageName.trim() || null,
      brokerFullName: fields.buyerSideBrokerFullName.trim() || null,
      brokerEmail: fields.buyerSideBrokerEmail.trim() || null,
      buyerAgentPaymentAddress: fields.buyerAgentPaymentAddress.trim() || null,
      clientCredits: fields.clientCredits.trim() ? Number(fields.clientCredits) : null,
      buyerCommissionType: fields.buyerCommissionType || null,
      buyerCommissionValue: fields.buyerCommissionValue.trim() ? Number(fields.buyerCommissionValue) : null,
    },
  };
}

export function loadBuyerAgentTransactionInfo(token: string): Promise<TransactionInfoDto> {
  return getTransactionInfo(token);
}

export function saveBuyerAgentInfo(token: string, fields: BuyerAgentInfoFormFields): Promise<SaveTransactionInfoResult> {
  return saveTransactionInfo(token, buildBuyerAgentInfoPayload(fields));
}
