import { Readable } from 'stream';
import { TransactionEntity } from '../transactions/entities/transaction.entity';

export function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export function formatAddress(tx: TransactionEntity): string {
  const parts = [tx.propertyAddressLine1];
  if (tx.propertyAddressLine2) parts.push(tx.propertyAddressLine2);
  parts.push(`${tx.propertyCity}, ${tx.propertyState}`);
  if (tx.propertyPostalCode) parts[parts.length - 1] += ` ${tx.propertyPostalCode}`;
  return parts.join(', ');
}

export function extractPageFromMessage(message: string, fallback = 1): number {
  const m = message.match(/page\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : fallback;
}

export function detectRolesInMessage(lowerMsg: string): string[] {
  const roles: string[] = [];
  if (/\bbuyer\b/.test(lowerMsg)) roles.push('buyer');
  if (/\bseller\b/.test(lowerMsg)) roles.push('seller');
  if (/\bofferor\b/.test(lowerMsg)) roles.push('seller');
  if (/\bacceptor\b/.test(lowerMsg)) roles.push('buyer');
  if (/\bbuyer.?agent\b/.test(lowerMsg)) roles.push('buyer_agent');
  if (/\bseller.?agent|listing.?agent\b/.test(lowerMsg)) roles.push('seller_agent');
  return roles;
}
