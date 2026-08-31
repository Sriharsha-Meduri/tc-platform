import { DataSource } from 'typeorm';
import { AuditLogEntity, AuditAction } from '../../../modules/audit-log/audit-log.entity';
import { AccountEntity } from '../../../modules/accounts/entities/account.entity';
import { TransactionEntity } from '../../../modules/transactions/entities/transaction.entity';

export async function seedAuditLogs(
  dataSource: DataSource,
  accounts: AccountEntity[],
): Promise<void> {
  const repo = dataSource.getRepository(AuditLogEntity);
  const txRepo = dataSource.getRepository(TransactionEntity);

  const existing = await repo.count();
  if (existing > 0) {
    console.log(`  [audit_logs] Skipped — ${existing} entries already exist.`);
    return;
  }

  // Resolve account references by email convention
  const sarah = accounts[0];
  const alice = accounts[1];
  const bob   = accounts[2];
  const carol = accounts[3];
  const david = accounts[4];
  const admin = accounts[5];

  // Resolve transaction references
  const tx1 = await txRepo.findOne({ where: { transactionNumber: 'TXN-2024-0001' } });
  const tx2 = await txRepo.findOne({ where: { transactionNumber: 'TXN-2024-0002' } });

  const logs = repo.create([
    // ── Org lifecycle ─────────────────────────────────────────────────
    {
      accountId: sarah.id,
      action: AuditAction.ORG_CREATED,
      targetType: 'organization',
      targetDisplayName: 'Sunset Realty Group',
      description: 'Broker Sarah Broker registered Sunset Realty Group (pending approval)',
    },
    {
      accountId: admin.id,
      action: AuditAction.ORG_STATUS_CHANGED,
      targetType: 'organization',
      targetDisplayName: 'Sunset Realty Group',
      description: 'Admin approved Sunset Realty Group — status changed to active',
    },

    // ── User registrations ────────────────────────────────────────────
    {
      accountId: sarah.id,
      action: AuditAction.USER_REGISTERED,
      targetType: 'user',
      targetDisplayName: sarah.displayName,
      description: `${sarah.displayName} registered as broker_admin`,
    },
    {
      accountId: alice.id,
      action: AuditAction.USER_REGISTERED,
      targetType: 'user',
      targetDisplayName: alice.displayName,
      description: `${alice.displayName} registered as transaction_coordinator`,
    },
    {
      accountId: bob.id,
      action: AuditAction.USER_REGISTERED,
      targetType: 'user',
      targetDisplayName: bob.displayName,
      description: `${bob.displayName} registered as transaction_coordinator`,
    },
    {
      accountId: carol.id,
      action: AuditAction.USER_REGISTERED,
      targetType: 'user',
      targetDisplayName: carol.displayName,
      description: `${carol.displayName} registered as agent`,
    },
    {
      accountId: david.id,
      action: AuditAction.USER_REGISTERED,
      targetType: 'user',
      targetDisplayName: david.displayName,
      description: `${david.displayName} registered as agent`,
    },
    {
      accountId: admin.id,
      action: AuditAction.USER_REGISTERED,
      targetType: 'user',
      targetDisplayName: admin.displayName,
      description: `${admin.displayName} registered as support_admin`,
    },

    // ── Email verifications ───────────────────────────────────────────
    {
      accountId: alice.id,
      action: AuditAction.USER_VERIFIED,
      targetType: 'user',
      targetDisplayName: alice.displayName,
      description: `${alice.displayName} verified email address`,
    },
    {
      accountId: carol.id,
      action: AuditAction.USER_VERIFIED,
      targetType: 'user',
      targetDisplayName: carol.displayName,
      description: `${carol.displayName} verified email address`,
    },
    {
      accountId: david.id,
      action: AuditAction.USER_VERIFIED,
      targetType: 'user',
      targetDisplayName: david.displayName,
      description: `${david.displayName} verified email address`,
    },

    // ── Logins ────────────────────────────────────────────────────────
    {
      accountId: sarah.id,
      action: AuditAction.USER_LOGIN,
      targetType: 'user',
      targetDisplayName: sarah.displayName,
      description: `${sarah.displayName} signed in`,
    },
    {
      accountId: alice.id,
      action: AuditAction.USER_LOGIN,
      targetType: 'user',
      targetDisplayName: alice.displayName,
      description: `${alice.displayName} signed in`,
    },
    {
      accountId: carol.id,
      action: AuditAction.USER_LOGIN,
      targetType: 'user',
      targetDisplayName: carol.displayName,
      description: `${carol.displayName} signed in`,
    },

    // ── Memberships ───────────────────────────────────────────────────
    {
      accountId: sarah.id,
      action: AuditAction.MEMBERSHIP_CREATED,
      targetType: 'organization_membership',
      targetDisplayName: alice.displayName,
      description: `${alice.displayName} joined Sunset Realty Group as transaction_coordinator`,
    },
    {
      accountId: sarah.id,
      action: AuditAction.MEMBERSHIP_CREATED,
      targetType: 'organization_membership',
      targetDisplayName: bob.displayName,
      description: `${bob.displayName} joined Sunset Realty Group as transaction_coordinator`,
    },
    {
      accountId: sarah.id,
      action: AuditAction.MEMBERSHIP_CREATED,
      targetType: 'organization_membership',
      targetDisplayName: carol.displayName,
      description: `${carol.displayName} joined Sunset Realty Group as agent`,
    },
    {
      accountId: sarah.id,
      action: AuditAction.MEMBERSHIP_CREATED,
      targetType: 'organization_membership',
      targetDisplayName: david.displayName,
      description: `${david.displayName} joined Sunset Realty Group as agent`,
    },

    // ── Transaction 1: 456 Maple Street ───────────────────────────────
    ...(tx1
      ? [
          {
            accountId: carol.id,
            action: AuditAction.TRANSACTION_CREATED,
            targetType: 'transaction',
            targetId: tx1.id,
            targetDisplayName: 'TXN-2024-0001',
            description: `Carol Williams created transaction TXN-2024-0001 — 456 Maple Street, Pasadena`,
          } as const,
          {
            accountId: alice.id,
            action: AuditAction.TRANSACTION_SUBMITTED,
            targetType: 'transaction',
            targetId: tx1.id,
            targetDisplayName: 'TXN-2024-0001',
            description: `Alice Thompson submitted TXN-2024-0001 — advanced to CONTRACT stage`,
          } as const,
          {
            accountId: alice.id,
            action: AuditAction.TRANSACTION_STATUS_CHANGED,
            targetType: 'transaction',
            targetId: tx1.id,
            targetDisplayName: 'TXN-2024-0001',
            description: `TXN-2024-0001 moved to UNDER_CONTRACT — offer accepted`,
          } as const,
          {
            accountId: alice.id,
            action: AuditAction.DOCUMENT_UPLOADED,
            targetType: 'transaction_document',
            targetDisplayName: 'RPA',
            description: `Alice Thompson uploaded RPA for TXN-2024-0001`,
          } as const,
          {
            accountId: alice.id,
            action: AuditAction.DOCUMENT_UPLOADED,
            targetType: 'transaction_document',
            targetDisplayName: 'TDS',
            description: `Alice Thompson uploaded TDS for TXN-2024-0001`,
          } as const,
        ]
      : []),

    // ── Transaction 2: 789 Oak Drive ──────────────────────────────────
    ...(tx2
      ? [
          {
            accountId: david.id,
            action: AuditAction.TRANSACTION_CREATED,
            targetType: 'transaction',
            targetId: tx2.id,
            targetDisplayName: 'TXN-2024-0002',
            description: `David Lee created transaction TXN-2024-0002 — 789 Oak Drive, Glendale`,
          } as const,
        ]
      : []),

    // ── Admin actions ─────────────────────────────────────────────────
    {
      accountId: admin.id,
      action: AuditAction.ADMIN_ACTION,
      targetType: 'organization',
      targetDisplayName: 'Bayview Realty Partners',
      description: 'Admin reviewed pending brokerage Bayview Realty Partners — no action taken',
    },
    {
      accountId: admin.id,
      action: AuditAction.ADMIN_ACTION,
      targetType: 'organization',
      targetDisplayName: 'Desert Oasis Properties',
      description: 'Admin reviewed pending brokerage Desert Oasis Properties — no action taken',
    },
  ]);

  await repo.save(logs);
  console.log(`  [audit_logs] Seeded ${logs.length} entries.`);
}
