import { Logger } from '@nestjs/common';
import { AccountEntity } from '../accounts/entities/account.entity';
import { TransactionEntity } from './entities/transaction.entity';

/**
 * The single source of truth for the "Transaction Coordinator" identity on any
 * transaction email — the TC's own myTC account supplies the NAME and PHONE,
 * but the EMAIL shown to parties is always the transaction-specific Mailgun
 * address (`transaction.outboundEmailAddress`), never the TC's myTC
 * login/account email.
 *
 * Templates render these via `{{tcName}}`, `{{tcPhone}}`, and
 * `{{transactionEmail}}`. Because the email field is populated exclusively from
 * `outboundEmailAddress`, a template can never accidentally expose the TC's
 * personal account email.
 */
export interface TransactionCoordinatorContact {
  /** myTC account/profile name of the TC who created the transaction. */
  name: string | null;
  /** Transaction-specific Mailgun-generated address — NEVER the TC's myTC login email. */
  email: string | null;
  /** myTC account cell phone, when configured. */
  phone: string | null;
}

/**
 * Resolves the Transaction Coordinator contact block for a transaction email.
 *
 * - `name`  ← creator account display/first name
 * - `phone` ← creator account cell phone
 * - `email` ← `transaction.outboundEmailAddress` (the transaction Mailgun address)
 *
 * A missing `outboundEmailAddress` is treated as a data/configuration problem:
 * it is logged and the email value comes back `null` so templates omit the
 * line — it is NEVER silently replaced with the TC's myTC account email.
 */
export function getTransactionCoordinatorContact(
  transaction: TransactionEntity,
  creatorAccount: AccountEntity | null | undefined,
  logger?: Pick<Logger, 'warn'>,
): TransactionCoordinatorContact {
  const reference = transaction.transactionNumber ?? transaction.id ?? '<unknown>';

  const name = creatorAccount?.displayName ?? creatorAccount?.firstName ?? null;
  if (!name) {
    const accountReference = creatorAccount?.id ?? transaction.createdByAccountId ?? '<unknown>';
    logger?.warn?.(
      `Transaction ${reference}: creator account (${accountReference}) has no resolvable display/first name — TC name omitted from email correspondence`,
    );
  }

  const phone = creatorAccount?.cellPhone ?? null;

  const email = transaction.outboundEmailAddress ?? null;
  if (!email) {
    logger?.warn?.(
      `Transaction ${reference}: transaction-specific Mailgun address (outboundEmailAddress) is missing — TC email omitted from correspondence (never falling back to the TC's myTC login email)`,
    );
  }

  return { name, email, phone };
}
