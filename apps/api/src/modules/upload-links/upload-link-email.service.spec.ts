import { UploadLinkEmailService } from './upload-link-email.service';
import { EmailTemplateService } from '../auth/email-template.service';

const SELLER_AGENT_LINK = {
  id: 'link-2',
  transactionId: 'tx-1',
  purpose: 'seller_agent_document_upload',
  emailMessageId: 'mg-welcome-1',
  recipientName: 'Sam Seller Agent',
  recipientEmail: 'sam@listingco.com',
  recipientPartyId: 'party-sa-1',
  ccEmail: 'tina@sunsetrealty.com',
  ccRole: 'seller_transaction_coordinator',
};

const BUYER_AGENT_LINK = {
  id: 'link-1',
  transactionId: 'tx-1',
  purpose: 'document_upload',
  emailMessageId: 'mg-buyer-welcome-1',
  recipientName: 'Alice Agent',
  recipientEmail: 'alice@brokerage.com',
  recipientPartyId: 'party-ba-1',
  ccEmail: null,
  ccRole: null,
};

const ESCROW_LINK = {
  id: 'link-4',
  transactionId: 'tx-1',
  purpose: 'escrow_officer_document_upload',
  emailMessageId: 'mg-escrow-welcome-1',
  recipientName: 'Erin Escrow',
  recipientEmail: 'erin@escrowco.com',
  recipientPartyId: null,
  ccEmail: null,
  ccRole: null,
};

function buildService(overrides: { sendEmailImpl?: (...args: unknown[]) => Promise<{ messageId: string } | null> } = {}) {
  const uploadLinkRepo = { recordEmailSent: jest.fn().mockResolvedValue(undefined) };
  const mailgunService = {
    sendEmail: jest.fn(overrides.sendEmailImpl ?? (async () => ({ messageId: 'mg-reply-1' }))),
  };
  const emailTemplateService = { render: jest.fn((name: string, ctx: Record<string, unknown>) => `<rendered:${name}:${JSON.stringify(ctx)}>`) };
  const messagesRepo = {
    create: jest.fn((data: Record<string, unknown>) => data),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UploadLinkEmailService(
    uploadLinkRepo as never,
    mailgunService as never,
    emailTemplateService as never,
    messagesRepo as never,
  );

  return { service, uploadLinkRepo, mailgunService, emailTemplateService, messagesRepo };
}

const CTX = { tcName: 'Carla Creator', transactionEmail: 'txn-abc123@txn.mytcapp.net', tcPhone: '555-0200', transactionId: 'tx-1', propertyAddress: '123 Main St, Chino, CA', outboundEmailAddress: null };
const REJECTED = [{ fileName: 'unsigned.pdf', reasons: ['Missing buyer signature on page 3.'] }];

describe('UploadLinkEmailService.sendSellerAgentRejectionEmail', () => {
  it('replies in the same thread — In-Reply-To/References set to the original welcome email\'s message id', async () => {
    const { service, mailgunService } = buildService();
    await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    const call = mailgunService.sendEmail.mock.calls[0];
    expect(call[6]).toBe('mg-welcome-1'); // inReplyTo is the 7th positional arg
  });

  it('CCs the Seller TC and addresses the Seller Agent directly', async () => {
    const { service, mailgunService } = buildService();
    await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toBe('sam@listingco.com');
    expect(cc).toBe('tina@sunsetrealty.com');
  });

  it('uses a "Re:" prefixed subject matching the Seller Agent purpose\'s original subject line', async () => {
    const { service, mailgunService } = buildService();
    await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    const [, subject] = mailgunService.sendEmail.mock.calls[0];
    expect(subject).toBe('Re: Upload Seller-Side Transaction Documents – 123 Main St, Chino, CA');
  });

  it('builds the secure link from the SAME token already in hand — never mints a new one', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    const [, ctxArg] = emailTemplateService.render.mock.calls[0];
    expect(ctxArg.uploadUrl).toContain('/upload-link/seller-token');
  });

  it('threads the transaction id into the template context for the footer', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    const [, ctxArg] = emailTemplateService.render.mock.calls[0];
    expect(ctxArg.transactionId).toBe('tx-1');
  });

  it('persists an outbound transaction_messages row threaded via providerThreadId/threadKey, carrying uploadLinkId + idempotencyKey for later dedup', async () => {
    const { service, messagesRepo } = buildService();
    await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    expect(messagesRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      direction: 'outbound',
      providerMessageId: 'mg-reply-1',
      providerThreadId: 'mg-welcome-1',
      threadKey: 'mg-welcome-1',
      recipientPartyId: 'party-sa-1',
      metadataJson: expect.objectContaining({
        type: 'seller_agent_document_rejection',
        uploadLinkId: 'link-2',
        idempotencyKey: 'attempt-1',
        rejectedFileNames: ['unsigned.pdf'],
        cc: 'tina@sunsetrealty.com',
      }),
    }));
  });

  it('returns { sent: true, providerMessageId } on success', async () => {
    const { service } = buildService();
    const result = await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');
    expect(result).toEqual({ sent: true, providerMessageId: 'mg-reply-1' });
  });

  it('returns { sent: false, providerMessageId: null } and does not persist a message row when Mailgun throws', async () => {
    const { service, messagesRepo } = buildService({ sendEmailImpl: async () => { throw new Error('Mailgun down'); } });
    const result = await service.sendSellerAgentRejectionEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    expect(result).toEqual({ sent: false, providerMessageId: null });
    expect(messagesRepo.save).not.toHaveBeenCalled();
  });

  it('omits the In-Reply-To anchor gracefully when the link has no recorded emailMessageId', async () => {
    const { service, mailgunService } = buildService();
    const linkWithoutMessageId = { ...SELLER_AGENT_LINK, emailMessageId: null };
    await service.sendSellerAgentRejectionEmail(linkWithoutMessageId as never, 'seller-token', CTX, REJECTED, 'attempt-1');

    const call = mailgunService.sendEmail.mock.calls[0];
    expect(call[6]).toBeUndefined();
  });
});

