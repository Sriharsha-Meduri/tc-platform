import { Body, Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { UploadLinkService } from '../upload-links/upload-link.service';
import { EscrowOnboardingService } from './escrow-onboarding.service';

/**
 * A second controller declaring the same 'upload-links' prefix as
 * UploadLinkController, contributing only these escrow-specific sub-paths.
 * Registered directly on UploadLinksModule (see upload-links.module.ts) —
 * the escrow welcome email is now normally auto-triggered by
 * UploadLinkController right after a successful Seller Agent escrow-info
 * save, so that module needs EscrowOnboardingService directly. The routes
 * here remain for status checks and a manual resend. Purpose gating
 * (Seller-Agent-triggered / Escrow-Officer-only) is enforced inside
 * EscrowOnboardingService regardless of this controller's own gating.
 */
@Controller('upload-links')
export class EscrowOnboardingController {
  constructor(
    private readonly uploadLinkService: UploadLinkService,
    private readonly escrowOnboardingService: EscrowOnboardingService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('token/:token/escrow/welcome-email')
  @HttpCode(HttpStatus.OK)
  async sendEscrowWelcomeEmail(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.escrowOnboardingService.sendWelcomeEmail(link, transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/escrow-welcome-email-status')
  async getEscrowWelcomeEmailStatus(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.escrowOnboardingService.getWelcomeEmailStatus(link, transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/escrow-document-delivery')
  async getEscrowDocumentDeliveryPreference(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.escrowOnboardingService.getDocumentDeliveryPreference(link, transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token/:token/escrow-document-delivery')
  @HttpCode(HttpStatus.OK)
  async saveEscrowDocumentDeliveryPreference(@Param('token') token: string, @Body('willSendDocumentsToBuyer') willSendDocumentsToBuyer: unknown) {
    if (typeof willSendDocumentsToBuyer !== 'boolean') {
      throw new BadRequestException('willSendDocumentsToBuyer must be a boolean.');
    }
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.escrowOnboardingService.saveDocumentDeliveryPreference(link, transaction, willSendDocumentsToBuyer);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/escrow-number')
  async getEscrowNumber(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.escrowOnboardingService.getEscrowNumber(link, transaction);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('token/:token/escrow-number')
  @HttpCode(HttpStatus.OK)
  async saveEscrowNumber(@Param('token') token: string, @Body('escrowNumber') escrowNumber: unknown) {
    if (escrowNumber !== null && typeof escrowNumber !== 'string') {
      throw new BadRequestException('escrowNumber must be a string or null.');
    }
    const normalized = typeof escrowNumber === 'string' ? escrowNumber.trim() || null : null;
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.escrowOnboardingService.saveEscrowNumber(link, transaction, normalized);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token/escrow-hoa-status')
  async getEscrowHoaStatus(@Param('token') token: string) {
    const { link, transaction } = await this.uploadLinkService.validateUploadToken(token);
    return this.escrowOnboardingService.getHoaRequirement(link, transaction);
  }
}
