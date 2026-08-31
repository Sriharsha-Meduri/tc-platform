import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class BuyerAgentApprovalWorkflow1785500000000 implements MigrationInterface {
  name = 'BuyerAgentApprovalWorkflow1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('real_estate_transactions', [
      new TableColumn({
        name: 'buyer_agent_account_id',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'buyer_agent_approval_status',
        type: 'varchar',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('real_estate_transactions', 'buyer_agent_approval_status');
    await queryRunner.dropColumn('real_estate_transactions', 'buyer_agent_account_id');
  }
}
