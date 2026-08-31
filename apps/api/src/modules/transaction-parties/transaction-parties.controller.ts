import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TransactionPartiesService } from './transaction-parties.service';
import { CreateTransactionPartyInput } from './dto/create-transaction-party.input';
import { UpdateTransactionPartyInput } from './dto/update-transaction-party.input';

@Controller('transaction-parties')
export class TransactionPartiesController {
  constructor(private readonly transactionPartiesService: TransactionPartiesService) {}

  @Get('agents-coordinators')
  findAgentsAndCoordinators() {
    return this.transactionPartiesService.findAgentsAndCoordinators();
  }

  @Get('transaction/:transactionId')
  findByTransaction(@Param('transactionId') transactionId: string) {
    return this.transactionPartiesService.findByTransaction(transactionId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionPartiesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTransactionPartyInput) {
    return this.transactionPartiesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTransactionPartyInput) {
    return this.transactionPartiesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transactionPartiesService.remove(id);
  }
}
