import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RemoveBuyerAgentApprovalStatus1786000000000 implements MigrationInterface {
  name = 'RemoveBuyerAgentApprovalStatus1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Buyer Agent approval gating has been removed — any transaction still
    // parked in the old pending status should be treated as active.
    await queryRunner.query(
      `UPDATE "real_estate_transactions" SET "status" = 'active' WHERE "status" = 'agent_approval_pending'`,
    );
    await queryRunner.dropColumn('real_estate_transactions', 'buyer_agent_approval_status');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('real_estate_transactions', new TableColumn({
      name: 'buyer_agent_approval_status',
      type: 'varchar',
      isNullable: true,
    }));
  }
}
