import { ReminderSchedulerService } from './reminder-scheduler.service';
import { EventType } from '../transaction-events/entities/transaction-event.entity';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';

const TRANSACTION_ID = 'tx-1';

function makeEvent(eventType: EventType, eventDate: Date, id = 'event-1') {
  return { id, eventType, eventDate } as never;
}

function makeParty(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'party-1',
    displayName: 'Alice Agent',
    email: 'agent@brokerage.com',
    partyRole: PartyRole.BUYER_AGENT,
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

function buildService(overrides: {
  transaction?: unknown;
  parties?: unknown[];
} = {}) {
  const qb = buildQueryBuilder();
  const remindersRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    find: jest.fn().mockResolvedValue([]),
  };
  const transactionsRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.transaction !== undefined ? overrides.transaction : makeTransaction()),
  };
  const partiesRepo = {
    find: jest.fn().mockResolvedValue(overrides.parties !== undefined ? overrides.parties : [makeParty()]),
  };
  const eventsRepo = { findOne: jest.fn() };
  const customRemindersRepo = { create: jest.fn(), save: jest.fn() };
  const clockService = { findByTransaction: jest.fn().mockResolvedValue(null) };
  const reminderQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
  };

  const service = new ReminderSchedulerService(
    reminderQueue as never,
    transactionsRepo as never,
    partiesRepo as never,
    remindersRepo as never,
    eventsRepo as never,
    customRemindersRepo as never,
    clockService as never,
  );

  return { service, reminderQueue, remindersRepo, transactionsRepo, partiesRepo, qb };
}

describe('ReminderSchedulerService.scheduleForEvents', () => {
  it('enqueues a reminder job per event/offset pair for a future event', async () => {
    const { service, reminderQueue } = buildService();
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await service.scheduleForEvents([makeEvent(EventType.CLOSING, futureDate)], TRANSACTION_ID);

    expect(reminderQueue.add).toHaveBeenCalled();
  });

  it(
    'does not propagate a queue outage (e.g. Redis unavailable) — reproduces the exact live regression where ' +
    'ContractSubmissionService.submitContract -> EventSeederService.seedFromExtraction -> scheduleForEvents crashed ' +
    'with an uncaught ReplyError and turned "Submit & Send Emails" into a 500',
    async () => {
      const { service, reminderQueue } = buildService();
      reminderQueue.add.mockRejectedValue(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500000.'));
      const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

      await expect(
        service.scheduleForEvents([makeEvent(EventType.CLOSING, futureDate)], TRANSACTION_ID),
      ).resolves.toBeUndefined();
    },
  );

  it('keeps scheduling subsequent offsets/events after one enqueue fails, rather than aborting the whole batch', async () => {
    const { service, reminderQueue } = buildService();
    reminderQueue.add
      .mockRejectedValueOnce(new Error('ERR max requests limit exceeded.'))
      .mockResolvedValue(undefined);
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    await service.scheduleForEvents(
      [makeEvent(EventType.CLOSING, futureDate, 'event-1'), makeEvent(EventType.INSPECTION, futureDate, 'event-2')],
      TRANSACTION_ID,
    );

    expect(reminderQueue.add.mock.calls.length).toBeGreaterThan(1);
  });
});
