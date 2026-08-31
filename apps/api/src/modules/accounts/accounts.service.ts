import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from './entities/account.entity';
import { CreateAccountInput } from './dto/create-account.input';
import { UpdateAccountInput } from './dto/update-account.input';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountsRepo: Repository<AccountEntity>,
  ) {}

  findAll(): Promise<AccountEntity[]> {
    return this.accountsRepo.find();
  }

  async findOne(id: string): Promise<AccountEntity> {
    const account = await this.accountsRepo.findOne({ where: { id }, relations: ['user'] });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async findByUserId(userId: string): Promise<AccountEntity | null> {
    return this.accountsRepo.findOne({ where: { userId } });
  }

  async findByEmail(email: string): Promise<AccountEntity | null> {
    return this.findAccountByEmail(email);
  }

  async findAgentByEmail(email: string): Promise<AccountEntity | null> {
    return this.findAccountByEmail(email, { requireAgentRole: true });
  }

  async findAgentAccountByEmail(email: string): Promise<{ id: string; displayName: string; email: string } | null> {
    const account = await this.findAccountByEmail(email, { requireAgentRole: true, includeUser: true });
    if (!account?.user) return null;
    return { id: account.id, displayName: account.displayName, email: account.user.email };
  }

  private async findAccountByEmail(
    email: string,
    opts?: { requireAgentRole?: boolean; includeUser?: boolean },
  ): Promise<AccountEntity | null> {
    let qb = this.accountsRepo
      .createQueryBuilder('a')
      .innerJoin('users', 'u', 'u.id = a.userId')
      .where('LOWER(u.email) = LOWER(:email)', { email: email.trim() });

    if (opts?.requireAgentRole) {
      qb = qb.andWhere('u.roles @> ARRAY[:role]::text[]', { role: 'agent' });
    }

    if (opts?.includeUser) {
      qb = qb.leftJoinAndSelect('a.user', 'u2');
    }

    return qb.getOne();
  }

  async searchCoordinators(query: string): Promise<Array<{ id: string; displayName: string; email: string }>> {
    const results = await this.accountsRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'u')
      .where('u.roles @> ARRAY[:role]::text[]', { role: 'transaction_coordinator' })
      .andWhere(
        '(LOWER(a.displayName) LIKE LOWER(:q) OR LOWER(u.email) LIKE LOWER(:q))',
        { q: `%${query}%` },
      )
      .limit(20)
      .getMany();

    return results.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      email: a.user?.email ?? '',
    }));
  }

  async create(dto: CreateAccountInput): Promise<AccountEntity> {
    const account = this.accountsRepo.create({
      userId: dto.userId,
      displayName: dto.displayName,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      timezone: dto.timezone ?? null,
      locale: dto.locale ?? null,
      organizationName: dto.organizationName ?? null,
      cellPhone: dto.cellPhone ?? null,
      officePhone: dto.officePhone ?? null,
      addressLine1: dto.addressLine1 ?? null,
      addressLine2: dto.addressLine2 ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      zipCode: dto.zipCode ?? null,
      country: dto.country ?? null,
      dreLicenseNumber: dto.dreLicenseNumber ?? null,
    });
    return this.accountsRepo.save(account);
  }

  async update(id: string, dto: UpdateAccountInput): Promise<AccountEntity> {
    const account = await this.findOne(id);
    Object.assign(account, dto);
    return this.accountsRepo.save(account);
  }

  /** Soft-delete an account by setting its status to 'deleted'. */
  async delete(id: string): Promise<void> {
    const account = await this.findOne(id);
    account.status = 'deleted';
    await this.accountsRepo.save(account);
  }
}
