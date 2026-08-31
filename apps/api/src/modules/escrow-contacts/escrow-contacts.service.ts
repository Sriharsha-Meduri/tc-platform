import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Repository } from 'typeorm';
import { EscrowContactEntity } from './entities/escrow-contact.entity';

export class CreateEscrowContactDto {
  @IsString()
  contactName: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsString()
  companyName: string;

  @IsString()
  email: string;

  @IsString()
  cellPhone: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateEscrowContactDto {
  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  cellPhone?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

@Injectable()
export class EscrowContactsService {
  constructor(
    @InjectRepository(EscrowContactEntity)
    private readonly repo: Repository<EscrowContactEntity>,
  ) {}

  async findAll(userId: string): Promise<EscrowContactEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<EscrowContactEntity> {
    const contact = await this.repo.findOne({ where: { id, userId } });
    if (!contact) throw new NotFoundException('Escrow contact not found');
    return contact;
  }

  async create(userId: string, dto: CreateEscrowContactDto): Promise<EscrowContactEntity> {
    if (dto.isDefault) {
      await this.repo.update({ userId }, { isDefault: false });
    }

    const contact = this.repo.create({
      userId,
      contactName: dto.contactName,
      jobTitle: dto.jobTitle ?? null,
      companyName: dto.companyName,
      email: dto.email,
      cellPhone: dto.cellPhone,
      addressLine1: dto.addressLine1 ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      zipCode: dto.zipCode ?? null,
      website: dto.website ?? null,
      notes: dto.notes ?? null,
      isDefault: dto.isDefault ?? false,
    });
    return this.repo.save(contact);
  }

  async update(id: string, userId: string, dto: UpdateEscrowContactDto): Promise<EscrowContactEntity> {
    const contact = await this.findOne(id, userId);

    if (dto.isDefault === true) {
      await this.repo.update({ userId }, { isDefault: false });
    }

    if (dto.contactName !== undefined) contact.contactName = dto.contactName;
    if (dto.jobTitle !== undefined) contact.jobTitle = dto.jobTitle ?? null;
    if (dto.companyName !== undefined) contact.companyName = dto.companyName;
    if (dto.email !== undefined) contact.email = dto.email;
    if (dto.cellPhone !== undefined) contact.cellPhone = dto.cellPhone;
    if (dto.addressLine1 !== undefined) contact.addressLine1 = dto.addressLine1 ?? null;
    if (dto.city !== undefined) contact.city = dto.city ?? null;
    if (dto.state !== undefined) contact.state = dto.state ?? null;
    if (dto.zipCode !== undefined) contact.zipCode = dto.zipCode ?? null;
    if (dto.website !== undefined) contact.website = dto.website ?? null;
    if (dto.notes !== undefined) contact.notes = dto.notes ?? null;
    if (dto.isDefault !== undefined) contact.isDefault = dto.isDefault;

    return this.repo.save(contact);
  }

  async remove(id: string, userId: string): Promise<void> {
    const contact = await this.findOne(id, userId);
    await this.repo.remove(contact);
  }

  async setDefault(id: string, userId: string): Promise<EscrowContactEntity> {
    const contact = await this.findOne(id, userId);
    await this.repo.update({ userId }, { isDefault: false });
    contact.isDefault = true;
    return this.repo.save(contact);
  }
}
