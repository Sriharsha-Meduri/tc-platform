import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionWorkflowStepEntity } from './entities/transaction-workflow-step.entity';

@Controller('transaction-workflow-steps')
export class TransactionWorkflowStepsController {
  constructor(
    @InjectRepository(TransactionWorkflowStepEntity)
    private readonly stepsRepo: Repository<TransactionWorkflowStepEntity>,
  ) {}

  @Get('transaction/:transactionId')
  findByTransaction(@Param('transactionId') transactionId: string) {
    return this.stepsRepo.find({
      where: { transactionId },
      order: { sortOrder: 'ASC' },
    });
  }
}
