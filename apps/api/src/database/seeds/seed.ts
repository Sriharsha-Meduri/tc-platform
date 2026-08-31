/**
 * Standalone seed runner — no NestJS context needed.
 * Run from apps/api/:  pnpm seed
 *
 * Idempotent: each seeder checks for existing rows and skips if already populated.
 * Order matters — respect FK dependencies.
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { seedUsers } from './data/users.seed-data';
import { seedAccounts } from './data/accounts.seed-data';
import { seedOrganizations, seedMemberships } from './data/organizations.seed-data';
import { MemberRole } from '../../modules/organizations/entities/organization-membership.entity';
import { seedContacts, seedTransactions, seedMessages } from './data/transactions.seed-data';
import { seedFormTemplates } from './data/form-templates.seed-data';
import { seedAuditLogs } from './data/audit-logs.seed-data';

async function run() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();

  console.log('Running seeders...');

  // 1. Users (auth identities)
  const users = await seedUsers(AppDataSource);

  // 2. Accounts (profiles, 1:1 with users)
  const accounts = await seedAccounts(AppDataSource, users);

  // 3. Organizations + memberships
  const orgs = await seedOrganizations(AppDataSource);
  const sunsetOrg = orgs.find((o) => o.name === 'Sunset Realty Group')!;
  const transcendOrg = orgs.find((o) => o.name === 'Transcend Brokerage Group')!;

  // Sunset Realty Group — accounts[0]=Sarah(broker_admin), [1]=Alice(tc), [2]=Bob(tc), [3]=Carol(agent), [4]=David(agent)
  await seedMemberships(AppDataSource, sunsetOrg, [
    { account: accounts[0], role: MemberRole.BROKER_ADMIN,            isPrimary: true  },
    { account: accounts[1], role: MemberRole.TRANSACTION_COORDINATOR, isPrimary: false },
    { account: accounts[2], role: MemberRole.TRANSACTION_COORDINATOR, isPrimary: false },
    { account: accounts[3], role: MemberRole.AGENT,                   isPrimary: false },
    { account: accounts[4], role: MemberRole.AGENT,                   isPrimary: false },
  ]);

  // Transcend Brokerage Group — accounts[6]=Elena(broker_admin)
  await seedMemberships(AppDataSource, transcendOrg, [
    { account: accounts[6], role: MemberRole.BROKER_ADMIN, isPrimary: true },
  ]);

  // 4. Form templates (per-org form expectations)
  await seedFormTemplates(AppDataSource, sunsetOrg, accounts[0].id);
  await seedFormTemplates(AppDataSource, transcendOrg, accounts[6].id);

  // 5. Contacts (buyers, sellers, third-parties)
  const contacts = await seedContacts(AppDataSource);

  // 6. Transactions, parties, journals, tasks
  await seedTransactions(AppDataSource, sunsetOrg, accounts, contacts);

  // 7. Transaction messages (email threads for swimlane demo)
  await seedMessages(AppDataSource);

  // 8. Audit logs (demo entries for admin panel)
  await seedAuditLogs(AppDataSource, accounts);

  console.log('\nSeeding complete.');
  await AppDataSource.destroy();
}

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
