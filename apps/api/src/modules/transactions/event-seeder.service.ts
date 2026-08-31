import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionDocumentEntity } from '../transaction-documents/entities/transaction-document.entity';
import { TransactionEventEntity, EventType, EventStatus } from '../transaction-events/entities/transaction-event.entity';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { ContingencyRemovalReminderSchedulerService, ContingencyEventCandidate } from '../reminders/contingency-removal-reminder-scheduler.service';
import { ContingencyType } from '../reminders/entities/contingency-removal-reminder.entity';
import { VerificationOfPropertyReminderSchedulerService } from '../reminders/verification-of-property-reminder-scheduler.service';
import { SellerSideDocumentReminderSchedulerService } from '../reminders/seller-side-document-reminder-scheduler.service';
import { findContractFamilyDocuments } from './contract-terms-merge.util';
import { FinalTermsService } from './final-terms.service';
import type { FinalTermKey } from '@tc/document-intelligence';

/** Maps a contingency event type to its checklist contingency type + waived flag + raw day count, from merged terms. */
const CONTINGENCY_EVENT_TYPES: Partial<Record<EventType, ContingencyType>> = {
  [EventType.INSPECTION]: 'inspection',
  [EventType.APPRAISAL]: 'appraisal',
  [EventType.LOAN_COMMITMENT]: 'loan',
};

@Injectable()
export class EventSeederService {
  private readonly logger = new Logger(EventSeederService.name);

  constructor(
    @InjectRepository(TransactionDocumentEntity)
    private readonly documentsRepo: Repository<TransactionDocumentEntity>,
    @InjectRepository(TransactionEventEntity)
    private readonly eventsRepo: Repository<TransactionEventEntity>,
    private readonly reminderScheduler: ReminderSchedulerService,
    private readonly contingencyReminderScheduler: ContingencyRemovalReminderSchedulerService,
    private readonly vpReminderScheduler: VerificationOfPropertyReminderSchedulerService,
    private readonly sellerSideReminderScheduler: SellerSideDocumentReminderSchedulerService,
    private readonly finalTermsService: FinalTermsService,
  ) {}

