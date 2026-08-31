import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiInteractionEntity } from './entities/ai-interaction.entity';
import { AiInteractionsService } from './ai-interactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiInteractionEntity])],
  providers: [AiInteractionsService],
  exports: [AiInteractionsService],
})
export class AiInteractionsModule {}
