import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractionJobEntity } from './entities/extraction-job.entity';
import type { PipelineProgressEvent } from './pipeline-progress.types';
import type { PageRoutingPipelineResult } from './page-routing.types';

export interface ExtractionJob {
  id: string;
  status: 'processing' | 'complete' | 'error';
  progress: PipelineProgressEvent | null;
  progressVersion: number;
  result?: PageRoutingPipelineResult;
  draftResult?: unknown;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 1_800_000; // 30 minutes

@Injectable()
export class ExtractionJobStore {
  private readonly logger = new Logger(ExtractionJobStore.name);
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private lastCleanupAt = 0;
  private readonly CLEANUP_INTERVAL_MS = 60_000; // run orphan cleanup at most once per minute

  constructor(
    @InjectRepository(ExtractionJobEntity)
    private readonly repo: Repository<ExtractionJobEntity>,
  ) {}

  async create(id: string): Promise<void> {
    await this.repo.insert({
      id,
      status: 'processing',
      progressVersion: 0,
    });
    this.scheduleCleanup();
  }

  /** Same as create() but auto-fails the job if it doesn't finish within timeoutMs. */
  async createWithTimeout(id: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
    await this.create(id);
    const timer = setTimeout(() => {
      this.fail(id, 'Job timed out', { timeoutMs }).catch(() => {
        // if job already completed/failed, the SQL guard in fail() is a no-op
      });
    }, timeoutMs);
    this.timeouts.set(id, timer);
  }

  /** Clear in-memory timer if the job finishes before the timeout fires. */
  private clearTimeout(id: string): void {
    const timer = this.timeouts.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(id);
    }
  }

  /**
   * DB-based orphan cleanup: fail any jobs stuck in 'processing' longer than
   * DEFAULT_TIMEOUT_MS. This handles the case where in-memory timers are lost
   * (e.g. Fly.io machine restart) — the timer-based timeout never fires, so
   * the job stays 'processing' forever without this safety net.
   */
  private scheduleCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupAt < this.CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;
    this.cleanupStaleJobs().catch((err) =>
      this.logger.warn(`Orphan cleanup failed: ${err.message}`),
    );
  }

  async cleanupStaleJobs(): Promise<number> {
    const cutoffMs = DEFAULT_TIMEOUT_MS;
    const stale = await this.repo.query(
      `UPDATE "extraction_jobs"
         SET "status" = 'error',
             "error" = 'Job timed out (orphaned)',
             "errorDetailsJson" = '{"reason":"orphaned"}'::jsonb,
             "progressJson" = '{"stage":"error","message":"Job timed out (orphaned)","percent":0}'::jsonb,
             "progressVersion" = "progressVersion" + 1,
             "updatedAt" = NOW()
       WHERE "status" = 'processing'
         AND "updatedAt" < NOW() - INTERVAL '1 millisecond' * $1
       RETURNING "id"`,
      [cutoffMs],
    );
    if (stale.length > 0) {
      this.logger.warn(`Cleaned up ${stale.length} orphaned extraction job(s): ${stale.map((r: { id: string }) => r.id).join(', ')}`);
    }
    return stale.length;
  }

  async get(id: string): Promise<ExtractionJob | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    return this.entityToJob(entity);
  }

  async emit(id: string, event: PipelineProgressEvent): Promise<void> {
    // Skip if job already finished — prevents fire-and-forget emits racing
    // with complete()/completeDraft() from overwriting the final state.
    await this.repo.query(
      `UPDATE "extraction_jobs" SET "progressJson" = $1::jsonb, "progressVersion" = "progressVersion" + 1, "updatedAt" = NOW() WHERE "id" = $2 AND "status" NOT IN ('complete', 'error')`,
      [JSON.stringify(event), id],
    );
  }

  async complete(id: string, result: PageRoutingPipelineResult): Promise<void> {
    this.clearTimeout(id);
    // Guard: only mark complete if still processing — prevents a slow extraction
    // from overwriting an earlier timeout-induced error state.
    await this.repo.query(
      `UPDATE "extraction_jobs" SET "status" = 'complete', "resultJson" = $1::jsonb, "progressJson" = $2::jsonb, "progressVersion" = "progressVersion" + 1, "updatedAt" = NOW() WHERE "id" = $3 AND "status" = 'processing'`,
      [JSON.stringify(result), JSON.stringify({ stage: 'complete', message: 'Processing complete', percent: 100 }), id],
    );
  }

  async completeDraft(id: string, result: unknown): Promise<void> {
    this.clearTimeout(id);
    // Guard: only mark complete if still processing — prevents a slow extraction
    // from overwriting an earlier timeout-induced error state.
    await this.repo.query(
      `UPDATE "extraction_jobs" SET "status" = 'complete', "draftResultJson" = $1::jsonb, "progressJson" = $2::jsonb, "progressVersion" = "progressVersion" + 1, "updatedAt" = NOW() WHERE "id" = $3 AND "status" = 'processing'`,
      [JSON.stringify(result), JSON.stringify({ stage: 'complete', message: 'Draft created', percent: 100 }), id],
    );
  }

  async fail(id: string, error: string, details?: Record<string, unknown>): Promise<void> {
    this.clearTimeout(id);
    const progressEvent = { stage: 'error', message: error, percent: 0, details };
    await this.repo.query(
      `UPDATE "extraction_jobs" SET "status" = 'error', "error" = $1, "errorDetailsJson" = $2::jsonb, "progressJson" = $3::jsonb, "progressVersion" = "progressVersion" + 1, "updatedAt" = NOW() WHERE "id" = $4 AND "status" = 'processing'`,
      [error, JSON.stringify(details ?? null), JSON.stringify(progressEvent), id],
    );
  }

  private entityToJob(entity: ExtractionJobEntity): ExtractionJob {
    return {
      id: entity.id,
      status: entity.status as 'processing' | 'complete' | 'error',
      progress: entity.progressJson as unknown as PipelineProgressEvent | null,
      progressVersion: entity.progressVersion,
      result: entity.resultJson as unknown as PageRoutingPipelineResult | undefined,
      draftResult: entity.draftResultJson,
      error: entity.error ?? undefined,
      errorDetails: entity.errorDetailsJson as Record<string, unknown> | undefined,
    };
  }
}
