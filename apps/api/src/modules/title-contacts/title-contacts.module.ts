import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TitleContactEntity } from './entities/title-contact.entity';
import { TitleContactsController } from './title-contacts.controller';
import { TitleContactsService } from './title-contacts.service';

@Module({
  imports: [TypeOrmModule.forFeature([TitleContactEntity])],
  controllers: [TitleContactsController],
  providers: [TitleContactsService],
  exports: [TitleContactsService],
})
export class TitleContactsModule {}
