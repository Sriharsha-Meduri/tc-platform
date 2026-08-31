import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationInput } from './dto/create-organization.input';
import { UpdateOrganizationInput } from './dto/update-organization.input';
import { Public } from '../auth/decorators/public.decorator';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  findAll() {
    return this.organizationsService.findAll();
  }

  @Public()
  @Get('search')
  search(@Query('q') q?: string) {
    return this.organizationsService.search(q);
  }

  @Public()
  @Get('browse')
  browse(
    @Query('page') page = '1',
    @Query('limit') limit = '12',
    @Query('q') q?: string,
  ) {
    return this.organizationsService.browse(parseInt(page, 10), parseInt(limit, 10), q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrganizationInput) {
    return this.organizationsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationInput) {
    return this.organizationsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }
}
