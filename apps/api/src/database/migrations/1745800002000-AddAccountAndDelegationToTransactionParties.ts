import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountAndDelegationToTransactionParties1745800002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // accountId — links a system user's account to a party record.
    // External people (buyers, sellers, lenders) keep contactId only.
    // Internal users (agents, TCs) set accountId; contactId is optional.
    await queryRunner.query(`
      ALTER TABLE "transaction_parties"
        ADD COLUMN IF NOT EXISTS "accountId"         UUID,
        ADD COLUMN IF NOT EXISTS "delegatedByPartyId" UUID
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction_parties"
        ADD CONSTRAINT "FK_party_account"
          FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_party_delegated_by"
          FOREIGN KEY ("delegatedByPartyId") REFERENCES "transaction_parties"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`CREATE INDEX "IDX_PARTIES_ACCOUNT"  ON "transaction_parties" ("accountId")`);
    await queryRunner.query(`CREATE INDEX "IDX_PARTIES_DELEGATED" ON "transaction_parties" ("delegatedByPartyId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PARTIES_DELEGATED"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PARTIES_ACCOUNT"`);
    await queryRunner.query(`
      ALTER TABLE "transaction_parties"
        DROP CONSTRAINT IF EXISTS "FK_party_delegated_by",
        DROP CONSTRAINT IF EXISTS "FK_party_account",
        DROP COLUMN IF EXISTS "delegatedByPartyId",
        DROP COLUMN IF EXISTS "accountId"
    `);
  }
}
