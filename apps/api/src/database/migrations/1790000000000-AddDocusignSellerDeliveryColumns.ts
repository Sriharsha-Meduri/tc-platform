import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddDocusignSellerDeliveryColumns1790000000000 implements MigrationInterface {
  name = 'AddDocusignSellerDeliveryColumns1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('docusign_envelopes', [
      new TableColumn({ name: 'ccRecipients', type: 'jsonb', isNullable: true }),
      new TableColumn({ name: 'uploadLinkId', type: 'uuid', isNullable: true }),
    ]);
    await queryRunner.createIndex('docusign_envelopes', new TableIndex({
      name: 'IDX_docusign_envelopes_uploadLinkId',
      columnNames: ['uploadLinkId'],
    }));

    await queryRunner.addColumns('upload_links', [
      new TableColumn({ name: 'docusignConfirmationRequestedAt', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'docusignConfirmedAt', type: 'timestamptz', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('upload_links', ['docusignConfirmationRequestedAt', 'docusignConfirmedAt']);
    await queryRunner.dropIndex('docusign_envelopes', 'IDX_docusign_envelopes_uploadLinkId');
    await queryRunner.dropColumns('docusign_envelopes', ['ccRecipients', 'uploadLinkId']);
  }
}
