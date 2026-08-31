import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUploadLinksTable1786500000000 implements MigrationInterface {
  name = 'CreateUploadLinksTable1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'upload_links',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'transactionId', type: 'uuid', isNullable: false },
          { name: 'recipientPartyId', type: 'uuid', isNullable: true },
          { name: 'recipientRole', type: 'varchar', isNullable: false },
          { name: 'recipientName', type: 'varchar', isNullable: false },
          { name: 'recipientEmail', type: 'varchar', isNullable: false },
          { name: 'purpose', type: 'varchar', isNullable: false },
          { name: 'tokenHash', type: 'varchar', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: `'active'` },
          { name: 'expiresAt', type: 'timestamptz', isNullable: false },
          { name: 'revokedAt', type: 'timestamptz', isNullable: true },
          { name: 'replacedByUploadLinkId', type: 'uuid', isNullable: true },
          { name: 'createdByAccountId', type: 'uuid', isNullable: true },
          { name: 'emailSentAt', type: 'timestamptz', isNullable: true },
          { name: 'emailMessageId', type: 'varchar', isNullable: true },
          { name: 'firstAccessedAt', type: 'timestamptz', isNullable: true },
          { name: 'lastAccessedAt', type: 'timestamptz', isNullable: true },
          { name: 'uploadCount', type: 'integer', isNullable: false, default: 0 },
          { name: 'createdAt', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
        indices: [
          { columnNames: ['transactionId'] },
          { columnNames: ['recipientPartyId'] },
        ],
        foreignKeys: [
          { columnNames: ['transactionId'], referencedTableName: 'real_estate_transactions', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['recipientPartyId'], referencedTableName: 'transaction_parties', referencedColumnNames: ['id'], onDelete: 'SET NULL' },
          { columnNames: ['createdByAccountId'], referencedTableName: 'accounts', referencedColumnNames: ['id'], onDelete: 'SET NULL' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'upload_links',
      new TableIndex({ name: 'IDX_upload_links_token_hash', columnNames: ['tokenHash'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('upload_links', true);
  }
}
