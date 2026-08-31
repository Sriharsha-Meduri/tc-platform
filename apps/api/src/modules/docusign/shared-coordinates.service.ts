import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SharedFieldCoordinateEntity } from './entities/shared-field-coordinate.entity';

export interface CreateSharedCoordinateInput {
  formCode: string;
  formVersion?: string | null;
  pageNumber: number;
  fieldLabel: string;
  fieldType: string;
  docuSignTabType: string;
  recipientRole: string;
  xPosition: number;
  yPosition: number;
  width?: number | null;
  height?: number | null;
  createdBy: string;
}

export interface SharedCoordinateQuery {
  formCode?: string;
  fieldType?: string;
  recipientRole?: string;
  pageNumber?: number;
}

@Injectable()
export class SharedCoordinatesService {
  private readonly logger = new Logger(SharedCoordinatesService.name);

  constructor(
    @InjectRepository(SharedFieldCoordinateEntity)
    private readonly repo: Repository<SharedFieldCoordinateEntity>,
  ) {}

  /**
   * Save a new shared coordinate mapping. If an existing mapping
   * matches the same form/filed/role, it is updated (verified).
   */
  async upsert(input: CreateSharedCoordinateInput): Promise<SharedFieldCoordinateEntity> {
    const existing = await this.repo.findOne({
      where: {
        formCode: input.formCode.toUpperCase(),
        fieldLabel: input.fieldLabel,
        recipientRole: input.recipientRole,
      },
      order: { lastVerifiedAt: 'DESC' },
    });

    if (existing) {
      existing.xPosition = input.xPosition;
      existing.yPosition = input.yPosition;
      existing.width = input.width ?? existing.width;
      existing.height = input.height ?? existing.height;
      existing.pageNumber = input.pageNumber;
      existing.fieldType = input.fieldType;
      existing.docuSignTabType = input.docuSignTabType;
      existing.lastVerifiedAt = new Date();
      existing.verificationCount += 1;
      if (input.formVersion) existing.formVersion = input.formVersion;
      this.logger.log(`Updated shared coordinate: ${input.formCode}/${input.fieldLabel}/${input.recipientRole}`);
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      formCode: input.formCode.toUpperCase(),
      formVersion: input.formVersion ?? null,
      pageNumber: input.pageNumber,
      fieldLabel: input.fieldLabel,
      fieldType: input.fieldType,
      docuSignTabType: input.docuSignTabType,
      recipientRole: input.recipientRole,
      xPosition: input.xPosition,
      yPosition: input.yPosition,
      width: input.width ?? null,
      height: input.height ?? null,
      createdBy: input.createdBy,
      lastVerifiedAt: new Date(),
      verificationCount: 1,
      successCount: 0,
    });

    this.logger.log(`Created shared coordinate: ${input.formCode}/${input.fieldLabel}/${input.recipientRole}`);
    return this.repo.save(entity);
  }

  /**
   * Query shared coordinates. Results ordered by most recently verified.
   */
  async query(params: SharedCoordinateQuery): Promise<SharedFieldCoordinateEntity[]> {
    const where: Record<string, unknown> = {};

    if (params.formCode) {
      where.formCode = params.formCode.toUpperCase();
    }
    if (params.fieldType) {
      where.fieldType = params.fieldType;
    }
    if (params.recipientRole) {
      where.recipientRole = params.recipientRole;
    }
    if (params.pageNumber != null) {
      where.pageNumber = params.pageNumber;
    }

    return this.repo.find({
      where,
      order: { lastVerifiedAt: 'DESC', verificationCount: 'DESC' },
      take: 50,
    });
  }

  /**
   * Get all shared coordinates for a specific form as a Map keyed by fieldLabel+role.
   * Used by field-coordinates to augment template placements.
   */
  async getFormCoordinates(formCode: string): Promise<Map<string, SharedFieldCoordinateEntity>> {
    const entries = await this.repo.find({
      where: { formCode: formCode.toUpperCase() },
      order: { lastVerifiedAt: 'DESC' },
    });

    const map = new Map<string, SharedFieldCoordinateEntity>();
    for (const entry of entries) {
      const key = `${entry.fieldLabel.toLowerCase()}|${entry.recipientRole}`;
      // Only keep the most recently verified entry per key
      if (!map.has(key)) {
        map.set(key, entry);
      }
    }

    return map;
  }

  /**
   * Verify a shared coordinate (mark as recently used/verified).
   */
  async verify(id: string): Promise<void> {
    await this.repo.increment({ id }, 'verificationCount', 1);
    await this.repo.update(id, { lastVerifiedAt: new Date() });
  }

  /**
   * Increment success count when a coordinate mapping is used successfully.
   */
  async markSuccess(id: string): Promise<void> {
    await this.repo.increment({ id }, 'successCount', 1);
  }

  /**
   * Delete a shared coordinate mapping (admin use).
   */
  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
    this.logger.log(`Removed shared coordinate: ${id}`);
  }
}
