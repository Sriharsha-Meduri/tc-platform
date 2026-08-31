import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionPartyInvitationsTable1745800003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supports inviting external / independent-contractor users to a transaction.
    // Flow: invite created → email sent with token link → recipient signs up (or logs in)
    //       → acceptedAt stamped → transaction_party row created with resolved accountId.
    // Invitees may not belong to any organization (independent contractors).
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_party_invitations" CASCADE`);
  }
}
