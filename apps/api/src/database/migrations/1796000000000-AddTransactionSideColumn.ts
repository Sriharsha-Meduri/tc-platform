import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionSideColumn1796000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE real_estate_transactions
        ADD COLUMN transaction_side VARCHAR NULL;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN real_estate_transactions.transaction_side IS
        'Which side of the transaction is being coordinated: ''BUYER'' or ''SELLER''.
         NULL on legacy rows — treated as ''BUYER'' at the application layer for
         backward compatibility. Distinct from the ` + '`side`' + ` (agency) column.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE real_estate_transactions DROP COLUMN IF EXISTS transaction_side;
    `);
  }
}
