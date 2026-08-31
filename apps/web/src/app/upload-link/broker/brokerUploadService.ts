import { getTransactionInfo, saveTransactionInfo, SaveTransactionInfoResult } from '../shared/uploadLinkApi';
import type { TransactionInfoDto } from '../shared/uploadLinkTypes';

export interface BrokerInfoFormFields {
  brokerPaymentAddress: string;
  brokerCommissionType: 'percentage' | 'flat_amount' | '';
  brokerCommissionValue: string;
}

/** Shapes the Broker's own commission-split fields into the shared transaction-info save payload. */
export function buildBrokerInfoPayload(fields: BrokerInfoFormFields): Record<string, unknown> {
  return {
    broker: {
      brokerPaymentAddress: fields.brokerPaymentAddress.trim() || null,
      brokerCommissionType: fields.brokerCommissionType || null,
      brokerCommissionValue: fields.brokerCommissionValue.trim() ? Number(fields.brokerCommissionValue) : null,
    },
  };
}

export function loadBrokerTransactionInfo(token: string): Promise<TransactionInfoDto> {
  return getTransactionInfo(token);
}

export function saveBrokerInfo(token: string, fields: BrokerInfoFormFields): Promise<SaveTransactionInfoResult> {
  return saveTransactionInfo(token, buildBrokerInfoPayload(fields));
}
