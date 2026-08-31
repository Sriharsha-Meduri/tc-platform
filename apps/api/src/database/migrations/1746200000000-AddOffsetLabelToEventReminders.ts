import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `offset_label` varchar to `transaction_event_reminders`.
 *
 * This replaces the int `days_before_deadline` as the primary offset identifier,
 * allowing arbitrary units (d / h / m) configured via REMINDER_SCHEDULE env var.
 *
 * Existing rows are back-filled: days_before_deadline value → "{N}d" label
 * (e.g. 7 → "7d", 0 → "0d").
 *
 * `days_before_deadline` is kept as a nullable int for historical reference.
 */
export class AddOffsetLabelToEventReminders1746200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the new column (nullable first so back-fill can run on existing rows)
    await queryRunner.query(`
      ALTER TABLE transaction_event_reminders
      ADD COLUMN IF NOT EXISTS offset_label varchar;
    `);

    // Back-fill from existing days_before_deadline values
    await queryRunner.query(`
      UPDATE transaction_event_reminders
      SET offset_label = days_before_deadline::text || 'd'
      WHERE offset_label IS NULL;
    `);

    // Now enforce NOT NULL
    await queryRunner.query(`
      ALTER TABLE transaction_event_reminders
      ALTER COLUMN offset_label SET NOT NULL;
    `);

    // Make days_before_deadline nullable (it stays for historical reference only)
    await queryRunner.query(`
      ALTER TABLE transaction_event_reminders
      ALTER COLUMN days_before_deadline DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transaction_event_reminders
      ALTER COLUMN days_before_deadline SET NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_event_reminders
      DROP COLUMN IF EXISTS offset_label;
    `);
  }
}
