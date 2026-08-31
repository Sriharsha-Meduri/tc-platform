import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { UserEntity, UserRole, UserStatus } from '../../../modules/users/entities/user.entity';

const SEED_USERS = [
  { email: 'sarah.broker@sunsetrealty.com', phone: '+15550001001', roles: [UserRole.BROKER_ADMIN] },
  { email: 'alice.tc@sunsetrealty.com',     phone: '+15550001002', roles: [UserRole.TRANSACTION_COORDINATOR] },
  { email: 'bob.tc@sunsetrealty.com',       phone: '+15550001003', roles: [UserRole.TRANSACTION_COORDINATOR] },
  { email: 'carol.agent@sunsetrealty.com',  phone: '+15550001004', roles: [UserRole.AGENT] },
  { email: 'david.agent@sunsetrealty.com',  phone: '+15550001005', roles: [UserRole.AGENT] },
  // Support admin
  { email: 'admin@tcplatform.com',          phone: '+15550001006', roles: [UserRole.SUPPORT_ADMIN] },
  // Transcend Brokerage Group
  { email: 'elena.broker@transcendbrokerage.com', phone: '+15550001007', roles: [UserRole.BROKER_ADMIN] },
];

export async function seedUsers(dataSource: DataSource): Promise<UserEntity[]> {
  const repo = dataSource.getRepository(UserEntity);
  const password = await bcrypt.hash('Password1!', 10);

  const created: UserEntity[] = [];

  for (const u of SEED_USERS) {
    const existing = await repo.findOne({ where: { email: u.email } });
    if (existing) {
      let changed = false;
      if (existing.status !== UserStatus.ACTIVE) {
        existing.status = UserStatus.ACTIVE;
        changed = true;
      }
      const currentRoles = existing.roles || [];
      const needsRoles = u.roles.some(r => !currentRoles.includes(r));
      if (needsRoles) {
        existing.roles = [...new Set([...currentRoles, ...u.roles])];
        changed = true;
      }
      if (changed) {
        await repo.save(existing);
      }
      created.push(existing);
      continue;
    }
    const user = repo.create({ ...u, passwordHash: password, status: UserStatus.ACTIVE });
    const saved = await repo.save(user);
    created.push(saved);
  }

  console.log(`  [users] ${created.length} users (${SEED_USERS.length - created.length} skipped).`);
  return created;
}
