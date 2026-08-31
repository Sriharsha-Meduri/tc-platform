import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailgunService {
  private readonly logger = new Logger(MailgunService.name);

  /**
   * Sends a transactional email via Mailgun.
   *
   * @param to    Recipient(s) — a real Mailgun To header, so every recipient's
   *              copy shows every other To recipient that was addressed.
   * @param from  Optional From address override. When provided (e.g. for transaction
   *              emails), use the transaction's outboundEmailAddress so that replies
   *              are routed back to the correct transaction thread. Falls back to the
   *              default noreply address when omitted.
   * @param cc    Optional Cc recipient(s) — a real Mailgun Cc header, so every
   *              recipient's copy shows who else was addressed (not a duplicate send).
   * @param inReplyTo Optional Message-Id of an earlier email this one is a reply to.
   *              Sets both the In-Reply-To and References headers to that id, so mail
   *              clients (and this app's own inbound-webhook thread matching, which
   *              looks up messages by In-Reply-To) thread this send under the original.
   */
  async sendEmail(to: string | string[], subject: string, html: string, text: string, from?: string, cc?: string | string[], inReplyTo?: string): Promise<{ messageId: string } | null> {
    const apiKey    = process.env.MAILGUN_API_KEY;
    const domain    = process.env.MAILGUN_DOMAIN;
    const fromEmail = process.env.MAILGUN_FROM_EMAIL ?? `noreply@${domain}`;
    const baseUrl   = process.env.MAILGUN_API_URL ?? 'https://api.mailgun.net';
    const toValue   = Array.isArray(to) ? to.join(',') : to;

    if (!apiKey || !domain) {
      this.logger.warn('MAILGUN_API_KEY or MAILGUN_DOMAIN not set — skipping email');
      this.logger.log(`Would have sent to ${toValue}${cc ? ` (cc: ${Array.isArray(cc) ? cc.join(', ') : cc})` : ''}: ${subject}`);
      return null;
    }

    const body = new URLSearchParams({ from: from ?? `TC Platform <${fromEmail}>`, to: toValue, subject, html, text });
    if (cc) body.set('cc', Array.isArray(cc) ? cc.join(',') : cc);
    if (inReplyTo) {
      body.set('h:In-Reply-To', inReplyTo);
      body.set('h:References', inReplyTo);
    }
    const response = await fetch(`${baseUrl}/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Mailgun error ${response.status}: ${detail}`);
      throw new Error('Failed to send email');
    }

    const result = await response.json() as { id?: string; message?: string };
    const messageId = result?.id ?? null;
    this.logger.log(`Email sent to ${toValue}: ${subject} — Mailgun ID: ${messageId}`);
    return messageId ? { messageId } : null;
  }

  async sendVerificationEmail(to: string, firstName: string, verificationUrl: string): Promise<void> {
    const apiKey    = process.env.MAILGUN_API_KEY;
    const domain    = process.env.MAILGUN_DOMAIN;
    const fromEmail = process.env.MAILGUN_FROM_EMAIL ?? `noreply@${domain}`;
    const baseUrl   = process.env.MAILGUN_API_URL ?? 'https://api.mailgun.net';

    if (!apiKey || !domain) {
      this.logger.warn('MAILGUN_API_KEY or MAILGUN_DOMAIN not set — skipping verification email');
      this.logger.log(`Verification URL for ${to}: ${verificationUrl}`);
      return;
    }

    const body = new URLSearchParams({
      from:    `TC Platform <${fromEmail}>`,
      to,
      subject: 'Verify your TC Platform account',
      html:    this.buildEmailHtml(firstName, verificationUrl),
      text:    `Hi ${firstName},\n\nVerify your account by visiting:\n${verificationUrl}\n\nThis link expires in 24 hours.`,
    });

    const response = await fetch(`${baseUrl}/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Mailgun error ${response.status}: ${text}`);
      throw new Error('Failed to send verification email');
    }

    this.logger.log(`Verification email sent to ${to}`);
  }

  async sendInviteEmail(to: string, inviteUrl: string, organizationName: string): Promise<void> {
    const apiKey    = process.env.MAILGUN_API_KEY;
    const domain    = process.env.MAILGUN_DOMAIN;
    const fromEmail = process.env.MAILGUN_FROM_EMAIL ?? `noreply@${domain}`;
    const baseUrl   = process.env.MAILGUN_API_URL ?? 'https://api.mailgun.net';

    if (!apiKey || !domain) {
      this.logger.warn('MAILGUN_API_KEY or MAILGUN_DOMAIN not set — skipping invite email');
      this.logger.log(`Invite URL for ${to}: ${inviteUrl}`);
      return;
    }

    const body = new URLSearchParams({
      from:    `TC Platform <${fromEmail}>`,
      to,
      subject: `You've been invited to join ${organizationName} on TC Platform`,
      html:    this.buildInviteHtml(organizationName, inviteUrl),
      text:    `You've been invited to join ${organizationName} on TC Platform.\n\nClick the link below to set up your account:\n${inviteUrl}\n\nThis link expires in 7 days.`,
    });

    const response = await fetch(`${baseUrl}/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Mailgun error ${response.status}: ${text}`);
      throw new Error('Failed to send invite email');
    }

    this.logger.log(`Invite email sent to ${to} for ${organizationName}`);
  }

  private buildInviteHtml(organizationName: string, inviteUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#1d4ed8;color:#fff;font-size:22px;font-weight:700;padding:12px 20px;border-radius:10px;">TC</div>
    </div>
    <h2 style="color:#111827;margin:0 0 8px;">You're Invited!</h2>
    <p style="color:#6b7280;margin:0 0 24px;">You've been invited to join <strong>${organizationName}</strong> on TC Platform. Click the button below to set up your account.</p>
    <a href="${inviteUrl}"
       style="display:block;text-align:center;background:#1d4ed8;color:#fff;font-weight:600;padding:14px 24px;border-radius:8px;text-decoration:none;font-size:15px;">
      Accept Invitation
    </a>
    <p style="color:#9ca3af;font-size:13px;margin:24px 0 0;text-align:center;">This link expires in 7 days. If you were not expecting this invite, ignore this email.</p>
  </div>
</body>
</html>`;
  }

  private buildEmailHtml(firstName: string, verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#1d4ed8;color:#fff;font-size:22px;font-weight:700;padding:12px 20px;border-radius:10px;">TC</div>
    </div>
    <h2 style="color:#111827;margin:0 0 8px;">Welcome, ${firstName}!</h2>
    <p style="color:#6b7280;margin:0 0 24px;">Thanks for signing up for TC Platform. Please verify your email address to activate your account.</p>
    <a href="${verificationUrl}"
       style="display:block;text-align:center;background:#1d4ed8;color:#fff;font-weight:600;padding:14px 24px;border-radius:8px;text-decoration:none;font-size:15px;">
      Verify my account
    </a>
    <p style="color:#9ca3af;font-size:13px;margin:24px 0 0;text-align:center;">This link expires in 24 hours. If you did not sign up, ignore this email.</p>
  </div>
</body>
</html>`;
  }
}
