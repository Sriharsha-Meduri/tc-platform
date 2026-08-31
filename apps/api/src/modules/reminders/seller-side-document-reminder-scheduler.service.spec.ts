import { SellerSideDocumentReminderSchedulerService, DEFAULT_SELLER_SIDE_REMINDER_LEAD_DAYS } from './seller-side-document-reminder-scheduler.service';
import { SellerSideDocumentReminderStatus } from './entities/seller-side-document-reminder.entity';
import { EventType } from '../transaction-events/entities/transaction-event.entity';

const TRANSACTION_ID = 'tx-1';

function makeDisclosuresDueEvent(eventDate: Date, id = 'event-disclosures-1') {
  return { id, eventType: EventType.DISCLOSURES_DUE, eventDate } as never;
}

function makeLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'link-1',
    recipientEmail: 'seller-agent@brokerage.com',
    recipientName: 'Sam Agent',
    ccEmail: null,
    emailMessageId: 'msg-abc',
    ...overrides,
  } as never;
}

function makeTransaction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TRANSACTION_ID,
    transactionNumber: 'TXN-2026-0001',
    organizationId: 'org-1',
    propertyState: 'CA',
    transactionType: 'purchase',
    side: 'seller',
    propertyAddressLine1: '123 Main St',
    propertyCity: 'Chino',
    propertyState2: 'CA',
    outboundEmailAddress: null,
    sellerSideReminderLeadDays: null,
    ...overrides,
  } as never;
}

function makeTemplate(items: Array<{ formCode: string; formName: string; isRequired: boolean }>) {
  return { items } as never;
}

function buildQueryBuilder() {
  const qb: Record<string, jest.Mock> = {};
  qb.insert = jest.fn().mockReturnValue(qb);
  qb.into = jest.fn().mockReturnValue(qb);
  qb.values = jest.fn().mockReturnValue(qb);
  qb.orIgnore = jest.fn().mockReturnValue(qb);
  qb.execute = jest.fn().mockResolvedValue(undefined);
  return qb;
}

function buildScheduler(overrides: {
  existingReminders?: Record<string, Record<string, unknown> | null>;
  link?: unknown;
  transaction?: unknown;
  template?: unknown;
  satisfiedFormCodes?: string[];
  job?: { remove: jest.Mock } | null;
  disclosuresDueEvent?: unknown;
} = {}) {
  const qb = buildQueryBuilder();
  const remindersRepo = {
    findOne: jest.fn().mockImplementation(async ({ where }: { where: { formCode: string } }) => {
      const map = overrides.existingReminders ?? {};
      return map[where.formCode] ?? null;
    }),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  const uploadLinksRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.link !== undefined ? overrides.link : makeLink()),
  };
  const transactionsRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.transaction !== undefined ? overrides.transaction : makeTransaction()),
  };
  const documentsRepo = {
    findOne: jest.fn().mockImplementation(async ({ where }: { where: { formCode: string } }) => {
      const satisfied = overrides.satisfiedFormCodes ?? [];
      return satisfied.includes(where.formCode) ? { id: `doc-${where.formCode}`, formCode: where.formCode, analysisStatus: 'completed' } : null;
    }),
  };
  const eventsRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.disclosuresDueEvent !== undefined ? overrides.disclosuresDueEvent : null),
  };
  const formTemplatesService = {
    resolveForTransaction: jest.fn().mockResolvedValue(
      overrides.template !== undefined
        ? overrides.template
        : makeTemplate([{ formCode: 'TDS', formName: 'Transfer Disclosure Statement', isRequired: true }]),
    ),
  };
  const clockService = {
    findByTransaction: jest.fn().mockResolvedValue(null),
  };
  const reminderQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(overrides.job === undefined ? { remove: jest.fn() } : overrides.job),
  };

  const service = new SellerSideDocumentReminderSchedulerService(
    reminderQueue as never,
    remindersRepo as never,
    uploadLinksRepo as never,
    transactionsRepo as never,
    documentsRepo as never,
    eventsRepo as never,
    formTemplatesService as never,
    clockService as never,
  );

  return { service, remindersRepo, uploadLinksRepo, transactionsRepo, documentsRepo, eventsRepo, formTemplatesService, clockService, reminderQueue, qb };
}

