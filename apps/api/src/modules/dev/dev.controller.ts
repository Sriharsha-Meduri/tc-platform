import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { DevSeedService } from './dev-seed.service';
import { SeedTransactionPayload } from './dev-seed.dto';

/**
 * Dev-only controller — registered only when APP_ENV !== 'production'.
 *
 * Route naming convention: {persona}-{lifecycle-step}
 *   buyer-agent-init-tran    → create DRAFT transaction (document + parties + clock)
 *   buyer-agent-init-submit  → (future) advance DRAFT → submitted / active
 *
 * See docs/api-testing.md for payload schema and usage examples.
 */
@Public()
@Controller('dev/transactions')
export class DevController {
  constructor(private readonly devSeedService: DevSeedService) {}

  /**
   * Creates a fully-formed DRAFT transaction from a JSON payload.
   * Populates: transaction record, parties, synthetic purchase-agreement document
   * with contract extraction metadata, and clock settings.
   *
   * Nothing is activated — open the transaction in the UI and click
   * "Initialize Workflow" to seed events + reminders and activate.
   */
  @Post('buyer-agent-init-tran')
  buyerAgentInitTran(@Body() payload: SeedTransactionPayload) {
    return this.devSeedService.seed(payload);
  }

  /**
   * (Future) Advances an existing DRAFT to submitted/active in one call.
   * Will seed events, schedule reminders, and optionally initialize the workflow.
   * Placeholder — returns 501 until implemented.
   */
  @Post('buyer-agent-init-submit')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  buyerAgentInitSubmit() {
    return {
      statusCode: 501,
      message: 'buyer-agent-init-submit is not yet implemented',
      description: 'Will accept a transactionId and advance the DRAFT to active, seeding events and scheduling reminders.',
    };
  }
}
