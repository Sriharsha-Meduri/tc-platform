import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionAccessGrantsTable1745900002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transaction_access_grants (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id          UUID NOT NULL REFERENCES real_estate_transactions(id) ON DELETE CASCADE,
        account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        granted_by_account_id   UUID REFERENCES accounts(id) ON DELETE SET NULL,
        access_level            varchar NOT NULL DEFAULT 'collaborate',
        granted_at              timestamptz NOT NULL DEFAULT now(),
        expires_at              timestamptz,
        revoked_at              timestamptz,
        created_at              timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_transaction_access_grants_tx_account
          UNIQUE (transaction_id, account_id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_transaction_access_grants_transaction_id ON transaction_access_grants(transaction_id)`);
    await queryRunner.query(`CREATE INDEX idx_transaction_access_grants_account_id ON transaction_access_grants(account_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE transaction_access_grants`);
  }
}
