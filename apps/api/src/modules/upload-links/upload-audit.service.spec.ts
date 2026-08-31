import { UploadAuditService } from './upload-audit.service';
import { AuditAction } from '../audit-log/audit-log.entity';

describe('UploadAuditService — findMostRecentRejectionReasons', () => {
  function buildService(events: Array<{ action: AuditAction; detailsJson: Record<string, unknown> | null }>) {
    const auditLogService = {
      findByTarget: jest.fn().mockResolvedValue(events),
      log: jest.fn(),
    } as any;
    return new UploadAuditService(auditLogService);
  }

  it('returns an empty map when there are no rejection events', async () => {
    const service = buildService([]);
    const result = await service.findMostRecentRejectionReasons('link-1');
    expect(result.size).toBe(0);
  });

  it('maps a single form code to its reasons', async () => {
    const service = buildService([
      {
        action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED,
        detailsJson: { detectedFormCode: 'TDS', reasons: ['Missing seller signature', 'Property address mismatch'] },
      },
    ]);
    const result = await service.findMostRecentRejectionReasons('link-1');
    expect(result.get('TDS')).toEqual(['Missing seller signature', 'Property address mismatch']);
  });

  it('keeps the most-recent occurrence when the same form code is rejected multiple times', async () => {
    // findByTarget already returns newest-first (createdAt DESC), so the first
    // matching event in the array is the most recent rejection.
    const service = buildService([
      { action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'TDS', reasons: ['Newest reason'] } },
      { action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'TDS', reasons: ['Older reason'] } },
    ]);
    const result = await service.findMostRecentRejectionReasons('link-1');
    expect(result.get('TDS')).toEqual(['Newest reason']);
  });

  it('ignores events that are not SELLER_AGENT_DOCUMENT_VALIDATION_FAILED', async () => {
    const service = buildService([
      { action: AuditAction.SELLER_AGENT_REJECTION_EMAIL_SENT, detailsJson: { detectedFormCode: 'TDS', reasons: ['Should not appear'] } },
      { action: AuditAction.BUYER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'RR', reasons: ['Also should not appear'] } },
    ]);
    const result = await service.findMostRecentRejectionReasons('link-1');
    expect(result.size).toBe(0);
  });

  it('ignores events with no detectedFormCode', async () => {
    const service = buildService([
      { action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: null, reasons: ['Unidentified form'] } },
    ]);
    const result = await service.findMostRecentRejectionReasons('link-1');
    expect(result.size).toBe(0);
  });

  it('defaults to an empty reasons array when reasons is missing', async () => {
    const service = buildService([
      { action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'TDS' } },
    ]);
    const result = await service.findMostRecentRejectionReasons('link-1');
    expect(result.get('TDS')).toEqual([]);
  });

  it('tracks multiple distinct form codes independently', async () => {
    const service = buildService([
      { action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'TDS', reasons: ['TDS reason'] } },
      { action: AuditAction.SELLER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'SPQ', reasons: ['SPQ reason'] } },
    ]);
    const result = await service.findMostRecentRejectionReasons('link-1');
    expect(result.get('TDS')).toEqual(['TDS reason']);
    expect(result.get('SPQ')).toEqual(['SPQ reason']);
  });
});

describe('UploadAuditService — findMostRecentEscrowRejectionReasons', () => {
  function buildService(events: Array<{ action: AuditAction; detailsJson: Record<string, unknown> | null }>) {
    const auditLogService = {
      findByTarget: jest.fn().mockResolvedValue(events),
      log: jest.fn(),
    } as any;
    return new UploadAuditService(auditLogService);
  }

  it('maps a single form code to its location-prefixed reasons, scoped to ESCROW_DOCUMENT_VALIDATION_FAILED events only', async () => {
    const service = buildService([
      { action: AuditAction.ESCROW_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'RPA', reasons: ['Page 6 — Buyer initials are missing.'] } },
      { action: AuditAction.BUYER_AGENT_DOCUMENT_VALIDATION_FAILED, detailsJson: { detectedFormCode: 'RPA', reasons: ['Should not appear'] } },
    ]);
    const result = await service.findMostRecentEscrowRejectionReasons('link-4');
    expect(result.get('RPA')).toEqual(['Page 6 — Buyer initials are missing.']);
  });

  it('returns an empty map when there are no Escrow rejection events', async () => {
    const service = buildService([]);
    const result = await service.findMostRecentEscrowRejectionReasons('link-4');
    expect(result.size).toBe(0);
  });
});

describe('UploadAuditService — recordEscrowValidationFailureAuditEvent / recordEscrowRejectionEmailSentAuditEvent', () => {
  it('logs a validation-failure event under ESCROW_DOCUMENT_VALIDATION_FAILED, targeting the upload link', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const service = new UploadAuditService({ log, findByTarget: jest.fn() } as any);

    await service.recordEscrowValidationFailureAuditEvent({
      transactionId: 'tx-1',
      propertyAddress: '123 Main St',
      originalFileName: 'rpa-unsigned.pdf',
      uploadLinkId: 'link-4',
      recipientName: 'Erin Escrow',
      recipientEmail: 'erin@escrowco.com',
      reasons: ['Page 6 — Buyer initials are missing.'],
      detectedFormCode: 'RPA',
    });

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.ESCROW_DOCUMENT_VALIDATION_FAILED,
      targetType: 'upload_link',
      targetId: 'link-4',
      details: expect.objectContaining({ reasons: ['Page 6 — Buyer initials are missing.'], detectedFormCode: 'RPA' }),
    }));
  });

  it('logs a rejection-email-sent event under ESCROW_REJECTION_EMAIL_SENT', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const service = new UploadAuditService({ log, findByTarget: jest.fn() } as any);

    await service.recordEscrowRejectionEmailSentAuditEvent({
      transactionId: 'tx-1',
      uploadLinkId: 'link-4',
      recipientEmail: 'erin@escrowco.com',
      rejectedFileNames: ['rpa-unsigned.pdf'],
      providerMessageId: 'mg-escrow-rejection-1',
    });

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.ESCROW_REJECTION_EMAIL_SENT,
      targetType: 'upload_link',
      targetId: 'link-4',
      details: expect.objectContaining({ rejectedFileNames: ['rpa-unsigned.pdf'], providerMessageId: 'mg-escrow-rejection-1' }),
    }));
  });
});
