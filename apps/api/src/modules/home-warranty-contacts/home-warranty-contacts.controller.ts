import { Controller, Get, Post, Patch, Delete, Body, Param, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { HomeWarrantyContactsService, CreateHomeWarrantyContactDto, UpdateHomeWarrantyContactDto } from './home-warranty-contacts.service';

@Controller('home-warranty-contacts')
export class HomeWarrantyContactsController {
  constructor(private readonly service: HomeWarrantyContactsService) {}

  private getUserId(req: { user?: { userId?: string } }): string {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new Error('Unauthorized');
    return userId;
  }

  @Get()
  findAll(@Request() req: { user?: { userId?: string } }) {
    return this.service.findAll(this.getUserId(req));
  }

  @Get(':id')
  findOne(@Request() req: { user?: { userId?: string } }, @Param('id') id: string) {
    return this.service.findOne(id, this.getUserId(req));
  }

  @Post()
  create(@Request() req: { user?: { userId?: string } }, @Body() dto: CreateHomeWarrantyContactDto) {
    return this.service.create(this.getUserId(req), dto);
  }

  @Patch(':id')
  update(@Request() req: { user?: { userId?: string } }, @Param('id') id: string, @Body() dto: UpdateHomeWarrantyContactDto) {
    return this.service.update(id, this.getUserId(req), dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: { user?: { userId?: string } }, @Param('id') id: string): Promise<void> {
    return this.service.remove(id, this.getUserId(req));
  }

  @Patch(':id/set-default')
  setDefault(@Request() req: { user?: { userId?: string } }, @Param('id') id: string) {
    return this.service.setDefault(id, this.getUserId(req));
  }
}
