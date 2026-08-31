import type { Request } from 'express';
import { DocuSignWebhookController } from './docusign-webhook.controller';

function buildController(opts: { envelope?: { id: string; envelopeId: string } | null; processFails?: boolean } = {}) {
  const envelopeRepo = {
    findOne: jest.fn().mockResolvedValue(opts.envelope === undefined ? { id: 'env-row-1', envelopeId: 'env-1' } : opts.envelope),
  };
  const docusignService = {
    processCompletedEnvelope: opts.processFails
      ? jest.fn().mockRejectedValue(new Error('boom'))
      : jest.fn().mockResolvedValue({ savedDocumentIds: ['doc-1'] }),
  };
  const controller = new DocuSignWebhookController(envelopeRepo as never, docusignService as never);
  return { controller, envelopeRepo, docusignService };
}

function makeReq(body: Record<string, unknown>): Request {
  return { body } as Request;
}

describe('DocuSignWebhookController', () => {
  it('dispatches processCompletedEnvelope for a known, completed envelope and returns ok', async () => {
    const { controller, docusignService } = buildController();
    const result = await controller.receiveConnect(makeReq({ envelopeId: 'env-1', status: 'completed' }));

    expect(result).toEqual({ status: 'ok' });
    // Fire-and-forget dispatch — allow the microtask queue to flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(docusignService.processCompletedEnvelope).toHaveBeenCalledWith('env-row-1');
  });

  it('ignores an unknown envelope — no matching row, no dispatch, still returns 200', async () => {
    const { controller, docusignService } = buildController({ envelope: null });
    const result = await controller.receiveConnect(makeReq({ envelopeId: 'env-unknown', status: 'completed' }));

    expect(result).toEqual({ status: 'ignored' });
    expect(docusignService.processCompletedEnvelope).not.toHaveBeenCalled();
  });

  it('ignores a non-completed status without dispatching', async () => {
    const { controller, docusignService } = buildController();
    const result = await controller.receiveConnect(makeReq({ envelopeId: 'env-1', status: 'sent' }));

    expect(result).toEqual({ status: 'ignored' });
    expect(docusignService.processCompletedEnvelope).not.toHaveBeenCalled();
  });

  it('ignores a payload with no envelopeId', async () => {
    const { controller, docusignService } = buildController();
    const result = await controller.receiveConnect(makeReq({ status: 'completed' }));

    expect(result).toEqual({ status: 'ignored' });
    expect(docusignService.processCompletedEnvelope).not.toHaveBeenCalled();
  });

  it('still returns ok even when processCompletedEnvelope rejects — the failure is logged, not surfaced to DocuSign', async () => {
    const { controller } = buildController({ processFails: true });
    const result = await controller.receiveConnect(makeReq({ envelopeId: 'env-1', status: 'completed' }));

    expect(result).toEqual({ status: 'ok' });
    await new Promise((r) => setTimeout(r, 0));
  });
});
