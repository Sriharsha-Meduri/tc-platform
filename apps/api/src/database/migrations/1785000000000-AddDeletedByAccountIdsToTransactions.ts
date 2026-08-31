import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedByAccountIdsToTransactions1785000000000 implements MigrationInterface {
  name = 'AddDeletedByAccountIdsToTransactions1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "real_estate_transactions" ADD COLUMN "deletedByAccountIds" text[] NOT NULL DEFAULT '{}'::text[]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "real_estate_transactions" DROP COLUMN "deletedByAccountIds"`,
    );
  }
}
