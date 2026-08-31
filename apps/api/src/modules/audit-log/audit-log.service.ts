import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { AuditLogEntity, AuditAction, USER_CATEGORY_ACTIONS, TRANSACTION_CATEGORY_ACTIONS } from './audit-log.entity';

export interface AuditLogInput {
  accountId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  targetDisplayName?: string | null;
  description: string;
  details?: Record<string, unknown> | null;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  category?: 'user' | 'transaction';
  action?: string;
  search?: string;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const CATEGORY_MAP: Record<string, AuditAction[]> = {
  user: USER_CATEGORY_ACTIONS,
  transaction: TRANSACTION_CATEGORY_ACTIONS,
};

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async log(input: AuditLogInput): Promise<AuditLogEntity> {
    const entry = this.repo.create({
      accountId: input.accountId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetDisplayName: input.targetDisplayName ?? null,
      description: input.description,
      detailsJson: input.details ?? null,
    });
    return this.repo.save(entry);
  }

  findAll(limit = 100, offset = 0): Promise<AuditLogEntity[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findAllPaginated(query: AuditLogQuery): Promise<PaginatedAuditLogs> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.category && CATEGORY_MAP[query.category]) {
      where.action = In(CATEGORY_MAP[query.category]);
    } else if (query.action) {
      where.action = query.action;
    }

    if (query.search) {
      where.description = Like(`%${query.search}%`);
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  findByAccount(accountId: string, limit = 50): Promise<AuditLogEntity[]> {
    return this.repo.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  findByTarget(targetType: string, targetId: string, limit = 50): Promise<AuditLogEntity[]> {
    return this.repo.find({
      where: { targetType, targetId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
