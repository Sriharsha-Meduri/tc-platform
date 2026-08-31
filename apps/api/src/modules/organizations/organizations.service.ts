import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { OrganizationEntity, OrgStatus } from './entities/organization.entity';
import { CreateOrganizationInput } from './dto/create-organization.input';
import { UpdateOrganizationInput } from './dto/update-organization.input';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly orgsRepo: Repository<OrganizationEntity>,
  ) {}

  findAll(): Promise<OrganizationEntity[]> {
    return this.orgsRepo.find();
  }

  async findOne(id: string): Promise<OrganizationEntity> {
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async create(dto: CreateOrganizationInput): Promise<OrganizationEntity> {
    const org = this.orgsRepo.create({
      name: dto.name,
      type: dto.type,
      licenseNumber: dto.licenseNumber ?? null,
      phone: dto.phone ?? null,
      addressLine1: dto.addressLine1 ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
    });
    return this.orgsRepo.save(org);
  }

  async update(id: string, dto: UpdateOrganizationInput): Promise<OrganizationEntity> {
    const org = await this.findOne(id);
    Object.assign(org, dto);
    return this.orgsRepo.save(org);
  }

  search(query?: string): Promise<OrganizationEntity[]> {
    if (!query || query.trim().length === 0) {
      return this.orgsRepo.find({ where: { status: OrgStatus.ACTIVE }, take: 50 });
    }
    return this.orgsRepo.find({
      where: [
        { name: Like(`%${query}%`), status: OrgStatus.ACTIVE },
        { city: Like(`%${query}%`), status: OrgStatus.ACTIVE },
        { state: Like(`%${query}%`), status: OrgStatus.ACTIVE },
      ],
      take: 20,
    });
  }

  async browse(page: number, limit: number, query?: string) {
    const skip = (page - 1) * limit;
    const where = query?.trim()
      ? [
          { name: Like(`%${query}%`), status: OrgStatus.ACTIVE },
          { city: Like(`%${query}%`), status: OrgStatus.ACTIVE },
          { state: Like(`%${query}%`), status: OrgStatus.ACTIVE },
        ]
      : { status: OrgStatus.ACTIVE };

    const [data, total] = await this.orgsRepo.findAndCount({
      where,
      order: { name: 'ASC' },
      take: limit,
      skip,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findByStatus(status: OrgStatus): Promise<OrganizationEntity[]> {
    return this.orgsRepo.find({ where: { status } });
  }

  async updateStatus(id: string, status: OrgStatus): Promise<OrganizationEntity> {
    const org = await this.findOne(id);
    org.status = status;
    return this.orgsRepo.save(org);
  }

  async remove(id: string): Promise<void> {
    const org = await this.findOne(id);
    await this.orgsRepo.remove(org);
  }
}
