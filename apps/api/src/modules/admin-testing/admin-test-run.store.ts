import { Injectable } from '@nestjs/common';

export type TestRunMode = 'mock' | 'real';
export type TestStepStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface TestRunStep {
  key: string;
  label: string;
  status: TestStepStatus;
  startedAt?: string;
  completedAt?: string;
  documentId?: string;
  emailId?: string;
  uploadLinkId?: string;
  envelopeId?: string;
  detail?: string;
  error?: string;
}

export interface TestRunEmailAddresses {
  buyerAgent: string;
  sellerAgent: string;
  broker: string;
  escrow: string;
  lender: string;
}

export interface TestRun {
  runId: string;
  mode: TestRunMode;
  accountId: string;
  organizationId: string;
  testEmails: TestRunEmailAddresses | null;
  transactionId: string | null;
  /** Raw upload-link tokens captured at mint/regenerate time — never persisted, only held here in memory for the lifetime of this run. */
  uploadLinkTokens: Partial<Record<'buyerAgent' | 'sellerAgent' | 'broker' | 'escrow', string>>;
  steps: TestRunStep[];
  overallStatus: 'running' | 'passed' | 'failed';
  progressVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * In-memory run-status store for the Admin Buyer Transaction Test Center.
 * Single-process, non-durable — acceptable here (unlike ExtractionJobStore,
 * which is DB-backed) because this tool is low-scale, non-production-only,
 * and a lost run on server restart just means re-running the test, not lost
 * user data. Mirrors ExtractionJobStore's status/progressVersion shape for
 * the same SSE-polling idiom used by extract-and-draft-routed's progress route.
 */
@Injectable()
export class AdminTestRunStore {
  private readonly runs = new Map<string, TestRun>();

  create(runId: string, mode: TestRunMode, accountId: string, organizationId: string, testEmails: TestRunEmailAddresses | null, stepDefs: Array<{ key: string; label: string }>): TestRun {
    const now = new Date().toISOString();
    const run: TestRun = {
      runId,
      mode,
      accountId,
      organizationId,
      testEmails,
      transactionId: null,
      uploadLinkTokens: {},
      steps: stepDefs.map((s) => ({ key: s.key, label: s.label, status: 'pending' })),
      overallStatus: 'running',
      progressVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(runId, run);
    return run;
  }

  get(runId: string): TestRun | null {
    return this.runs.get(runId) ?? null;
  }

  setTransactionId(runId: string, transactionId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.transactionId = transactionId;
    run.updatedAt = new Date().toISOString();
    run.progressVersion += 1;
  }

  recordUploadLinkToken(runId: string, purpose: 'buyerAgent' | 'sellerAgent' | 'broker' | 'escrow', token: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.uploadLinkTokens[purpose] = token;
    run.updatedAt = new Date().toISOString();
    run.progressVersion += 1;
  }

  startStep(runId: string, key: string): void {
    this.updateStep(runId, key, { status: 'running', startedAt: new Date().toISOString() });
  }

  passStep(runId: string, key: string, extra?: Partial<TestRunStep>): void {
    this.updateStep(runId, key, { status: 'passed', completedAt: new Date().toISOString(), ...extra });
  }

  failStep(runId: string, key: string, error: string, extra?: Partial<TestRunStep>): void {
    this.updateStep(runId, key, { status: 'failed', completedAt: new Date().toISOString(), error, ...extra });
    const run = this.runs.get(runId);
    if (run) run.overallStatus = 'failed';
  }

  private updateStep(runId: string, key: string, patch: Partial<TestRunStep>): void {
    const run = this.runs.get(runId);
    if (!run) return;
    const step = run.steps.find((s) => s.key === key);
    if (!step) return;
    Object.assign(step, patch);
    run.updatedAt = new Date().toISOString();
    run.progressVersion += 1;
  }

  finish(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    if (run.overallStatus !== 'failed') run.overallStatus = 'passed';
    run.updatedAt = new Date().toISOString();
    run.progressVersion += 1;
  }
}
