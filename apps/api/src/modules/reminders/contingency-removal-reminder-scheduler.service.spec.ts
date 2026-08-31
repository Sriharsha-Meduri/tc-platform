import { ContingencyRemovalReminderSchedulerService } from './contingency-removal-reminder-scheduler.service';
import { ContingencyRemovalReminderStatus } from './entities/contingency-removal-reminder.entity';
import { EventType } from '../transaction-events/entities/transaction-event.entity';

const TRANSACTION_ID = 'tx-1';

function makeEvent(eventType: EventType, eventDate: Date, id = 'event-1') {
  return { id, eventType, eventDate } as never;
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
  job?: { remove: jest.Mock } | null;
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
  const clockService = {
    findByTransaction: jest.fn().mockResolvedValue(null),
  };
  const reminderQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(overrides.job === undefined ? { remove: jest.fn() } : overrides.job),
  };

  const service = new ContingencyRemovalReminderSchedulerService(
    reminderQueue as never,
    remindersRepo as never,
    uploadLinksRepo as never,
    transactionsRepo as never,
    clockService as never,
  );

  return { service, remindersRepo, uploadLinksRepo, transactionsRepo, clockService, reminderQueue, qb };
}

describe('ContingencyRemovalReminderSchedulerService.scheduleOrReschedule', () => {
  it('does nothing when no candidates are passed', async () => {
    const { service, uploadLinksRepo } = buildScheduler();
    await service.scheduleOrReschedule(TRANSACTION_ID, []);
    expect(uploadLinksRepo.findOne).not.toHaveBeenCalled();
  });

  it('no-ops when there is no active Buyer Agent upload link for the transaction', async () => {
    const { service, reminderQueue } = buildScheduler({ link: null });
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'inspection', event: makeEvent(EventType.INSPECTION, futureDate), waived: false, days: 17 },
    ]);
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('schedules a new reminder at exactly deadline minus 1 day when none exists yet', async () => {
    const { service, reminderQueue, qb } = buildScheduler({ existingReminder: null });
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'inspection', event: makeEvent(EventType.INSPECTION, futureDate), waived: false, days: 17 },
    ]);

    expect(qb.values).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: TRANSACTION_ID,
      contingencyType: 'inspection',
      deadlineAt: futureDate,
      status: ContingencyRemovalReminderStatus.SCHEDULED,
    }));
    expect(reminderQueue.add).toHaveBeenCalledTimes(1);
    const [jobData, opts] = reminderQueue.add.mock.calls[0];
    expect(jobData.reminderType).toBe('contingency_removal');
    expect(jobData.contingencyType).toBe('inspection');
    expect(jobData.contractTimeframe).toBe('17 days after Acceptance');
    expect(jobData.recipientEmail).toBe('agent@brokerage.com');
    expect(jobData.emailMessageId).toBe('msg-abc');
    expect(opts.delay).toBeGreaterThan(0);
  });

  it('is idempotent — does not reschedule when the deadline is unchanged and already scheduled', async () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      existingReminder: { id: 'reminder-1', deadlineAt: futureDate, bullJobId: 'contingency-reminder:event-1:x', status: ContingencyRemovalReminderStatus.SCHEDULED },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'inspection', event: makeEvent(EventType.INSPECTION, futureDate), waived: false, days: 17 },
    ]);

    expect(reminderQueue.add).not.toHaveBeenCalled();
    expect(remindersRepo.update).not.toHaveBeenCalled();
  });

  it('cancels the old reminder and Bull job, then schedules a new one when the deadline changes', async () => {
    const oldDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const newDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
    const removeMock = jest.fn();
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      existingReminder: { id: 'reminder-1', deadlineAt: oldDate, bullJobId: 'contingency-reminder:event-1:old', status: ContingencyRemovalReminderStatus.SCHEDULED },
      job: { remove: removeMock },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'loan', event: makeEvent(EventType.LOAN_COMMITMENT, newDate), waived: false, days: 21 },
    ]);

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: ContingencyRemovalReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
    expect(reminderQueue.add).toHaveBeenCalledTimes(1);
  });

  it('cancels any scheduled reminder and schedules nothing new when the contingency is waived', async () => {
    const removeMock = jest.fn();
    const { service, reminderQueue, remindersRepo } = buildScheduler({
      existingReminder: { id: 'reminder-1', deadlineAt: new Date(), bullJobId: 'job-1', status: ContingencyRemovalReminderStatus.SCHEDULED },
      job: { remove: removeMock },
    });

    await service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'loan', event: makeEvent(EventType.LOAN_COMMITMENT, new Date()), waived: true, days: null },
    ]);

    expect(remindersRepo.update).toHaveBeenCalledWith('reminder-1', expect.objectContaining({ status: ContingencyRemovalReminderStatus.CANCELLED }));
    expect(removeMock).toHaveBeenCalled();
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('skips scheduling when there is no persisted event and the contingency is not waived (never fabricates a deadline)', async () => {
    const { service, reminderQueue, qb } = buildScheduler();
    await service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'appraisal', event: null, waived: false, days: null },
    ]);
    expect(reminderQueue.add).not.toHaveBeenCalled();
    expect(qb.values).not.toHaveBeenCalled();
  });

  it('skips scheduling (but does not throw) when the deadline minus 1 day has already passed', async () => {
    const pastDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now — less than the 1-day lead time
    const { service, reminderQueue } = buildScheduler();
    await service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'inspection', event: makeEvent(EventType.INSPECTION, pastDate), waived: false, days: 17 },
    ]);
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('does not propagate a queue outage (e.g. Redis unavailable) — the caller (contract submission) must not 500 because the reminder queue is down', async () => {
    const { service, reminderQueue } = buildScheduler();
    reminderQueue.add.mockRejectedValue(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500000.'));
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await expect(service.scheduleOrReschedule(TRANSACTION_ID, [
      { contingencyType: 'inspection', event: makeEvent(EventType.INSPECTION, futureDate), waived: false, days: 17 },
    ])).resolves.toBeUndefined();
  });
});

describe('ContingencyRemovalReminderSchedulerService.cancelForSatisfiedContingencies', () => {
  it('cancels the scheduled reminder and removes its Bull job for each satisfied type', async () => {
    const removeMock = jest.fn();
    const { service, remindersRepo } = buildScheduler({
      existingReminder: { id: 'reminder-1', bullJobId: 'job-1', status: ContingencyRemovalReminderStatus.SCHEDULED },
      job: { remove: removeMock },
    });

    await service.cancelForSatisfiedContingencies(TRANSACTION_ID, ['inspection', 'loan']);

    expect(remindersRepo.update).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when there is no scheduled reminder for a given type', async () => {
    const { service, remindersRepo } = buildScheduler({ existingReminder: null });
    await service.cancelForSatisfiedContingencies(TRANSACTION_ID, ['appraisal']);
    expect(remindersRepo.update).not.toHaveBeenCalled();
  });
});