describe('SellerSideDocumentReminderSchedulerService.scheduleOrReschedule', () => {
  it('no-ops when there is no Seller Disclosures Due event yet (never fabricates a deadline)', async () => {
    const { service, uploadLinksRepo } = buildScheduler();
    await service.scheduleOrReschedule(TRANSACTION_ID, null);
    expect(uploadLinksRepo.findOne).not.toHaveBeenCalled();
  });

  it('no-ops when there is no active Seller Agent upload link for the transaction', async () => {
    const { service, reminderQueue } = buildScheduler({ link: null });
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate));
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('no-ops when the resolved template has no required items', async () => {
    const { service, reminderQueue } = buildScheduler({ template: makeTemplate([]) });
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate));
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('schedules one reminder per required form code, all sharing the same deadline', async () => {
    const { service, reminderQueue, qb } = buildScheduler({
      template: makeTemplate([
        { formCode: 'TDS', formName: 'Transfer Disclosure Statement', isRequired: true },
        { formCode: 'SPQ', formName: 'Seller Property Questionnaire', isRequired: true },
        { formCode: 'OPTIONAL-X', formName: 'Optional Thing', isRequired: false },
      ]),
    });
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate));

    expect(reminderQueue.add).toHaveBeenCalledTimes(2);
    expect(qb.values).toHaveBeenCalledWith(expect.objectContaining({ formCode: 'TDS', deadlineAt: futureDate, status: SellerSideDocumentReminderStatus.SCHEDULED }));
    expect(qb.values).toHaveBeenCalledWith(expect.objectContaining({ formCode: 'SPQ', deadlineAt: futureDate, status: SellerSideDocumentReminderStatus.SCHEDULED }));
    const formCodesScheduled = reminderQueue.add.mock.calls.map(([jobData]) => jobData.formCode);
    expect(formCodesScheduled.sort()).toEqual(['SPQ', 'TDS']);
  });

  it('cancels any scheduled reminder and schedules nothing new for a form code already uploaded and validated', async () => {
    const removeMock = jest.fn();
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      satisfiedFormCodes: ['TDS'],
      existingReminders: { TDS: { id: 'reminder-1', bullJobId: 'job-1', status: SellerSideDocumentReminderStatus.SCHEDULED } },
      job: { remove: removeMock },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate));

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: SellerSideDocumentReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('uses the transaction-specific lead time when sellerSideReminderLeadDays is set', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue } = buildScheduler({
      transaction: makeTransaction({ sellerSideReminderLeadDays: 6 }),
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate));

    const [, opts] = reminderQueue.add.mock.calls[0];
    const expectedDelay = futureDate.getTime() - 6 * 24 * 60 * 60 * 1000 - Date.now();
    expect(opts.delay).toBeGreaterThan(expectedDelay - 5000);
    expect(opts.delay).toBeLessThan(expectedDelay + 5000);
  });

  it('defaults to 3 days when sellerSideReminderLeadDays is not set', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue } = buildScheduler();

    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate));

    const [, opts] = reminderQueue.add.mock.calls[0];
    const expectedDelay = futureDate.getTime() - DEFAULT_SELLER_SIDE_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000 - Date.now();
    expect(opts.delay).toBeGreaterThan(expectedDelay - 5000);
    expect(opts.delay).toBeLessThan(expectedDelay + 5000);
  });

  it('is idempotent — does not reschedule a form code when the deadline is unchanged and already scheduled', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      existingReminders: { TDS: { id: 'reminder-1', deadlineAt: futureDate, bullJobId: 'seller-side-reminder:tx-1:TDS:x', status: SellerSideDocumentReminderStatus.SCHEDULED } },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate));

    expect(reminderQueue.add).not.toHaveBeenCalled();
    expect(remindersRepo.update).not.toHaveBeenCalled();
  });

  it('cancels the old reminder and Bull job, then schedules a new one when the disclosures due date changes', async () => {
    const oldDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const newDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
    const removeMock = jest.fn();
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      existingReminders: { TDS: { id: 'reminder-1', deadlineAt: oldDate, bullJobId: 'seller-side-reminder:tx-1:TDS:old', status: SellerSideDocumentReminderStatus.SCHEDULED } },
      job: { remove: removeMock },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(newDate));

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: SellerSideDocumentReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
    expect(reminderQueue.add).toHaveBeenCalledTimes(1);
  });

  it('skips scheduling (but does not throw) when the deadline minus lead time has already passed', async () => {
    const pastDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now — less than the 3-day default lead time
    const { service, reminderQueue } = buildScheduler();
    await service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(pastDate));
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('does not propagate a queue outage (e.g. Redis unavailable) — the caller (contract submission) must not 500 because the reminder queue is down', async () => {
    const { service, reminderQueue } = buildScheduler();
    reminderQueue.add.mockRejectedValue(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500000.'));
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await expect(service.scheduleOrReschedule(TRANSACTION_ID, makeDisclosuresDueEvent(futureDate))).resolves.toBeUndefined();
  });
});

describe('SellerSideDocumentReminderSchedulerService.cancelIfSatisfied', () => {
  it('cancels the scheduled reminder for the given form code and removes its Bull job', async () => {
    const removeMock = jest.fn();
    const { service, remindersRepo } = buildScheduler({
      existingReminders: { TDS: { id: 'reminder-1', bullJobId: 'job-1', status: SellerSideDocumentReminderStatus.SCHEDULED } },
      job: { remove: removeMock },
    });

    await service.cancelIfSatisfied(TRANSACTION_ID, 'TDS');

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: SellerSideDocumentReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
  });

  it('is a no-op when there is no scheduled reminder for that form code', async () => {
    const { service, remindersRepo } = buildScheduler({ existingReminders: {} });
    await service.cancelIfSatisfied(TRANSACTION_ID, 'TDS');
    expect(remindersRepo.update).not.toHaveBeenCalled();
  });
});

describe('SellerSideDocumentReminderSchedulerService.rescheduleForNewLeadTime', () => {
  it('re-derives the current DISCLOSURES_DUE event and re-runs schedule/cancel with the new lead time', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, eventsRepo, reminderQueue } = buildScheduler({
      disclosuresDueEvent: makeDisclosuresDueEvent(futureDate),
      transaction: makeTransaction({ sellerSideReminderLeadDays: 4 }),
    });

    await service.rescheduleForNewLeadTime(TRANSACTION_ID);

    expect(eventsRepo.findOne).toHaveBeenCalledWith({ where: { transactionId: TRANSACTION_ID, eventType: EventType.DISCLOSURES_DUE } });
    expect(reminderQueue.add).toHaveBeenCalledTimes(1);
    const expectedDelay = futureDate.getTime() - 4 * 24 * 60 * 60 * 1000 - Date.now();
    const [, opts] = reminderQueue.add.mock.calls[0];
    expect(opts.delay).toBeGreaterThan(expectedDelay - 5000);
  });

  it('no-ops when there is no DISCLOSURES_DUE event yet', async () => {
    const { service, reminderQueue } = buildScheduler({ disclosuresDueEvent: null });
    await service.rescheduleForNewLeadTime(TRANSACTION_ID);
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });
});
