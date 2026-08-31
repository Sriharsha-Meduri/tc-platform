import { Body, Controller, Delete, Get, Param, Patch, Post, Request, BadRequestException } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipInput } from './dto/create-membership.input';
import { MembershipStatus } from './entities/organization-membership.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { AccountsService } from '../accounts/accounts.service';

@Controller('organization-memberships')
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
    private readonly auditLogService: AuditLogService,
    private readonly accountsService: AccountsService,
  ) {}

  @Get()
  findAll() {
    return this.membershipsService.findAll();
  }

  @Get('organization/:orgId')
  findByOrganization(@Param('orgId') orgId: string) {
    return this.membershipsService.findByOrganization(orgId);
  }

  @Get('account/:accountId')
  findByAccount(@Param('accountId') accountId: string) {
    return this.membershipsService.findByAccount(accountId);
  }

  @Get('my-org-members/:accountId')
  findOrgMembersByAccount(@Param('accountId') accountId: string) {
    return this.membershipsService.findOrgMembersByAccount(accountId);
  }

  @Post()
  create(@Body() dto: CreateMembershipInput) {
    return this.membershipsService.create(dto);
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Request() req: { user: { userId: string } }) {
    const membership = await this.membershipsService.updateStatus(id, MembershipStatus.ACTIVE);
    if (!req.user) throw new BadRequestException('Not authenticated');
    const account = await this.accountsService.findByUserId(req.user.userId);
    await this.auditLogService.log({
      accountId: account?.id ?? null,
      action: AuditAction.MEMBERSHIP_APPROVED,
      targetType: 'organization_membership',
      targetId: membership.id,
      description: `Membership approved for account ${membership.accountId} in org ${membership.organizationId}`,
    });
    return membership;
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string, @Request() req: { user: { userId: string } }) {
    const membership = await this.membershipsService.updateStatus(id, MembershipStatus.REJECTED);
    if (!req.user) throw new BadRequestException('Not authenticated');
    const account = await this.accountsService.findByUserId(req.user.userId);
    await this.auditLogService.log({
      accountId: account?.id ?? null,
      action: AuditAction.MEMBERSHIP_REJECTED,
      targetType: 'organization_membership',
      targetId: membership.id,
      description: `Membership rejected for account ${membership.accountId} in org ${membership.organizationId}`,
    });
    return membership;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.membershipsService.remove(id);
  }
}
