import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { MembershipsService } from '../organizations/memberships.service';
import { ContractSubmissionService } from '../transactions/contract-submission.service';
import { UploadLinkService } from '../upload-links/upload-link.service';
import { ExternalDocumentUploadService } from '../upload-links/external-document-upload.service';
import {
  BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
  SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD,
} from '../upload-links/upload-link.types';
import { AdminTestRunStore, TestRunMode } from './admin-test-run.store';
import { TestDocumentProvisioningService, BuiltInTestDocument } from './test-document-provisioning.service';
import { buildMockRpaExtraction } from './rpa-mock-extraction.fixture';

const API_PORT = process.env.PORT ?? 3000;
const SELF_BASE_URL = `http://127.0.0.1:${API_PORT}/api/v1`;

export const CREATE_TRANSACTION_STEP = 'create_transaction';
export const UPLOAD_DOCUMENT_STEP_PREFIX = 'upload_document:';

interface DraftResult {
  transaction?: { id: string };
  document?: { id: string };
  duplicate?: boolean;
}

/**
 * Owns step sequencing/status for the Admin Buyer Transaction Test Center.
 * Never reimplements business logic (see admin-testing.module.ts doc comment)
 * — "create transaction" makes an authenticated self-HTTP call to the app's
 * own real POST /document-extraction/extract-and-draft-routed endpoint
 * (mirroring exactly what the real frontend wizard does), and every other
 * step calls the same exported services the real controllers call.
 */
@Injectable()
export class AdminTestOrchestratorService {
  private readonly logger = new Logger(AdminTestOrchestratorService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionsRepo: Repository<TransactionEntity>,
    private readonly membershipsService: MembershipsService,
    private readonly contractSubmissionService: ContractSubmissionService,
    private readonly uploadLinkService: UploadLinkService,
    private readonly externalDocumentUploadService: ExternalDocumentUploadService,
    private readonly runStore: AdminTestRunStore,
    private readonly documentProvisioningService: TestDocumentProvisioningService,
  ) {}

  /**
   * Creates a fresh in-memory run, resolving the admin's own organizationId
   * via MembershipsService (per the plan's decision to run test transactions
   * under the logged-in admin's own account/org — no dedicated seed org).
   */
  async createRun(mode: TestRunMode, accountId: string): Promise<{ runId: string }> {
    const memberships = await this.membershipsService.findByAccount(accountId);
    const organizationId = memberships[0]?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Your account has no organization membership — cannot create a test transaction.');
    }

