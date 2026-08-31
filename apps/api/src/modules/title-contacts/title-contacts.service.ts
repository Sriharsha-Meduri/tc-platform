import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Repository } from 'typeorm';
import { TitleContactEntity } from './entities/title-contact.entity';

export class CreateTitleContactDto {
  @IsString()
  contactName: string;

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
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTitleContactDto {
  @IsOptional()
  @IsString()
  contactName?: string;

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
  @IsBoolean()
  isDefault?: boolean;
}

@Injectable()
export class TitleContactsService {
  constructor(
    @InjectRepository(TitleContactEntity)
    private readonly repo: Repository<TitleContactEntity>,
  ) {}

  async findAll(userId: string): Promise<TitleContactEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<TitleContactEntity> {
    const contact = await this.repo.findOne({ where: { id, userId } });
    if (!contact) throw new NotFoundException('Title contact not found');
    return contact;
  }

  async create(userId: string, dto: CreateTitleContactDto): Promise<TitleContactEntity> {
    if (dto.isDefault) {
      await this.repo.update({ userId }, { isDefault: false });
    }

    const contact = this.repo.create({
      userId,
      contactName: dto.contactName,
      companyName: dto.companyName,
      email: dto.email,
      cellPhone: dto.cellPhone,
      addressLine1: dto.addressLine1 ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      zipCode: dto.zipCode ?? null,
      isDefault: dto.isDefault ?? false,
    });
    return this.repo.save(contact);
  }

  async update(id: string, userId: string, dto: UpdateTitleContactDto): Promise<TitleContactEntity> {
    const contact = await this.findOne(id, userId);

    if (dto.isDefault === true) {
      await this.repo.update({ userId }, { isDefault: false });
    }

    Object.assign(contact, {
      contactName: dto.contactName,
      companyName: dto.companyName,
      email: dto.email,
      cellPhone: dto.cellPhone,
      addressLine1: dto.addressLine1,
      city: dto.city,
      state: dto.state,
      zipCode: dto.zipCode,
      isDefault: dto.isDefault,
    });

    return this.repo.save(contact);
  }

  async remove(id: string, userId: string): Promise<void> {
    const contact = await this.findOne(id, userId);
    await this.repo.remove(contact);
  }

  async setDefault(id: string, userId: string): Promise<TitleContactEntity> {
    const contact = await this.findOne(id, userId);
    await this.repo.update({ userId }, { isDefault: false });
    contact.isDefault = true;
    return this.repo.save(contact);
  }
}
