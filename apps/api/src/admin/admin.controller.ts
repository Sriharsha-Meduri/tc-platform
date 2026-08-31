import {
  Controller, Get, Param, Post, Query, Render, Body, Patch, Put, Delete, Redirect,
  HttpCode, HttpStatus, BadRequestException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AdminService } from './admin.service';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { MailgunService } from '../modules/auth/mailgun.service';
import { UserRole, UserStatus } from '../modules/users/entities/user.entity';
import { UserEntity } from '../modules/users/entities/user.entity';
import { AccountEntity } from '../modules/accounts/entities/account.entity';
import { UsersService } from '../modules/users/users.service';
import { AccountsService } from '../modules/accounts/accounts.service';
import { OrganizationsService } from '../modules/organizations/organizations.service';
import { MembershipsService } from '../modules/organizations/memberships.service';
import { AuditLogService } from '../modules/audit-log/audit-log.service';
import { MemberRole } from '../modules/organizations/entities/organization-membership.entity';
import { OrgStatus, OrgType } from '../modules/organizations/entities/organization.entity';
import { AuditAction } from '../modules/audit-log/audit-log.entity';

@Roles(UserRole.SUPPORT_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly organizationsService: OrganizationsService,
    private readonly membershipsService: MembershipsService,
    private readonly auditLogService: AuditLogService,
    private readonly mailgunService: MailgunService,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountsRepo: Repository<AccountEntity>,
  ) {}

  // ── Server-rendered Handlebars pages (legacy) ─────────────────────────────

  @Get()
  @Render('admin/dashboard')
  async dashboard() {
    return { title: 'Dashboard', stats: await this.adminService.getStats() };
  }

  @Get('users')
  @Render('admin/users')
  async usersPage() {
    const users = await this.usersService.findAll();
    return { title: 'Users', users };
  }

  @Get('organizations')
  @Render('admin/organizations')
  async organizationsPage() {
    const orgs = await this.organizationsService.findAll();
    return { title: 'Organizations', organizations: orgs };
  }

  @Get('audit-logs')
  @Render('admin/audit-logs')
  async auditLogsPage(@Query('limit') limit?: string) {
    const logs = await this.auditLogService.findAll(parseInt(limit ?? '100', 10));
    return { title: 'Audit Logs', logs };
  }

  @Get('organizations/create')
  @Render('admin/organizations-create')
  async createOrganizationPage() {
    return { title: 'Create Organization', orgTypes: Object.values(OrgType) };
  }

  @Post('organizations/:id/approve')
  @Redirect('/admin/organizations')
  async approveOrganization(@Param('id') id: string) {
    const org = await this.organizationsService.findOne(id);
    await this.organizationsService.updateStatus(id, OrgStatus.ACTIVE);
    await this.auditLogService.log({
      action: AuditAction.ORG_STATUS_CHANGED,
      targetType: 'organization',
      targetId: org.id,
      targetDisplayName: org.name,
      description: `Organization ${org.name} approved by admin`,
      details: { newStatus: OrgStatus.ACTIVE },
    });
    return { url: '/admin/organizations' };
  }

  @Post('organizations/:id/reject')
  @Redirect('/admin/organizations')
  async rejectOrganization(@Param('id') id: string) {
    const org = await this.organizationsService.findOne(id);
    await this.organizationsService.updateStatus(id, OrgStatus.INACTIVE);
    await this.auditLogService.log({
      action: AuditAction.ORG_STATUS_CHANGED,
      targetType: 'organization',
      targetId: org.id,
      targetDisplayName: org.name,
      description: `Organization ${org.name} rejected by admin`,
      details: { newStatus: OrgStatus.INACTIVE },
    });
    return { url: '/admin/organizations' };
  }

  // ── JSON API for web app consumption ──────────────────────────────────────

  @Get('api/audit-logs')
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    const result = await this.auditLogService.findAllPaginated({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category: category as 'user' | 'transaction' | undefined,
      action,
      search,
    });
    return {
      data: result.data.map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        targetDisplayName: log.targetDisplayName,
        description: log.description,
        details: log.detailsJson,
        accountId: log.accountId,
        createdAt: log.createdAt,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Get('api/stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('api/users')
  async getUsers() {
    const allUsers = await this.usersService.findAll();
    const users = allUsers.filter((u) => !u.roles.includes(UserRole.SUPPORT_ADMIN));
    const accounts = await this.accountsRepo.find({ relations: ['user', 'memberships', 'memberships.organization'] });
    const accountByUserId = new Map(accounts.map((a) => [a.userId, a]));

    return users.map((user) => {
      const account = accountByUserId.get(user.id);
      const memberships = account?.memberships ?? [];
      return {
        id: user.id,
        email: user.email,
        phone: user.phone,
        status: user.status,
        role: user.roles[0] ?? 'user',
        roles: user.roles,
        emailVerifiedAt: user.emailVerifiedAt,
        verificationToken: user.verificationToken ? true : false,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        account: account
          ? {
              id: account.id,
              displayName: account.displayName,
              firstName: account.firstName,
              lastName: account.lastName,
              organizationName: account.organizationName,
              status: account.status,
            }
          : null,
        memberships: memberships.map((m) => ({
          id: m.id,
          organizationId: m.organizationId,
          role: m.role,
          status: m.status,
          isPrimary: m.isPrimary,
          organization: m.organization
            ? { id: m.organization.id, name: m.organization.name, status: m.organization.status }
            : null,
        })),
      };
    });
  }

  @Patch('api/users/:id/status')
  @HttpCode(HttpStatus.OK)
  async updateUserStatus(@Param('id') id: string, @Body() body: { status: string }) {
    const validStatuses = ['active', 'inactive', 'suspended', 'pending'];
    if (!validStatuses.includes(body.status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const user = await this.usersService.findOne(id);
    this.ensureNotAdmin(user);
    const previousStatus = user.status;
    user.status = body.status as UserStatus;
    await this.usersRepo.save(user);

    await this.auditLogService.log({
      action: AuditAction.ADMIN_ACTION,
      targetType: 'user',
      targetId: user.id,
      targetDisplayName: user.email,
      description: `User ${user.email} status changed from ${previousStatus} to ${body.status}`,
      details: { previousStatus, newStatus: body.status },
    });

    return { success: true, user: { id: user.id, email: user.email, status: user.status } };
  }

  @Put('api/users/:id')
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Param('id') id: string,
    @Body() body: {
      email?: string;
      phone?: string | null;
      role?: string;
      status?: string;
      displayName?: string;
      firstName?: string | null;
      lastName?: string | null;
    },
  ) {
    const user = await this.usersService.findOne(id);
    this.ensureNotAdmin(user);

    const validRoles = Object.values(UserRole);
    if (body.role && !validRoles.includes(body.role as UserRole)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    if (body.email !== undefined && body.email !== user.email) {
      const existing = await this.usersService.findByEmail(body.email);
      if (existing) throw new BadRequestException('Email already in use');
    }

    if (body.email !== undefined) user.email = body.email;
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.role !== undefined) {
      const newRoles = new Set(user.roles || []);
      newRoles.add(body.role as UserRole);
      user.roles = Array.from(newRoles);
    }
    if (body.status !== undefined) {
      const validStatuses = ['active', 'inactive', 'suspended', 'pending'];
      if (!validStatuses.includes(body.status)) {
        throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }
      user.status = body.status as UserStatus;
    }
    await this.usersRepo.save(user);

    const account = await this.accountsService.findByUserId(user.id);
    if (account && (body.displayName !== undefined || body.firstName !== undefined || body.lastName !== undefined)) {
      if (body.displayName !== undefined) account.displayName = body.displayName;
      if (body.firstName !== undefined) account.firstName = body.firstName;
      if (body.lastName !== undefined) account.lastName = body.lastName;
      await this.accountsRepo.save(account);
    }

    await this.auditLogService.log({
      action: AuditAction.ADMIN_ACTION,
      targetType: 'user',
      targetId: user.id,
      targetDisplayName: user.email,
      description: `User ${user.email} profile updated by admin`,
      details: { changes: body },
    });
    return { success: true, user: { id: user.id, email: user.email, status: user.status, role: user.roles[0] ?? 'user', roles: user.roles } };
  }

  @Delete('api/users/:id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    this.ensureNotAdmin(user);
    const email = user.email;
    await this.usersService.remove(id);
    await this.auditLogService.log({
      action: AuditAction.ADMIN_ACTION,
      targetType: 'user',
      targetId: id,
      targetDisplayName: email,
      description: `Admin deleted user ${email}`,
      details: { userId: id, email },
    });
    return { success: true };
  }

  @Post('api/users/:id/resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Param('id') id: string,
    @Body() body: { email?: string },
  ) {
    const user = await this.usersService.findOne(id);
    this.ensureNotAdmin(user);

    if (user.emailVerifiedAt) {
      throw new BadRequestException('User email is already verified');
    }

    // If a new email is provided, update the user's email
    if (body.email && body.email !== user.email) {
      const existing = await this.usersService.findByEmail(body.email);
      if (existing) throw new BadRequestException('Email already in use');
      user.email = body.email;
      await this.usersRepo.save(user);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.usersRepo.update(user.id, {
      status: UserStatus.PENDING,
      verificationToken: token,
      verificationTokenExpiresAt: expiresAt,
    });

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const verificationUrl = `${webAppUrl}/verify-email?token=${token}`;

    console.log(`[Admin] Verification URL for ${user.email}: ${verificationUrl}`);

    await this.auditLogService.log({
      action: AuditAction.ADMIN_ACTION,
      targetType: 'user',
      targetId: user.id,
      targetDisplayName: user.email,
      description: `Verification email resent to ${user.email}`,
      details: { verificationUrl },
    });

    return { success: true, message: `Verification link generated for ${user.email}`, verificationUrl };
  }

  @Post('api/users/:id/assign-brokerage')
  @HttpCode(HttpStatus.OK)
  async assignBrokerage(
    @Param('id') id: string,
    @Body() body: { organizationId: string; role: string },
  ) {
    const user = await this.usersService.findOne(id);
    this.ensureNotAdmin(user);
    const account = await this.accountsService.findByUserId(user.id);
    if (!account) throw new BadRequestException('User has no account');

    const org = await this.organizationsService.findOne(body.organizationId);

    const validRoles = Object.values(MemberRole);
    if (!validRoles.includes(body.role as MemberRole)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const existingMemberships = await this.membershipsService.findByAccount(account.id);
    const existingOrg = existingMemberships.find((m) => m.organizationId === body.organizationId);
    if (existingOrg) {
      throw new BadRequestException('User already has a membership with this organization');
    }

    const membership = await this.membershipsService.create({
      organizationId: body.organizationId,
      accountId: account.id,
      role: body.role as MemberRole,
      isPrimary: existingMemberships.length === 0,
    });

    await this.auditLogService.log({
      action: AuditAction.MEMBERSHIP_CREATED,
      targetType: 'organization_membership',
      targetId: membership.id,
      targetDisplayName: org.name,
      description: `User ${user.email} assigned to ${org.name} as ${body.role}`,
      details: { organizationId: body.organizationId, role: body.role },
    });

    return { success: true, membership };
  }

  @Get('api/organizations')
  async getOrganizations(@Query('q') q?: string) {
    if (q) {
      return this.organizationsService.search(q);
    }
    return this.organizationsService.findAll();
  }

  @Post('api/organizations')
  @HttpCode(HttpStatus.CREATED)
  async createOrganization(
    @Body() body: {
      name: string;
      type: string;
      licenseNumber?: string;
      adminEmail: string;
      adminFirstName: string;
      adminLastName: string;
      adminPhone?: string;
      addressLine1?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    },
  ) {
    const existingUser = await this.usersService.findByEmail(body.adminEmail);
    if (existingUser) throw new ConflictException('A user with this email already exists');

    const validTypes = Object.values(OrgType);
    if (!validTypes.includes(body.type as OrgType)) {
      throw new BadRequestException(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Create user with invite token
    const user = await this.usersService.create({
      email: body.adminEmail,
      password: crypto.randomBytes(12).toString('hex'),
      phone: body.adminPhone,
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.usersRepo.update(user.id, {
      status: UserStatus.PENDING,
      roles: [UserRole.BROKER_ADMIN],
      verificationToken: token,
      verificationTokenExpiresAt: expiresAt,
    });

    // Create account
    const account = await this.accountsService.create({
      userId: user.id,
      displayName: `${body.adminFirstName} ${body.adminLastName}`,
      firstName: body.adminFirstName,
      lastName: body.adminLastName,
      cellPhone: body.adminPhone,
      addressLine1: body.addressLine1,
      city: body.city,
      state: body.state,
      zipCode: body.zipCode,
      country: body.country,
    });

    // Create organization (active — admin provisioned)
    const org = await this.organizationsService.create({
      name: body.name,
      type: body.type as OrgType,
      licenseNumber: body.licenseNumber,
      phone: body.adminPhone,
      addressLine1: body.addressLine1,
      city: body.city,
      state: body.state,
    });

    // Create membership
    await this.membershipsService.create({
      organizationId: org.id,
      accountId: account.id,
      role: MemberRole.BROKER_ADMIN,
      isPrimary: true,
    });

    // Generate invite URL
    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const inviteUrl = `${webAppUrl}/register/invite?token=${token}`;

    // Send invite email
    const emailEnabled = process.env.CREATE_ACCT_EMAIL_NOTIFY_ENABLED === 'true';
    if (emailEnabled) {
      await this.mailgunService.sendInviteEmail(body.adminEmail, inviteUrl, org.name);
    } else {
      console.log(`[Admin] Invite URL for ${body.adminEmail}: ${inviteUrl}`);
    }

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.ORG_CREATED,
      targetType: 'organization',
      targetId: org.id,
      targetDisplayName: org.name,
      description: `Organization ${org.name} created by admin for ${body.adminEmail}`,
      details: { adminEmail: body.adminEmail, type: body.type },
    });

    return {
      success: true,
      organization: { id: org.id, name: org.name, status: org.status },
      user: { id: user.id, email: user.email },
      inviteUrl,
    };
  }

  @Get('api/accounts/search')
  async searchAccounts(@Query('q') q?: string) {
    if (!q || q.length < 2) return [];
    const accounts = await this.accountsRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'u')
      .where('LOWER(a.displayName) LIKE LOWER(:q)', { q: `%${q}%` })
      .orWhere('LOWER(u.email) LIKE LOWER(:q)', { q: `%${q}%` })
      .limit(20)
      .getMany();
    return accounts.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      email: a.user?.email ?? null,
    }));
  }

  private ensureNotAdmin(user: UserEntity) {
    if (user.roles.includes(UserRole.SUPPORT_ADMIN)) {
      throw new ForbiddenException('Cannot modify admin/support user accounts');
    }
  }
}
