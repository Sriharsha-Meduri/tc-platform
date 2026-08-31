import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Repository } from 'typeorm';
import { HomeWarrantyContactEntity } from './entities/home-warranty-contact.entity';

export class CreateHomeWarrantyContactDto {
  @IsString() contactName: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsString() companyName: string;
  @IsString() email: string;
  @IsOptional() @IsString() officePhone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() orderingPortalUrl?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateHomeWarrantyContactDto {
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() officePhone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() orderingPortalUrl?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

@Injectable()
export class HomeWarrantyContactsService {
  constructor(
    @InjectRepository(HomeWarrantyContactEntity)
    private readonly repo: Repository<HomeWarrantyContactEntity>,
  ) {}

  async findAll(userId: string): Promise<HomeWarrantyContactEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<HomeWarrantyContactEntity> {
    const contact = await this.repo.findOne({ where: { id, userId } });
    if (!contact) throw new NotFoundException('Home warranty contact not found');
    return contact;
  }

  async create(userId: string, dto: CreateHomeWarrantyContactDto): Promise<HomeWarrantyContactEntity> {
    if (dto.isDefault) {
      await this.repo.update({ userId }, { isDefault: false });
    }
    const contact = this.repo.create({
      userId,
      contactName: dto.contactName,
      jobTitle: dto.jobTitle ?? null,
      companyName: dto.companyName,
      email: dto.email,
      officePhone: dto.officePhone ?? null,
      website: dto.website ?? null,
      orderingPortalUrl: dto.orderingPortalUrl ?? null,
      isDefault: dto.isDefault ?? false,
    });
    return this.repo.save(contact);
  }

  async update(id: string, userId: string, dto: UpdateHomeWarrantyContactDto): Promise<HomeWarrantyContactEntity> {
    const contact = await this.findOne(id, userId);
    if (dto.isDefault === true) {
      await this.repo.update({ userId }, { isDefault: false });
    }
    if (dto.contactName !== undefined) contact.contactName = dto.contactName;
    if (dto.jobTitle !== undefined) contact.jobTitle = dto.jobTitle ?? null;
    if (dto.companyName !== undefined) contact.companyName = dto.companyName;
    if (dto.email !== undefined) contact.email = dto.email;
    if (dto.officePhone !== undefined) contact.officePhone = dto.officePhone ?? null;
    if (dto.website !== undefined) contact.website = dto.website ?? null;
    if (dto.orderingPortalUrl !== undefined) contact.orderingPortalUrl = dto.orderingPortalUrl ?? null;
    if (dto.isDefault !== undefined) contact.isDefault = dto.isDefault;
    return this.repo.save(contact);
  }

  async remove(id: string, userId: string): Promise<void> {
    const contact = await this.findOne(id, userId);
    await this.repo.remove(contact);
  }

  async setDefault(id: string, userId: string): Promise<HomeWarrantyContactEntity> {
    const contact = await this.findOne(id, userId);
    await this.repo.update({ userId }, { isDefault: false });
    contact.isDefault = true;
    return this.repo.save(contact);
  }
}
