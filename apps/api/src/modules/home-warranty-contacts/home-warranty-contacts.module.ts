import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeWarrantyContactEntity } from './entities/home-warranty-contact.entity';
import { HomeWarrantyContactsController } from './home-warranty-contacts.controller';
import { HomeWarrantyContactsService } from './home-warranty-contacts.service';

@Module({
  imports: [TypeOrmModule.forFeature([HomeWarrantyContactEntity])],
  controllers: [HomeWarrantyContactsController],
  providers: [HomeWarrantyContactsService],
  exports: [HomeWarrantyContactsService],
})
export class HomeWarrantyContactsModule {}
