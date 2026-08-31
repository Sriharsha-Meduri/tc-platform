import {
  isWeekend,
  isHoliday,
  isBusinessDay,
  addCalendarDays,
  adjustToNextBusinessDay,
  addBusinessAdjustedDays,
  addBusinessDays,
} from './business-day.util';

describe('business-day.util', () => {
  describe('isWeekend', () => {
    it('identifies Saturday and Sunday as weekend', () => {
      expect(isWeekend(new Date(2026, 6, 4))).toBe(true);  // Sat Jul 4, 2026
      expect(isWeekend(new Date(2026, 6, 5))).toBe(true);  // Sun Jul 5, 2026
    });

    it('identifies weekdays as not weekend', () => {
      expect(isWeekend(new Date(2026, 6, 6))).toBe(false); // Mon Jul 6, 2026
    });
  });

  describe('isHoliday', () => {
    it('recognizes Independence Day observed on the adjacent Friday when July 4 falls on a Saturday', () => {
      // July 4, 2026 is a Saturday -> observed Friday July 3.
      expect(isHoliday(new Date(2026, 6, 3))).toBe(true);
      expect(isHoliday(new Date(2026, 6, 4))).toBe(false); // the actual Saturday isn't itself flagged as the observed holiday
    });

    it('recognizes New Year\'s Day when it falls on a weekday', () => {
      expect(isHoliday(new Date(2026, 0, 1))).toBe(true); // Thu Jan 1, 2026
    });

    it('recognizes Thanksgiving as the 4th Thursday of November', () => {
      expect(isHoliday(new Date(2026, 10, 26))).toBe(true); // Thu Nov 26, 2026
      expect(isHoliday(new Date(2026, 10, 19))).toBe(false); // the Thursday before is not Thanksgiving
    });

    it('does not flag an ordinary weekday as a holiday', () => {
      expect(isHoliday(new Date(2026, 6, 6))).toBe(false); // Mon Jul 6, 2026
    });
  });

  describe('isBusinessDay', () => {
    it('is false for weekends and holidays, true otherwise', () => {
      expect(isBusinessDay(new Date(2026, 6, 4))).toBe(false); // Saturday
      expect(isBusinessDay(new Date(2026, 6, 3))).toBe(false); // observed July 4th holiday (Friday)
      expect(isBusinessDay(new Date(2026, 6, 6))).toBe(true);  // ordinary Monday
    });
  });

  describe('addCalendarDays', () => {
    it('adds calendar days without any weekend/holiday awareness', () => {
      const result = addCalendarDays(new Date(2026, 6, 1), 3); // Wed Jul 1 + 3 = Sat Jul 4
      expect(result.getDate()).toBe(4);
      expect(isWeekend(result)).toBe(true); // deliberately lands on a weekend — this function does not adjust
    });
  });

  describe('adjustToNextBusinessDay', () => {
    it('leaves a business day unchanged', () => {
      const monday = new Date(2026, 6, 6);
      const result = adjustToNextBusinessDay(monday);
      expect(result.getTime()).toBe(monday.getTime());
    });

    it('rolls a Saturday forward to the following Monday', () => {
      const saturday = new Date(2026, 6, 4);
      const result = adjustToNextBusinessDay(saturday);
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(6);
    });

    it('rolls a holiday-observed Friday forward past the weekend to Monday', () => {
      // July 3, 2026 is the observed Independence Day (Friday) -> next business day is Monday July 6.
      const observedHoliday = new Date(2026, 6, 3);
      const result = adjustToNextBusinessDay(observedHoliday);
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(6);
    });
  });

  describe('addBusinessAdjustedDays', () => {
    it('returns the plain calendar-day result when it lands on a business day', () => {
      // Wed Jul 1, 2026 + 2 days = Fri Jul 3 -- but Jul 3 is the observed July 4th holiday, so it should roll to Monday Jul 6.
      // Use a case that lands on an ordinary business day instead: Jul 1 + 1 = Jul 2 (Thursday).
      const result = addBusinessAdjustedDays(new Date(2026, 6, 1), 1);
      expect(result.getDate()).toBe(2);
      expect(isBusinessDay(result)).toBe(true);
    });

    it('adjusts a deadline landing on a weekend to the next business day', () => {
      // Wed Jul 1, 2026 + 3 days = Sat Jul 4 -> adjusted to Mon Jul 6.
      const result = addBusinessAdjustedDays(new Date(2026, 6, 1), 3);
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(6);
    });

    it('adjusts a deadline landing on an observed holiday past the following weekend', () => {
      // Wed Jul 1, 2026 + 2 days = Fri Jul 3, the observed Independence Day -> adjusted to Mon Jul 6.
      const result = addBusinessAdjustedDays(new Date(2026, 6, 1), 2);
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(6);
    });
  });

  describe('addBusinessDays', () => {
    it('counts only business days when there is no weekend/holiday in the way', () => {
      // Mon Jul 6, 2026 + 3 business days = Thu Jul 9 (Tue, Wed, Thu).
      const result = addBusinessDays(new Date(2026, 6, 6), 3);
      expect(result.getDate()).toBe(9);
      expect(result.getDay()).toBe(4); // Thursday
    });

    it('skips weekend days while counting, not just landing on one', () => {
      // Thu Jul 2, 2026 + 2 business days: Fri Jul 3 is the observed July 4th
      // holiday (skipped), Sat/Sun skipped, so day 1 = Mon Jul 6, day 2 = Tue Jul 7.
      const result = addBusinessDays(new Date(2026, 6, 2), 2);
      expect(result.getDate()).toBe(7);
      expect(result.getDay()).toBe(2); // Tuesday
    });

    it('skips both the observed holiday and the surrounding weekend when counting', () => {
      // Wed Jul 1, 2026 + 3 business days: Jul 2 (Thu, 1), Jul 3 (Fri holiday, skip),
      // Jul 4-5 (weekend, skip), Jul 6 (Mon, 2), Jul 7 (Tue, 3).
      const result = addBusinessDays(new Date(2026, 6, 1), 3);
      expect(result.getDate()).toBe(7);
      expect(result.getDay()).toBe(2); // Tuesday
    });
  });
});
