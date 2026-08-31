import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCustomRemindersTable1779947878850 implements MigrationInterface {
    name = 'CreateCustomRemindersTable1779947878850'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "custom_reminders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "transaction_id" uuid NOT NULL,
                "fire_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "subject" character varying NOT NULL,
                "message" text,
                "recipients" jsonb,
                "bull_job_id" character varying NOT NULL,
                "status" character varying NOT NULL DEFAULT 'scheduled',
                "sent_at" TIMESTAMP WITH TIME ZONE,
                "cancelled_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_custom_reminders_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_custom_reminders_bull_job_id" UNIQUE ("bull_job_id"),
                CONSTRAINT "FK_custom_reminders_transaction" FOREIGN KEY ("transaction_id")
                    REFERENCES "real_estate_transactions"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_custom_reminders_transaction_id" ON "custom_reminders" ("transaction_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_custom_reminders_transaction_id"`);
        await queryRunner.query(`DROP TABLE "custom_reminders"`);
    }
}