const BUYER_CTX = { tcName: 'Carla Creator', transactionEmail: 'txn-abc123@txn.mytcapp.net', tcPhone: '555-0200', transactionId: 'tx-1', propertyAddress: '123 Main St, Chino, CA', outboundEmailAddress: null };
const BUYER_REJECTED = [{ fileName: 'rr-unsigned.pdf', reasons: ['Buyer has not signed the RR.'] }];

describe('UploadLinkEmailService.sendBuyerAgentRejectionEmail', () => {
  it('replies in the same thread — In-Reply-To/References set to the original welcome email\'s message id', async () => {
    const { service, mailgunService } = buildService();
    await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const call = mailgunService.sendEmail.mock.calls[0];
    expect(call[6]).toBe('mg-buyer-welcome-1');
  });

  it('addresses the Buyer Agent directly, with no CC when the link has none', async () => {
    const { service, mailgunService } = buildService();
    await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toBe('alice@brokerage.com');
    expect(cc).toBeUndefined();
  });

  it('still honors link.ccEmail generically when one happens to be set', async () => {
    const { service, mailgunService } = buildService();
    const linkWithCc = { ...BUYER_AGENT_LINK, ccEmail: 'someone@example.com', ccRole: 'other' };
    await service.sendBuyerAgentRejectionEmail(linkWithCc as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const [, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(cc).toBe('someone@example.com');
  });

  it('uses a "Re:" prefixed subject matching the Buyer Agent purpose\'s original subject line', async () => {
    const { service, mailgunService } = buildService();
    await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const [, subject] = mailgunService.sendEmail.mock.calls[0];
    expect(subject).toBe('Re: Upload Transaction Documents – 123 Main St, Chino, CA');
  });

  it('builds the secure link from the SAME token already in hand — never mints a new one', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const [, ctxArg] = emailTemplateService.render.mock.calls[0];
    expect(ctxArg.uploadUrl).toContain('/upload-link/buyer-token');
  });

  it('threads the transaction id into the template context for the footer', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const [, ctxArg] = emailTemplateService.render.mock.calls[0];
    expect(ctxArg.transactionId).toBe('tx-1');
  });

  it('renders the dedicated Buyer Agent rejection templates', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const renderedTemplates = emailTemplateService.render.mock.calls.map((c: unknown[]) => c[0]);
    expect(renderedTemplates).toContain('upload-link-buyer-agent-rejection.html.hbs');
    expect(renderedTemplates).toContain('upload-link-buyer-agent-rejection.text.hbs');
  });

  it('persists an outbound transaction_messages row threaded via providerThreadId/threadKey, tagged with the buyer_agent_document_rejection type', async () => {
    const { service, messagesRepo } = buildService();
    await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    expect(messagesRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      direction: 'outbound',
      providerMessageId: 'mg-reply-1',
      providerThreadId: 'mg-buyer-welcome-1',
      threadKey: 'mg-buyer-welcome-1',
      recipientPartyId: 'party-ba-1',
      metadataJson: expect.objectContaining({
        type: 'buyer_agent_document_rejection',
        uploadLinkId: 'link-1',
        idempotencyKey: 'ba-attempt-1',
        rejectedFileNames: ['rr-unsigned.pdf'],
      }),
    }));
  });

  it('returns { sent: true, providerMessageId } on success', async () => {
    const { service } = buildService();
    const result = await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');
    expect(result).toEqual({ sent: true, providerMessageId: 'mg-reply-1' });
  });

  it('returns { sent: false, providerMessageId: null } and does not persist a message row when Mailgun throws', async () => {
    const { service, messagesRepo } = buildService({ sendEmailImpl: async () => { throw new Error('Mailgun down'); } });
    const result = await service.sendBuyerAgentRejectionEmail(BUYER_AGENT_LINK as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    expect(result).toEqual({ sent: false, providerMessageId: null });
    expect(messagesRepo.save).not.toHaveBeenCalled();
  });

  it('omits the In-Reply-To anchor gracefully when the link has no recorded emailMessageId', async () => {
    const { service, mailgunService } = buildService();
    const linkWithoutMessageId = { ...BUYER_AGENT_LINK, emailMessageId: null };
    await service.sendBuyerAgentRejectionEmail(linkWithoutMessageId as never, 'buyer-token', BUYER_CTX, BUYER_REJECTED, 'ba-attempt-1');

    const call = mailgunService.sendEmail.mock.calls[0];
    expect(call[6]).toBeUndefined();
  });
});

