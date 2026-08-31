import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePendingUploadsTable1779947878849 implements MigrationInterface {
    name = 'CreatePendingUploadsTable1779947878849'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "pending_uploads" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "transactionId" character varying NOT NULL,
                "stage" character varying NOT NULL,
                "storageKey" character varying NOT NULL,
                "fileName" character varying NOT NULL,
                "mimeType" character varying NOT NULL,
                "title" character varying NOT NULL,
                "detectedFormCode" character varying,
                "extractionJson" jsonb,
                "complianceJson" jsonb,
                "pdfType" character varying,
                "interactionId" character varying,
                "existingDocId" character varying NOT NULL,
                "existingFormCode" character varying,
                "existingFormName" character varying,
                "existingVersionNo" integer NOT NULL DEFAULT 1,
                "existingUploadedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_pending_uploads_id" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "pending_uploads"`);
    }
}
