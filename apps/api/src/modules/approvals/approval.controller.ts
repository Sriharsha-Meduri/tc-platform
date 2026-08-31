import { Controller, Post, Patch, Get, Param, Body, Req, HttpCode, HttpStatus, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ApprovalService } from './approval.service';
import { AccountsService } from '../accounts/accounts.service';

@Controller('approval-requests')
export class ApprovalController {
  constructor(
    private readonly approvalService: ApprovalService,
    private readonly accountsService: AccountsService,
  ) {}

  private async resolveAccountId(req: Request): Promise<string> {
    const userId = (req.user as { userId?: string })?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const account = await this.accountsService.findByUserId(userId);
    if (!account) throw new UnauthorizedException('Account not found');
    return account.id;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() body: { transactionId: string; type: 'buyer_agent_contingency_removal'; contingencies?: string[] }) {
    const accountId = await this.resolveAccountId(req);
    return this.approvalService.create({ ...body, requestedBy: accountId });
  }

  @Public()
  @Get(':id')
  async getById(@Param('id') id: string) {
    const entity = await this.approvalService.findById(id);
    if (!entity) throw new NotFoundException('Approval request not found');
    return entity;
  }

  @Public()
  @Patch(':id/approve')
  async approve(@Req() req: Request, @Param('id') id: string, @Body() body: { comments?: string }) {
    const accountId = await this.resolveAccountId(req).catch(() => null);
    return this.approvalService.approve(id, accountId, body.comments);
  }

  @Public()
  @Patch(':id/approve-contingencies')
  async approveContingencies(@Req() req: Request, @Param('id') id: string, @Body() body: { selected?: string[]; rejected?: string[]; comments?: string }) {
    const accountId = await this.resolveAccountId(req).catch(() => null);
    return this.approvalService.approveContingencies(id, accountId, body.selected ?? [], body.comments);
  }

  @Public()
  @Patch(':id/reject')
  async reject(@Req() req: Request, @Param('id') id: string, @Body() body: { comments?: string }) {
    const accountId = await this.resolveAccountId(req).catch(() => null);
    return this.approvalService.reject(id, accountId, body.comments);
  }

  @Public()
  @Get('transaction/:transactionId')
  async getForTransaction(@Param('transactionId') transactionId: string) {
    return this.approvalService.getForTransaction(transactionId);
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  async resend(@Param('id') id: string) {
    await this.approvalService.resendEmail(id);
    return { ok: true };
  }
}
