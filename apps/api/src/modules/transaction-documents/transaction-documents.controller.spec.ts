import { ForbiddenException } from '@nestjs/common';
import { Readable } from 'stream';
import { TransactionDocumentsController } from './transaction-documents.controller';

function makeReq(userId: string | null = 'user-1') {
  return { user: userId ? { userId } : undefined } as never;
}

function makeRes() {
  return { set: jest.fn() } as never;
}

function buildController(opts: {
  doc?: { id: string; storageKey: string | null; transactionId: string };
  transaction?: { id: string } | null;
  canAccess?: boolean;
  account?: { id: string } | null;
} = {}) {
  const doc = opts.doc ?? { id: 'doc-1', storageKey: 'transactions/tx-1/file.pdf', transactionId: 'tx-1' };

  const transactionDocumentsService = { findOne: jest.fn().mockResolvedValue(doc) };
  const s3 = { getObject: jest.fn().mockResolvedValue({ stream: Readable.from(['data']), contentType: 'application/pdf', contentLength: 4, fileName: 'file.pdf' }) };
  const accountsService = { findByUserId: jest.fn().mockResolvedValue(opts.account === undefined ? { id: 'acct-1' } : opts.account) };
  const transactionAccessService = { canAccountAccessTransaction: jest.fn().mockResolvedValue(opts.canAccess ?? true) };
  const transactionsRepo = { findOne: jest.fn().mockResolvedValue(opts.transaction === undefined ? { id: doc.transactionId } : opts.transaction) };

  const controller = new TransactionDocumentsController(
    transactionDocumentsService as never,
    s3 as never,
    accountsService as never,
    transactionAccessService as never,
    transactionsRepo as never,
  );

  return { controller, transactionAccessService, s3 };
}

describe('TransactionDocumentsController.streamFile — access enforcement', () => {
  it('rejects with ForbiddenException when the caller fails the transaction access check', async () => {
    const { controller, s3 } = buildController({ canAccess: false });
    await expect(controller.streamFile('doc-1', makeReq(), makeRes())).rejects.toBeInstanceOf(ForbiddenException);
    expect(s3.getObject).not.toHaveBeenCalled();
  });

  it('streams the file for an account that passes the transaction access check', async () => {
    const { controller, transactionAccessService } = buildController({ canAccess: true });
    const result = await controller.streamFile('doc-1', makeReq(), makeRes());
    expect(transactionAccessService.canAccountAccessTransaction).toHaveBeenCalledWith('acct-1', { id: 'tx-1' });
    expect(result).toBeDefined();
  });

  it('rejects with ForbiddenException when there is no authenticated user on the request', async () => {
    const { controller } = buildController();
    await expect(controller.streamFile('doc-1', makeReq(null), makeRes())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
