import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { DisclosureAnalysisController } from './disclosure-analysis.controller';

function createController(overrides?: Record<string, unknown>) {
  const mocks = {
    documentsService: {
      findOne: jest.fn(),
      updateAnalysisResult: jest.fn().mockResolvedValue(undefined),
      patchMetadataJson: jest.fn().mockResolvedValue(undefined),
    },
    documentPipelineService: {
      process: jest.fn(),
    },
    s3: {
      getObject: jest.fn(),
    },
    ...overrides,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const controller = new DisclosureAnalysisController(
    mocks.documentsService,
    mocks.documentPipelineService,
    mocks.s3,
  );

  return { controller, mocks };
}

function streamOf(text: string): Readable {
  return Readable.from([Buffer.from(text)]);
}

describe('DisclosureAnalysisController', () => {
  it('rejects a document that does not belong to the given transaction', async () => {
    const { controller, mocks } = createController();
    mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', transactionId: 'tx-other', storageKey: 'key' });

    await expect(controller.analyzeDocument('tx-1', 'doc-1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a document with no stored file', async () => {
    const { controller, mocks } = createController();
    mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', transactionId: 'tx-1', storageKey: null });

    await expect(controller.analyzeDocument('tx-1', 'doc-1')).rejects.toThrow(BadRequestException);
  });

  it('re-analyzes a document, saves fresh compliance, and returns the updated row', async () => {
    const { controller, mocks } = createController();
    mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', transactionId: 'tx-1', storageKey: 'tds-key', formCode: 'TDS' });
    mocks.s3.getObject.mockResolvedValue({ stream: streamOf('pdf-bytes') });
    mocks.documentPipelineService.process.mockResolvedValue({
      extraction: { some: 'data' },
      compliance: { checks: [], blockers: [], warnings: [] },
      detectedFormCode: 'TDS',
    });

    const result = await controller.analyzeDocument('tx-1', 'doc-1');

    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenNthCalledWith(
      1,
      'doc-1',
      expect.objectContaining({ analysisStatus: 'analyzing' }),
    );
    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenNthCalledWith(
      2,
      'doc-1',
      expect.objectContaining({ analysisStatus: 'completed', formCode: 'TDS' }),
    );
    expect(mocks.documentsService.patchMetadataJson).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({ compliance: { checks: [], blockers: [], warnings: [] }, analysisError: undefined }),
    );
    expect(result).toBeDefined();
  });

  it('is idempotent — retrying a previously failed document re-runs analysis and can succeed', async () => {
    const { controller, mocks } = createController();
    mocks.documentsService.findOne.mockResolvedValue({
      id: 'doc-1', transactionId: 'tx-1', storageKey: 'nhd-key', formCode: null,
      metadataJson: { analysisError: 'previous failure' },
    });
    mocks.s3.getObject.mockResolvedValue({ stream: streamOf('pdf-bytes') });
    mocks.documentPipelineService.process.mockResolvedValue({
      extraction: {},
      compliance: { checks: [], blockers: [], warnings: [] },
      detectedFormCode: 'NHD',
    });

    await controller.analyzeDocument('tx-1', 'doc-1');

    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenLastCalledWith(
      'doc-1',
      expect.objectContaining({ analysisStatus: 'completed' }),
    );
  });

  it('marks analysisStatus=failed and stores the error message when the pipeline throws, without rejecting the request', async () => {
    const { controller, mocks } = createController();
    mocks.documentsService.findOne.mockResolvedValue({ id: 'doc-1', transactionId: 'tx-1', storageKey: 'tds-key' });
    mocks.s3.getObject.mockResolvedValue({ stream: streamOf('pdf-bytes') });
    mocks.documentPipelineService.process.mockRejectedValue(new Error('Gemini extraction timed out'));

    const result = await controller.analyzeDocument('tx-1', 'doc-1');

    expect(mocks.documentsService.updateAnalysisResult).toHaveBeenLastCalledWith(
      'doc-1',
      expect.objectContaining({ analysisStatus: 'failed' }),
    );
    expect(mocks.documentsService.patchMetadataJson).toHaveBeenLastCalledWith(
      'doc-1',
      expect.objectContaining({ analysisError: 'Gemini extraction timed out' }),
    );
    expect(result).toBeDefined();
  });
});
