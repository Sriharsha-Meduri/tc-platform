import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../modules/users/users.module';
import { AccountsModule } from '../modules/accounts/accounts.module';
import { OrganizationsModule } from '../modules/organizations/organizations.module';
import { AuditLogModule } from '../modules/audit-log/audit-log.module';
import { AuthModule } from '../modules/auth/auth.module';
import { UserEntity } from '../modules/users/entities/user.entity';
import { AccountEntity } from '../modules/accounts/entities/account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, AccountEntity]),
    UsersModule,
    AccountsModule,
    OrganizationsModule,
    AuditLogModule,
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