    const runId = randomUUID();
    this.runStore.create(runId, mode, accountId, organizationId, null, [
      { key: CREATE_TRANSACTION_STEP, label: 'Create Test Buyer Transaction' },
    ]);
    return { runId };
  }

  /**
   * Step 1: create a test transaction via the real extract-and-draft-routed
   * pipeline (self-HTTP call, forwarding the admin's own bearer token) then
   * the real ContractSubmissionService.submitContract — identical to what
   * the real /transactions/new wizard does. Mock mode supplies a canned,
   * schema-valid mockExtractions.RPA payload so the LLM call is skipped;
   * Real Integration mode omits it, forcing real Document Intelligence
   * classification of a generated synthetic RPA PDF.
   */
  async createTestTransaction(runId: string, bearerToken: string): Promise<{ transactionId: string }> {
    const run = this.runStore.get(runId);
    if (!run) throw new BadRequestException(`Unknown test run ${runId}`);

    this.runStore.startStep(runId, CREATE_TRANSACTION_STEP);
    try {
      const propertyAddress = {
        streetAddress: `${100 + Math.floor(Math.random() * 899)} Test Center Way`,
        city: 'Chino',
        state: 'CA',
        postalCode: '91710',
      };

      const [rpaFile] = await this.documentProvisioningService.provision('rpa_valid' as BuiltInTestDocument);

      const form = new FormData();
      form.append('files', new Blob([new Uint8Array(rpaFile.buffer)], { type: 'application/pdf' }), rpaFile.fileName);
      form.append('organizationId', run.organizationId);
      form.append('createdByAccountId', run.accountId);
      if (run.mode === 'mock') {
        form.append(
          'mockExtractions',
          JSON.stringify({ RPA: buildMockRpaExtraction(propertyAddress) }),
        );
      }

      const submitRes = await fetch(`${SELF_BASE_URL}/document-extraction/extract-and-draft-routed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
        body: form,
      });
      if (!submitRes.ok) {
        throw new Error(`extract-and-draft-routed returned ${submitRes.status}: ${await submitRes.text()}`);
      }
      const { jobId } = (await submitRes.json()) as { jobId: string };

      const draft = await this.pollDraftResult(jobId, bearerToken);
      if (!draft.transaction?.id) {
        throw new Error(draft.duplicate ? 'Extraction detected a duplicate document — no new transaction was created.' : 'No transaction was created by extract-and-draft-routed.');
      }
      const transactionId = draft.transaction.id;

      await this.transactionsRepo.update(transactionId, {
        isTestData: true,
        testMode: run.mode,
      });

      await this.contractSubmissionService.submitContract(transactionId, {
        buyerAgentName: 'Test Buyer Agent',
        buyerAgentEmail: run.testEmails?.buyerAgent ?? 'test-buyer-agent@admintest.local',
        sellerAgentName: 'Test Seller Agent',
        sellerAgentEmail: run.testEmails?.sellerAgent ?? 'test-seller-agent@admintest.local',
        buyers: [{ name: 'Test Buyer' }],
        sellers: [{ name: 'Test Seller' }],
      });

      this.runStore.setTransactionId(runId, transactionId);
      this.runStore.passStep(runId, CREATE_TRANSACTION_STEP, { documentId: draft.document?.id });

      return { transactionId };
    } catch (err) {
      this.runStore.failStep(runId, CREATE_TRANSACTION_STEP, (err as Error).message);
      throw err;
    }
  }

  /**
   * Step 2 (repeatable): uploads a built-in synthetic test PDF to the
   * transaction's real Buyer Agent upload link via the exact same
   * ExternalDocumentUploadService.uploadTransactionDocuments the public
   * upload-link page uses — real classification/extraction/validation/blocker
   * logic runs, never bypassed.
   */
  async uploadTestDocument(runId: string, document: BuiltInTestDocument): Promise<void> {
    const run = this.runStore.get(runId);
    if (!run) throw new BadRequestException(`Unknown test run ${runId}`);
    if (!run.transactionId) throw new BadRequestException('Create the test transaction before uploading documents.');

    const stepKey = `${UPLOAD_DOCUMENT_STEP_PREFIX}${document}`;
    if (!run.steps.some((s) => s.key === stepKey)) {
      run.steps.push({ key: stepKey, label: `Upload ${document}`, status: 'pending' });
    }
    this.runStore.startStep(runId, stepKey);

    try {
      const token = await this.resolveUploadToken(run.transactionId, BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, run.accountId);
      this.runStore.recordUploadLinkToken(runId, 'buyerAgent', token);

      const files = await this.documentProvisioningService.provision(document);
      const multerFiles = files.map((f) => ({
        buffer: f.buffer,
        originalname: f.fileName,
        mimetype: 'application/pdf',
        size: f.buffer.length,
      })) as Express.Multer.File[];

      const results = await this.externalDocumentUploadService.uploadTransactionDocuments(token, multerFiles);
      const firstDocumentId = results[0]?.documentId ?? undefined;

      this.runStore.passStep(runId, stepKey, { documentId: firstDocumentId });
    } catch (err) {
      this.runStore.failStep(runId, stepKey, (err as Error).message);
      throw err;
    }
  }

  /**
   * Buyer Agent and Seller Agent links are minted (and their welcome emails
   * sent) automatically inside ContractSubmissionService.submitContract —
   * raw tokens are never persisted (only their SHA-256 hash), so recovering
   * one for the admin's own use here always goes through regenerateSecureUploadLink,
   * exactly like a real "resend link" action would.
   */
  private async resolveUploadToken(transactionId: string, purpose: typeof BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD | typeof SELLER_AGENT_TRANSACTION_DOCUMENT_UPLOAD, accountId: string): Promise<string> {
    const email = purpose === BUYER_AGENT_TRANSACTION_DOCUMENT_UPLOAD ? 'test-buyer-agent@admintest.local' : 'test-seller-agent@admintest.local';
    const link = await this.uploadLinkService.findActiveLinkForEmail(transactionId, email, purpose);
    if (!link) throw new Error(`No active upload link found for purpose "${purpose}" — was the test transaction created?`);
    const { token } = await this.uploadLinkService.regenerateSecureUploadLink(link.id, accountId);
    if (!token) throw new Error('regenerateSecureUploadLink did not return a raw token.');
    return token;
  }

  private async pollDraftResult(jobId: string, bearerToken: string): Promise<DraftResult> {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      const res = await fetch(`${SELF_BASE_URL}/document-extraction/extract-and-draft-routed/${jobId}/result`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.status === 400) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) {
        throw new Error(`extract-and-draft-routed result returned ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as DraftResult;
    }
    throw new Error(`Timed out waiting for extraction job ${jobId} to complete.`);
  }
}
