import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class DocuSignSignedDocumentPromotion1794000000000 implements MigrationInterface {
  name = 'DocuSignSignedDocumentPromotion1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('docusign_envelopes', new TableColumn({
      name: 'completedProcessedAt', type: 'timestamptz', isNullable: true,
    }));

    await queryRunner.addColumn('transaction_documents', new TableColumn({
      name: 'docusignEnvelopeId', type: 'varchar', isNullable: true,
    }));
    await queryRunner.createIndex('transaction_documents', new TableIndex({
      name: 'IDX_transaction_documents_docusignEnvelopeId',
      columnNames: ['docusignEnvelopeId'],
    }));

    // The real duplicate-prevention arbiter: even if two concurrent completion
    // handlers both pass the application-level envelope claim and per-document
    // dup-check (e.g. two different envelopes racing on the same document, or
    // a bug reintroducing the race), the database itself refuses a second
    // signed row for the same original document.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_transaction_documents_signed_previous_version"
      ON "transaction_documents" ("previous_version_id")
      WHERE status = 'signed'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "UQ_transaction_documents_signed_previous_version"');
    await queryRunner.dropIndex('transaction_documents', 'IDX_transaction_documents_docusignEnvelopeId');
    await queryRunner.dropColumn('transaction_documents', 'docusignEnvelopeId');
    await queryRunner.dropColumn('docusign_envelopes', 'completedProcessedAt');
  }
}
