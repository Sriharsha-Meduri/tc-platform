import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsTable1743724805000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "real_estate_transactions" (
        "id"                             UUID           NOT NULL DEFAULT gen_random_uuid(),
        "organizationId"                 UUID           NOT NULL,
        "transactionNumber"              VARCHAR        NOT NULL,
        "externalRef"                    VARCHAR,
        "transactionType"                VARCHAR        NOT NULL,
        "side"                           VARCHAR        NOT NULL,
        "status"                         VARCHAR        NOT NULL DEFAULT 'draft',
        "stage"                          VARCHAR        NOT NULL DEFAULT 'intake',
        "propertyAddressLine1"           VARCHAR        NOT NULL,
        "propertyAddressLine2"           VARCHAR,
        "propertyCity"                   VARCHAR        NOT NULL,
        "propertyState"                  VARCHAR        NOT NULL,
        "propertyPostalCode"             VARCHAR,
        "propertyCounty"                 VARCHAR,
        "apn"                            VARCHAR,
        "mlsNumber"                      VARCHAR,
        "bedrooms"                       NUMERIC(5,2),
        "bathrooms"                      NUMERIC(5,2),
        "squareFeet"                     INTEGER,
        "lotSizeSqft"                    INTEGER,
        "yearBuilt"                      INTEGER,
        "listPrice"                      NUMERIC(14,2),
        "contractPrice"                  NUMERIC(14,2),
        "earnestMoneyAmount"             NUMERIC(14,2),
        "commissionAmount"               NUMERIC(14,2),
        "offerAcceptedAt"                TIMESTAMPTZ,
        "openEscrowAt"                   TIMESTAMPTZ,
        "inspectionDeadlineAt"           TIMESTAMPTZ,
        "financeDeadlineAt"              TIMESTAMPTZ,
        "appraisalDeadlineAt"            TIMESTAMPTZ,
        "closeOfEscrowAt"                TIMESTAMPTZ,
        "closedAt"                       TIMESTAMPTZ,
        "cancelledAt"                    TIMESTAMPTZ,
        "createdByAccountId"             UUID           NOT NULL,
        "assignedCoordinatorAccountId"   UUID,
        "summaryJson"                    JSONB,
        "createdAt"                      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        "updatedAt"                      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_transactions"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transaction_number"        UNIQUE ("transactionNumber"),
        CONSTRAINT "FK_transaction_org"
          FOREIGN KEY ("organizationId") REFERENCES "real_estate_organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_transaction_created_by"
          FOREIGN KEY ("createdByAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_transaction_coordinator"
          FOREIGN KEY ("assignedCoordinatorAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_TX_ORG_ID"      ON "real_estate_transactions" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_TX_STATUS"       ON "real_estate_transactions" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_TX_STAGE"        ON "real_estate_transactions" ("stage")`);
    await queryRunner.query(`CREATE INDEX "IDX_TX_CLOSE_DATE"   ON "real_estate_transactions" ("closeOfEscrowAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "real_estate_transactions" CASCADE`);
  }
}
