import { VerificationOfPropertyReminderSchedulerService, DEFAULT_BUYER_SIDE_REMINDER_LEAD_DAYS } from './verification-of-property-reminder-scheduler.service';
import { VerificationOfPropertyReminderStatus } from './entities/verification-of-property-reminder.entity';
import { EventType } from '../transaction-events/entities/transaction-event.entity';

const TRANSACTION_ID = 'tx-1';

function makeClosingEvent(eventDate: Date, id = 'event-closing-1') {
  return { id, eventType: EventType.CLOSING, eventDate } as never;
}

function makeLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'link-1',
    recipientEmail: 'agent@brokerage.com',
    recipientName: 'Alice Agent',
    ccEmail: null,
    emailMessageId: 'msg-abc',
    ...overrides,
  } as never;
}

function makeTransaction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TRANSACTION_ID,
    transactionNumber: 'TXN-2026-0001',
    propertyAddressLine1: '123 Main St',
    propertyCity: 'Chino',
    propertyState: 'CA',
    outboundEmailAddress: null,
    buyerSideReminderLeadDays: null,
    ...overrides,
  } as never;
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
  existingReminder?: Record<string, unknown> | null;
  link?: unknown;
  transaction?: unknown;
  vpDoc?: unknown;
  job?: { remove: jest.Mock } | null;
  closingEvent?: unknown;
} = {}) {
  const qb = buildQueryBuilder();
  const remindersRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.existingReminder ?? null),
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
    findOne: jest.fn().mockResolvedValue(overrides.vpDoc !== undefined ? overrides.vpDoc : null),
  };
  const eventsRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.closingEvent !== undefined ? overrides.closingEvent : null),
  };
  const clockService = {
    findByTransaction: jest.fn().mockResolvedValue(null),
  };
  const reminderQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(overrides.job === undefined ? { remove: jest.fn() } : overrides.job),
  };

  const service = new VerificationOfPropertyReminderSchedulerService(
    reminderQueue as never,
    remindersRepo as never,
    uploadLinksRepo as never,
    transactionsRepo as never,
    documentsRepo as never,
    eventsRepo as never,
    clockService as never,
  );

  return { service, remindersRepo, uploadLinksRepo, transactionsRepo, documentsRepo, eventsRepo, clockService, reminderQueue, qb };
}

