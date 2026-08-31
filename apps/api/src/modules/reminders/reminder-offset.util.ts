/**
 * Parses the REMINDER_SCHEDULE environment variable into an array of
 * { label, ms } offsets sorted descending (furthest-out first).
 *
 * Format: comma-separated values with a unit suffix:
 *   d = days    (e.g. 7d  = 7 days before deadline)
 *   h = hours   (e.g. 2h  = 2 hours before deadline)
 *   m = minutes (e.g. 30m = 30 minutes before deadline)
 *
 * Examples:
 *   Production:    REMINDER_SCHEDULE=7d,3d,0d
 *   Local testing: REMINDER_SCHEDULE=5m,2m,0m
 *   Mixed:         REMINDER_SCHEDULE=7d,3d,2h,30m
 *
 * Default (when env var is unset): 7d,3d,0d
 */

export interface ReminderOffset {
  /** Raw label as supplied in env, e.g. "7d", "30m", "2h" */
  label: string;
  /** Equivalent milliseconds */
  ms: number;
  /** Human-readable string for display in emails and logs, e.g. "7 days", "30 minutes" */
  display: string;
}

const DEFAULT_SCHEDULE = '7d,3d,0d';

export function loadReminderSchedule(): ReminderOffset[] {
  const raw = process.env.REMINDER_SCHEDULE ?? DEFAULT_SCHEDULE;
  return parseReminderSchedule(raw);
}

export function parseReminderSchedule(raw: string): ReminderOffset[] {
  const offsets = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseOffset);

  // Sort descending so we iterate furthest-out → closest
  return offsets.sort((a, b) => b.ms - a.ms);
}

function parseOffset(label: string): ReminderOffset {
  const match = label.match(/^(\d+(?:\.\d+)?)(d|h|m)$/i);
  if (!match) {
    throw new Error(
      `Invalid REMINDER_SCHEDULE entry: "${label}". ` +
      `Use a number followed by d (days), h (hours), or m (minutes) — e.g. 7d, 2h, 30m.`,
    );
  }

  const value = parseFloat(match[1]);
  const unit  = match[2].toLowerCase() as 'd' | 'h' | 'm';

  const msMap = { d: 86_400_000, h: 3_600_000, m: 60_000 } as const;
  const ms = value * msMap[unit];

  const unitLabel = { d: 'day', h: 'hour', m: 'minute' }[unit];
  const display = value === 0
    ? 'day-of'
    : `${value % 1 === 0 ? value : value} ${unitLabel}${value !== 1 ? 's' : ''}`;

  return { label, ms, display };
}
