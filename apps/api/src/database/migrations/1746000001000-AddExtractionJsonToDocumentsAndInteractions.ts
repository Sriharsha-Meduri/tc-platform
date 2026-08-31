import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExtractionJsonToDocumentsAndInteractions1746000001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Link transaction_documents → ai_interactions (which LLM call produced the extraction)
    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        ADD COLUMN "ai_interaction_id" UUID
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        ADD CONSTRAINT "FK_td_ai_interaction"
          FOREIGN KEY ("ai_interaction_id")
          REFERENCES "ai_interactions"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_td_ai_interaction_id" ON "transaction_documents" ("ai_interaction_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_td_ai_interaction_id"`);
    await queryRunner.query(`
      ALTER TABLE "transaction_documents"
        DROP CONSTRAINT "FK_td_ai_interaction",
        DROP COLUMN "ai_interaction_id"
    `);
  }
}