describe('UploadLinkEmailService.sendEscrowRejectionEmail', () => {
  const ESCROW_CTX = { tcName: 'Carla Creator', transactionEmail: 'txn-abc123@txn.mytcapp.net', tcPhone: '555-0200', transactionId: 'tx-1', propertyAddress: '123 Main St, Chino, CA', outboundEmailAddress: null };
  const ESCROW_REJECTED = [{ fileName: 'rpa-unsigned.pdf', reasons: ['Page 6 — Buyer initials are missing.'] }];

  it('replies in the same thread — In-Reply-To/References set to the original welcome email\'s message id', async () => {
    const { service, mailgunService } = buildService();
    await service.sendEscrowRejectionEmail(ESCROW_LINK as never, 'escrow-token', ESCROW_CTX, ESCROW_REJECTED, 'escrow-attempt-1');

    const call = mailgunService.sendEmail.mock.calls[0];
    expect(call[6]).toBe('mg-escrow-welcome-1');
  });

  it('uses a "Re:" prefixed subject matching the Escrow purpose\'s original subject line', async () => {
    const { service, mailgunService } = buildService();
    await service.sendEscrowRejectionEmail(ESCROW_LINK as never, 'escrow-token', ESCROW_CTX, ESCROW_REJECTED, 'escrow-attempt-1');

    const [, subject] = mailgunService.sendEmail.mock.calls[0];
    expect(subject).toBe('Re: Escrow Onboarding – Upload Transaction Documents – 123 Main St, Chino, CA');
  });

  it('builds the secure link from the SAME token already in hand — never mints a new one', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendEscrowRejectionEmail(ESCROW_LINK as never, 'escrow-token', ESCROW_CTX, ESCROW_REJECTED, 'escrow-attempt-1');

    const [, ctxArg] = emailTemplateService.render.mock.calls[0];
    expect(ctxArg.uploadUrl).toContain('/upload-link/escrow-token');
  });

  it('renders the dedicated Escrow rejection templates', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendEscrowRejectionEmail(ESCROW_LINK as never, 'escrow-token', ESCROW_CTX, ESCROW_REJECTED, 'escrow-attempt-1');

    const renderedTemplates = emailTemplateService.render.mock.calls.map((c: unknown[]) => c[0]);
    expect(renderedTemplates).toContain('upload-link-escrow-rejection.html.hbs');
    expect(renderedTemplates).toContain('upload-link-escrow-rejection.text.hbs');
  });

  it('persists an outbound transaction_messages row threaded via providerThreadId/threadKey, tagged with the escrow_document_rejection type', async () => {
    const { service, messagesRepo } = buildService();
    await service.sendEscrowRejectionEmail(ESCROW_LINK as never, 'escrow-token', ESCROW_CTX, ESCROW_REJECTED, 'escrow-attempt-1');

    expect(messagesRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      direction: 'outbound',
      providerMessageId: 'mg-reply-1',
      providerThreadId: 'mg-escrow-welcome-1',
      threadKey: 'mg-escrow-welcome-1',
      metadataJson: expect.objectContaining({
        type: 'escrow_document_rejection',
        uploadLinkId: 'link-4',
        idempotencyKey: 'escrow-attempt-1',
        rejectedFileNames: ['rpa-unsigned.pdf'],
      }),
    }));
  });

  it('returns { sent: true, providerMessageId } on success', async () => {
    const { service } = buildService();
    const result = await service.sendEscrowRejectionEmail(ESCROW_LINK as never, 'escrow-token', ESCROW_CTX, ESCROW_REJECTED, 'escrow-attempt-1');
    expect(result).toEqual({ sent: true, providerMessageId: 'mg-reply-1' });
  });

  it('returns { sent: false, providerMessageId: null } and does not persist a message row when Mailgun throws', async () => {
    const { service, messagesRepo } = buildService({ sendEmailImpl: async () => { throw new Error('Mailgun down'); } });
    const result = await service.sendEscrowRejectionEmail(ESCROW_LINK as never, 'escrow-token', ESCROW_CTX, ESCROW_REJECTED, 'escrow-attempt-1');

    expect(result).toEqual({ sent: false, providerMessageId: null });
    expect(messagesRepo.save).not.toHaveBeenCalled();
  });
});

