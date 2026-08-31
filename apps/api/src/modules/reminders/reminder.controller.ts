import { Controller, Get } from '@nestjs/common';
import { loadReminderSchedule } from './reminder-offset.util';

@Controller('reminders')
export class ReminderController {
  /** Returns the active reminder schedule as human-readable display strings. */
  @Get('schedule')
  getSchedule() {
    const offsets = loadReminderSchedule();
    return {
      raw: offsets.map((o) => o.label),
      display: offsets.map((o) => o.display),
    };
  }
}
