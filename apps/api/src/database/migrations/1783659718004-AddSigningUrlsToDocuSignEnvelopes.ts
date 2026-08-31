import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSigningUrlsToDocuSignEnvelopes1783659718004 implements MigrationInterface {
  name = 'AddSigningUrlsToDocuSignEnvelopes1783659718004';

  async up(qr: QueryRunner): Promise<void> {
    const hasSigningUrls = await qr.hasColumn('docusign_envelopes', 'signingUrls');
    if (!hasSigningUrls) {
      await qr.addColumns('docusign_envelopes', [
        new TableColumn({ name: 'signingUrls', type: 'jsonb', isNullable: true }),
        new TableColumn({ name: 'envelopeUri', type: 'varchar', isNullable: true }),
      ]);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.dropColumns('docusign_envelopes', ['signingUrls', 'envelopeUri']);
  }
}
