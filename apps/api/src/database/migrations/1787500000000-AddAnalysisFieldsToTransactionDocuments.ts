import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddAnalysisFieldsToTransactionDocuments1787500000000 implements MigrationInterface {
  name = 'AddAnalysisFieldsToTransactionDocuments1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('transaction_documents', [
      new TableColumn({ name: 'uploadLinkId', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'analysisStatus', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'analyzedAt', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'idempotencyKey', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'fileSizeBytes', type: 'integer', isNullable: true }),
    ]);

    await queryRunner.createForeignKey('transaction_documents', new TableForeignKey({
      columnNames: ['uploadLinkId'],
      referencedTableName: 'upload_links',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL',
    }));

    await queryRunner.createIndex(
      'transaction_documents',
      new TableIndex({ name: 'IDX_transaction_documents_upload_link_id', columnNames: ['uploadLinkId'] }),
    );

    // Prevents duplicate document rows from a retried/double-clicked upload request for the
    // same secure link — Postgres allows unlimited NULLs in a unique index, so this has zero
    // effect on every other document-creation path, which never sets idempotencyKey.
    await queryRunner.createIndex(
      'transaction_documents',
      new TableIndex({
        name: 'IDX_transaction_documents_upload_link_idempotency_key',
        columnNames: ['uploadLinkId', 'idempotencyKey'],
        isUnique: true,
        where: '"idempotencyKey" IS NOT NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('transaction_documents', 'IDX_transaction_documents_upload_link_idempotency_key');
    await queryRunner.dropIndex('transaction_documents', 'IDX_transaction_documents_upload_link_id');

    const table = await queryRunner.getTable('transaction_documents');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('uploadLinkId'));
    if (fk) await queryRunner.dropForeignKey('transaction_documents', fk);

    await queryRunner.dropColumns('transaction_documents', ['uploadLinkId', 'analysisStatus', 'analyzedAt', 'idempotencyKey', 'fileSizeBytes']);
  }
}
