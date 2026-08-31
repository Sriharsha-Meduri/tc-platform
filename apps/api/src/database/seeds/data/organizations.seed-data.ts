import { DataSource } from 'typeorm';
import { OrganizationEntity, OrgType, OrgStatus } from '../../../modules/organizations/entities/organization.entity';
import { OrganizationMembershipEntity, MemberRole } from '../../../modules/organizations/entities/organization-membership.entity';
import { AccountEntity } from '../../../modules/accounts/entities/account.entity';

const ORG_DATA = [
  {
    name: 'Sunset Realty Group',
    type: OrgType.BROKERAGE,
    licenseNumber: 'CA-BRE-01234567',
    emailDomain: 'sunsetrealty.com',
    phone: '+15559990100',
    status: OrgStatus.ACTIVE,
    addressLine1: '100 Sunset Blvd',
    city: 'Los Angeles',
    state: 'CA',
    postalCode: '90028',
    country: 'US',
  },
  {
    name: 'Transcend Brokerage Group',
    type: OrgType.BROKERAGE,
    licenseNumber: 'CA-BRE-09999001',
    emailDomain: 'transcendbrokerage.com',
    phone: '+15559990900',
    status: OrgStatus.ACTIVE,
    addressLine1: '1 Market Plaza',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
  },
];

export async function seedOrganizations(
  dataSource: DataSource,
): Promise<OrganizationEntity[]> {
  const orgRepo = dataSource.getRepository(OrganizationEntity);

  const created: OrganizationEntity[] = [];

  for (const d of ORG_DATA) {
    const existing = await orgRepo.findOne({ where: { name: d.name } });
    if (existing) {
      created.push(existing);
      continue;
    }
    const org = orgRepo.create(d);
    const saved = await orgRepo.save(org);
    created.push(saved);
  }

  console.log(`  [organizations] ${created.length} orgs (${ORG_DATA.length - created.length} skipped).`);
  return created;
}

export async function seedMemberships(
  dataSource: DataSource,
  organization: OrganizationEntity,
  roles: Array<{ account: AccountEntity; role: MemberRole; isPrimary: boolean }>,
): Promise<void> {
  const repo = dataSource.getRepository(OrganizationMembershipEntity);

  let seeded = 0;

  for (const { account, role, isPrimary } of roles) {
    const existing = await repo.findOne({
      where: { organizationId: organization.id, accountId: account.id },
    });
    if (existing) continue;
    const membership = repo.create({
      organizationId: organization.id,
      accountId: account.id,
      role,
      isPrimary,
      joinedAt: new Date('2024-01-15'),
    });
    await repo.save(membership);
    seeded++;
  }

  console.log(`  [memberships] ${seeded} created for ${organization.name}.`);
}
