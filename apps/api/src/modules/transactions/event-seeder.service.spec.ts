import { EventSeederService } from './event-seeder.service';
import { FinalTermsService } from './final-terms.service';
import { EventType } from '../transaction-events/entities/transaction-event.entity';

function mockRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((rows: unknown[]) => Promise.resolve(rows)),
    create: jest.fn().mockImplementation((v: unknown) => v),
    ...overrides,
  };
}

let docIdCounter = 0;
function makeDoc(extraction: Record<string, unknown>, createdAt: string) {
  return {
    id: `doc-${++docIdCounter}`,
    transactionId: 'tx-1',
    documentType: 'purchase_agreement',
    status: 'uploaded',
    createdAt: new Date(createdAt),
    metadataJson: { extraction },
  };
}

function buildService(deps: {
  docs?: ReturnType<typeof makeDoc>[];
  existingEvents?: Array<{ eventType: EventType; eventDate?: Date; notes?: string | null }>;
} = {}) {
  const documentsRepo = mockRepo({ find: jest.fn().mockResolvedValue(deps.docs ?? []) });
  const eventsRepo = mockRepo({ find: jest.fn().mockResolvedValue(deps.existingEvents ?? []) });
  const reminderScheduler = { scheduleForEvents: jest.fn().mockResolvedValue(undefined) };
  const contingencyReminderScheduler = { scheduleOrReschedule: jest.fn().mockResolvedValue(undefined) };
  const vpReminderScheduler = { scheduleOrReschedule: jest.fn().mockResolvedValue(undefined) };
  const sellerSideReminderScheduler = { scheduleOrReschedule: jest.fn().mockResolvedValue(undefined) };
  const ntpReminderScheduler = { scheduleOrReschedule: jest.fn().mockResolvedValue(undefined) };
  // Real FinalTermsService, backed by the same mocked documentsRepo — so the
  // seeder's deadlines are genuinely produced by the resolver, the same way
  // production wires it, rather than a second independently-faked source.
  const finalTermsService = new FinalTermsService(documentsRepo as never);

  const service = new EventSeederService(
    documentsRepo as never,
    eventsRepo as never,
    reminderScheduler as never,
    contingencyReminderScheduler as never,
    vpReminderScheduler as never,
    sellerSideReminderScheduler as never,
    ntpReminderScheduler as never,
    finalTermsService,
  );

  return { service, documentsRepo, eventsRepo, reminderScheduler, contingencyReminderScheduler, vpReminderScheduler, sellerSideReminderScheduler, ntpReminderScheduler, finalTermsService };
}

