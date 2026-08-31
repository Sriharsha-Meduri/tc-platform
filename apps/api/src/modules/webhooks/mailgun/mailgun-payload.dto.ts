/**
 * Fields Mailgun POSTs as multipart/form-data for inbound routed emails.
 * Property names mirror the exact field names Mailgun sends.
 */
export interface MailgunInboundPayload {
  // ── Routing ─────────────────────���────────────────────────────────────────
  recipient: string;        // who the message was addressed to (your route address)
  sender: string;           // SMTP envelope sender
  from: string;             // RFC 2822 From header value

  // ── Content ──────────────────────────────────────────────────────────────
  subject?: string;
  'body-plain'?: string;    // full plain text body
  'body-html'?: string;     // full HTML body
  'stripped-text'?: string; // plain text with quoted reply stripped
  'stripped-html'?: string; // HTML with quoted reply stripped
  'Message-Id'?: string;    // RFC 2822 message ID
  'In-Reply-To'?: string;   // thread reference

  // ── Attachments (multipart files — accessed via req.files, not req.body) ──
  // Mailgun POSTs files as `attachment-1`, `attachment-2`, … Express.Multer.File
  'attachment-count'?: string;  // total count as a string field in the form body

  // ── Signature (used by guard) ─────────────────────────────────────────────
  timestamp: string;        // Unix epoch as string
  token: string;            // random 50-char string
  signature: string;        // HMAC-SHA256(signing_key, timestamp + token)
}
