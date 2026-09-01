import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { DisclosurePacketService } from './disclosure-packet.service';
import { DisclosurePacketStatus } from './entities/disclosure-packet.entity';
import { PartyRole } from '../transaction-parties/entities/transaction-party.entity';

function build(overrides: {
  packet?: Record<string, unknown> | null;
  parties?: Array<{ partyRole: PartyRole; email: string | null; displayName?: string }>;
  docs?: Array<{ documentType: string; title?: string; fileName?: string; status: string }>;
} = {}) {
  const packetRow = overrides.packet === undefined
    ? { id: 'p1', transactionId: 'tx1', status: DisclosurePacketStatus.SENT_TO_SELLER }
    : overrides.packet;

  const packetsRepo = {
    findOne: jest.fn().mockResolvedValue(packetRow),
    create: jest.fn().mockImplementation((v: unknown) => v),
    save: jest.fn().mockImplementation((v: unknown) => Promise.resolve(v)),
  };
  const transactionsRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'tx1', transactionNumber: 'TXN-1',
      propertyAddressLine1: '1 Main St', propertyCity: 'Austin', propertyState: 'TX',
      outboundEmailAddress: 'txn@txn.mytcapp.net', createdByAccount: null,
    }),
  };
  const partiesRepo = { find: jest.fn().mockResolvedValue(overrides.parties ?? []) };
  const documentsRepo = { find: jest.fn().mockResolvedValue(overrides.docs ?? []) };
  const messagesRepo = {
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockImplementation((v: unknown) => v),
  };
  const mailgunService = { sendEmail: jest.fn().mockResolvedValue({ messageId: 'mg1' }) };
  const emailTemplateService = { render: jest.fn().mockReturnValue('<html></html>') };
  const auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new DisclosurePacketService(
    packetsRepo as never,
    transactionsRepo as never,
    partiesRepo as never,
    documentsRepo as never,
    messagesRepo as never,
    mailgunService as never,
    emailTemplateService as never,
    auditLogService as never,
  );
  return { service, packetsRepo, mailgunService, auditLogService, messagesRepo };
}

describe('DisclosurePacketService', () => {
  it('markReviewed moves the packet to TC_REVIEWED and audits', async () => {
    const { service, auditLogService } = build();
    const result = await service.markReviewed('tx1', 'acct-9', 'looks complete');
    expect(result.status).toBe(DisclosurePacketStatus.TC_REVIEWED);
    expect(result.reviewedByAccountId).toBe('acct-9');
    expect(result.reviewedAt).toBeInstanceOf(Date);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
  });

  it('forwardToBuyer refuses while the packet has not been reviewed', async () => {
    const { service } = build({ packet: { id: 'p1', transactionId: 'tx1', status: DisclosurePacketStatus.SELLER_COMPLETED } });
    await expect(service.forwardToBuyer('tx1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwardToBuyer refuses when no buyer recipient email is on file', async () => {
    const { service } = build({
      packet: { id: 'p1', transactionId: 'tx1', status: DisclosurePacketStatus.TC_REVIEWED },
      parties: [{ partyRole: PartyRole.BUYER_AGENT, email: null }],
    });
    await expect(service.forwardToBuyer('tx1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('forwardToBuyer emails the buyer side and moves the packet to SENT_TO_BUYER', async () => {
    const { service, mailgunService, auditLogService } = build({
      packet: { id: 'p1', transactionId: 'tx1', status: DisclosurePacketStatus.TC_REVIEWED },
      parties: [
        { partyRole: PartyRole.BUYER_TRANSACTION_COORDINATOR, email: 'buyertc@example.com', displayName: 'Buyer TC' },
        { partyRole: PartyRole.BUYER_AGENT, email: 'buyeragent@example.com', displayName: 'Buyer Agent' },
      ],
      docs: [{ documentType: 'tds', title: 'Transfer Disclosure Statement', status: 'uploaded' }],
    });
    const result = await service.forwardToBuyer('tx1');
    expect(mailgunService.sendEmail).toHaveBeenCalledTimes(1);
    const toArg = mailgunService.sendEmail.mock.calls[0][0];
    expect(toArg).toEqual(['buyertc@example.com', 'buyeragent@example.com']);
    expect(result.status).toBe(DisclosurePacketStatus.SENT_TO_BUYER);
    expect(result.forwardedAt).toBeInstanceOf(Date);
    expect(auditLogService.log).toHaveBeenCalledTimes(1);
  });
});