describe('EventSeederService', () => {
  it('returns an empty array and skips when no contract-family documents exist', async () => {
    const { service } = buildService({ docs: [] });
    const result = await service.seedFromExtraction('tx-1');
    expect(result).toEqual([]);
  });

  it('only looks at purchase-agreement-family documents, not other document types', async () => {
    const { service, documentsRepo } = buildService();
    await service.seedFromExtraction('tx-1');
    expect(documentsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ transactionId: 'tx-1', documentType: 'purchase_agreement' }) }),
    );
  });

  it('skips contingency-day events entirely when acceptanceDate is missing rather than guessing', async () => {
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: '2026-07-01', acceptanceDate: null, closingDate: null, possessionDate: null },
        contractTerms: { inspectionContingencyDays: 17, loanContingencyDays: 21, appraisalContingencyDays: 17, disclosuresDueDays: 7 },
      }, '2026-07-01T12:00:00Z')],
    });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType }>;
    expect(saved.map((e) => e.eventType)).not.toContain(EventType.INSPECTION);
    expect(saved.map((e) => e.eventType)).not.toContain(EventType.DISCLOSURES_DUE);
    // offerDate alone is still recorded
    expect(saved.map((e) => e.eventType)).toContain(EventType.OFFER_ACCEPTED);
  });

  it('does not re-save an event whose computed date is unchanged (idempotent)', async () => {
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: '2026-07-01T12:00:00Z', acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { inspectionContingencyDays: 1 },
      }, '2026-07-01T12:00:00Z')],
      existingEvents: [
        { eventType: EventType.OFFER_ACCEPTED, eventDate: new Date('2026-07-01T12:00:00Z') },
        // Contingency deadlines are date-only (no time-of-day) — local midnight is the canonical representation the resolver produces.
        { eventType: EventType.INSPECTION, eventDate: new Date(2026, 6, 2) }, // Thu Jul 2 — matches the recomputed date
      ],
    });
    await service.seedFromExtraction('tx-1');
    expect(eventsRepo.save).not.toHaveBeenCalled();
  });

  it('updates an existing event in place when the negotiated deadline changes, without duplicating it', async () => {
    const existingInspection = { eventType: EventType.INSPECTION, eventDate: new Date(2026, 6, 20), notes: 'stale' };
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { inspectionContingencyDays: 1 }, // recomputes to Jul 2 — different from the stale Jul 20
      }, '2026-07-01T12:00:00Z')],
      existingEvents: [existingInspection],
    });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType; eventDate: Date }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toBe(existingInspection); // same object, updated in place — not a new row
    expect(saved[0].eventDate.getDate()).toBe(2);
  });

  it('merges terms across contract-family documents, letting a later counter-offer override the original RPA', async () => {
    const rpa = makeDoc({
      transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: '2026-08-01T12:00:00Z', possessionDate: null },
      contractTerms: { inspectionContingencyDays: 17, loanContingencyDays: 21, appraisalContingencyDays: 17, disclosuresDueDays: 7 },
    }, '2026-07-01T12:00:00Z');
    // A later-uploaded seller counter-offer that only restates the close-of-escrow date.
    const sco = makeDoc({
      transaction: { closingDate: '2026-08-15T12:00:00Z' },
      contractTerms: {},
    }, '2026-07-05T12:00:00Z');

    const { service, eventsRepo } = buildService({ docs: [rpa, sco] });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType; eventDate: Date }>;

    // The SCO's closing date wins...
    const closing = saved.find((e) => e.eventType === EventType.CLOSING)!;
    expect(closing.eventDate.getUTCMonth()).toBe(7); // August
    expect(closing.eventDate.getUTCDate()).toBe(15);

    // ...but fields the SCO didn't restate still come from the original RPA.
    const inspection = saved.find((e) => e.eventType === EventType.INSPECTION)!;
    expect(inspection).toBeDefined();
  });

  it('computes a contingency deadline on an ordinary business day with no adjustment', async () => {
    // Wed Jul 1, 2026 + 1 day = Thu Jul 2, 2026 -- an ordinary business day.
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { inspectionContingencyDays: 1 },
      }, '2026-07-01T12:00:00Z')],
    });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType; eventDate: Date }>;
    const inspection = saved.find((e) => e.eventType === EventType.INSPECTION)!;
    expect(inspection.eventDate.getDate()).toBe(2);
    expect(inspection.eventDate.getDay()).toBe(4); // Thursday
  });

  it('rolls a contingency deadline landing on a weekend forward to the next business day', async () => {
    // Wed Jul 1, 2026 + 3 days = Sat Jul 4, 2026 -- rolls to Mon Jul 6, 2026.
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { loanContingencyDays: 3 },
      }, '2026-07-01T12:00:00Z')],
    });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType; eventDate: Date }>;
    const loan = saved.find((e) => e.eventType === EventType.LOAN_COMMITMENT)!;
    expect(loan.eventDate.getDay()).toBe(1); // Monday
    expect(loan.eventDate.getDate()).toBe(6);
  });

  it('rolls a contingency deadline landing on an observed holiday past the following weekend', async () => {
    // Wed Jul 1, 2026 + 2 days = Fri Jul 3, 2026, the observed Independence Day -> rolls to Mon Jul 6, 2026.
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { appraisalContingencyDays: 2 },
      }, '2026-07-01T12:00:00Z')],
    });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType; eventDate: Date }>;
    const appraisal = saved.find((e) => e.eventType === EventType.APPRAISAL)!;
    expect(appraisal.eventDate.getDay()).toBe(1); // Monday
    expect(appraisal.eventDate.getDate()).toBe(6);
  });

  it('omits the EMD_DUE event when no initialDepositBusinessDays figure is available (no fabrication)', async () => {
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: '2026-07-01T12:00:00Z', acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: {},
      }, '2026-07-01T12:00:00Z')],
    });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType }>;
    expect(saved.map((e) => e.eventType)).not.toContain(EventType.EMD_DUE);
  });

  it('computes the EMD_DUE event by counting actual business days, not calendar days with a final rollover', async () => {
    // Wed Jul 1, 2026 + 5 business days: Thu Jul 2 (1), Fri Jul 3 observed holiday
    // (skipped), Sat/Sun (skipped), Mon Jul 6 (2), Tue Jul 7 (3), Wed Jul 8 (4),
    // Thu Jul 9 (5) -> Jul 9. Plain calendar-day-plus-adjust math would land on
    // Jul 6 instead, so this pins down the business-day-counting behavior.
    const { service, eventsRepo } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { initialDepositBusinessDays: 5 },
      }, '2026-07-01T12:00:00Z')],
    });
    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType; eventDate: Date }>;
    const emd = saved.find((e) => e.eventType === EventType.EMD_DUE)!;
    expect(emd).toBeDefined();
    expect(emd.eventDate.getDate()).toBe(9);
    expect(emd.eventDate.getDay()).toBe(4); // Thursday
  });

  it('schedules reminders only for newly created events, not updated ones', async () => {
    const staleLoan = { eventType: EventType.LOAN_COMMITMENT, eventDate: new Date(2026, 6, 20), notes: 'stale' };
    const { service, eventsRepo, reminderScheduler } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { loanContingencyDays: 1, inspectionContingencyDays: 1 }, // LOAN_COMMITMENT updates, INSPECTION is new
      }, '2026-07-01T12:00:00Z')],
      existingEvents: [staleLoan],
    });
    await service.seedFromExtraction('tx-1');
    expect(eventsRepo.save).toHaveBeenCalled();
    const scheduled = reminderScheduler.scheduleForEvents.mock.calls[0][0] as Array<{ eventType: EventType }>;
    expect(scheduled.map((e) => e.eventType)).toEqual([EventType.INSPECTION]);
  });

  it('calls the VP reminder scheduler with the resolved CLOSING event, alongside the contingency scheduler', async () => {
    const { service, vpReminderScheduler } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: '2026-08-15T12:00:00Z', possessionDate: null },
        contractTerms: {},
      }, '2026-07-01T12:00:00Z')],
    });

    await service.seedFromExtraction('tx-1');

    expect(vpReminderScheduler.scheduleOrReschedule).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ eventType: EventType.CLOSING }),
    );
  });

  it('calls the VP reminder scheduler with null when no CLOSING event has ever resolved', async () => {
    const { service, vpReminderScheduler } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: {},
      }, '2026-07-01T12:00:00Z')],
    });

    await service.seedFromExtraction('tx-1');

    expect(vpReminderScheduler.scheduleOrReschedule).toHaveBeenCalledWith('tx-1', null);
  });

  it('calls the seller-side reminder scheduler with the resolved DISCLOSURES_DUE event, alongside the other schedulers', async () => {
    const { service, sellerSideReminderScheduler } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: { disclosuresDueDays: 7 },
      }, '2026-07-01T12:00:00Z')],
    });

    await service.seedFromExtraction('tx-1');

    expect(sellerSideReminderScheduler.scheduleOrReschedule).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ eventType: EventType.DISCLOSURES_DUE }),
    );
  });

  it('calls the seller-side reminder scheduler with null when no DISCLOSURES_DUE event has ever resolved', async () => {
    const { service, sellerSideReminderScheduler } = buildService({
      docs: [makeDoc({
        transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
        contractTerms: {},
      }, '2026-07-01T12:00:00Z')],
    });

    await service.seedFromExtraction('tx-1');

    expect(sellerSideReminderScheduler.scheduleOrReschedule).toHaveBeenCalledWith('tx-1', null);
  });

  it('consistency: the transaction_events deadlines match FinalTermsService.computeAndPersist exactly, for the same input', async () => {
    const docs = [makeDoc({
      transaction: { offerDate: null, acceptanceDate: '2026-07-01T12:00:00Z', closingDate: null, possessionDate: null },
      contractTerms: { inspectionContingencyDays: 1, loanContingencyDays: 3, appraisalContingencyDays: 2, disclosuresDueDays: 7, initialDepositBusinessDays: 5 },
    }, '2026-07-01T12:00:00Z')];
    const { service, eventsRepo, finalTermsService } = buildService({ docs });

    await service.seedFromExtraction('tx-1');
    const saved = eventsRepo.save.mock.calls[0][0] as Array<{ eventType: EventType; eventDate: Date }>;

    // Recompute independently via the same FinalTermsService instance the
    // seeder itself calls internally — this is the single source of truth,
    // so the two must produce byte-identical deadline strings.
    const finalTerms = await finalTermsService.computeAndPersist('tx-1');
    const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const inspectionEvent = saved.find((e) => e.eventType === EventType.INSPECTION)!;
    const loanEvent = saved.find((e) => e.eventType === EventType.LOAN_COMMITMENT)!;
    const appraisalEvent = saved.find((e) => e.eventType === EventType.APPRAISAL)!;
    const disclosuresEvent = saved.find((e) => e.eventType === EventType.DISCLOSURES_DUE)!;
    const emdEvent = saved.find((e) => e.eventType === EventType.EMD_DUE)!;

    expect(isoLocal(inspectionEvent.eventDate)).toBe(finalTerms!.terms.find((t) => t.key === 'inspection')!.deadline);
    expect(isoLocal(loanEvent.eventDate)).toBe(finalTerms!.terms.find((t) => t.key === 'loan')!.deadline);
    expect(isoLocal(appraisalEvent.eventDate)).toBe(finalTerms!.terms.find((t) => t.key === 'appraisal')!.deadline);
    expect(isoLocal(disclosuresEvent.eventDate)).toBe(finalTerms!.terms.find((t) => t.key === 'disclosuresDue')!.deadline);
    expect(isoLocal(emdEvent.eventDate)).toBe(finalTerms!.terms.find((t) => t.key === 'emdInitialDeposit')!.deadline);
  });
});
