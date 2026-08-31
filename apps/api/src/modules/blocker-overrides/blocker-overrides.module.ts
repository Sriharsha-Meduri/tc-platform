import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionBlockerOverrideEntity } from './entities/transaction-blocker-override.entity';
import { BlockerOverrideService } from './blocker-override.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionBlockerOverrideEntity])],
  providers: [BlockerOverrideService],
  exports: [BlockerOverrideService],
})
export class BlockerOverridesModule {}