describe('UploadLinkEmailService.sendSellerAgentDocusignConfirmationEmail', () => {
  it('replies in the same thread — In-Reply-To/References set to the original welcome email\'s message id', async () => {
    const { service, mailgunService } = buildService();
    await service.sendSellerAgentDocusignConfirmationEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX);

    const call = mailgunService.sendEmail.mock.calls[0];
    expect(call[6]).toBe('mg-welcome-1'); // inReplyTo is the 7th positional arg
  });

  it('CCs the Seller TC and addresses the Seller Agent directly', async () => {
    const { service, mailgunService } = buildService();
    await service.sendSellerAgentDocusignConfirmationEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX);

    const [to, , , , , cc] = mailgunService.sendEmail.mock.calls[0];
    expect(to).toBe('sam@listingco.com');
    expect(cc).toBe('tina@sunsetrealty.com');
  });

  it('builds the secure link from the SAME token already in hand and threads the transaction id into the template context', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendSellerAgentDocusignConfirmationEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX);

    const [, ctxArg] = emailTemplateService.render.mock.calls[0];
    expect(ctxArg.uploadUrl).toContain('/upload-link/seller-token');
    expect(ctxArg.transactionId).toBe('tx-1');
  });

  it('renders the dedicated DocuSign confirmation templates', async () => {
    const { service, emailTemplateService } = buildService();
    await service.sendSellerAgentDocusignConfirmationEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX);

    const renderedTemplates = emailTemplateService.render.mock.calls.map((c: unknown[]) => c[0]);
    expect(renderedTemplates).toContain('upload-link-seller-agent-docusign-confirmation.html.hbs');
    expect(renderedTemplates).toContain('upload-link-seller-agent-docusign-confirmation.text.hbs');
  });

  it('persists an outbound transaction_messages row tagged with the seller_agent_docusign_confirmation_request type', async () => {
    const { service, messagesRepo } = buildService();
    await service.sendSellerAgentDocusignConfirmationEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX);

    expect(messagesRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: 'tx-1',
      direction: 'outbound',
      providerMessageId: 'mg-reply-1',
      providerThreadId: 'mg-welcome-1',
      threadKey: 'mg-welcome-1',
      recipientPartyId: 'party-sa-1',
      metadataJson: expect.objectContaining({
        type: 'seller_agent_docusign_confirmation_request',
        uploadLinkId: 'link-2',
        cc: 'tina@sunsetrealty.com',
      }),
    }));
  });

  it('returns { sent: true, providerMessageId } on success', async () => {
    const { service } = buildService();
    const result = await service.sendSellerAgentDocusignConfirmationEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX);
    expect(result).toEqual({ sent: true, providerMessageId: 'mg-reply-1' });
  });

  it('returns { sent: false, providerMessageId: null } and does not persist a message row when Mailgun throws', async () => {
    const { service, messagesRepo } = buildService({ sendEmailImpl: async () => { throw new Error('Mailgun down'); } });
    const result = await service.sendSellerAgentDocusignConfirmationEmail(SELLER_AGENT_LINK as never, 'seller-token', CTX);

    expect(result).toEqual({ sent: false, providerMessageId: null });
    expect(messagesRepo.save).not.toHaveBeenCalled();
  });
});