describe('VerificationOfPropertyReminderSchedulerService.scheduleOrReschedule', () => {
  it('no-ops when there is no Close of Escrow event yet (never fabricates a deadline)', async () => {
    const { service, uploadLinksRepo } = buildScheduler();
    await service.scheduleOrReschedule(TRANSACTION_ID, null);
    expect(uploadLinksRepo.findOne).not.toHaveBeenCalled();
  });

  it('no-ops when there is no active Buyer Agent upload link for the transaction', async () => {
    const { service, reminderQueue } = buildScheduler({ link: null });
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(futureDate));
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('cancels any scheduled reminder and schedules nothing new when VP is already validated', async () => {
    const removeMock = jest.fn();
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      vpDoc: { id: 'doc-1', formCode: 'VP', analysisStatus: 'completed' },
      existingReminder: { id: 'reminder-1', bullJobId: 'job-1', status: VerificationOfPropertyReminderStatus.SCHEDULED },
      job: { remove: removeMock },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(futureDate));

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: VerificationOfPropertyReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('schedules a new reminder at the default 3-day lead time when the transaction has not overridden it', async () => {
    const { service, reminderQueue, qb } = buildScheduler({ existingReminder: null });
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(futureDate));

    expect(qb.values).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: TRANSACTION_ID,
      deadlineAt: futureDate,
      status: VerificationOfPropertyReminderStatus.SCHEDULED,
    }));
    expect(reminderQueue.add).toHaveBeenCalledTimes(1);
    const [jobData, opts] = reminderQueue.add.mock.calls[0];
    expect(jobData.reminderType).toBe('verification_of_property');
    expect(jobData.deadlineLabel).toBe('Close of Escrow');
    expect(jobData.recipientEmail).toBe('agent@brokerage.com');
    expect(jobData.uploadLinkId).toBe('link-1');
    const expectedDelay = futureDate.getTime() - DEFAULT_BUYER_SIDE_REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000 - Date.now();
    expect(opts.delay).toBeGreaterThan(expectedDelay - 5000);
    expect(opts.delay).toBeLessThan(expectedDelay + 5000);
  });

  it('uses the transaction-specific lead time when buyerSideReminderLeadDays is set', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue } = buildScheduler({
      transaction: makeTransaction({ buyerSideReminderLeadDays: 7 }),
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(futureDate));

    const [, opts] = reminderQueue.add.mock.calls[0];
    const expectedDelay = futureDate.getTime() - 7 * 24 * 60 * 60 * 1000 - Date.now();
    expect(opts.delay).toBeGreaterThan(expectedDelay - 5000);
    expect(opts.delay).toBeLessThan(expectedDelay + 5000);
  });

  it('is idempotent — does not reschedule when the deadline is unchanged and already scheduled', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      existingReminder: { id: 'reminder-1', deadlineAt: futureDate, bullJobId: 'vp-reminder:tx-1:x', status: VerificationOfPropertyReminderStatus.SCHEDULED },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(futureDate));

    expect(reminderQueue.add).not.toHaveBeenCalled();
    expect(remindersRepo.update).not.toHaveBeenCalled();
  });

  it('cancels the old reminder and Bull job, then schedules a new one when the closing date changes', async () => {
    const oldDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const newDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
    const removeMock = jest.fn();
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      existingReminder: { id: 'reminder-1', deadlineAt: oldDate, bullJobId: 'vp-reminder:tx-1:old', status: VerificationOfPropertyReminderStatus.SCHEDULED },
      job: { remove: removeMock },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(newDate));

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: VerificationOfPropertyReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
    expect(reminderQueue.add).toHaveBeenCalledTimes(1);
  });

  it('skips scheduling (but does not throw) when the deadline minus lead time has already passed', async () => {
    const pastDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now — less than the 3-day default lead time
    const { service, reminderQueue } = buildScheduler();
    await service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(pastDate));
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('does not propagate a queue outage (e.g. Redis unavailable) — the caller (contract submission) must not 500 because the reminder queue is down', async () => {
    const { service, reminderQueue } = buildScheduler();
    reminderQueue.add.mockRejectedValue(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500000.'));
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await expect(service.scheduleOrReschedule(TRANSACTION_ID, makeClosingEvent(futureDate))).resolves.toBeUndefined();
  });
});

describe('VerificationOfPropertyReminderSchedulerService.cancelIfSatisfied', () => {
  it('cancels the scheduled reminder and removes its Bull job', async () => {
    const removeMock = jest.fn();
    const { service, remindersRepo } = buildScheduler({
      existingReminder: { id: 'reminder-1', bullJobId: 'job-1', status: VerificationOfPropertyReminderStatus.SCHEDULED },
      job: { remove: removeMock },
    });

    await service.cancelIfSatisfied(TRANSACTION_ID);

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: VerificationOfPropertyReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
  });

  it('is a no-op when there is no scheduled reminder', async () => {
    const { service, remindersRepo } = buildScheduler({ existingReminder: null });
    await service.cancelIfSatisfied(TRANSACTION_ID);
    expect(remindersRepo.update).not.toHaveBeenCalled();
  });
});

describe('VerificationOfPropertyReminderSchedulerService.rescheduleForNewLeadTime', () => {
  it('re-derives the current CLOSING event and re-runs schedule/cancel with the new lead time', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, eventsRepo, reminderQueue } = buildScheduler({
      closingEvent: makeClosingEvent(futureDate),
      transaction: makeTransaction({ buyerSideReminderLeadDays: 5 }),
    });

    await service.rescheduleForNewLeadTime(TRANSACTION_ID);

    expect(eventsRepo.findOne).toHaveBeenCalledWith({ where: { transactionId: TRANSACTION_ID, eventType: EventType.CLOSING } });
    expect(reminderQueue.add).toHaveBeenCalledTimes(1);
    const expectedDelay = futureDate.getTime() - 5 * 24 * 60 * 60 * 1000 - Date.now();
    const [, opts] = reminderQueue.add.mock.calls[0];
    expect(opts.delay).toBeGreaterThan(expectedDelay - 5000);
  });

  it('no-ops when there is no CLOSING event yet', async () => {
    const { service, reminderQueue } = buildScheduler({ closingEvent: null });
    await service.rescheduleForNewLeadTime(TRANSACTION_ID);
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });
});
