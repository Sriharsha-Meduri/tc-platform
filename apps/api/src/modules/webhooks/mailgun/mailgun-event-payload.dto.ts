/**
 * Mailgun Event Webhook Payload
 *
 * Mailgun POSTs JSON to the /webhooks/email/events endpoint with
 * the following structure for delivery, open, click, failed, etc. events.
 *
 * Unlike the inbound webhook (flat form-fields), this is pure JSON.
 */

export interface MailgunEventSignature {
  timestamp: string;
  token: string;
  signature: string;
}

export interface MailgunEventMessageHeaders {
  'message-id': string;
}

export interface MailgunEventMessage {
  headers: MailgunEventMessageHeaders;
}

export interface MailgunEventClientInfo {
  'client-os'?: string;
  'client-type'?: string;
  'device-type'?: string;
}

export interface MailgunEventDeliveryStatus {
  message?: string;
  code?: string;
  description?: string;
}

export type MailgunEventType =
  | 'accepted'
  | 'rejected'
  | 'delivered'
  | 'failed'
  | 'opened'
  | 'clicked'
  | 'unsubscribed'
  | 'complained'
  | 'stored';

export interface MailgunEventData {
  event: MailgunEventType;
  timestamp: number;
  id: string;
  message: MailgunEventMessage;
  recipient: string;
  'user-variables'?: Record<string, unknown>;
  severity?: 'temporary' | 'permanent';
  reason?: string;
  'delivery-status'?: MailgunEventDeliveryStatus;
  ip?: string;
  'client-info'?: MailgunEventClientInfo;
  url?: string;
}

export interface MailgunEventWebhookBody {
  signature: MailgunEventSignature;
  'event-data': MailgunEventData;
}
