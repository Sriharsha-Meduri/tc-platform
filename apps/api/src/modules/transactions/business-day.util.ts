/**
 * Weekend/holiday-aware date math for contract deadline calculation.
 *
 * Nothing like this existed anywhere in the repo before — all prior date
 * math (event-seeder's `addDays`) was a naive `Date.setDate()` calendar-day
 * add with no weekend/holiday rollover, despite the buyer timeline email
 * copy already claiming "deadlines falling on a weekend or holiday will be
 * adjusted to the next business day." This makes that claim actually true.
 *
 * Contingency day-counts themselves (loan/appraisal/inspection/disclosures)
 * are still counted in calendar days, per C.A.R. RPA's definition of "Day"/
 * "Days" (Section 25) — only the FINAL deadline is rolled forward to the
 * next business day when it lands on a weekend or holiday.
 */

/** Observed US federal holidays, the common baseline for "business day" in California real estate contracts. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(year, month, day);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const lastWeekday = last.getDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

/** Shift a fixed-date holiday observed on a weekend to the adjacent weekday, per federal convention. */
function observedFixedHoliday(year: number, month: number, day: number): Date {
  const date = new Date(year, month, day);
  const dow = date.getDay();
  if (dow === 6) return new Date(year, month, day - 1); // Saturday -> observed Friday
  if (dow === 0) return new Date(year, month, day + 1); // Sunday -> observed Monday
  return date;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** US federal holidays (observed) for the given year, as a Set of date keys for O(1) lookup. */
function federalHolidaysForYear(year: number): Date[] {
  return [
    observedFixedHoliday(year, 0, 1),               // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3),                // MLK Day — 3rd Monday of January
    nthWeekdayOfMonth(year, 1, 1, 3),                // Presidents' Day — 3rd Monday of February
    lastWeekdayOfMonth(year, 4, 1),                  // Memorial Day — last Monday of May
    observedFixedHoliday(year, 5, 19),               // Juneteenth
    observedFixedHoliday(year, 6, 4),                // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1),                 // Labor Day — 1st Monday of September
    nthWeekdayOfMonth(year, 9, 1, 2),                 // Columbus Day — 2nd Monday of October
    observedFixedHoliday(year, 10, 11),              // Veterans Day
    nthWeekdayOfMonth(year, 10, 4, 4),                // Thanksgiving — 4th Thursday of November
    observedFixedHoliday(year, 11, 25),              // Christmas Day
  ];
}

const holidayCache = new Map<number, Set<string>>();

function holidaySetForYear(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(federalHolidaysForYear(year).map(dateKey));
    holidayCache.set(year, set);
  }
  return set;
}

export function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

export function isHoliday(date: Date): boolean {
  return holidaySetForYear(date.getFullYear()).has(dateKey(date));
}

export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

/** Plain calendar-day addition — no weekend/holiday awareness. */
export function addCalendarDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

/** Roll a date forward to the next business day if it falls on a weekend or holiday; otherwise return it unchanged. */
export function adjustToNextBusinessDay(date: Date): Date {
  let result = new Date(date);
  while (!isBusinessDay(result)) {
    result = addCalendarDays(result, 1);
  }
  return result;
}

/**
 * Add `days` calendar days to `base`, then roll the result forward to the
 * next business day if it lands on a weekend or holiday. This is the
 * standard C.A.R. RPA deadline calculation: contingency periods count in
 * calendar days, but a deadline that falls on a non-business day extends to
 * the next business day.
 */
export function addBusinessAdjustedDays(base: Date, days: number): Date {
  return adjustToNextBusinessDay(addCalendarDays(base, days));
}

/**
 * Count forward `days` *business* days from `base` (weekends and holidays are
 * skipped in the counting itself, not just rolled past at the end). This is
 * distinct from `addBusinessAdjustedDays` — used for RPA terms phrased as
 * "N business days after Acceptance" (e.g. the initial deposit / EMD
 * delivery deadline), as opposed to contingency periods which are always
 * counted in calendar days per C.A.R. RPA §25.
 */
export function addBusinessDays(base: Date, days: number): Date {
  let result = new Date(base);
  let remaining = days;
  while (remaining > 0) {
    result = addCalendarDays(result, 1);
    if (isBusinessDay(result)) remaining -= 1;
  }
  return result;
}
