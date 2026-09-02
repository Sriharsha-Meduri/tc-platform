import { Body, Controller, Get, Param, Post, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { DisclosurePacketService } from './disclosure-packet.service';
import { AccountsService } from '../accounts/accounts.service';

@Controller('transactions')
export class DisclosurePacketController {
  constructor(
    private readonly disclosurePacketService: DisclosurePacketService,
    private readonly accountsService: AccountsService,
  ) {}

  /** The seller disclosure packet lifecycle state for a transaction. */
  @Get(':transactionId/disclosure-packet')
  async get(@Param('transactionId') transactionId: string) {
    return this.disclosurePacketService.findByTransaction(transactionId);
  }

  /** Marks the seller's disclosures returned and ready for TC review. */
  @Post(':transactionId/disclosure-packet/seller-completed')
  @HttpCode(HttpStatus.OK)
  async markSellerCompleted(@Param('transactionId') transactionId: string) {
    return this.disclosurePacketService.markSellerCompleted(transactionId);
  }

  /** Listing TC marks the disclosures reviewed for completeness. */
  @Post(':transactionId/disclosure-packet/review')
  @HttpCode(HttpStatus.OK)
  async review(
    @Req() req: Request,
    @Param('transactionId') transactionId: string,
    @Body() body: { notes?: string | null },
  ) {
    const userId = (req.user as { userId?: string })?.userId;
    const account = userId ? await this.accountsService.findByUserId(userId) : null;
    return this.disclosurePacketService.markReviewed(transactionId, account?.id ?? null, body?.notes ?? null);
  }

  /** Forwards the reviewed disclosure packet to the Buyer TC and Buyer Agent. */
  @Post(':transactionId/disclosure-packet/forward')
  @HttpCode(HttpStatus.OK)
  async forward(@Param('transactionId') transactionId: string) {
    return this.disclosurePacketService.forwardToBuyer(transactionId);
  }
}
