import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMembershipEntity, MembershipStatus } from './entities/organization-membership.entity';
import { CreateMembershipInput } from './dto/create-membership.input';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(OrganizationMembershipEntity)
    private readonly membershipsRepo: Repository<OrganizationMembershipEntity>,
  ) {}

  findAll(): Promise<OrganizationMembershipEntity[]> {
    return this.membershipsRepo.find();
  }

  findByOrganization(organizationId: string): Promise<OrganizationMembershipEntity[]> {
    return this.membershipsRepo.find({ where: { organizationId } });
  }

  findByAccount(accountId: string): Promise<OrganizationMembershipEntity[]> {
    return this.membershipsRepo.find({ where: { accountId } });
  }

  async findOrgMembersByAccount(accountId: string) {
    const own = await this.membershipsRepo.findOne({ where: { accountId } });
    if (!own) return [];
    const rows = await this.membershipsRepo.find({
      where: { organizationId: own.organizationId },
      relations: ['account', 'account.user'],
      order: { role: 'ASC' },
    });
    return rows.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      accountId: m.accountId,
      role: m.role,
      status: m.status,
      accessScope: m.accessScope,
      isPrimary: m.isPrimary,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      account: m.account ? {
        id: m.account.id,
        displayName: m.account.displayName,
        firstName: m.account.firstName,
        lastName: m.account.lastName,
        cellPhone: m.account.cellPhone,
        officePhone: m.account.officePhone,
        avatarUrl: m.account.avatarUrl,
        status: m.account.status,
        user: m.account.user ? { email: m.account.user.email } : null,
      } : null,
    }));
  }

  async create(dto: CreateMembershipInput): Promise<OrganizationMembershipEntity> {
    const membership = this.membershipsRepo.create({
      organizationId: dto.organizationId,
      accountId: dto.accountId,
      role: dto.role,
      isPrimary: dto.isPrimary ?? false,
    });
    return this.membershipsRepo.save(membership);
  }

  async findOne(id: string): Promise<OrganizationMembershipEntity> {
    const membership = await this.membershipsRepo.findOne({ where: { id } });
    if (!membership) throw new NotFoundException(`Membership ${id} not found`);
    return membership;
  }

  async updateStatus(id: string, status: MembershipStatus): Promise<OrganizationMembershipEntity> {
    const membership = await this.findOne(id);
    membership.status = status;
    if (status === MembershipStatus.ACTIVE && !membership.joinedAt) {
      membership.joinedAt = new Date();
    }
    return this.membershipsRepo.save(membership);
  }

  async remove(id: string): Promise<void> {
    const membership = await this.membershipsRepo.findOne({ where: { id } });
    if (!membership) throw new NotFoundException(`Membership ${id} not found`);
    await this.membershipsRepo.remove(membership);
  }
}
