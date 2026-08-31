import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TransactionMessagesService } from './transaction-messages.service';
import { CreateTransactionMessageInput } from './dto/create-transaction-message.input';
import { UpdateMessageStatusInput } from './dto/update-message-status.input';

@Controller('transaction-messages')
export class TransactionMessagesController {
  constructor(private readonly transactionMessagesService: TransactionMessagesService) {}

  @Get('transaction/:transactionId')
  findByTransaction(@Param('transactionId') transactionId: string) {
    return this.transactionMessagesService.findByTransaction(transactionId);
  }

  @Get('thread/:threadKey')
  findByThread(@Param('threadKey') threadKey: string) {
    return this.transactionMessagesService.findByThread(threadKey);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionMessagesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTransactionMessageInput) {
    return this.transactionMessagesService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateMessageStatusInput) {
    return this.transactionMessagesService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transactionMessagesService.remove(id);
  }
}
