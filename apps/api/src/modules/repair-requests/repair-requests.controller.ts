import { Controller, Get, Post, Patch, Logger, HttpCode, HttpStatus, Body, Param, Query } from '@nestjs/common';
import { RepairRequestsService, CreateRepairRequestInput, ReceiveRrrrInput, ReviewInput } from './repair-requests.service';

@Controller('repair-requests')
export class RepairRequestsController {
  private readonly logger = new Logger(RepairRequestsController.name);

  constructor(private readonly service: RepairRequestsService) {}

  @Get()
  async list(@Query('transactionId') transactionId: string) {
    if (!transactionId) return [];
    const items = await this.service.findByTransaction(transactionId);
    const enriched = await Promise.all(
      items.map(async (pr) => {
        const docs = await this.service.findDocumentsForRepairRequest(pr);
        return { ...pr, documents: docs };
      }),
    );
    return enriched;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const pr = await this.service.findById(id);
    if (!pr) return null;
    const docs = await this.service.findDocumentsForRepairRequest(pr);
    return { ...pr, documents: docs };
  }

  @Post('rr')
  @HttpCode(HttpStatus.CREATED)
  async createRR(@Body() body: CreateRepairRequestInput) {
    return this.service.createRepairRequest(body);
  }

  @Post('rrrr/receive')
  @HttpCode(HttpStatus.OK)
  async receiveRRRR(@Body() body: ReceiveRrrrInput) {
    return this.service.receiveRrrr(body);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @Body() body: { reviewerAccountId: string; notes?: string }) {
    return this.service.approve({ repairRequestId: id, ...body });
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@Param('id') id: string, @Body() body: { reviewerAccountId: string; notes?: string }) {
    return this.service.reject({ repairRequestId: id, ...body });
  }

  @Post(':id/request-changes')
  @HttpCode(HttpStatus.OK)
  async requestChanges(@Param('id') id: string, @Body() body: { reviewerAccountId: string; notes?: string }) {
    return this.service.requestChanges({ repairRequestId: id, ...body });
  }
}
