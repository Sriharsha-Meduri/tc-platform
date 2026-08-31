import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionClockSettingsEntity } from './entities/transaction-clock-settings.entity';

// ── US State → IANA timezone mapping ─────────────────────────────────────────

export const STATE_TIMEZONE: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/Kentucky/Louisville',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  DC: 'America/New_York',
};

export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

export function timezoneForState(state: string | null | undefined): string {
  if (!state) return DEFAULT_TIMEZONE;
  return STATE_TIMEZONE[state.toUpperCase().trim()] ?? DEFAULT_TIMEZONE;
}

// ── Virtual clock resolution ──────────────────────────────────────────────────

/**
 * Returns the effective "now" in milliseconds for a transaction.
 * When virtualClockOffsetMs is set, shifts real time by that offset.
 * When null, returns real Date.now().
 */
export function resolveNow(clockSettings: TransactionClockSettingsEntity | null | undefined): number {
  if (!clockSettings?.virtualClockOffsetMs) return Date.now();
  return Date.now() + Number(clockSettings.virtualClockOffsetMs);
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface SetClockDto {
  /** ISO datetime string to set as the virtual "now". Null resets to real time. */
  virtualNow: string | null;
  /** Optional IANA timezone override, e.g. 'America/Chicago'. */
  timezone?: string;
}

@Injectable()
export class TransactionClockService {
  private readonly logger = new Logger(TransactionClockService.name);

  constructor(
    @InjectRepository(TransactionClockSettingsEntity)
    private readonly clockRepo: Repository<TransactionClockSettingsEntity>,
  ) {}

  /**
   * Creates clock settings for a newly-created transaction.
   * Timezone is derived from the transaction's propertyState.
   * virtualClockOffsetMs starts as null (= real time).
   */
  async createForTransaction(
    transactionId: string,
    propertyState: string | null | undefined,
  ): Promise<TransactionClockSettingsEntity> {
    const settings = this.clockRepo.create({
      transactionId,
      timezone: timezoneForState(propertyState),
      virtualClockOffsetMs: null,
    });
    return this.clockRepo.save(settings);
  }

  /** Returns clock settings for a transaction, or null if not yet created. */
  async findByTransaction(transactionId: string): Promise<TransactionClockSettingsEntity | null> {
    return this.clockRepo.findOne({ where: { transactionId } });
  }

  /**
   * Sets the virtual clock for a transaction and reschedules all pending
   * Bull reminder jobs to fire relative to the new virtual "now".
   *
   * Pass { virtualNow: null } to reset to real time.
   */
  async setClock(transactionId: string, dto: SetClockDto): Promise<TransactionClockSettingsEntity> {
    let settings = await this.clockRepo.findOne({ where: { transactionId } });
    if (!settings) throw new NotFoundException(`Clock settings not found for transaction ${transactionId}`);

    // Update timezone if provided
    if (dto.timezone) {
      settings.timezone = dto.timezone;
    }

    // Compute offset
    if (dto.virtualNow === null) {
      settings.virtualClockOffsetMs = null;
    } else {
      const virtualMs = new Date(dto.virtualNow).getTime();
      const offsetMs  = virtualMs - Date.now();
      settings.virtualClockOffsetMs = offsetMs.toString();
    }

    settings = await this.clockRepo.save(settings);

    this.logger.log(
      dto.virtualNow
        ? `Virtual clock set for transaction ${transactionId}: ${dto.virtualNow} (offset ${settings.virtualClockOffsetMs}ms)`
        : `Virtual clock reset to real time for transaction ${transactionId}`,
    );

    return settings;
  }

}
