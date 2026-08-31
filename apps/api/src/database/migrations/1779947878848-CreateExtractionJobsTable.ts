import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateExtractionJobsTable1779947878848 implements MigrationInterface {
    name = 'CreateExtractionJobsTable1779947878848'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "extraction_jobs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "status" character varying NOT NULL DEFAULT 'processing',
                "progressJson" jsonb,
                "progressVersion" integer NOT NULL DEFAULT 0,
                "resultJson" jsonb,
                "draftResultJson" jsonb,
                "error" text,
                "errorDetailsJson" jsonb,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_extraction_jobs_id" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "extraction_jobs"`);
    }
}
