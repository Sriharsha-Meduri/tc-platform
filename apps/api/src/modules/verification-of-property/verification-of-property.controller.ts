import { Controller, Get, Post, Patch, Logger, HttpCode, HttpStatus, Body, Param, Query } from '@nestjs/common';
import { VerificationOfPropertyService, ScheduleVopInput } from './verification-of-property.service';

@Controller('verification-of-property')
export class VerificationOfPropertyController {
  private readonly logger = new Logger(VerificationOfPropertyController.name);

  constructor(private readonly service: VerificationOfPropertyService) {}

  @Get()
  async get(@Query('transactionId') transactionId: string) {
    if (!transactionId) return { vp: null };
    const vop = await this.service.findByTransaction(transactionId);
    return { vp: vop };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async schedule(@Body() body: ScheduleVopInput) {
    return this.service.schedule(body);
  }

  @Patch(':id/date')
  @HttpCode(HttpStatus.OK)
  async updateDate(
    @Param('id') id: string,
    @Body() body: { scheduledDate: string; updatedByAccountId?: string },
  ) {
    // Re-use schedule logic with the existing VOP's transactionId
    const existing = await this.service.findById(id);
    if (!existing) return null;
    return this.service.schedule({
      transactionId: existing.transactionId,
      scheduledDate: body.scheduledDate,
      createdByAccountId: body.updatedByAccountId,
    });
  }

  @Post('transaction/:transactionId/reminder')
  @HttpCode(HttpStatus.OK)
  async sendReminder(
    @Param('transactionId') transactionId: string,
    @Body() body?: { triggeredByAccountId?: string },
  ) {
    return this.service.sendReminder(transactionId, body?.triggeredByAccountId);
  }

  @Post(':id/receive-document')
  @HttpCode(HttpStatus.OK)
  async receiveDocument(
    @Param('id') id: string,
    @Body() body: { documentId: string; accountId?: string },
  ) {
    return this.service.markDocumentReceived(id, body.documentId, body.accountId);
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Param('id') id: string,
    @Body() body?: { accountId?: string },
  ) {
    return this.service.markValidated(id, body?.accountId);
  }

  @Post(':id/ready-for-docusign')
  @HttpCode(HttpStatus.OK)
  async readyForDocuSign(
    @Param('id') id: string,
    @Body() body?: { accountId?: string },
  ) {
    return this.service.setReadyForDocuSign(id, body?.accountId);
  }

  @Post(':id/send-for-signature')
  @HttpCode(HttpStatus.OK)
  async sendForSignature(
    @Param('id') id: string,
    @Body() body?: { accountId?: string },
  ) {
    return this.service.sendForSignature(id, body?.accountId);
  }

  @Post(':id/fully-executed')
  @HttpCode(HttpStatus.OK)
  async markFullyExecuted(
    @Param('id') id: string,
    @Body() body?: { accountId?: string },
  ) {
    return this.service.markFullyExecuted(id, body?.accountId);
  }

}
