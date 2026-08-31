import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddContingencyStatusToApprovalRequests1784043910001 implements MigrationInterface {
  name = 'AddContingencyStatusToApprovalRequests1784043910001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('approval_requests', new TableColumn({
      name: 'contingencyStatus',
      type: 'jsonb',
      isNullable: true,
      default: `'{}'`,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('approval_requests', 'contingencyStatus');
  }
}
