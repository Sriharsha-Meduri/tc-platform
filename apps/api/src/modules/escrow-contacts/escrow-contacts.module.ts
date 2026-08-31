import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EscrowContactEntity } from './entities/escrow-contact.entity';
import { EscrowContactsController } from './escrow-contacts.controller';
import { EscrowContactsService } from './escrow-contacts.service';

@Module({
  imports: [TypeOrmModule.forFeature([EscrowContactEntity])],
  controllers: [EscrowContactsController],
  providers: [EscrowContactsService],
  exports: [EscrowContactsService],
})
export class EscrowContactsModule {}
