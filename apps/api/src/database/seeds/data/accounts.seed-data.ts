import { DataSource } from 'typeorm';
import { AccountEntity } from '../../../modules/accounts/entities/account.entity';
import { UserEntity } from '../../../modules/users/entities/user.entity';

interface AccountSeedInput {
  userId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  timezone: string;
  locale: string;
}

const ACCOUNT_DATA: Omit<AccountSeedInput, 'userId'>[] = [
  { displayName: 'Sarah Broker',   firstName: 'Sarah',  lastName: 'Broker',   timezone: 'America/Los_Angeles', locale: 'en-US' },
  { displayName: 'Alice TC',       firstName: 'Alice',  lastName: 'Thompson', timezone: 'America/Los_Angeles', locale: 'en-US' },
  { displayName: 'Bob TC',         firstName: 'Bob',    lastName: 'Martinez', timezone: 'America/Los_Angeles', locale: 'en-US' },
  { displayName: 'Carol Agent',    firstName: 'Carol',  lastName: 'Williams', timezone: 'America/Los_Angeles', locale: 'en-US' },
  { displayName: 'David Agent',    firstName: 'David',  lastName: 'Lee',      timezone: 'America/Los_Angeles', locale: 'en-US' },
  { displayName: 'Admin User',     firstName: 'Admin',  lastName: 'User',     timezone: 'America/Los_Angeles', locale: 'en-US' },
  { displayName: 'Elena Brooks',   firstName: 'Elena',  lastName: 'Brooks',   timezone: 'America/Los_Angeles', locale: 'en-US' },
];

export async function seedAccounts(
  dataSource: DataSource,
  users: UserEntity[],
): Promise<AccountEntity[]> {
  const repo = dataSource.getRepository(AccountEntity);

  // Match accounts to users by email convention — admin@tcplatform.com gets the last slot
  const created: AccountEntity[] = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const existing = await repo.findOne({ where: { userId: user.id } });
    if (existing) {
      created.push(existing);
      continue;
    }
    const data = ACCOUNT_DATA[i];
    if (!data) continue; // user has no corresponding account data
    const account = repo.create({
      userId: user.id,
      displayName: data.displayName,
      firstName: data.firstName,
      lastName: data.lastName,
      timezone: data.timezone,
      locale: data.locale,
    });
    const saved = await repo.save(account);
    created.push(saved);
  }

  console.log(`  [accounts] ${created.length} accounts.`);
  return created;
}
