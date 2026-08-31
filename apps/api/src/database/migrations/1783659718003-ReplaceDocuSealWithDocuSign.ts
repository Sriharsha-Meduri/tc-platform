import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class ReplaceDocuSealWithDocuSign1783659718003 implements MigrationInterface {
  name = 'ReplaceDocuSealWithDocuSign1783659718003';

  async up(qr: QueryRunner): Promise<void> {
    const tableExists = await qr.hasTable('docuseal_submissions');
    if (tableExists) {
      await qr.dropTable('docuseal_submissions');
    }

    const envelopeExists = await qr.hasTable('docusign_envelopes');
    if (!envelopeExists) {
      await qr.createTable(
      new Table({
        name: 'docusign_envelopes',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'transactionId', type: 'uuid' },
          { name: 'envelopeId', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', default: "'created'" },
          { name: 'recipients', type: 'jsonb', isNullable: true },
          { name: 'documentIds', type: 'jsonb', isNullable: true },
          { name: 'envelopeUri', type: 'varchar', isNullable: true },
          { name: 'sentAt', type: 'timestamptz', isNullable: true },
          { name: 'completedAt', type: 'timestamptz', isNullable: true },
          { name: 'lastStatusCheckedAt', type: 'timestamptz', isNullable: true },
          { name: 'error', type: 'varchar', isNullable: true },
          { name: 'signingUrls', type: 'jsonb', isNullable: true },
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
          new TableIndex({ columnNames: ['transactionId'] }),
          new TableIndex({ columnNames: ['envelopeId'] }),
        ],
      }),
      true,
    );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const envelopeExists = await qr.hasTable('docusign_envelopes');
    if (envelopeExists) {
      await qr.dropTable('docusign_envelopes');
    }
  }
}
