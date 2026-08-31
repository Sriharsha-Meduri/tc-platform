import { Controller, Get, Post, Patch, Delete, Body, Param, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { EscrowContactsService, CreateEscrowContactDto, UpdateEscrowContactDto } from './escrow-contacts.service';

@Controller('escrow-contacts')
export class EscrowContactsController {
  constructor(private readonly service: EscrowContactsService) {}

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
  create(@Request() req: { user?: { userId?: string } }, @Body() dto: CreateEscrowContactDto) {
    return this.service.create(this.getUserId(req), dto);
  }

  @Patch(':id')
  update(@Request() req: { user?: { userId?: string } }, @Param('id') id: string, @Body() dto: UpdateEscrowContactDto) {
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
