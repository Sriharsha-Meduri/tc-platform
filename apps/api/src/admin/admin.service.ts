import { Injectable } from '@nestjs/common';
import { UsersService } from '../modules/users/users.service';
import { OrganizationsService } from '../modules/organizations/organizations.service';
import { AuditLogService } from '../modules/audit-log/audit-log.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getStats() {
    const users = await this.usersService.findAll();
    const orgs = await this.organizationsService.findAll();
    return {
      totalUsers: users.length,
      pendingUsers: users.filter((u) => u.status === 'pending').length,
      totalOrganizations: orgs.length,
      pendingOrganizations: orgs.filter((o) => o.status === 'pending_approval').length,
    };
  }
}
