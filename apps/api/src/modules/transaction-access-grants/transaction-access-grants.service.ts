import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionAccessGrantEntity } from './entities/transaction-access-grant.entity';
import { AccountsService } from '../accounts/accounts.service';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';
import { UpdateAccessGrantDto } from './dto/update-access-grant.dto';

@Injectable()
export class TransactionAccessGrantsService {
  constructor(
    @InjectRepository(TransactionAccessGrantEntity)
    private readonly grantsRepo: Repository<TransactionAccessGrantEntity>,
    private readonly accountsService: AccountsService,
  ) {}

  findAll(): Promise<TransactionAccessGrantEntity[]> {
    return this.grantsRepo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.account', 'account')
      .leftJoinAndSelect('account.user', 'user')
      .leftJoinAndSelect('g.transaction', 'transaction')
      .leftJoinAndSelect('g.grantedByAccount', 'grantedBy')
      .where('g.revokedAt IS NULL')
      .orderBy('g.createdAt', 'DESC')
      .getMany();
  }

  findByTransaction(transactionId: string): Promise<TransactionAccessGrantEntity[]> {
    return this.grantsRepo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.account', 'account')
      .leftJoinAndSelect('account.user', 'user')
      .leftJoinAndSelect('g.grantedByAccount', 'grantedBy')
      .where('g.transactionId = :transactionId', { transactionId })
      .andWhere('g.revokedAt IS NULL')
      .orderBy('g.createdAt', 'DESC')
      .getMany();
  }

  async create(dto: CreateAccessGrantDto): Promise<TransactionAccessGrantEntity> {
    const account = await this.accountsService.findByEmail(dto.accountEmail);
    if (!account) {
      throw new BadRequestException(`No account found with email "${dto.accountEmail}"`);
    }

    const existing = await this.grantsRepo.findOne({
      where: { transactionId: dto.transactionId, accountId: account.id },
    });
    if (existing && !existing.revokedAt) {
      throw new BadRequestException('This user already has an active grant for this transaction. Update or revoke it first.');
    }

    const grant = this.grantsRepo.create({
      transactionId: dto.transactionId,
      accountId: account.id,
      grantedByAccountId: dto.grantedByAccountId,
      accessLevel: dto.accessLevel as TransactionAccessGrantEntity['accessLevel'],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    return this.grantsRepo.save(grant);
  }

  async update(id: string, dto: UpdateAccessGrantDto): Promise<TransactionAccessGrantEntity> {
    const grant = await this.grantsRepo.findOne({ where: { id } });
    if (!grant) throw new NotFoundException(`Grant ${id} not found`);
    if (grant.revokedAt) throw new BadRequestException('Cannot update a revoked grant');

    if (dto.accessLevel) grant.accessLevel = dto.accessLevel as TransactionAccessGrantEntity['accessLevel'];
    if (dto.expiresAt !== undefined) {
      grant.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    return this.grantsRepo.save(grant);
  }

  async revoke(id: string): Promise<TransactionAccessGrantEntity> {
    const grant = await this.grantsRepo.findOne({ where: { id } });
    if (!grant) throw new NotFoundException(`Grant ${id} not found`);

    grant.revokedAt = new Date();
    return this.grantsRepo.save(grant);
  }

  async findActiveByAccount(accountId: string): Promise<TransactionAccessGrantEntity[]> {
    return this.grantsRepo
      .createQueryBuilder('g')
      .where('g.accountId = :accountId', { accountId })
      .andWhere('g.revokedAt IS NULL')
      .select(['g.transactionId'])
      .getMany();
  }
}
