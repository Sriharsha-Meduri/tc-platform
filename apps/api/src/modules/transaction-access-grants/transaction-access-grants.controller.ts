import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TransactionAccessGrantsService } from './transaction-access-grants.service';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';
import { UpdateAccessGrantDto } from './dto/update-access-grant.dto';

@Controller('transaction-access-grants')
export class TransactionAccessGrantsController {
  constructor(private readonly service: TransactionAccessGrantsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('transaction/:transactionId')
  findByTransaction(@Param('transactionId') transactionId: string) {
    return this.service.findByTransaction(transactionId);
  }

  @Post()
  create(@Body() dto: CreateAccessGrantDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccessGrantDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
