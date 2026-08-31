import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionMessagesTable1743724808000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_messages" (
        "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"     UUID        NOT NULL,
        "channel"           VARCHAR     NOT NULL,
        "direction"         VARCHAR     NOT NULL,
        "senderPartyId"     UUID,
        "recipientPartyId"  UUID,
        "subject"           VARCHAR,
        "bodyText"          TEXT,
        "bodyHtml"          TEXT,
        "providerName"      VARCHAR,
        "providerMessageId" VARCHAR,
        "providerThreadId"  VARCHAR,
        "threadKey"         VARCHAR,
        "status"            VARCHAR     NOT NULL DEFAULT 'received',
        "sentAt"            TIMESTAMPTZ,
        "receivedAt"        TIMESTAMPTZ,
        "metadataJson"      JSONB,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_message_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_message_sender"
          FOREIGN KEY ("senderPartyId") REFERENCES "transaction_parties"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_message_recipient"
          FOREIGN KEY ("recipientPartyId") REFERENCES "transaction_parties"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_MESSAGES_TX"         ON "transaction_messages" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_MESSAGES_CHANNEL"    ON "transaction_messages" ("channel")`);
    await queryRunner.query(`CREATE INDEX "IDX_MESSAGES_THREAD_KEY" ON "transaction_messages" ("threadKey")`);
    await queryRunner.query(`CREATE INDEX "IDX_MESSAGES_PROVIDER_ID" ON "transaction_messages" ("providerMessageId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_messages" CASCADE`);
  }
}
