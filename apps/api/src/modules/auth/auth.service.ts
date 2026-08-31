import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { AccountsService } from '../accounts/accounts.service';
import { MailgunService } from './mailgun.service';
import { UserEntity, UserStatus, UserRole } from '../users/entities/user.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { MembershipsService } from '../organizations/memberships.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';
import { OrgStatus, OrgType } from '../organizations/entities/organization.entity';
import { MemberRole, MembershipStatus } from '../organizations/entities/organization-membership.entity';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
  officePhone?: string;
  organizationName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface RegisterBrokerInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
  officePhone?: string;
  brokerageName: string;
  licenseNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface RegisterAgentInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
  officePhone?: string;
  dreLicenseNumber?: string;
}

export interface RegisterCoordinatorInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
  officePhone?: string;
}

export interface RegisterWithInviteInput {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly jwtService: JwtService,
    private readonly mailgunService: MailgunService,
    private readonly organizationsService: OrganizationsService,
    private readonly membershipsService: MembershipsService,
    private readonly auditLogService: AuditLogService,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  async register(input: RegisterInput): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(input.email);
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.usersService.create({
      email: input.email,
      password: input.password,
      phone: input.cellPhone,
    });

    // Set status to pending and generate verification token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await this.usersRepo.update(user.id, {
      status: UserStatus.PENDING,
      verificationToken: token,
      verificationTokenExpiresAt: expiresAt,
    });

    await this.accountsService.create({
      userId: user.id,
      displayName: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      cellPhone: input.cellPhone,
      officePhone: input.officePhone,
      organizationName: input.organizationName,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      country: input.country,
    });

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const verificationUrl = `${webAppUrl}/verify-email?token=${token}`;

    const emailEnabled = process.env.CREATE_ACCT_EMAIL_NOTIFY_ENABLED === 'true';
    if (emailEnabled) {
      await this.mailgunService.sendVerificationEmail(input.email, input.firstName, verificationUrl);
    } else {
      console.log(`[AuthService] Email notifications disabled — verification URL for ${input.email}: ${verificationUrl}`);
    }

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.usersRepo.findOne({ where: { verificationToken: token } });

    if (!user) throw new BadRequestException('Invalid or expired verification link');
    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Verification link has expired. Please register again.');
    }

    await this.usersRepo.update(user.id, {
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      verificationToken: null,
      verificationTokenExpiresAt: null,
    });

    return { message: 'Email verified successfully. You can now sign in.' };
  }

  async registerBroker(input: RegisterBrokerInput): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(input.email);
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.usersService.create({
      email: input.email,
      password: input.password,
      phone: input.cellPhone,
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.usersRepo.update(user.id, {
      status: UserStatus.PENDING,
      roles: [UserRole.BROKER_ADMIN],
      verificationToken: token,
      verificationTokenExpiresAt: expiresAt,
    });

    const account = await this.accountsService.create({
      userId: user.id,
      displayName: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      cellPhone: input.cellPhone,
      officePhone: input.officePhone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      country: input.country,
    });

    const org = await this.organizationsService.create({
      name: input.brokerageName,
      type: OrgType.BROKERAGE,
      licenseNumber: input.licenseNumber,
      phone: input.officePhone ?? input.cellPhone,
      addressLine1: input.addressLine1,
      city: input.city,
      state: input.state,
    });

    await this.organizationsService.updateStatus(org.id, OrgStatus.PENDING_APPROVAL);

    await this.membershipsService.create({
      organizationId: org.id,
      accountId: account.id,
      role: MemberRole.BROKER_ADMIN,
      isPrimary: true,
    });

    await this.auditLogService.log({
      accountId: account.id,
      action: AuditAction.ORG_CREATED,
      targetType: 'organization',
      targetId: org.id,
      targetDisplayName: org.name,
      description: `Broker registration: ${input.brokerageName} created by ${input.firstName} ${input.lastName} (pending approval)`,
      details: { email: input.email, licenseNumber: input.licenseNumber },
    });

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const verificationUrl = `${webAppUrl}/verify-email?token=${token}`;

    const emailEnabled = process.env.CREATE_ACCT_EMAIL_NOTIFY_ENABLED === 'true';
    if (emailEnabled) {
      await this.mailgunService.sendVerificationEmail(input.email, input.firstName, verificationUrl);
    } else {
      console.log(`[AuthService] Email notifications disabled — verification URL for ${input.email}: ${verificationUrl}`);
    }

    return {
      message: 'Broker registration submitted. Please check your email to verify your account. Your brokerage will be reviewed by a support administrator.',
    };
  }

  async registerAgent(input: RegisterAgentInput): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(input.email);
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.usersService.create({
      email: input.email,
      password: input.password,
      phone: input.cellPhone,
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.usersRepo.update(user.id, {
      status: UserStatus.PENDING,
      roles: [UserRole.AGENT],
      verificationToken: token,
      verificationTokenExpiresAt: expiresAt,
    });

    const account = await this.accountsService.create({
      userId: user.id,
      displayName: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      cellPhone: input.cellPhone,
      officePhone: input.officePhone,
      dreLicenseNumber: input.dreLicenseNumber,
    });

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const verificationUrl = `${webAppUrl}/verify-email?token=${token}`;

    const emailEnabled = process.env.CREATE_ACCT_EMAIL_NOTIFY_ENABLED === 'true';
    if (emailEnabled) {
      await this.mailgunService.sendVerificationEmail(input.email, input.firstName, verificationUrl);
    } else {
      console.log(`[AuthService] Verification URL for ${input.email}: ${verificationUrl}`);
    }

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async registerCoordinator(input: RegisterCoordinatorInput): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(input.email);
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.usersService.create({
      email: input.email,
      password: input.password,
      phone: input.cellPhone,
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.usersRepo.update(user.id, {
      status: UserStatus.PENDING,
      roles: [UserRole.TRANSACTION_COORDINATOR],
      verificationToken: token,
      verificationTokenExpiresAt: expiresAt,
    });

    await this.accountsService.create({
      userId: user.id,
      displayName: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      cellPhone: input.cellPhone,
      officePhone: input.officePhone,
    });

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3001';
    const verificationUrl = `${webAppUrl}/verify-email?token=${token}`;

    const emailEnabled = process.env.CREATE_ACCT_EMAIL_NOTIFY_ENABLED === 'true';
    if (emailEnabled) {
      await this.mailgunService.sendVerificationEmail(input.email, input.firstName, verificationUrl);
    } else {
      console.log(`[AuthService] Verification URL for ${input.email}: ${verificationUrl}`);
    }

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async registerWithInvite(input: RegisterWithInviteInput): Promise<{ message: string }> {
    const user = await this.usersRepo.findOne({ where: { verificationToken: input.token } });
    if (!user) throw new BadRequestException('Invalid or expired invitation link');
    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invitation link has expired. Please contact support.');
    }

    const hash = await bcrypt.hash(input.password, 10);
    const currentRoles = user.roles || [];
    await this.usersRepo.update(user.id, {
      passwordHash: hash,
      status: UserStatus.ACTIVE,
      roles: currentRoles,
      emailVerifiedAt: new Date(),
      verificationToken: null,
      verificationTokenExpiresAt: null,
    });

    const account = await this.accountsService.findByUserId(user.id);
    if (account) {
      await this.accountsService.update(account.id, {
        displayName: `${input.firstName} ${input.lastName}`,
        firstName: input.firstName,
        lastName: input.lastName,
        cellPhone: input.cellPhone,
      });
    }

    return { message: 'Account created successfully. You can now sign in.' };
  }

  async getInviteInfo(token: string): Promise<{ email: string; organizationName: string }> {
    const user = await this.usersRepo.findOne({ where: { verificationToken: token } });
    if (!user) throw new BadRequestException('Invalid or expired invitation link');
    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invitation link has expired. Please contact support.');
    }

    const account = await this.accountsService.findByUserId(user.id);

    let organizationName = '';
    if (account) {
      const memberships = await this.membershipsService.findByAccount(account.id);
      const primary = memberships.find((m) => m.isPrimary);
      if (primary) {
        const org = await this.organizationsService.findOne(primary.organizationId);
        organizationName = org.name;
      }
    }

    return { email: user.email, organizationName };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    const account = await this.accountsService.findByUserId(user.id);

    await this.usersRepo.update(user.id, { lastLoginAt: new Date() });

    const payload = { sub: user.id, email: user.email, roles: user.roles };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.roles[0] ?? 'user',
        roles: user.roles,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      account: account
        ? {
            id: account.id,
            userId: account.userId,
            displayName: account.displayName,
            firstName: account.firstName,
            lastName: account.lastName,
            avatarUrl: account.avatarUrl,
            timezone: account.timezone,
            locale: account.locale,
            status: account.status,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          }
        : null,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findOne(userId);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.update(userId, { passwordHash: newHash });
  }

  async getMe(userId: string) {
    const user = await this.usersService.findOne(userId);
    const account = await this.accountsService.findByUserId(userId);
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.roles[0] ?? 'user',
        roles: user.roles,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      account: account
        ? {
            id: account.id,
            userId: account.userId,
            displayName: account.displayName,
            firstName: account.firstName,
            lastName: account.lastName,
            avatarUrl: account.avatarUrl,
            timezone: account.timezone,
            locale: account.locale,
            status: account.status,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          }
        : null,
    };
  }

  async joinBrokerage(userId: string, organizationId: string): Promise<{ message: string }> {
    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new BadRequestException('No account found for this user');

    const existingMemberships = await this.membershipsService.findByAccount(account.id);
    if (existingMemberships.some((m) => m.organizationId === organizationId)) {
      throw new ConflictException('You already have a membership with this organization');
    }

    const org = await this.organizationsService.findOne(organizationId);

    const membership = await this.membershipsService.create({
      organizationId,
      accountId: account.id,
      role: MemberRole.AGENT,
      isPrimary: false,
    });

    await this.membershipsService.updateStatus(membership.id, MembershipStatus.PENDING);

    await this.auditLogService.log({
      accountId: account.id,
      action: AuditAction.MEMBERSHIP_CREATED,
      targetType: 'organization_membership',
      targetId: membership.id,
      targetDisplayName: org.name,
      description: `Join request: ${account.displayName} requested to join ${org.name}`,
      details: { organizationId, accountId: account.id },
    });

    return { message: `Your request to join ${org.name} has been submitted. A broker admin will review it.` };
  }

  async inviteMember(
    inviterUserId: string,
    email: string,
    role: MemberRole,
    organizationId: string,
  ): Promise<{ message: string }> {
    const inviterAccount = await this.accountsService.findByUserId(inviterUserId);
    if (!inviterAccount) throw new BadRequestException('No account found for inviter');

    const org = await this.organizationsService.findOne(organizationId);

    let user = await this.usersService.findByEmail(email);
    let account;

    if (user) {
      account = await this.accountsService.findByUserId(user.id);
      if (!account) {
        throw new BadRequestException('User has no account. Ask them to register first.');
      }
    } else {
      const tempPassword = crypto.randomBytes(12).toString('hex');
      user = await this.usersService.create({
        email,
        password: tempPassword,
        phone: undefined,
      });
      await this.usersRepo.update(user.id, {
        status: UserStatus.PENDING,
        verificationToken: crypto.randomBytes(32).toString('hex'),
        verificationTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      account = await this.accountsService.create({
        userId: user.id,
        displayName: email.split('@')[0],
      });
    }

    const existingMemberships = await this.membershipsService.findByAccount(account.id);
    if (existingMemberships.some((m) => m.organizationId === organizationId)) {
      throw new ConflictException('This user already has a membership with this organization');
    }

    const membership = await this.membershipsService.create({
      organizationId,
      accountId: account.id,
      role,
      isPrimary: false,
    });

    await this.auditLogService.log({
      accountId: inviterAccount.id,
      action: AuditAction.MEMBERSHIP_CREATED,
      targetType: 'organization_membership',
      targetId: membership.id,
      targetDisplayName: org.name,
      description: `Invitation sent to ${email} to join ${org.name} as ${role}`,
      details: { organizationId, email, role },
    });

    return {
      message: `Invitation sent to ${email}. They will appear as pending once they accept.`,
    };
  }
}
