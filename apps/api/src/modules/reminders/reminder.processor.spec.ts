import { ReminderProcessor } from './reminder.processor';
import { ContingencyRemovalReminderStatus } from './entities/contingency-removal-reminder.entity';
import { VerificationOfPropertyReminderStatus } from './entities/verification-of-property-reminder.entity';
import { SellerSideDocumentReminderStatus } from './entities/seller-side-document-reminder.entity';
import { ContingencyRemovalReminderJobData, VerificationOfPropertyReminderJobData, SellerSideDocumentReminderJobData } from './reminder.constants';

function makeJob(data: ContingencyRemovalReminderJobData, jobId = 'contingency-reminder:event-1:123') {
  return { data, opts: { jobId }, id: jobId } as never;
}

function baseJobData(overrides: Partial<ContingencyRemovalReminderJobData> = {}): ContingencyRemovalReminderJobData {
  return {
    reminderType: 'contingency_removal',
    transactionId: 'tx-1',
    transactionNumber: 'TXN-2026-0001',
    propertyAddress: '123 Main St, Chino, CA',
    transactionEventId: 'event-1',
    contingencyType: 'inspection',
    contingencyLabel: 'Inspection Contingency Removal',
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    contractTimeframe: '17 days after Acceptance',
    recipientEmail: 'agent@brokerage.com',
    recipientName: 'Alice Agent',
    ccEmail: null,
    emailMessageId: 'msg-abc',
    fromAddress: 'TC Platform <noreply@txn.mytcapp.net>',
    transactionStage: 'inspection',
    ...overrides,
  };
}