describe('Upload-link request templates — real rendering (footer)', () => {
  const realTemplateService = new EmailTemplateService();
  const TEMPLATES = [
    'upload-link-request.html.hbs',
    'upload-link-request.text.hbs',
    'upload-link-request-seller-agent.html.hbs',
    'upload-link-request-seller-agent.text.hbs',
    'upload-link-request-escrow.html.hbs',
    'upload-link-request-escrow.text.hbs',
    'upload-link-seller-agent-rejection.html.hbs',
    'upload-link-seller-agent-rejection.text.hbs',
    'upload-link-buyer-agent-rejection.html.hbs',
    'upload-link-buyer-agent-rejection.text.hbs',
    'upload-link-seller-agent-docusign-confirmation.html.hbs',
    'upload-link-seller-agent-docusign-confirmation.text.hbs',
  ];

  const baseCtx = {
    recipientName: 'Sam Agent',
    propertyAddress: '123 Main St, Chino, CA',
    uploadUrl: 'https://app.example.com/upload-links/token-1',
  };

  it('never renders "Not specified", "N/A", or "Unknown" anywhere when TC values are missing', () => {
    for (const name of TEMPLATES) {
      const rendered = realTemplateService.render(name, { ...baseCtx, tcName: null, transactionEmail: null, tcPhone: null, transactionId: 'tx-1' });
      expect(rendered).not.toContain('Not specified');
      expect(rendered).not.toMatch(/\bN\/A\b/);
      expect(rendered).not.toContain('Unknown');
    }
  });

  it('includes the Transaction ID, Transaction Coordinator, and Transaction Email in the footer when available', () => {
    for (const name of TEMPLATES) {
      const rendered = realTemplateService.render(name, { ...baseCtx, tcName: 'Carla Creator', transactionEmail: 'txn-abc123@txn.mytcapp.net', tcPhone: '555-0200', transactionId: 'tx-1' });
      expect(rendered).toContain('Transaction ID: tx-1');
      expect(rendered).toContain('Transaction Coordinator: Carla Creator');
      expect(rendered).toContain('Transaction Email: txn-abc123@txn.mytcapp.net');
    }
  });

  it('omits the Transaction Coordinator footer line entirely when the TC name is missing', () => {
    for (const name of TEMPLATES) {
      const rendered = realTemplateService.render(name, { ...baseCtx, tcName: null, transactionEmail: null, tcPhone: null, transactionId: 'tx-1' });
      expect(rendered).toContain('Transaction ID: tx-1');
      expect(rendered).not.toContain('Transaction Coordinator: ');
    }
  });

  it('never exposes the TC\'s myTC account email anywhere — only the transaction Mailgun address renders', () => {
    for (const name of TEMPLATES) {
      const rendered = realTemplateService.render(name, {
        ...baseCtx,
        tcName: 'Carla Creator',
        tcPhone: '555-0200',
        transactionEmail: 'txn-abc123@txn.mytcapp.net',
        ccInstructionEmail: 'txn-abc123@txn.mytcapp.net',
        transactionId: 'tx-1',
      });
      expect(rendered).not.toContain('carla@tc.com');
      expect(rendered).toContain('txn-abc123@txn.mytcapp.net');
    }
  });
});
