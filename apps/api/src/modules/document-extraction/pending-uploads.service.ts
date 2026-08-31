import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { PendingUploadEntity } from './entities/pending-upload.entity';

export interface CreatePendingUploadParams {
  transactionId: string;
  stage: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  title: string;
  detectedFormCode: string | null;
  extractionJson: Record<string, unknown> | null;
  complianceJson: Record<string, unknown> | null;
  pdfType: string | null;
  interactionId: string | null;
  existingDocId: string;
  existingFormCode: string | null;
  existingFormName: string | null;
  existingVersionNo: number;
  existingUploadedAt: Date | null;
}

@Injectable()
export class PendingUploadsService {
  constructor(
    @InjectRepository(PendingUploadEntity)
    private readonly repo: Repository<PendingUploadEntity>,
  ) {}

  async create(params: CreatePendingUploadParams): Promise<PendingUploadEntity> {
    const entity = this.repo.create(params);
    return this.repo.save(entity);
  }

  async findOne(id: string): Promise<PendingUploadEntity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`PendingUpload ${id} not found`);
    return entity;
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }

  async removeById(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async cleanupOlderThan(date: Date): Promise<number> {
    const result = await this.repo.delete({ createdAt: LessThan(date) });
    return result.affected ?? 0;
  }
}
