import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionClockSettingsEntity } from './entities/transaction-clock-settings.entity';
import { TransactionClockService } from './transaction-clock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionClockSettingsEntity]),
  ],
  providers: [TransactionClockService],
  exports: [TransactionClockService],
})
export class TransactionClockModule {}
