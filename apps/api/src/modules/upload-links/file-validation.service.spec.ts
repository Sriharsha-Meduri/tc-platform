import { FileValidationService } from './file-validation.service';
import { AllowedFileConfig } from './upload-link.types';

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'files',
    originalname: 'document.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('hello'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

const config: AllowedFileConfig = {
  allowedMimeTypes: ['application/pdf', 'image/png'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFiles: 10,
};

describe('FileValidationService', () => {
  const service = new FileValidationService();

  it('accepts a valid PDF within size limits', () => {
    const result = service.validateFile(makeFile(), config);
    expect(result.valid).toBe(true);
  });

  it('rejects an empty (0-byte) file', () => {
    const result = service.validateFile(makeFile({ size: 0, buffer: Buffer.alloc(0) }), config);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/empty/i);
  });

  it('rejects a file exceeding the configured size limit', () => {
    const result = service.validateFile(makeFile({ size: 999 * 1024 * 1024 }), config);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/exceeds/i);
  });

  it('rejects a mime type not on the allow-list (e.g. an executable)', () => {
    const result = service.validateFile(
      makeFile({ originalname: 'installer.exe', mimetype: 'application/x-msdownload' }),
      config,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/not supported/i);
  });

  it('sanitizes a filename with unsafe characters and path traversal attempts', () => {
    const result = service.validateFile(
      makeFile({ originalname: '../../etc/passwd; rm -rf.pdf' }),
      config,
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sanitizedFileName).not.toContain('/');
      expect(result.sanitizedFileName).not.toContain(';');
      expect(result.sanitizedFileName).not.toContain('..');
    }
  });

  it('accepts any mime type present in the allow-list', () => {
    const result = service.validateFile(makeFile({ originalname: 'photo.png', mimetype: 'image/png' }), config);
    expect(result.valid).toBe(true);
  });
});