  /**
   * Reads every contract-family document (RPA plus any counter-offers,
   * addenda, and amendments — SCO/BCO/SMCO/BMCO) for the transaction, oldest
   * first. Every date/deadline this seeder needs — contingency/disclosures/
   * EMD deadlines (`terms`) and offer/closing/possession dates (`valueTerms`)
   * — comes from the single `FinalTermsService.computeAndPersist` call below,
   * the same Final Negotiated Terms resolver the Draft-stage UI and
   * welcome/timeline email read, so this seeder never computes any of them
   * independently and can't disagree with what's shown elsewhere. Creates or
   * updates `transaction_events` rows for every date/deadline that resolves.
   *
   * If `acceptanceDate` is missing, contingency/EMD/disclosures events are
   * skipped rather than guessed. Safe to call repeatedly (e.g. after every
   * document upload) — existing events are updated in place when the
   * negotiated terms change, never duplicated, and never cleared back to
   * "missing" if a later document happens not to restate a value.
   */
  async seedFromExtraction(transactionId: string): Promise<TransactionEventEntity[]> {
    // ── Load every contract-family document, oldest first ──────────────────────
    const docs = await findContractFamilyDocuments(this.documentsRepo, transactionId);

    if (docs.length === 0) {
      this.logger.warn(`No contract documents found for transaction ${transactionId} — skipping event seed`);
      return [];
    }

    // Compute-and-persist is the single source of truth for every contingency,
    // disclosures, EMD deadline, and — since the value-terms consolidation —
    // offer/closing/possession date shown anywhere (this event seeder, the
    // Draft-stage UI, the welcome/timeline email) — never recomputed
    // independently here, so none of those can disagree with each other.
    const finalTerms = await this.finalTermsService.computeAndPersist(transactionId);
    const termByKey = new Map((finalTerms?.terms ?? []).map((t) => [t.key, t]));
    const valueByKey = new Map((finalTerms?.valueTerms ?? []).map((t) => [t.key, t.value]));
    const termDeadline = (key: FinalTermKey): Date | null => this.parseDate(termByKey.get(key)?.deadline ?? null);
    const termDays = (key: FinalTermKey): number | null => termByKey.get(key)?.days ?? null;
    const termWaived = (key: FinalTermKey): boolean => termByKey.get(key)?.status === 'No contingency';

    // ── Build event candidates ─────────────────────────────────────────────────
    const candidates: Array<{ type: EventType; date: Date | null; note: string }> = [
      { type: EventType.OFFER_ACCEPTED,   date: this.parseDate(valueByKey.get('offerDate') as string ?? null),      note: 'Offer date' },
      { type: EventType.CLOSING,          date: this.parseDate(valueByKey.get('closeOfEscrow') as string ?? null), note: 'Close of escrow' },
      { type: EventType.POSSESSION,       date: this.parseDate(valueByKey.get('possession') as string ?? null),    note: 'Possession date' },
      {
        type: EventType.EMD_DUE,
        date: termDeadline('emdInitialDeposit'),
        note: `EMD due (${termDays('emdInitialDeposit') ?? '?'} business days from acceptance)`,
      },
      {
        type: EventType.DISCLOSURES_DUE,
        date: termDeadline('disclosuresDue'),
        note: `Disclosures due (${termDays('disclosuresDue') ?? '?'} days from acceptance)`,
      },
      {
        type: EventType.INSPECTION,
        date: termDeadline('inspection'),
        note: `Inspection contingency (${termDays('inspection') ?? '?'} days from acceptance)`,
      },
      {
        type: EventType.APPRAISAL,
        date: termDeadline('appraisal'),
        note: `Appraisal contingency (${termDays('appraisal') ?? '?'} days from acceptance)`,
      },
      {
        type: EventType.LOAN_COMMITMENT,
        date: termDeadline('loan'),
        note: `Loan contingency (${termDays('loan') ?? '?'} days from acceptance)`,
      },
    ];

    // ── Create new events, update existing ones whose date has changed ─────────
    const existing = await this.eventsRepo.find({ where: { transactionId } });
    const existingByType = new Map(existing.map((e) => [e.eventType, e]));

    const toCreate: TransactionEventEntity[] = [];
    const toUpdate: TransactionEventEntity[] = [];

    for (const c of candidates) {
      if (c.date === null) continue; // never fabricate — leave any existing event untouched
      const current = existingByType.get(c.type);
      if (!current) {
        toCreate.push(
          this.eventsRepo.create({
            transactionId,
            eventType: c.type,
            eventDate: c.date,
            status: EventStatus.SCHEDULED,
            notes: c.note,
          }),
        );
      } else if (current.eventDate.getTime() !== c.date.getTime()) {
        current.eventDate = c.date;
        current.notes = c.note;
        toUpdate.push(current);
      }
    }

    let saved: TransactionEventEntity[] = [];

    if (toCreate.length > 0 || toUpdate.length > 0) {
      saved = await this.eventsRepo.save([...toCreate, ...toUpdate]);

      this.logger.log(
        `Seeded/updated ${saved.length} event(s) for transaction ${transactionId}: ` +
        saved.map((e) => e.eventType).join(', '),
      );

      // Schedule deadline reminder emails for newly created events only —
      // updates to already-scheduled events are left alone here.
      if (toCreate.length > 0) {
        await this.reminderScheduler.scheduleForEvents(toCreate, transactionId);
      }
    } else {
      this.logger.log(`No new or changed events for transaction ${transactionId}`);
    }

    // ── Contingency-removal reminders (Buyer Agent upload link) ────────────────
    // Runs even when nothing above changed — a contingency can transition to
    // "waived" without its stale event row changing (a waived contingency's
    // day count resolves to null, so the "never fabricate" gate above leaves
    // any existing event untouched), and that transition alone must still
    // cancel an obsolete reminder.
    const finalEventByType = new Map(existingByType);
    for (const s of saved) finalEventByType.set(s.eventType, s);

    const contingencyCandidates: ContingencyEventCandidate[] = (
      Object.entries(CONTINGENCY_EVENT_TYPES) as Array<[EventType, ContingencyType]>
    ).map(([eventType, contingencyType]) => ({
      contingencyType,
      event: finalEventByType.get(eventType) ?? null,
      // inspection has no waiver checkbox on the RPA — it's only ever removed via CR-B
      waived: contingencyType === 'inspection' ? false : termWaived(contingencyType),
      days: termDays(contingencyType),
    }));

    await this.contingencyReminderScheduler.scheduleOrReschedule(transactionId, contingencyCandidates);

    // ── Verification of Property reminder (Buyer Agent upload link) ───────────
    // Same "runs even when nothing above changed" reasoning as the contingency
    // call above — re-evaluates against the current Close of Escrow event and
    // VP's own satisfied/not-satisfied state every time this method runs.
    await this.vpReminderScheduler.scheduleOrReschedule(transactionId, finalEventByType.get(EventType.CLOSING) ?? null);

    // ── Seller Side document reminders (Seller Agent upload link) ─────────────
    // Same "runs even when nothing above changed" reasoning as the VP call
    // above — re-evaluates every required Seller Agent form code against the
    // current Seller Disclosures Due event every time this method runs.
    await this.sellerSideReminderScheduler.scheduleOrReschedule(transactionId, finalEventByType.get(EventType.DISCLOSURES_DUE) ?? null);

    return saved;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    // Bare "YYYY-MM-DD" (as produced by the Final Terms resolver's deadline
    // field) is parsed as UTC midnight by `new Date(str)` — displaying it via
    // local-time getters (getDate/getDay, as this service and its tests do)
    // then shows the previous day in any timezone behind UTC. Construct it
    // from local Y/M/D components instead to avoid that shift.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      return new Date(parseInt(dateOnly[1], 10), parseInt(dateOnly[2], 10) - 1, parseInt(dateOnly[3], 10));
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}
