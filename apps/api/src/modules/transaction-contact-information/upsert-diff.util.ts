import { Repository } from 'typeorm';

export interface UpsertDiffResult<T> {
  /** Null only when there was no existing row AND nothing meaningful was submitted (a true no-op with nothing to show). */
  entity: T | null;
  /** Names of the fields whose value actually changed (or was set for the first time) in this call. */
  changedFields: string[];
  /** Prior value for each changed field, keyed by field name — null when there was no existing row. */
  previousValues: Record<string, unknown>;
  hadChanges: boolean;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return (a ?? null) === (b ?? null);
}

/**
 * Shared "one row per transaction" upsert used by every sub-service in this module
 * (Lender/Escrow/HOA/BrokerCommission). Fields left `undefined` in `incoming` are treated
 * as "not submitted this time" and are left untouched; only fields whose value actually
 * differs from what's already stored trigger a write, so resubmitting an identical form
 * is a true no-op (no DB write, no audit entry) — this is what makes duplicate submissions
 * safe. Uses `Repository.upsert()` on the unique `transactionId` conflict target, which is
 * atomic at the DB level (no find-then-create race that a plain findOne+create/save would have).
 */
export async function upsertWithDiff<T extends { transactionId: string }>(
  repo: Repository<T>,
  transactionId: string,
  incoming: Partial<T>,
): Promise<UpsertDiffResult<T>> {
  const existing = await repo.findOne({ where: { transactionId } as never });

  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const prev = existing ? (existing as Record<string, unknown>)[key] : null;
    if (!valuesEqual(prev, value)) {
      changedFields.push(key);
      previousValues[key] = prev ?? null;
    }
  }

  if (changedFields.length === 0) {
    return { entity: existing, changedFields: [], previousValues: {}, hadChanges: false };
  }

  await repo.upsert({ transactionId, ...incoming } as never, ['transactionId']);
  const entity = await repo.findOneOrFail({ where: { transactionId } as never });
  return { entity, changedFields, previousValues, hadChanges: true };
}
