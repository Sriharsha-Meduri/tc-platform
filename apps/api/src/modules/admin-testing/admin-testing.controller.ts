import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { NonProductionGuard } from '../auth/guards/non-production.guard';
import { AccountsService } from '../accounts/accounts.service';
import { AdminTestOrchestratorService } from './admin-test-orchestrator.service';
import { AdminTestRunStore } from './admin-test-run.store';
import { CreateTestRunDto } from './dto/create-test-run.dto';
import { UploadTestDocumentDto } from './dto/upload-test-document.dto';

/**
 * Admin Buyer Transaction Test Center — never reachable in production.
 * AdminTestingModule itself is only registered when APP_ENV !== 'production'
 * (see admin-testing.module.ts); NonProductionGuard is the belt-and-suspenders
 * defense-in-depth on top of that. @Roles(SUPPORT_ADMIN) reuses the same
 * global JwtAuthGuard/RolesGuard gate as the rest of /admin.
 */
@Roles(UserRole.SUPPORT_ADMIN)
@UseGuards(NonProductionGuard)
@Controller('admin/testing/buyer-transaction')
export class AdminTestingController {
  constructor(
    private readonly orchestrator: AdminTestOrchestratorService,
    private readonly runStore: AdminTestRunStore,
    private readonly accountsService: AccountsService,
  ) {}

  /** Same req.user.userId → AccountEntity pattern used across every other controller in this codebase. */
  private async resolveAccountId(req: Request): Promise<string> {
    const userId = (req.user as { userId?: string })?.userId;
    const account = await this.accountsService.findByUserId(userId ?? '');
    if (!account) throw new Error('No account found for the current user.');
    return account.id;
  }

  @Post('runs')
  async createRun(@Body() dto: CreateTestRunDto, @Req() req: Request) {
    const accountId = await this.resolveAccountId(req);
    return this.orchestrator.createRun(dto.mode, accountId);
  }

  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.runStore.get(runId);
  }

  @Post('runs/:runId/create-transaction')
  async createTransaction(@Param('runId') runId: string, @Req() req: Request) {
    const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? req.cookies?.tc_token;
    return this.orchestrator.createTestTransaction(runId, bearerToken);
  }

  @Post('runs/:runId/upload-document')
  async uploadDocument(@Param('runId') runId: string, @Body() dto: UploadTestDocumentDto) {
    await this.orchestrator.uploadTestDocument(runId, dto.document);
    return this.runStore.get(runId);
  }
}
