import { MigrationInterface, QueryRunner } from 'typeorm';

// The transaction_party_invitations table and its NestJS module were never
// wired up to any controller/resolver — no invite-flow was ever built on top
// of it. Dead scaffolding removed as part of a dead-code cleanup pass.
export class DropTransactionPartyInvitationsTable1803000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_party_invitations" CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_party_invitations" (
        "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"       UUID        NOT NULL,
        "partyRole"           VARCHAR     NOT NULL,
        "invitedEmail"        VARCHAR     NOT NULL,
        "invitedDisplayName"  VARCHAR,
        "invitedByAccountId"  UUID        NOT NULL,
        "token"               VARCHAR     NOT NULL,
        "expiresAt"           TIMESTAMPTZ NOT NULL,
        "acceptedAt"          TIMESTAMPTZ,
        "acceptedByAccountId" UUID,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_party_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_party_invitation_token" UNIQUE ("token"),
        CONSTRAINT "FK_invitation_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invitation_invited_by"
          FOREIGN KEY ("invitedByAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_invitation_accepted_by"
          FOREIGN KEY ("acceptedByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_INVITATIONS_TX"    ON "transaction_party_invitations" ("transactionId")`);
    await queryRunner.query(`CREATE INDEX "IDX_INVITATIONS_EMAIL" ON "transaction_party_invitations" ("invitedEmail")`);
    await queryRunner.query(`CREATE INDEX "IDX_INVITATIONS_TOKEN" ON "transaction_party_invitations" ("token")`);
  }
}