function buildProcessor(overrides: {
  reminderRow?: Record<string, unknown> | null;
  crbDocs?: unknown[];
} = {}) {
  const mailgunService = {
    sendEmail: jest.fn().mockResolvedValue({ messageId: 'mg-1' }),
  };
  const emailTemplateService = {
    render: jest.fn().mockReturnValue('<html></html>'),
  };
  const remindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const customRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const contingencyRemindersRepo = {
    findOne: jest.fn().mockResolvedValue(
      overrides.reminderRow !== undefined
        ? overrides.reminderRow
        : { id: 'reminder-1', status: ContingencyRemovalReminderStatus.SCHEDULED },
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const messagesRepo = {
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockImplementation((v: unknown) => v),
  };
  const documentsRepo = {
    find: jest.fn().mockResolvedValue(overrides.crbDocs ?? []),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const vpRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const sellerSideRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const uploadLinkRepo = {
    findById: jest.fn().mockResolvedValue(null),
    regenerate: jest.fn(),
  };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const processor = new ReminderProcessor(
    mailgunService as never,
    emailTemplateService as never,
    remindersRepo as never,
    customRemindersRepo as never,
    contingencyRemindersRepo as never,
    vpRemindersRepo as never,
    sellerSideRemindersRepo as never,
    messagesRepo as never,
    documentsRepo as never,
    uploadLinkRepo as never,
    auditLogService as never,
  );

  return { processor, mailgunService, emailTemplateService, contingencyRemindersRepo, vpRemindersRepo, sellerSideRemindersRepo, uploadLinkRepo, auditLogService, messagesRepo, documentsRepo };
}

describe('ReminderProcessor — contingency removal reminders', () => {
  it('skips (does not send) when no DB record is found for the job (orphaned job)', async () => {
    const { processor, mailgunService, contingencyRemindersRepo } = buildProcessor({ reminderRow: null });
    contingencyRemindersRepo.findOne.mockResolvedValue(null);

    await processor.handleDeadlineReminder(makeJob(baseJobData()));

    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('skips (does not send) when the DB row is no longer SCHEDULED', async () => {
    const { processor, mailgunService } = buildProcessor({
      reminderRow: { id: 'reminder-1', status: ContingencyRemovalReminderStatus.CANCELLED },
    });

    await processor.handleDeadlineReminder(makeJob(baseJobData()));

    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('skips and marks SKIPPED when the contingency has since been satisfied by a completed CR-B', async () => {
    const { processor, mailgunService, contingencyRemindersRepo } = buildProcessor({
      crbDocs: [{ metadataJson: { extraction: { contingencies_removed: { inspection: true } } } }],
    });

    await processor.handleDeadlineReminder(makeJob(baseJobData({ contingencyType: 'inspection' })));

    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(contingencyRemindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: ContingencyRemovalReminderStatus.SKIPPED }));
  });

  it('does not skip for a satisfied CR-B covering a DIFFERENT contingency type', async () => {
    const { processor, mailgunService } = buildProcessor({
      crbDocs: [{ metadataJson: { extraction: { contingencies_removed: { loan: true } } } }],
    });

    await processor.handleDeadlineReminder(makeJob(baseJobData({ contingencyType: 'inspection' })));

    expect(mailgunService.sendEmail).toHaveBeenCalled();
  });

  it('treats all_contingencies as satisfying every contingency type', async () => {
    const { processor, mailgunService } = buildProcessor({
      crbDocs: [{ metadataJson: { extraction: { contingencies_removed: { all_contingencies: true } } } }],
    });

    await processor.handleDeadlineReminder(makeJob(baseJobData({ contingencyType: 'appraisal' })));

    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('sends the reminder in-thread (no upload link URL) and marks SENT on success', async () => {
    const { processor, mailgunService, contingencyRemindersRepo, messagesRepo } = buildProcessor();

    await processor.handleDeadlineReminder(makeJob(baseJobData()));

    expect(mailgunService.sendEmail).toHaveBeenCalledWith(
      'agent@brokerage.com',
      expect.stringContaining('Inspection Contingency Removal'),
      expect.any(String),
      expect.any(String),
      'TC Platform <noreply@txn.mytcapp.net>',
      undefined,
      'msg-abc',
    );
    expect(messagesRepo.save).toHaveBeenCalled();
    expect(contingencyRemindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: ContingencyRemovalReminderStatus.SENT }));
  });

  it('passes the ccEmail through to sendEmail when present', async () => {
    const { processor, mailgunService } = buildProcessor();
    await processor.handleDeadlineReminder(makeJob(baseJobData({ ccEmail: 'tc@sunsetrealty.com' })));
    expect(mailgunService.sendEmail).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String),
      'tc@sunsetrealty.com', expect.any(String),
    );
  });
});

function makeVpJob(data: VerificationOfPropertyReminderJobData, jobId = 'vp-reminder:tx-1:123') {
  return { data, opts: { jobId }, id: jobId } as never;
}

function baseVpJobData(overrides: Partial<VerificationOfPropertyReminderJobData> = {}): VerificationOfPropertyReminderJobData {
  return {
    reminderType: 'verification_of_property',
    transactionId: 'tx-1',
    transactionNumber: 'TXN-2026-0001',
    propertyAddress: '123 Main St, Chino, CA',
    transactionEventId: 'event-closing-1',
    deadlineLabel: 'Close of Escrow',
    deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    recipientEmail: 'agent@brokerage.com',
    recipientName: 'Alice Agent',
    ccEmail: null,
    uploadLinkId: 'link-1',
    fromAddress: 'TC Platform <noreply@txn.mytcapp.net>',
    transactionStage: 'closing',
    ...overrides,
  };
}

function buildVpProcessor(overrides: {
  reminderRow?: Record<string, unknown> | null;
  vpDoc?: unknown;
  existingLink?: unknown;
  regenerateResult?: { link: Record<string, unknown>; token: string };
} = {}) {
  const mailgunService = { sendEmail: jest.fn().mockResolvedValue({ messageId: 'mg-1' }) };
  const emailTemplateService = { render: jest.fn().mockReturnValue('<html></html>') };
  const remindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const customRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const contingencyRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const vpRemindersRepo = {
    findOne: jest.fn().mockResolvedValue(
      overrides.reminderRow !== undefined
        ? overrides.reminderRow
        : { id: 'vp-reminder-1', status: VerificationOfPropertyReminderStatus.SCHEDULED },
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const messagesRepo = {
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockImplementation((v: unknown) => v),
  };
  const documentsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(overrides.vpDoc !== undefined ? overrides.vpDoc : null),
  };
  const uploadLinkRepo = {
    findById: jest.fn().mockResolvedValue(
      overrides.existingLink !== undefined ? overrides.existingLink : { id: 'link-1', emailMessageId: 'msg-original' },
    ),
    regenerate: jest.fn().mockResolvedValue(
      overrides.regenerateResult ?? { link: { id: 'link-2', emailMessageId: 'msg-original' }, token: 'fresh-token' },
    ),
  };
  const sellerSideRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const processor = new ReminderProcessor(
    mailgunService as never,
    emailTemplateService as never,
    remindersRepo as never,
    customRemindersRepo as never,
    contingencyRemindersRepo as never,
    vpRemindersRepo as never,
    sellerSideRemindersRepo as never,
    messagesRepo as never,
    documentsRepo as never,
    uploadLinkRepo as never,
    auditLogService as never,
  );

  return { processor, mailgunService, emailTemplateService, vpRemindersRepo, uploadLinkRepo, auditLogService, messagesRepo, documentsRepo };
}

describe('ReminderProcessor — Verification of Property reminders', () => {
  it('skips (does not send) when no DB record is found for the job (orphaned job)', async () => {
    const { processor, mailgunService } = buildVpProcessor({ reminderRow: null });
    await processor.handleDeadlineReminder(makeVpJob(baseVpJobData()));
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('skips (does not send) when the DB row is no longer SCHEDULED', async () => {
    const { processor, mailgunService } = buildVpProcessor({
      reminderRow: { id: 'vp-reminder-1', status: VerificationOfPropertyReminderStatus.SENT },
    });
    await processor.handleDeadlineReminder(makeVpJob(baseVpJobData()));
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('skips and marks SKIPPED when VP has since been validated', async () => {
    const { processor, mailgunService, vpRemindersRepo } = buildVpProcessor({
      vpDoc: { id: 'doc-1', formCode: 'VP', analysisStatus: 'completed' },
    });

    await processor.handleDeadlineReminder(makeVpJob(baseVpJobData()));

    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(vpRemindersRepo.update).toHaveBeenCalledWith('vp-reminder-1', expect.objectContaining({ status: VerificationOfPropertyReminderStatus.SKIPPED }));
  });

  it('skips and marks SKIPPED when the upload link no longer exists', async () => {
    const { processor, mailgunService, vpRemindersRepo } = buildVpProcessor({ existingLink: null });
    await processor.handleDeadlineReminder(makeVpJob(baseVpJobData()));
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(vpRemindersRepo.update).toHaveBeenCalledWith('vp-reminder-1', expect.objectContaining({ status: VerificationOfPropertyReminderStatus.SKIPPED }));
  });

  it('regenerates the upload link, sends with the fresh URL and preserved thread, marks SENT, and audits', async () => {
    const { processor, mailgunService, uploadLinkRepo, vpRemindersRepo, messagesRepo, auditLogService } = buildVpProcessor();

    await processor.handleDeadlineReminder(makeVpJob(baseVpJobData()));

    expect(uploadLinkRepo.regenerate).toHaveBeenCalledWith({ id: 'link-1', emailMessageId: 'msg-original' });
    expect(mailgunService.sendEmail).toHaveBeenCalledWith(
      'agent@brokerage.com',
      expect.stringContaining('Verification of Property'),
      expect.any(String),
      expect.any(String),
      'TC Platform <noreply@txn.mytcapp.net>',
      undefined,
      'msg-original',
    );
    expect(messagesRepo.save).toHaveBeenCalled();
    expect(vpRemindersRepo.update).toHaveBeenCalledWith('vp-reminder-1', expect.objectContaining({ status: VerificationOfPropertyReminderStatus.SENT }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'buyer_side_vp_checklist_reminder_sent',
    }));
  });

  it('passes the ccEmail through to sendEmail when present', async () => {
    const { processor, mailgunService } = buildVpProcessor();
    await processor.handleDeadlineReminder(makeVpJob(baseVpJobData({ ccEmail: 'tc@sunsetrealty.com' })));
    expect(mailgunService.sendEmail).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String),
      'tc@sunsetrealty.com', expect.any(String),
    );
  });
});

function makeSellerSideJob(data: SellerSideDocumentReminderJobData, jobId = 'seller-side-reminder:tx-1:TDS:123') {
  return { data, opts: { jobId }, id: jobId } as never;
}

function baseSellerSideJobData(overrides: Partial<SellerSideDocumentReminderJobData> = {}): SellerSideDocumentReminderJobData {
  return {
    reminderType: 'seller_side_document',
    transactionId: 'tx-1',
    transactionNumber: 'TXN-2026-0001',
    propertyAddress: '123 Main St, Chino, CA',
    transactionEventId: 'event-disclosures-1',
    formCode: 'TDS',
    formName: 'Transfer Disclosure Statement',
    deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    recipientEmail: 'seller-agent@brokerage.com',
    recipientName: 'Sam Agent',
    ccEmail: null,
    uploadLinkId: 'link-1',
    fromAddress: 'TC Platform <noreply@txn.mytcapp.net>',
    transactionStage: 'disclosures',
    ...overrides,
  };
}

function buildSellerSideProcessor(overrides: {
  reminderRow?: Record<string, unknown> | null;
  doc?: unknown;
  existingLink?: unknown;
  regenerateResult?: { link: Record<string, unknown>; token: string };
} = {}) {
  const mailgunService = { sendEmail: jest.fn().mockResolvedValue({ messageId: 'mg-1' }) };
  const emailTemplateService = { render: jest.fn().mockReturnValue('<html></html>') };
  const remindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const customRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const contingencyRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const vpRemindersRepo = { findOne: jest.fn(), update: jest.fn() };
  const sellerSideRemindersRepo = {
    findOne: jest.fn().mockResolvedValue(
      overrides.reminderRow !== undefined
        ? overrides.reminderRow
        : { id: 'seller-side-reminder-1', status: SellerSideDocumentReminderStatus.SCHEDULED },
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const messagesRepo = {
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockImplementation((v: unknown) => v),
  };
  const documentsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(overrides.doc !== undefined ? overrides.doc : null),
  };
  const uploadLinkRepo = {
    findById: jest.fn().mockResolvedValue(
      overrides.existingLink !== undefined ? overrides.existingLink : { id: 'link-1', emailMessageId: 'msg-original' },
    ),
    regenerate: jest.fn().mockResolvedValue(
      overrides.regenerateResult ?? { link: { id: 'link-2', emailMessageId: 'msg-original' }, token: 'fresh-token' },
    ),
  };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const processor = new ReminderProcessor(
    mailgunService as never,
    emailTemplateService as never,
    remindersRepo as never,
    customRemindersRepo as never,
    contingencyRemindersRepo as never,
    vpRemindersRepo as never,
    sellerSideRemindersRepo as never,
    messagesRepo as never,
    documentsRepo as never,
    uploadLinkRepo as never,
    auditLogService as never,
  );

  return { processor, mailgunService, emailTemplateService, sellerSideRemindersRepo, uploadLinkRepo, auditLogService, messagesRepo, documentsRepo };
}

describe('ReminderProcessor — Seller Side document reminders', () => {
  it('skips (does not send) when no DB record is found for the job (orphaned job)', async () => {
    const { processor, mailgunService } = buildSellerSideProcessor({ reminderRow: null });
    await processor.handleDeadlineReminder(makeSellerSideJob(baseSellerSideJobData()));
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('skips (does not send) when the DB row is no longer SCHEDULED', async () => {
    const { processor, mailgunService } = buildSellerSideProcessor({
      reminderRow: { id: 'seller-side-reminder-1', status: SellerSideDocumentReminderStatus.SENT },
    });
    await processor.handleDeadlineReminder(makeSellerSideJob(baseSellerSideJobData()));
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
  });

  it('skips and marks SKIPPED when the document has since been validated', async () => {
    const { processor, mailgunService, sellerSideRemindersRepo } = buildSellerSideProcessor({
      doc: { id: 'doc-1', formCode: 'TDS', analysisStatus: 'completed' },
    });

    await processor.handleDeadlineReminder(makeSellerSideJob(baseSellerSideJobData()));

    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(sellerSideRemindersRepo.update).toHaveBeenCalledWith('seller-side-reminder-1', expect.objectContaining({ status: SellerSideDocumentReminderStatus.SKIPPED }));
  });

  it('skips and marks SKIPPED when the upload link no longer exists', async () => {
    const { processor, mailgunService, sellerSideRemindersRepo } = buildSellerSideProcessor({ existingLink: null });
    await processor.handleDeadlineReminder(makeSellerSideJob(baseSellerSideJobData()));
    expect(mailgunService.sendEmail).not.toHaveBeenCalled();
    expect(sellerSideRemindersRepo.update).toHaveBeenCalledWith('seller-side-reminder-1', expect.objectContaining({ status: SellerSideDocumentReminderStatus.SKIPPED }));
  });

  it('regenerates the upload link, sends with the fresh URL and preserved thread, marks SENT, and audits', async () => {
    const { processor, mailgunService, uploadLinkRepo, sellerSideRemindersRepo, messagesRepo, auditLogService } = buildSellerSideProcessor();

    await processor.handleDeadlineReminder(makeSellerSideJob(baseSellerSideJobData()));

    expect(uploadLinkRepo.regenerate).toHaveBeenCalledWith({ id: 'link-1', emailMessageId: 'msg-original' });
    expect(mailgunService.sendEmail).toHaveBeenCalledWith(
      'seller-agent@brokerage.com',
      expect.stringContaining('Transfer Disclosure Statement'),
      expect.any(String),
      expect.any(String),
      'TC Platform <noreply@txn.mytcapp.net>',
      undefined,
      'msg-original',
    );
    expect(messagesRepo.save).toHaveBeenCalled();
    expect(sellerSideRemindersRepo.update).toHaveBeenCalledWith('seller-side-reminder-1', expect.objectContaining({ status: SellerSideDocumentReminderStatus.SENT }));
    expect(auditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'seller_side_document_reminder_sent',
    }));
  });

  it('passes the ccEmail through to sendEmail when present (Seller TC)', async () => {
    const { processor, mailgunService } = buildSellerSideProcessor();
    await processor.handleDeadlineReminder(makeSellerSideJob(baseSellerSideJobData({ ccEmail: 'seller-tc@sunsetrealty.com' })));
    expect(mailgunService.sendEmail).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String),
      'seller-tc@sunsetrealty.com', expect.any(String),
    );
  });
});
