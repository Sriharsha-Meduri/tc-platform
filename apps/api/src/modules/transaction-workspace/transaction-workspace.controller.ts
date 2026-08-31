import { BadRequestException, Controller, ForbiddenException, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { TransactionWorkspaceService } from './transaction-workspace.service';
import { AccountsService } from '../accounts/accounts.service';

const VALID_SIDES = ['buyer', 'seller', 'escrow', 'broker'] as const;
type Side = typeof VALID_SIDES[number];

function isSide(v: string | undefined): v is Side {
  return !!v && (VALID_SIDES as readonly string[]).includes(v);
}

/**
 * The simplified post-Draft swimlane's data source — every route requires
 * the caller to pass TransactionAccessService's check (enforced inside the
 * service, not here) before any party/document/email data is returned.
 */
@Controller('transactions/:id/workspace')
export class TransactionWorkspaceController {
  constructor(
    private readonly workspaceService: TransactionWorkspaceService,
    private readonly accountsService: AccountsService,
  ) {}

  /** Same pattern used across every other controller in this codebase — req.user.userId → AccountEntity. */
  private async resolveAccountId(req: Request): Promise<string> {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new ForbiddenException('Authentication required');
    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new ForbiddenException('Account not found');
    return account.id;
  }

  @Get('parties')
  async getParties(@Param('id') transactionId: string, @Req() req: Request) {
    const accountId = await this.resolveAccountId(req);
    return this.workspaceService.getParties(accountId, transactionId);
  }

  @Get('documents')
  async getDocuments(@Param('id') transactionId: string, @Req() req: Request) {
    const accountId = await this.resolveAccountId(req);
    return this.workspaceService.getDocuments(accountId, transactionId);
  }

  @Get('email-history')
  async getEmailHistory(@Param('id') transactionId: string, @Query('side') side: string | undefined, @Req() req: Request) {
    if (!isSide(side)) throw new BadRequestException('side must be one of buyer, seller, escrow, broker');
    const accountId = await this.resolveAccountId(req);
    return this.workspaceService.getEmailHistory(accountId, transactionId, side);
  }

  @Get('buyer-side')
  async getBuyerSide(@Param('id') transactionId: string, @Req() req: Request) {
    const accountId = await this.resolveAccountId(req);
    return this.workspaceService.getBuyerSideDetails(accountId, transactionId);
  }

  @Get('seller-side')
  async getSellerSide(@Param('id') transactionId: string, @Req() req: Request) {
    const accountId = await this.resolveAccountId(req);
    return this.workspaceService.getSellerSideDetails(accountId, transactionId);
  }

  @Get('escrow')
  async getEscrow(@Param('id') transactionId: string, @Req() req: Request) {
    const accountId = await this.resolveAccountId(req);
    return this.workspaceService.getEscrowDetails(accountId, transactionId);
  }

  @Get('broker')
  async getBroker(@Param('id') transactionId: string, @Req() req: Request) {
    const accountId = await this.resolveAccountId(req);
    return this.workspaceService.getBrokerDetails(accountId, transactionId);
  }
}
