import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboundEmailAddressToTransactions1746000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE real_estate_transactions
      ADD COLUMN IF NOT EXISTS outbound_email_address VARCHAR NULL;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN real_estate_transactions.outbound_email_address IS
        'The From address used for all outbound emails on this transaction.
         Format: {8-char-org-prefix}-{sanitized-street}-{zip}@txn.mytcapp.net
         Computed once at transaction creation from organizationId + propertyAddressLine1
         + propertyPostalCode and never mutated, so Mailgun routing rules and inbound
         reply matching always resolve back to the correct transaction row.
         NULL when the property address was not available at creation time.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE real_estate_transactions
      DROP COLUMN IF EXISTS outbound_email_address;
    `);
  }
}
