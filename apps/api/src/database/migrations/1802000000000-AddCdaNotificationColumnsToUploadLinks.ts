import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCdaNotificationColumnsToUploadLinks1802000000000 implements MigrationInterface {
  name = 'AddCdaNotificationColumnsToUploadLinks1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('upload_links', [
      new TableColumn({ name: 'cdaNotifiedAt', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'cdaNotifiedContentHash', type: 'varchar', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('upload_links', ['cdaNotifiedAt', 'cdaNotifiedContentHash']);
  }
}
