import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateVerificationOfPropertyTable1784044000000 implements MigrationInterface {
  name = 'CreateVerificationOfPropertyTable1784044000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.createTable(
      new Table({
        name: 'verification_of_property',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'transactionId', type: 'uuid' },
          { name: 'status', type: 'varchar', default: "'scheduled'" },
          { name: 'scheduledDate', type: 'timestamptz', isNullable: true },
          { name: 'reminderSentAt', type: 'timestamptz', isNullable: true },
          { name: 'documentReceivedAt', type: 'timestamptz', isNullable: true },
          { name: 'validatedAt', type: 'timestamptz', isNullable: true },
          { name: 'sentForSignatureAt', type: 'timestamptz', isNullable: true },
          { name: 'fullyExecutedAt', type: 'timestamptz', isNullable: true },
          { name: 'docusignEnvelopeId', type: 'varchar', isNullable: true },
          { name: 'vopDocumentId', type: 'varchar', isNullable: true },
          { name: 'createdByAccountId', type: 'varchar', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'metadataJson', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
        foreignKeys: [
          {
            columnNames: ['transactionId'],
            referencedTableName: 'real_estate_transactions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          new TableIndex({ columnNames: ['transactionId'], isUnique: true }),
          new TableIndex({ columnNames: ['status'] }),
        ],
      }),
      true,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropTable('verification_of_property');
  }
}
