import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionWorkflowStepEntity } from './entities/transaction-workflow-step.entity';
import { InitWorkflowService } from './init-workflow.service';
import { TransactionWorkflowStepsController } from './transaction-workflow-steps.controller';
import { TransactionWorkflowTemplateEntity } from '../transaction-workflow-templates/entities/transaction-workflow-template.entity';
import { TransactionWorkflowTemplateStepEntity } from '../transaction-workflow-templates/entities/transaction-workflow-template-step.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionStageInstanceEntity } from '../transactions/entities/transaction-stage-instance.entity';
import { TransactionPartyEntity } from '../transaction-parties/entities/transaction-party.entity';
import { TransactionJournalEntity } from '../transaction-journals/entities/transaction-journal.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionWorkflowStepEntity,
      TransactionWorkflowTemplateEntity,
      TransactionWorkflowTemplateStepEntity,
      TransactionEntity,
      TransactionStageInstanceEntity,
      TransactionPartyEntity,
      TransactionJournalEntity,
    ]),
    AuthModule,
  ],
  controllers: [TransactionWorkflowStepsController],
  providers: [InitWorkflowService],
  exports: [TypeOrmModule, InitWorkflowService],
})
export class TransactionWorkflowStepsModule {}
