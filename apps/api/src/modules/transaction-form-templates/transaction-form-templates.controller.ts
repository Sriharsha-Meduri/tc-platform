import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  HttpCode, HttpStatus, Req, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { TransactionFormTemplatesService } from './transaction-form-templates.service';
import { CreateFormTemplateInput } from './dto/create-form-template.input';
import { AddFormTemplateItemInput } from './dto/add-form-template-item.input';
import { AccountsService } from '../accounts/accounts.service';
import { UserRole } from '../users/entities/user.entity';
import { OrganizationMembershipEntity, MemberRole, MembershipStatus } from '../organizations/entities/organization-membership.entity';

@Controller('form-templates')
export class TransactionFormTemplatesController {
  constructor(
    private readonly svc: TransactionFormTemplatesService,
    private readonly accountsService: AccountsService,
    @InjectRepository(OrganizationMembershipEntity)
    private readonly membershipRepo: Repository<OrganizationMembershipEntity>,
  ) {}

  /**
   * Verify the caller is an ACTIVE broker_admin of the given organization.
   * When `organizationId` is omitted, returns the caller's own broker_admin
   * membership (used by create to default the template's org).
   */
  private async requireBrokerAdmin(req: Request, organizationId?: string): Promise<OrganizationMembershipEntity> {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new ForbiddenException('Authentication required');

    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new ForbiddenException('No account found');

    const memberships = await this.membershipRepo.find({
      where: { accountId: account.id, status: MembershipStatus.ACTIVE },
    });
    const adminMemberships = memberships.filter((m) => m.role === MemberRole.BROKER_ADMIN);
    if (adminMemberships.length === 0) {
      throw new ForbiddenException('Only broker admins can manage form templates');
    }
    if (organizationId) {
      const match = adminMemberships.find((m) => m.organizationId === organizationId);
      if (!match) {
        throw new ForbiddenException('You can only manage templates for your own brokerage');
      }
      return match;
    }
    return adminMemberships[0];
  }

  /** Ensure the caller may manage this template: broker admin of the template's org, or support admin for system templates. */
  private async requireTemplateAdmin(req: Request, id: string): Promise<void> {
    const template = await this.svc.findById(id);
    if (template.organizationId) {
      await this.requireBrokerAdmin(req, template.organizationId);
      return;
    }
    const roles = (req.user as { roles?: string[] })?.roles ?? [];
    if (!roles.includes(UserRole.SUPPORT_ADMIN)) {
      throw new ForbiddenException('Only support admins can manage system templates');
    }
  }

  /**
   * GET /api/v1/form-templates
   * List templates visible to an org, optionally filtered by transactionType, side, stateCode.
   */
  @Get()
  list(
    @Query('organizationId')   organizationId?: string,
    @Query('transactionType')  transactionType?: string,
    @Query('side')             side?: string,
    @Query('stateCode')        stateCode?: string,
  ) {
    return this.svc.listForOrg(organizationId, transactionType, side, stateCode);
  }

  /**
   * GET /api/v1/form-templates/car-forms
   * Catalog of supported CAR forms for the template builder picker.
   * Filterable by side and transactionType.
   */
  @Get('car-forms')
  carForms(
    @Query('side')            side?: string,
    @Query('transactionType') transactionType?: string,
  ) {
    return this.svc.listCarForms({ side, transactionType });
  }

  /**
   * GET /api/v1/form-templates/:id
   * Get a single template with all its items.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /**
   * POST /api/v1/form-templates
   * Create a new org-specific template. Broker admin only.
   */
  @Post()
  async create(@Req() req: Request, @Body() body: CreateFormTemplateInput) {
    const membership = await this.requireBrokerAdmin(req, body.organizationId);
    const organizationId = body.organizationId ?? membership.organizationId;
    return this.svc.create({
      ...body,
      organizationId,
      createdByAccountId: body.createdByAccountId ?? membership.accountId,
    });
  }

  /**
   * PUT /api/v1/form-templates/:id
   * Update template metadata. Broker admin only.
   */
  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; isActive?: boolean; effectiveDate?: string; retiredDate?: string; docusignTemplateId?: string | null },
  ) {
    await this.requireTemplateAdmin(req, id);
    return this.svc.update(id, body);
  }

  /**
   * DELETE /api/v1/form-templates/:id
   * Delete a template. Broker admin only.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: Request, @Param('id') id: string) {
    await this.requireTemplateAdmin(req, id);
    return this.svc.delete(id);
  }

  /**
   * POST /api/v1/form-templates/:id/items
   * Add a form item to an existing template. Broker admin of the template's org only.
   */
  @Post(':id/items')
  async addItem(@Req() req: Request, @Param('id') id: string, @Body() body: AddFormTemplateItemInput) {
    await this.requireTemplateAdmin(req, id);
    return this.svc.addItem(id, body);
  }

  /**
   * PUT /api/v1/form-templates/:id/items/:itemId
   * Update a single form item. Broker admin of the template's org only.
   */
  @Put(':id/items/:itemId')
  async updateItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: {
      formCode?: string; formName?: string; category?: string;
      isRequired?: boolean; sortOrder?: number; stage?: string;
      docusignTemplateId?: string | null;
    },
  ) {
    await this.requireTemplateAdmin(req, id);
    return this.svc.updateItem(id, itemId, body);
  }

  /**
   * DELETE /api/v1/form-templates/:id/items/:itemId
   * Remove a single form item. Broker admin of the template's org only.
   */
  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(@Req() req: Request, @Param('id') id: string, @Param('itemId') itemId: string) {
    await this.requireTemplateAdmin(req, id);
    return this.svc.removeItem(id, itemId);
  }

  /**
   * POST /api/v1/form-templates/:id/items/reorder
   * Reorder items. Broker admin of the template's org only.
   */
  @Post(':id/items/reorder')
  async reorderItems(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { itemIds: string[] },
  ) {
    await this.requireTemplateAdmin(req, id);
    return this.svc.reorderItems(id, body.itemIds);
  }

  /**
   * GET /api/v1/form-templates/resolve
   * Find the best matching template for a transaction's parameters.
   */
  @Get('resolve/best-match')
  resolve(
    @Query('organizationId')  organizationId?: string,
    @Query('stateCode')       stateCode?: string,
    @Query('transactionType') transactionType: string = 'residential',
    @Query('side')            side: string = 'buyer_side',
  ) {
    return this.svc.resolveForTransaction({ organizationId, stateCode, transactionType, side });
  }
}
