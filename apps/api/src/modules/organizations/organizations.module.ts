import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from './entities/organization.entity';
import { OrganizationMembershipEntity } from './entities/organization-membership.entity';
import { OrganizationsService } from './organizations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationsController } from './organizations.controller';
import { MembershipsController } from './memberships.controller';
import { OrganizationsResolver } from './organizations.resolver';
import { MembershipsResolver } from './memberships.resolver';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationEntity, OrganizationMembershipEntity]), AuditLogModule, AccountsModule],
  controllers: [OrganizationsController, MembershipsController],
  providers: [OrganizationsResolver, MembershipsResolver, OrganizationsService, MembershipsService],
  exports: [OrganizationsService, MembershipsService],
})
export class OrganizationsModule {}
